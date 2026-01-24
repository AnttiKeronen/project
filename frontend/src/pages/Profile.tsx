import { useEffect, useState } from "react";
import { api } from "../api";

type Me = {
  id: string;
  email: string;
  avatarUrl: string;
};

export default function Profile() {
  const [me, setMe] = useState<Me | null>(null);
  const [err, setError] = useState("");
  const [msg, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  async function load() {
    setError("");
    try {
      const res = await api.get<Me>("/users/me");
      setMe(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? "Failed to fetch your profile");
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <h2>Profile</h2>
      {err && <div className="alert alert-danger mt-3">{err}</div>}
      {msg && <div className="alert alert-success mt-3">{msg}</div>}
      <div className="card mt-3">
        <div className="card-body">
          <div className="d-flex gap-3 align-items-center flex-wrap">
            <div>
              {me?.avatarUrl ? (
                <img
                  src={`http://localhost:5000${me.avatarUrl}`}
                  alt="avatar"
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: "cover",
                    borderRadius: "50%",
                    border: "1px solid #ddd"
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    border: "1px solid #ddd",
                    display: "grid",
                    placeItems: "center",
                    color: "#777"
                  }}
                >
                  No photo
                </div>
              )}
            </div>

            <div style={{ minWidth: 240 }}>
              <div className="fw-bold">{me?.email || "—"}</div>
              <div className="text-muted small">User ID: {me?.id || "—"}</div>
            </div>
          </div>
          <hr />
          <label className="form-label">Upload profile picture (PNG/JPG/WEBP, max 2MB)</label>
          <input
            className="form-control"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              setMessage("");
              setError("");
              setFile(e.target.files?.[0] ?? null);
            }}
          />
          <button
            className="btn btn-primary mt-3"
            disabled={!file}
            onClick={async () => {
              if (!file) return;
              setError("");
              setMessage("");
              try {
                const fd = new FormData();
                fd.append("avatar", file);
                await api.post("/users/me/avatar", fd, {
                  headers: { "Content-Type": "multipart/form-data" }
                });
                setMessage("Profile picture updated. Looking nice!");
                setFile(null);
                await load();
              } catch (e: any) {
                setError(e?.response?.data?.message ?? "Upload failed");
              }
            }}
          >
            Upload
          </button>
        </div>
      </div>
    </div>
  );
}

