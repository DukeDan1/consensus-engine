"use client";
import { useState } from "react";

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true); 
        setErr(null);
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");
        if (!token) {
            setErr("Invalid or missing token");
            setLoading(false);
            return;
        }
        try {
            const res = await fetch("/api/reset-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, newPassword: password }),
            });
            setLoading(false);
            var resJson = await res.json();
            if (resJson.success) window.location.href = "/login?reset=success";
            else setErr(resJson.error ?? "Password reset failed");
        } catch (err) {
            setLoading(false);
            if (err instanceof Response) {
                try {
                    const errJson = await err.json();
                    setErr(errJson.error ?? "Password reset failed");
                } catch {
                    setErr("Password reset failed");
                }
            } else if (err instanceof Error) {
                setErr(err.message ?? "Password reset failed");
            } else {
                setErr("Password reset failed");
            }
        }
    }

    return (
        <div className="container mt-5">
            <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
                <h1 className="mb-4 text-center">Reset Password</h1>
                <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
                    <div className="form-floating">
                        <input
                            type="password"
                            className="form-control"
                            id="resetPassword"
                            placeholder="New Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                        />
                        <label htmlFor="resetPassword">New Password</label>
                    </div>
                    <button disabled={loading} type="submit" className="btn btn-primary mt-2">
                        {loading ? "Resetting..." : "Reset Password"}
                    </button>
                    {err && <div className="alert alert-danger mt-2" role="alert">{err}</div>}
                </form>
            </div>
        </div>
    );
}
