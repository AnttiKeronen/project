import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

type Comment = {
  _id: string;
  authorId: string;
  text: string;
  quote: string;
  createdAt: string;
};

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);

  const [commentText, setCommentText] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function lock() {
    await api.post(`/documents/${id}/lock`);
  }
  async function unlock() {
    await api.post(`/documents/${id}/unlock`);
  }

  async function load() {
    setErr("");
    try {
      const res = await api.get(`/documents/${id}`);
      setTitle(res.data.title);
      setContent(res.data.content || "");
      await lock();

      const cr = await api.get<Comment[]>(`/documents/${id}/comments`);
      setComments(cr.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to open document");
    }
  }

  useEffect(() => {
    load();

    const onUnload = () => unlock().catch(() => {});
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      unlock().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function captureSelection() {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (start === end) {
      setSelectedQuote("");
      return;
    }
    setSelectedQuote(el.value.slice(start, end));
  }

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex gap-2 align-items-center">
        <button className="btn btn-outline-secondary" onClick={() => nav("/")}>
          ← Back
        </button>
        <h2 className="m-0">Text document</h2>
      </div>

      {err && <div className="alert alert-danger mt-3">{err}</div>}
      {msg && <div className="alert alert-success mt-3">{msg}</div>}

      <div className="row mt-3">
        {/* Editor */}
        <div className="col-12 col-lg-8">
          <div className="card">
            <div className="card-body">
              <label className="form-label">Title</label>
              <input
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />

              <label className="form-label mt-3">Content</label>
              <textarea
                ref={textareaRef}
                className="form-control"
                rows={14}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onMouseUp={captureSelection}
                onKeyUp={captureSelection}
              />

              <div className="d-flex gap-2 mt-3 flex-wrap">
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    setMsg("");
                    setErr("");
                    try {
                      await api.put(`/documents/${id}/rename`, { title });
                      await api.put(`/documents/${id}/content`, { content });
                      setMsg("Document saved.");
                    } catch (e: any) {
                      setErr(e?.response?.data?.message ?? "Save failed");
                    }
                  }}
                >
                  Save
                </button>

                <button
                  className="btn btn-outline-secondary"
                  disabled={!selectedQuote}
                  onClick={() => {}}
                >
                  Selected text: {selectedQuote ? `"${selectedQuote.slice(0, 40)}"` : "—"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div className="col-12 col-lg-4 mt-3 mt-lg-0">
          <div className="card">
            <div className="card-body">
              <h5>Comments</h5>

              <div className="mb-3">
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder={
                    selectedQuote
                      ? `Comment on "${selectedQuote.slice(0, 50)}"...`
                      : "Select text to comment on"
                  }
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm mt-2"
                  disabled={!commentText.trim()}
                  onClick={async () => {
                    setErr("");
                    try {
                      const res = await api.post(`/documents/${id}/comments`, {
                        text: commentText,
                        quote: selectedQuote
                      });
                      setComments((prev) => [res.data, ...prev]);
                      setCommentText("");
                      setSelectedQuote("");
                    } catch (e: any) {
                      setErr(e?.response?.data?.message ?? "Failed to add comment");
                    }
                  }}
                >
                  Add comment
                </button>
              </div>

              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {comments.length === 0 ? (
                  <div className="text-muted small">No comments yet.</div>
                ) : (
                  comments.map((c) => (
                    <div key={c._id} className="border rounded p-2 mb-2">
                      {c.quote && (
                        <div className="small text-muted mb-1">
                          “{c.quote.slice(0, 120)}”
                        </div>
                      )}
                      <div>{c.text}</div>
                      <div className="d-flex justify-content-between mt-1">
                        <div className="text-muted small">
                          {new Date(c.createdAt).toLocaleString()}
                        </div>
                        <button
                          className="btn btn-link btn-sm text-danger"
                          onClick={async () => {
                            try {
                              await api.delete(
                                `/documents/${id}/comments/${c._id}`
                              );
                              setComments((prev) =>
                                prev.filter((x) => x._id !== c._id)
                              );
                            } catch {
                              alert("Not allowed to delete this comment");
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
