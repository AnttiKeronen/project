import { Router } from "express";
import { Document } from "../models/Document";

export const publicRoutes = Router();
publicRoutes.get("/share/:shareId", async (req, res) => {
  const { shareId } = req.params;
  const doc = await Document.findOne({ publicShareId: shareId, isPublic: true });
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json({
    id: doc._id,
    type: doc.type,
    title: doc.title,
    content: doc.content,
    spreadsheet: doc.spreadsheet,
    comments: doc.comments,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  });
});
