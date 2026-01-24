import mongoose from "mongoose";
//user info
const UserSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    //store only the filename
    avatarPath: { type: String, default: "" }
  },
  { timestamps: true }
);
export const User = mongoose.model("User", UserSchema);
