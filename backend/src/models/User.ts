import mongoose from "mongoose";

const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },

    // Store only the filename, served via GET /uploads/<filename>
    // Example: "avatar_65b..._1700000000000.jpg"
    avatarPath: { type: String, default: "" }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", UserSchema);
