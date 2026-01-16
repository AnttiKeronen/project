import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { connectDb } from "./db";
import { authRoutes } from "./routes/auth";
import { publicRoutes } from "./routes/public";
import { documentsRoutes } from "./routes/documents";
import { usersRoutes } from "./routes/users";
import { requireAuth } from "./middleware/auth";

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/cloud_drive";
const JWT_SECRET = process.env.JWT_SECRET || "";

async function main() {
  if (!JWT_SECRET) throw new Error("Missing env var JWT_SECRET");

  await connectDb(MONGO_URI);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // serve uploaded images
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/auth", authRoutes(JWT_SECRET));
  app.use("/api/public", publicRoutes);

  app.use("/api/users", requireAuth(JWT_SECRET), usersRoutes);
  app.use("/api/documents", requireAuth(JWT_SECRET), documentsRoutes);

  // Multer / upload error handler (prevents server crash)
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err?.name === "MulterError") {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({ message: "File too large. Max size is 2MB." });
      }
      return res.status(400).json({ message: err.message || "Upload error" });
    }
    return next(err);
  });

  // Final error handler (prevents crashes)
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error(err);

    // Mongoose optimistic concurrency / version conflicts
    if (err?.name === "VersionError") {
      return res
        .status(409)
        .json({ message: "Document was modified elsewhere. Please refresh and try again." });
    }

    return res.status(500).json({ message: "Server error" });
  });

  app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
