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

type Doc = {
  _id: string;
  title: string;
  content: string;
  isPublic: boolean;
  publicShareId?: string | null;
};

type AccessUser = { _id: string; email: string };
type AccessResponse = { owner: AccessUser; editors: AccessUser[] };

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);

  const [commentText, setCommentText] = useState("");
  const [selectedQuote, setSelectedQuote] = useState("");

  const [docMeta, setDocMeta] = useState<Pick<Doc, "isPublic" | "publicShareId">>({
    isPublic: false,
    publicShareId: null
  });

  const [shareEmail, setShareEmail] = useState("");
  const [access, setAccess] = useState<AccessResponse | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [accessErr, setAccessErr] = useState("");

  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function lock(docId: string) {
    await api.post(`/documents/${docId}/lock`);
  }
  async function unlock(docId: string) {
    await api.post(`/documents/${docId}/unlock`);
  }

  async function loadAccess(docId: string) {
    setAccessErr("");
    try {
      const res = await api.get<AccessResponse>(`/documents/${docId}/access`);
      setAccess(res.data);
      setIsOwner(true);
    } catch (e: any) {
      setIsOwner(false);
      setAccess(null);
      if (e?.response?.status && e.response.status !== 403) {
        setAccessErr(e?.response?.data?.message ?? "Failed to load access");
      }
    }
  }

  async function load(docId: string) {
    setErr("");
    try {
      const res = await api.get<Doc>(`/documents/${docId}`);
      setTitle(res.data.title);
      setContent(res.data.content || "");
      setDocMeta({
        isPublic: !!res.data.isPublic,
        publicShareId: res.data.publicShareId ?? null
      });

      await lock(docId);

      const cr = await api.get<Comment[]>(`/documents/${docId}/comments`);
      setComments(cr.data);

      await loadAccess(docId);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to open document");
    }
  }

  useEffect(() => {
    // ✅ never run without id
    if (!id) {
      nav("/", { replace: true });
      return;
    }

    let cancelled = false;

    (async () => {
      await load(id);
    })();

    // ✅ Heartbeat: refresh lock every 30s while editor is open
    const heartbeat = setInterval(() => {
      api.post(`/documents/${id}/lock`).catch(() => {});
    }, 30_000);

    const onUnload = () => {
      if (!cancelled) unlock(id).catch(() => {});
    };

    window.addEventListener("beforeunload", onUnload);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      window.removeEventListener("beforeunload", onUnload);
      unlock(id).catch(() => {});
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

  async function copyPublicLink(shareId: string) {
    setMsg("");
    setErr("");
    const full = `${window.location.origin}/share/${shareId}`;
    try {
      await navigator.clipboard.writeText(full);
      setMsg("Link copied to clipboard.");
    } catch {
      try {
        window.prompt("Copy this link:", full);
      } catch {
        setErr("Could not copy link automatically.");
      }
    }
  }

  async function makePublic() {
    if (!id) return;
    setMsg("");
    setErr("");
    try {
      const res = await api.post<{ shareId: string }>(`/documents/${id}/share`);
      setDocMeta({ isPublic: true, publicShareId: res.data.shareId });
      setMsg("Public link enabled.");
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to enable public link");
    }
  }

  async function disablePublic() {
    if (!id) return;
    setMsg("");
    setErr("");
    try {
      await api.post(`/documents/${id}/unshare`);
      setDocMeta((prev) => ({ ...prev, isPublic: false }));
      setMsg("Public link disabled.");
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to disable public link");
    }
  }

  async function grantEditor() {
    if (!id) return;
    const email = shareEmail.trim();
    if (!email) return;

    setErr("");
    setMsg("");
    setShareBusy(true);
    try {
      await api.post(`/documents/${id}/grant-editor`, { email });
      setMsg(`Granted edit access to ${email}.`);
      setShareEmail("");
      await loadAccess(id);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to grant access");
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeEditor(userId: string, email?: string) {
    if (!id) return;
    setErr("");
    setMsg("");
    try {
      await api.post(`/documents/${id}/revoke-editor`, { userId });
      setMsg(`Removed access${email ? ` for ${email}` : ""}.`);
      await loadAccess(id);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to remove access");
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex gap-2 align-items-center justify-content-between flex-wrap">
        <div className="d-flex gap-2 align-items-center">
          <button className="btn btn-outline-secondary" onClick={() => nav("/")}>
            ← Back
          </button>
          <h2 className="m-0">Text document</h2>
        </div>

        {isOwner ? (
          <div className="d-flex gap-2 flex-wrap align-items-center">
            {docMeta.isPublic && docMeta.publicShareId ? (
              <>
                <a
                  className="btn btn-outline-secondary"
                  href={`/share/${docMeta.publicShareId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open public view
                </a>
                <button className="btn btn-outline-secondary" onClick={() => copyPublicLink(docMeta.publicShareId!)}>
                  Copy link
                </button>
                <button className="btn btn-outline-warning" onClick={disablePublic}>
                  Disable public
                </button>
              </>
            ) : (
              <button className="btn btn-outline-success" onClick={makePublic}>
                Make public
              </button>
            )}
          </div>
        ) : null}
      </div>

      {err && <div className="alert alert-danger mt-3">{err}</div>}
      {msg && <div className="alert alert-success mt-3">{msg}</div>}

      {isOwner ? (
        <div className="card mt-3">
          <div className="card-body">
            <div className="d-flex align-items-start justify-content-between gap-3 flex-wrap">
              <div style={{ minWidth: 260 }}>
                <h5 className="mb-1">Share</h5>
                <div className="text-muted small">
                  Grant another user edit access by email. Editors can open and edit the document, but can&apos;t manage
                  sharing.
                </div>
              </div>

              <div className="d-flex gap-2 flex-wrap">
                <input
                  className="form-control"
                  style={{ maxWidth: 340 }}
                  placeholder="user@example.com"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                />
                <button className="btn btn-primary" disabled={!shareEmail.trim() || shareBusy} onClick={grantEditor}>
                  {shareBusy ? "Granting…" : "Grant editor access"}
                </button>
              </div>
            </div>

            {accessErr ? <div className="alert alert-warning mt-3 mb-0">{accessErr}</div> : null}

            {access ? (
              <div className="mt-3">
                <div className="small text-muted mb-2">
                  <strong>Owner:</strong> {access.owner.email}
                </div>

                <div className="d-flex align-items-center justify-content-between mb-2">
                  <h6 className="m-0">Editors</h6>
                  <button className="btn btn-outline-secondary btn-sm" onClick={() => id && loadAccess(id)}>
                    Refresh
                  </button>
                </div>

                {access.editors.length === 0 ? (
                  <div className="text-muted small">No editors yet.</div>
                ) : (
                  <div className="d-grid gap-2">
                    {access.editors.map((u) => (
                      <div key={u._id} className="border rounded p-2 d-flex justify-content-between align-items-center">
                        <div>{u.email}</div>
                        <button className="btn btn-outline-danger btn-sm" onClick={() => revokeEditor(u._id, u.email)}>
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="row mt-3">
        <div className="col-12 col-lg-8">
          <div className="card">
            <div className="card-body">
              <label className="form-label">Title</label>
              <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />

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
                  disabled={!id}
                  onClick={async () => {
                    if (!id) return;
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

                <button className="btn btn-outline-secondary" disabled={!selectedQuote} onClick={() => {}}>
                  Selected text: {selectedQuote ? `"${selectedQuote.slice(0, 40)}"` : "—"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4 mt-3 mt-lg-0">
          <div className="card">
            <div className="card-body">
              <h5>Comments</h5>

              <div className="mb-3">
                <textarea
                  className="form-control"
                  rows={3}
                  placeholder={selectedQuote ? `Comment on "${selectedQuote.slice(0, 50)}"...` : "Select text to comment on"}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm mt-2"
                  disabled={!commentText.trim() || !id}
                  onClick={async () => {
                    if (!id) return;
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
                      {c.quote && <div className="small text-muted mb-1">“{c.quote.slice(0, 120)}”</div>}
                      <div>{c.text}</div>
                      <div className="d-flex justify-content-between mt-1">
                        <div className="text-muted small">{new Date(c.createdAt).toLocaleString()}</div>
                        <button
                          className="btn btn-link btn-sm text-danger"
                          disabled={!id}
                          onClick={async () => {
                            if (!id) return;
                            try {
                              await api.delete(`/documents/${id}/comments/${c._id}`);
                              setComments((prev) => prev.filter((x) => x._id !== c._id));
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
