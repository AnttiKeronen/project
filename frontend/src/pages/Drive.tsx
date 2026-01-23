import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Link, useNavigate } from "react-router-dom";

type DocType = "text" | "spreadsheet";
type Access = "owner" | "editor";

type Doc = {
  _id: string;
  title: string;
  type?: DocType;
  createdAt: string;
  updatedAt: string;

  isPublic: boolean;
  publicShareId?: string | null;

  // returned by backend /documents (our new mapping)
  access?: Access;
};

function getPageButtons(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: number[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push(-1);
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push(-1);

  pages.push(total);
  return pages;
}

function typeBadge(t?: DocType) {
  const type = t ?? "text";
  const label = type === "spreadsheet" ? "SPREADSHEET" : "TEXT";
  const cls = type === "spreadsheet" ? "bg-success" : "bg-secondary";
  return <span className={`badge ${cls}`}>{label}</span>;
}

function accessBadge(access?: Access) {
  if (!access) return null;
  const cls = access === "owner" ? "bg-primary" : "bg-info";
  const label = access === "owner" ? "OWNER" : "EDITOR";
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function Drive() {
  const nav = useNavigate();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  // Sorting
  const [sortBy, setSortBy] = useState<"name" | "created" | "updated">("updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Search
  const [query, setQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 6;

  async function load() {
    setErr("");
    try {
      const res = await api.get<Doc[]>("/documents");
      setDocs(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to load documents");
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, sortBy, sortDir]);

  const filteredSortedDocs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? docs.filter((d) => d.title.toLowerCase().includes(q)) : docs;

    const dir = sortDir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.title.localeCompare(b.title) * dir;
      if (sortBy === "created")
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
      return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * dir;
    });
  }, [docs, query, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredSortedDocs.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);

  const pageDocs = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredSortedDocs.slice(start, start + pageSize);
  }, [filteredSortedDocs, safePage]);

  const pageButtons = useMemo(() => getPageButtons(safePage, totalPages), [safePage, totalPages]);

  async function createDoc(type: DocType) {
    setErr("");
    try {
      const res = await api.post("/documents", {
        title: type === "spreadsheet" ? "Untitled spreadsheet" : "Untitled",
        type
      });

      const newId = res?.data?._id;
      if (newId) {
        if (type === "spreadsheet") nav(`/sheet/${newId}`);
        else nav(`/edit/${newId}`);
      } else {
        await load();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to create document");
    }
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

  async function makePublic(docId: string) {
    setErr("");
    setMsg("");
    try {
      const res = await api.post<{ shareId: string }>(`/documents/${docId}/share`);
      setDocs((prev) =>
        prev.map((d) => (d._id === docId ? { ...d, isPublic: true, publicShareId: res.data.shareId } : d))
      );
      setMsg("Public link enabled.");
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to enable public link");
    }
  }

  async function disablePublic(docId: string) {
    setErr("");
    setMsg("");
    try {
      await api.post(`/documents/${docId}/unshare`);
      setDocs((prev) => prev.map((d) => (d._id === docId ? { ...d, isPublic: false } : d)));
      setMsg("Public link disabled.");
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Failed to disable public link");
    }
  }

  async function deleteDoc(docId: string, access?: Access) {
    setErr("");
    setMsg("");

    // editor shouldn't delete (backend blocks it anyway)
    if (access && access !== "owner") {
      setErr("Only owner can delete.");
      return;
    }

    try {
      await api.delete(`/documents/${docId}`);
      await load();
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Delete failed");
    }
  }

  return (
    <div className="container py-4" style={{ maxWidth: 980 }}>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <h2 className="m-0">My Drive</h2>

        <div className="d-flex gap-2 flex-wrap">
          <button className="btn btn-primary" onClick={() => createDoc("text")}>
            + New text document
          </button>
          <button className="btn btn-success" onClick={() => createDoc("spreadsheet")}>
            + New spreadsheet
          </button>
        </div>
      </div>

      {err && <div className="alert alert-danger mt-3 mb-0">{err}</div>}
      {msg && <div className="alert alert-success mt-3 mb-0">{msg}</div>}

      {/* Controls */}
      <div className="row g-2 mt-3 align-items-end">
        <div className="col-12 col-md-4">
          <label className="form-label mb-1">Search</label>
          <input
            className="form-control"
            placeholder="Search documents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="col-6 col-md-4">
          <label className="form-label mb-1">Sort by</label>
          <select className="form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="name">Name</option>
            <option value="created">Created</option>
            <option value="updated">Last updated</option>
          </select>
        </div>

        <div className="col-6 col-md-4">
          <label className="form-label mb-1">Order</label>
          <select className="form-select" value={sortDir} onChange={(e) => setSortDir(e.target.value as any)}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
      </div>

      <div className="text-muted small mt-2">
        Showing {filteredSortedDocs.length} document(s){query.trim() ? ` for "${query.trim()}"` : ""}
      </div>

      {/* List */}
      <div className="d-grid gap-2 mt-3">
        {pageDocs.map((d) => {
          const t = d.type ?? "text";
          const openPath = t === "spreadsheet" ? `/sheet/${d._id}` : `/edit/${d._id}`;
          const access = d.access ?? "owner";

          return (
            <div key={d._id} className="card">
              <div className="card-body">
                <div className="d-flex justify-content-between gap-2 flex-wrap">
                  <div className="me-2" style={{ minWidth: 260 }}>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <div className="fw-bold">{d.title}</div>
                      {typeBadge(t)}
                      {accessBadge(access)}
                    </div>

                    <div className="text-muted small">
                      Created: {new Date(d.createdAt).toLocaleString()} • Updated:{" "}
                      {new Date(d.updatedAt).toLocaleString()}
                    </div>

                    {/* Public link */}
                    {d.isPublic && d.publicShareId ? (
                      <div className="small mt-2 d-flex gap-2 flex-wrap align-items-center">
                        <a href={`/share/${d.publicShareId}`} target="_blank" rel="noreferrer">
                          /share/{d.publicShareId}
                        </a>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => copyPublicLink(d.publicShareId!)}
                        >
                          Copy
                        </button>
                        {access === "owner" ? (
                          <button className="btn btn-outline-warning btn-sm" onClick={() => disablePublic(d._id)}>
                            Disable
                          </button>
                        ) : null}
                      </div>
                    ) : access === "owner" ? (
                      <div className="small mt-2">
                        <button className="btn btn-outline-success btn-sm" onClick={() => makePublic(d._id)}>
                          Make public
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="d-flex align-items-center gap-2">
                    <Link className="btn btn-outline-primary btn-sm" to={openPath}>
                      Open
                    </Link>

                    <button
                      className="btn btn-outline-danger btn-sm"
                      disabled={access !== "owner"}
                      title={access !== "owner" ? "Only owner can delete" : ""}
                      onClick={() => deleteDoc(d._id, access)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {pageDocs.length === 0 ? <div className="alert alert-secondary">No documents found.</div> : null}
      </div>

      {/* Pagination */}
      <div className="d-flex align-items-center gap-2 flex-wrap mt-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => setPage(1)} disabled={safePage === 1}>
          First
        </button>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={safePage === 1}
        >
          Prev
        </button>

        <div className="d-flex align-items-center gap-1 flex-wrap">
          {pageButtons.map((p, idx) =>
            p === -1 ? (
              <span key={`e-${idx}`} className="px-2 text-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                className={`btn btn-sm ${p === safePage ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => setPage(p)}
                disabled={p === safePage}
              >
                {p}
              </button>
            )
          )}
        </div>

        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={safePage === totalPages}
        >
          Next
        </button>
        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={() => setPage(totalPages)}
          disabled={safePage === totalPages}
        >
          Last
        </button>

        <span className="text-muted small ms-1">
          Page {safePage} / {totalPages}
        </span>
      </div>
    </div>
  );
}
