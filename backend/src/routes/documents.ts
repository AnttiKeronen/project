import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { Document } from "../models/Document";
import { AuthedRequest } from "../middleware/auth";
import { User } from "../models/User";

const LOCK_TTL_MS = 1000 * 60 * 2; // 2min lock
function canEdit(doc: any, userId: string) {
  return String(doc.ownerId) === userId || (doc.editors ?? []).map(String).includes(userId);
}
function requireValidId(id: any, res: any) {
  if (!id || id === "undefined" || !mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid document id" });
    return false;
  }
  return true;
}
type LockShape = { userId: any; lockedAt: Date | null };
function ensureLock(doc: any): asserts doc is { lock: LockShape } {
  if (!doc.lock) doc.lock = { userId: null, lockedAt: null };
}
type SpreadsheetShape = { cells: Map<string, string> };
function ensureSpreadsheet(doc: any): asserts doc is { spreadsheet: SpreadsheetShape } {
  if (!doc.spreadsheet) doc.spreadsheet = { cells: new Map<string, string>() };
  if (!doc.spreadsheet.cells) doc.spreadsheet.cells = new Map<string, string>();
  //convert to map
  if (!(doc.spreadsheet.cells instanceof Map)) {
    const obj = doc.spreadsheet.cells;
    const m = new Map<string, string>();
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        m.set(String(k).toUpperCase().trim(), typeof v === "string" ? v : String(v ?? ""));
      }
    }
    doc.spreadsheet.cells = m;
  }
}
export const documentsRoutes = Router();
//owner or editor
documentsRoutes.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const docs = await Document.find({
    $or: [{ ownerId: userId }, { editors: userId }]
  }).sort({ updatedAt: -1 });
  res.json(
    docs.map((d) => ({
      ...d.toObject(),
      access: String(d.ownerId) === userId ? "owner" : "editor"
    }))
  );
});
//create document
documentsRoutes.post("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { title, type } = req.body ?? {};
  const docType = type === "spreadsheet" ? "spreadsheet" : "text";
  const doc = await Document.create({
    ownerId: userId,
    title: title || (docType === "spreadsheet" ? "Untitled spreadsheet" : "Untitled"),
    type: docType,
    content: "",
    spreadsheet: { cells: {} }
  });
  res.json(doc);
});
documentsRoutes.put("/:id/rename", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { title } = req.body ?? {};
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  // allow owners and editors
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No permission for you" });
  doc.title = String(title || doc.title);
  await doc.save();
  res.json(doc);
});
documentsRoutes.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can delete" });
  await doc.deleteOne();
  res.json({ ok: true });
});
documentsRoutes.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "Forbidden" });
  res.json(doc);
});
documentsRoutes.post("/:id/grant-editor", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { email } = req.body ?? {};
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  if (!cleanEmail) return res.status(400).json({ message: "Email required" });
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can grant permissions" });
  const u = await User.findOne({ email: cleanEmail });
  if (!u) return res.status(404).json({ message: "User not found" });
  const uid = String(u._id);
  // don't allow adding owner
  if (String(doc.ownerId) === uid) return res.status(400).json({ message: "Owner already has access" });
  //duplicates
  if (!(doc.editors ?? []).map(String).includes(uid)) {
    doc.editors.push(u._id as any);
    await doc.save();
  }
  res.json({ ok: true });
});
// for owners
documentsRoutes.get("/:id/access", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id)
    .populate("ownerId", "email")
    .populate("editors", "email");
  if (!doc) return res.status(404).json({ message: "Not found" });
  const ownerObj = doc.ownerId as any;
  const ownerId = ownerObj?._id ? String(ownerObj._id) : String(doc.ownerId);
  if (ownerId !== userId) return res.status(403).json({ message: "Only owner can view access" });
  const editors = (doc.editors ?? []) as any[];
  res.json({
    owner: { _id: String(ownerObj._id ?? ownerId), email: String(ownerObj.email ?? "") },
    editors: editors.map((u) => ({ _id: String(u._id), email: String(u.email ?? "") }))
  });
});
//delete editor
documentsRoutes.post("/:id/revoke-editor", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { userId: removeUserId, email } = req.body ?? {};
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can revoke permissions" });
  let targetId: string | null = null;
  if (removeUserId) {
    targetId = String(removeUserId);
  } else if (email) {
    const u = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!u) return res.status(404).json({ message: "Not found" });
    targetId = String(u._id);
  } else {
    return res.status(400).json({ message: "userId or email required" });
  }
  if (String(doc.ownerId) === targetId) return res.status(400).json({ message: "Ur not the captain now!!" });
  doc.editors = (doc.editors ?? []).filter((eid: any) => String(eid) !== targetId) as any;
  await doc.save();
  res.json({ ok: true });
});
documentsRoutes.post("/:id/share", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can share" });
  if (!doc.publicShareId) doc.publicShareId = crypto.randomBytes(16).toString("hex");
  doc.isPublic = true;
  await doc.save();
  res.json({ shareId: doc.publicShareId });
});
documentsRoutes.post("/:id/unshare", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can unshare" });
  doc.isPublic = false;
  await doc.save();
  res.json({ ok: true });
});
// Locking
documentsRoutes.post("/:id/lock", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });
  ensureLock(doc);
  // expiring
  if (doc.lock.lockedAt && Date.now() - new Date(doc.lock.lockedAt).getTime() > LOCK_TTL_MS) {
    doc.lock.userId = null;
    doc.lock.lockedAt = null;
  }
  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Someone else is editing" });
  }
  doc.lock.userId = userId as any;
  doc.lock.lockedAt = new Date();
  await doc.save();
  res.json({ ok: true });
});
documentsRoutes.post("/:id/unlock", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  ensureLock(doc);
  if (doc.lock.userId && String(doc.lock.userId) === userId) {
    doc.lock.userId = null;
    doc.lock.lockedAt = null;
    await doc.save();
  }
  res.json({ ok: true });
});
// Save
documentsRoutes.put("/:id/content", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { content } = req.body ?? {};
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });
  ensureLock(doc);
  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Someone else is editing" });
  }
  if (doc.type !== "text") return res.status(400).json({ message: "Not a text document" });
  doc.content = String(content ?? "");
  doc.lock.userId = userId as any;
  doc.lock.lockedAt = new Date();
  await doc.save();
  res.json(doc);
});
// Spreadsheetupdate
documentsRoutes.put("/:id/spreadsheet", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { cells } = req.body ?? {};
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });
  ensureLock(doc);
  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Someone else is editing" });
  }
  if (doc.type !== "spreadsheet") return res.status(400).json({ message: "Not a spreadsheet document" });
  ensureSpreadsheet(doc);
  if (cells && typeof cells === "object") {
    for (const [k, v] of Object.entries(cells)) {
      const key = String(k).toUpperCase().trim();
      doc.spreadsheet.cells.set(key, String(v ?? ""));
    }
  }
  doc.lock.userId = userId as any;
  doc.lock.lockedAt = new Date();
  await doc.save();
  res.json(doc);
});
// Comments
documentsRoutes.get("/:id/comments", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No access" });
  res.json(doc.comments ?? []);
});
documentsRoutes.post("/:id/comments", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id } = req.params;
  if (!requireValidId(id, res)) return;
  const { text, quote } = req.body ?? {};
  if (!text || String(text).trim().length === 0) return res.status(400).json({ message: "Comment text required" });
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No access" });
  const comment = {
    _id: crypto.randomBytes(8).toString("hex"),
    authorId: userId as any,
    quote: String(quote ?? "").slice(0, 300),
    text: String(text).slice(0, 2000),
    createdAt: new Date()
  };
  doc.comments.push(comment as any);
  await doc.save();
  res.json(comment);
});
documentsRoutes.delete("/:id/comments/:commentId", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { id, commentId } = req.params;
  if (!requireValidId(id, res)) return;
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No access" });
  const idx = (doc.comments ?? []).findIndex((c: any) => c._id === commentId);
  if (idx === -1) return res.status(404).json({ message: "Comment not found" });
  const c = doc.comments[idx] as any;
  const isOwner = String(doc.ownerId) === userId;
  const isAuthor = String(c.authorId) === userId;
  if (!isOwner && !isAuthor) return res.status(403).json({ message: "Not allowed" });
  doc.comments.splice(idx, 1);
  await doc.save();
  res.json({ ok: true });
});
