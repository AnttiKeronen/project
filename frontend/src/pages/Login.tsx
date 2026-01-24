import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { setToken } from "../auth";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setError] = useState("");
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Login</h2>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <button
        onClick={async () => {
          setError("");
          try {
            const res = await api.post("/auth/login", { email, password });
            setToken(res.data.token);
            nav("/");
          } catch (e: any) {
            setError(e?.response?.data?.message ?? "Login failed");
          }
        }}
      >
        Login
      </button>
      <p style={{ marginTop: 12 }}>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
