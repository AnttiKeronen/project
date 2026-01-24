import mongoose from "mongoose";
// embedded schema for document comments
const CommentSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // string id
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    quote: { type: String, default: "" }, // optional selected text
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);
// main document schema 
const DocumentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["text", "spreadsheet"], default: "text" },
    title: { type: String, required: true },
    // text document content
    content: { type: String, default: "" },
    // spreadsheet cell
    spreadsheet: {
      cells: { type: Map, of: String, default: {} }
    },
    editors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // read only
    publicShareId: { type: String, default: null },
    isPublic: { type: Boolean, default: false },
    // lock for editing
    lock: {
      type: {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        lockedAt: { type: Date, default: null }
      },
      default: { userId: null, lockedAt: null }
    },
    comments: { type: [CommentSchema], default: [] }
  },
  { timestamps: true } 
);
export const Document = mongoose.model("Document", DocumentSchema);
