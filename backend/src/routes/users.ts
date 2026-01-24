import { Router } from "express";
import path from "path";
import multer from "multer";
import { User } from "../models/User";
import { AuthedRequest } from "../middleware/auth";

function safeExt(mime: string) {
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  return "";
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(process.cwd(), "uploads"));
  },
  filename: (req, file, cb) => {
    const ext = safeExt(file.mimetype);
    const userId = (req as AuthedRequest).userId;
    cb(null, `avatar_${userId}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(null, ok);
  }
});
export const usersRoutes = Router();
//current user profile 
usersRoutes.get("/me", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const u = await User.findById(userId).select("_id email avatarPath");
  if (!u) return res.status(404).json({ message: "not found" });
  const avatarUrl = (u as any).avatarPath ? `/uploads/${(u as any).avatarPath}` : "";
  res.json({
    id: String((u as any)._id),
    email: (u as any).email,
    avatarUrl
  });
});
// upload avatar
usersRoutes.post("/me/avatar", upload.single("avatar"), async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const file = req.file;
  if (!file) return res.status(400).json({ message: "Not figuring out the file" });
  const u = await User.findById(userId);
  if (!u) return res.status(404).json({ message: "not found" });
  (u as any).avatarPath = file.filename;
  await u.save();
  res.json({ avatarUrl: `/uploads/${file.filename}` });
});
