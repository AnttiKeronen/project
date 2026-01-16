import { Router } from "express";
import crypto from "crypto";
import { Document } from "../models/Document";
import { AuthedRequest } from "../middleware/auth";
import { User } from "../models/User";

const LOCK_TTL_MS = 1000 * 60 * 10; // 10 min

function canEdit(doc: any, userId: string) {
  return String(doc.ownerId) === userId || doc.editors.map(String).includes(userId);
}

type LockShape = { userId: any; lockedAt: Date | null };
function ensureLock(doc: any): asserts doc is { lock: LockShape } {
  if (!doc.lock) doc.lock = { userId: null, lockedAt: null };
}

type SpreadsheetShape = { cells: Map<string, string> };
function ensureSpreadsheet(doc: any): asserts doc is { spreadsheet: SpreadsheetShape } {
  if (!doc.spreadsheet) doc.spreadsheet = { cells: new Map<string, string>() };
  if (!doc.spreadsheet.cells) doc.spreadsheet.cells = new Map<string, string>();
  // If it arrived as plain object, convert to Map
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

documentsRoutes.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const docs = await Document.find({ ownerId: userId }).sort({ updatedAt: -1 });
  res.json(docs);
});

// Create document: { title, type: "text"|"spreadsheet" }
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
  const { title } = req.body ?? {};
  const doc = await Document.findById(id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can rename" });

  doc.title = title || doc.title;
  await doc.save();
  res.json(doc);
});

documentsRoutes.delete("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can delete" });

  await doc.deleteOne();
  res.json({ ok: true });
});

documentsRoutes.get("/:id", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId) && String(doc.ownerId) !== userId) return res.status(403).json({ message: "Forbidden" });

  res.json(doc);
});

documentsRoutes.post("/:id/grant-editor", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { email } = req.body ?? {};
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can grant permissions" });

  const u = await User.findOne({ email });
  if (!u) return res.status(404).json({ message: "User not found" });

  const uid = String(u._id);
  if (!doc.editors.map(String).includes(uid)) doc.editors.push(u._id as any);
  await doc.save();
  res.json(doc);
});

documentsRoutes.post("/:id/share", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can share" });

  if (!doc.publicShareId) doc.publicShareId = crypto.randomBytes(16).toString("hex");
  doc.isPublic = true;
  await doc.save();
  res.json({ shareId: doc.publicShareId });
});

documentsRoutes.post("/:id/unshare", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (String(doc.ownerId) !== userId) return res.status(403).json({ message: "Only owner can unshare" });

  doc.isPublic = false;
  await doc.save();
  res.json({ ok: true });
});

// Locking
documentsRoutes.post("/:id/lock", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });

  ensureLock(doc);

  if (doc.lock.lockedAt && Date.now() - new Date(doc.lock.lockedAt).getTime() > LOCK_TTL_MS) {
    doc.lock.userId = null;
    doc.lock.lockedAt = null;
  }

  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Document is being edited by another user" });
  }

  doc.lock.userId = userId as any;
  doc.lock.lockedAt = new Date();
  await doc.save();
  res.json({ ok: true });
});

documentsRoutes.post("/:id/unlock", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  ensureLock(doc);

  if (doc.lock.userId && String(doc.lock.userId) === userId) {
    doc.lock.userId = null;
    doc.lock.lockedAt = null;
    await doc.save();
  }
  res.json({ ok: true });
});

// Save content (text docs)
documentsRoutes.put("/:id/content", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { content } = req.body ?? {};
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });

  ensureLock(doc);

  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Document is being edited by another user" });
  }

  if (doc.type !== "text") return res.status(400).json({ message: "Not a text document" });

  doc.content = String(content ?? "");
  doc.lock.userId = userId as any;
  doc.lock.lockedAt = new Date();
  await doc.save();
  res.json(doc);
});

// Spreadsheet cells update: { cells: { A1:"1", A2:"=SUM(A1:A1)" } }
documentsRoutes.put("/:id/spreadsheet", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { cells } = req.body ?? {};
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No edit permission" });

  ensureLock(doc);

  if (doc.lock.userId && String(doc.lock.userId) !== userId) {
    return res.status(409).json({ message: "Document is being edited by another user" });
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
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: "Not found" });
  if (!canEdit(doc, userId)) return res.status(403).json({ message: "No access" });
  res.json(doc.comments ?? []);
});

documentsRoutes.post("/:id/comments", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const { text, quote } = req.body ?? {};
  if (!text || String(text).trim().length === 0) return res.status(400).json({ message: "Comment text required" });

  const doc = await Document.findById(req.params.id);
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
