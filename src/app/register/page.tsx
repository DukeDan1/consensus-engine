"use client";
import { useState } from "react";

export default function RegisterPage() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); 
    setErr(null);
    try {
        const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name }),
        });
        const resJson = await res.json();
        setLoading(false);
        if (resJson.success) window.location.href = "/app";
        else setErr(resJson.error ?? "Registration failed");
    } catch (err) {
        console.error(err);
        setErr("An error occurred");
        setLoading(false);
    }
  }

  return (
    <div className="container mt-5">
        <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
            <h1 className="mb-4 text-center">Register</h1>
            <form onSubmit={onSubmit} style={{ maxWidth: 480, display: "grid", gap: 12 }}>
            <div className="form-floating">
                <input
                type="text"
                autoComplete="name"
                className="form-control"
                id="name"
                placeholder="Name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                />
                <label htmlFor="name">Name</label>
            </div>
            <div className="form-floating">
                <input
                type="email"
                autoComplete="email"
                className="form-control"
                id="email"
                placeholder="Email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                />
                <label htmlFor="email">Email</label>
            </div>
            <div className="form-floating">
                <input
                type="password"
                autoComplete="new-password"
                className="form-control"
                id="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                />
                <label htmlFor="password">Password</label>
            </div>
            <button
                disabled={loading}
                type="submit"
                className="btn btn-primary w-100 mt-2"
            >
                {loading ? <i className="fas fa-spinner fa-spin"></i> : "Create account"}
            </button>
            </form>
        {err && <div className="alert alert-danger mt-5" role="alert">{err}</div>}
        <p className="text-center mt-3">Already have an account? <a href="/login">Log in</a></p>
      </div>
    </div>
  );
}
