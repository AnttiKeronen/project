import mongoose from "mongoose";

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

const DocumentSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: ["text", "spreadsheet"], default: "text" },

    title: { type: String, required: true },

    // For text docs: EditorJS JSON string (or legacy plain text)
    content: { type: String, default: "" },

    // For spreadsheet docs: raw cell inputs ("1", "Hello", "=SUM(A1:A3)")
    spreadsheet: {
      cells: { type: Map, of: String, default: {} } // key "A1" -> raw string
    },

    editors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    publicShareId: { type: String, default: null },
    isPublic: { type: Boolean, default: false },

    // Lock for editing
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
