import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { setToken } from "../auth";

export default function Register() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setError] = useState("");
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>Register</h2>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
      <button
        onClick={async () => {
          setError("");
          try {
            const res = await api.post("/auth/register", { email, password });
            setToken(res.data.token);
            nav("/");
          } catch (e: any) {
            setError(e?.response?.data?.message ?? "Register failed");
          }
        }}
      >
        Register
      </button>
      <p style={{ marginTop: 12 }}>
        If ur boss and have an account <Link to="/login">Login</Link>
      </p>
    </div>
  );
}

