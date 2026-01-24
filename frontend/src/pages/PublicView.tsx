import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AxiosError } from "axios";
import editorJsHtml from "editorjs-html";
import { api } from "../api";
import html2pdf from "html2pdf.js";

type PublicDoc = {
  id: string;
  type: "text" | "spreadsheet";
  title: string;
  content: string;
  spreadsheet?: { cells: Record<string, string> };
  comments?: Array<{ _id: string; quote?: string; text: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
};
type ErrBody = { message?: string };
function colName(i: number) {
  return String.fromCharCode("A".charCodeAt(0) + i);
}
function cellKey(c: number, r: number) {
  return `${colName(c)}${r + 1}`;
}
function getRaw(cells: Record<string, string> | undefined, key: string) {
  return (cells?.[key.toUpperCase()] ?? "").trim();
}
function parseCellRef(ref: string) {
  const m = ref.trim().toUpperCase().match(/^([A-Z])([1-9]\d*)$/);
  if (!m) return null;
  return { col: m[1], row: Number(m[2]) };
}
function sumRange(a: string, b: string, cells: Record<string, string>): number {
  const A = parseCellRef(a);
  const B = parseCellRef(b);
  if (!A || !B) return 0;
  const c1 = A.col.charCodeAt(0);
  const c2 = B.col.charCodeAt(0);
  const r1 = A.row;
  const r2 = B.row;
  const cMin = Math.min(c1, c2);
  const cMax = Math.max(c1, c2);
  const rMin = Math.min(r1, r2);
  const rMax = Math.max(r1, r2);
  let s = 0;
  for (let c = cMin; c <= cMax; c++) {
    for (let r = rMin; r <= rMax; r++) {
      const key = `${String.fromCharCode(c)}${r}`;
      const raw = getRaw(cells, key);
      const n = Number(raw);
      if (!Number.isNaN(n)) s += n;
    }
  }
  return s;
}
function evalCell(raw: string, cells: Record<string, string>): string {
  const v = raw.trim();
  if (!v.startsWith("=")) return v;
  const m = v.toUpperCase().match(/^=SUM\((.+)\)$/);
  if (!m) return "#ERR";
  const inside = m[1].trim();
  if (inside.includes(":")) {
    const [a, b] = inside.split(":");
    return String(sumRange(a, b, cells));
  }
  const parts = inside.split(",").map((p) => p.trim()).filter(Boolean);
  let s = 0;
  for (const p of parts) {
    const ref = parseCellRef(p);
    if (!ref) continue;
    const key = `${ref.col}${ref.row}`;
    const n = Number(getRaw(cells, key));
    if (!Number.isNaN(n)) s += n;
  }
  return String(s);
}
function safeFilename(name: string) {
  const base = (name || "document")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .slice(0, 120);
  return base || "document";
}
export default function PublicView() {
  const { shareId } = useParams();
  const [doc, setDoc] = useState<PublicDoc | null>(null);
  const [err, setError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const parser = useMemo(() => editorJsHtml(), []);
  const pdfRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!shareId) {
      setError("Missing share id.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setError("");
        setDoc(null);
        const res = await api.get<PublicDoc>(`/public/share/${encodeURIComponent(shareId)}`);
        if (!cancelled) setDoc(res.data);
      } catch (e) {
        const ae = e as AxiosError<ErrBody>;
        if (!cancelled) setError(ae.response?.data?.message ?? "Not found");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);
  async function downloadPdf() {
    if (!doc) return;
    const el = pdfRef.current;
    if (!el) return;
    setPdfBusy(true);
    try {
      //ensure we export the content area only
      await (html2pdf() as any)
        .from(el)
        .set({
          margin: 10,
          filename: `${safeFilename(doc.title)}.pdf`,
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] }
        })
        .save();
    } finally {
      setPdfBusy(false);
    }
  }
  if (err) {
    return (
      <div className="container py-4" style={{ maxWidth: 980 }}>
        <h2>Read-only</h2>
        <div className="alert alert-danger">{err}</div>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="container py-4" style={{ maxWidth: 980 }}>
        <h2>Read-only</h2>
        <p>Loading…</p>
      </div>
    );
  }
  let html = "";
  if (doc.type === "text") {
    try {
      const parsed = JSON.parse(doc.content);
      const chunks = parser.parse(parsed);
      html = Array.isArray(chunks) ? chunks.join("") : String(chunks);
    } catch {
      html = `<p>${String(doc.content || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\n", "<br/>")}</p>`;
    }
  }
  const cells = doc.spreadsheet?.cells ?? {};
  return (
    <div className="container py-4" style={{ maxWidth: 980 }}>
      <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div>
          <h2 className="mb-1">{doc.title}</h2>
          <div className="text-muted small">
            Created: {new Date(doc.createdAt).toLocaleString()} • Updated: {new Date(doc.updatedAt).toLocaleString()}
          </div>
        </div>
        <button className="btn btn-outline-primary" onClick={downloadPdf} disabled={pdfBusy}>
          {pdfBusy ? "Generating PDF…" : "Download PDF"}
        </button>
      </div>

      {/*export content starts here */}
      <div ref={pdfRef} className="mt-3">
        {doc.type === "text" ? (
          <div className="card">
            <div className="card-body">
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-sm table-bordered align-middle">
                  <thead>
                    <tr>
                      <th style={{ width: 70 }}></th>
                      {Array.from({ length: 10 }, (_, c) => (
                        <th key={c} className="text-center" style={{ minWidth: 120 }}>
                          {colName(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 10 }, (_, r) => (
                      <tr key={r}>
                        <th className="text-center">{r + 1}</th>
                        {Array.from({ length: 10 }, (_, c) => {
                          const key = cellKey(c, r);
                          const raw = getRaw(cells, key);
                          const view = evalCell(raw, cells);
                          return (
                            <td key={key}>
                              <div className="small text-muted">{raw}</div>
                              {raw.startsWith("=") ? <div className="fw-bold">{view}</div> : <div>{view}</div>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="text-muted small">Read-only spreadsheet view. Only SUM is supported.</div>
            </div>
          </div>
        )}
        {/* Comments read-only */}
        <div className="card mt-3">
          <div className="card-body">
            <h5 className="mb-2">Comments</h5>
            <div className="d-grid gap-2">
              {(doc.comments ?? []).map((c) => (
                <div key={c._id} className="border rounded p-2">
                  {c.quote ? (
                    <div className="small text-muted mb-1">
                      Quote: <em>{c.quote}</em>
                    </div>
                  ) : null}
                  <div>{c.text}</div>
                  <div className="small text-muted mt-1">{new Date(c.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {(doc.comments ?? []).length === 0 ? <div className="text-muted">No comments.</div> : null}
            </div>
          </div>
        </div>
      </div>
      {}
      <div className="text-muted small mt-3">Read-only public view.</div>
    </div>
  );
}
