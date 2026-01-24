import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";

type DocResponse = {
  _id: string;
  type: "spreadsheet";
  title: string;
  spreadsheet?: { cells?: any };
  createdAt: string;
  updatedAt: string;
};
function colName(i: number) {
  return String.fromCharCode("A".charCodeAt(0) + i);
}
function cellKey(c: number, r: number) {
  return `${colName(c)}${r + 1}`;
}
function normalizeCells(input: any): Record<string, string> {
  const cells = input?.cells ?? input ?? {};
  //already a plain object
  if (cells && typeof cells === "object" && !Array.isArray(cells)) {
    // map serialized as or normal object
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(cells)) {
      if (typeof v === "string") out[String(k).toUpperCase()] = v;
      else if (v != null) out[String(k).toUpperCase()] = String(v);
    }
    return out;
  }
  //array of entries
  if (Array.isArray(cells)) {
    const out: Record<string, string> = {};
    for (const item of cells) {
      if (Array.isArray(item) && item.length >= 2) {
        const k = String(item[0]).toUpperCase();
        const v = item[1];
        out[k] = typeof v === "string" ? v : String(v ?? "");
      }
    }
    return out;
  }
  return {};
}
function parseCellRef(ref: string) {
  const m = ref.trim().toUpperCase().match(/^([A-Z])([1-9]\d*)$/);
  if (!m) return null;
  return { col: m[1], row: Number(m[2]) };
}
function sumRange(a: string, b: string, getRaw: (k: string) => string): number {
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
      const raw = getRaw(key);
      const n = Number(raw);
      if (!Number.isNaN(n)) s += n;
    }
  }
  return s;
}
function evalCell(raw: string, getRaw: (k: string) => string): string {
  const v = (raw ?? "").trim();
  if (!v.startsWith("=")) return v;
  // only sum
  const m = v.toUpperCase().match(/^=SUM\((.+)\)$/);
  if (!m) return "#ERR";
  const inside = m[1].trim();
  if (inside.includes(":")) {
    const [a, b] = inside.split(":");
    const s = sumRange(a, b, getRaw);
    return String(s);
  }
  const parts = inside
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let s = 0;
  for (const p of parts) {
    const ref = parseCellRef(p);
    if (!ref) continue;
    const key = `${ref.col}${ref.row}`;
    const n = Number(getRaw(key));
    if (!Number.isNaN(n)) s += n;
  }
  return String(s);
}
export default function Spreadsheet() {
  const { id } = useParams();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [cells, setCells] = useState<Record<string, string>>({});
  const [msg, setMessage] = useState("");
  const [err, setError] = useState("");
  async function lock() {
    await api.post(`/documents/${id}/lock`);
  }
  async function unlock() {
    await api.post(`/documents/${id}/unlock`);
  }
  useEffect(() => {
    (async () => {
      setError("");
      setMessage("");
      try {
        const res = await api.get<DocResponse>(`/documents/${id}`);
        if (res.data.type !== "spreadsheet") {
          setError("This is not a spreadsheet document.");
          return;
        }
        setTitle(res.data.title);
        setCells(normalizeCells(res.data.spreadsheet));
        try {
          await lock();
        } catch (e: any) {
          // lock messge
          const m = e?.response?.data?.message ?? "Will not lock the doc";
          setError(m);
        }
      } catch (e: any) {
        setError(e?.response?.data?.message ?? "Not giving you the spreadsheet");
      }
    })();
    const onUnload = () => unlock().catch(() => {});
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      unlock().catch(() => {});
    };
  }, [id]);
  const getRaw = (k: string) => cells[k.toUpperCase()] ?? "";
  const grid = useMemo(() => {
    const cols = 10;
    const rows = 10;
    const out: Array<{ key: string; raw: string; view: string }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = cellKey(c, r);
        const raw = getRaw(key);
        const view = evalCell(raw, getRaw);
        out.push({ key, raw, view });
      }
    }
    return out;
  }, [cells]); 
  return (
    <div className="container py-4" style={{ maxWidth: 1100 }}>
      <div className="d-flex gap-2 align-items-center flex-wrap">
        <button className="btn btn-outline-secondary" onClick={() => nav("/")}>
          ← Back
        </button>
        <h2 className="m-0">Spreadsheet</h2>
      </div>
      {err && <div className="alert alert-danger mt-3">{err}</div>}
      {msg && <div className="alert alert-success mt-3">{msg}</div>}
      <div className="card mt-3">
        <div className="card-body">
          <label className="form-label">Title</label>
          <input className="form-control" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="d-flex gap-2 mt-3 flex-wrap">
            <button
              className="btn btn-primary"
              onClick={async () => {
                setMessage("");
                setError("");
                try {
                  await api.put(`/documents/${id}/rename`, { title });
                  setMessage("Title saved.");
                } catch (e: any) {
                  setError(e?.response?.data?.message ?? "Rename failed");
                }
              }}
            >
              Save title
            </button>
            <button
              className="btn btn-success"
              onClick={async () => {
                setMessage("");
                setError("");
                try {
                  //store uppercase keys
                  const normalized: Record<string, string> = {};
                  for (const [k, v] of Object.entries(cells)) normalized[String(k).toUpperCase()] = v;
                  await api.put(`/documents/${id}/spreadsheet`, { cells: normalized });
                  setMessage("Spreadsheet saved.");
                } catch (e: any) {
                  setError(e?.response?.data?.message ?? "Save failed");
                }
              }}
            >
              Save spreadsheet
            </button>
          </div>
          <div className="text-muted small mt-3">
            Use <code>=SUM(A1:A3)</code> or <code>=SUM(A1,B2,C3)</code>. Only SUM is required.
          </div>
          <div className="table-responsive mt-3">
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
                      const raw = getRaw(key);
                      const view = evalCell(raw, getRaw);
                      return (
                        <td key={key}>
                          <input
                            className="form-control form-control-sm"
                            value={raw}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCells((prev) => ({ ...prev, [key.toUpperCase()]: v }));
                            }}
                            placeholder={view !== raw ? `= ${view}` : ""}
                          />
                          {raw.trim().startsWith("=") ? (
                            <div className="text-muted small mt-1">= {view}</div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
