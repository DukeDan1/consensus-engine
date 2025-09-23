"use client";
import { useState } from "react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true); 
        setErr(null);
        try {
            const res = await fetch("/api/forgot-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            setLoading(false);
            if (res.ok) setSuccess(true);
            else setErr((await res.json()).error ?? "Request failed");
        } catch (err) {
            console.error(err);
            setErr("An error occurred");
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className="container mt-5">
                <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
                    <h1 className="mb-4 text-center">Check your email</h1>
                    <p className="text-center">You will receive an email with instructions to reset your password.</p>
                    <p className="text-center mt-3"><a href="/login">Back to login</a></p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mt-5">
            <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
                <h1 className="mb-4 text-center">Forgot Password</h1>
                <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
                    <div className="form-floating">
                        <input
                            type="email"
                            className="form-control"
                            id="forgotEmail"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                        <label htmlFor="forgotEmail">Email</label>
                    </div>
                    <button disabled={loading} type="submit" className="btn btn-primary mt-2">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : "Send reset link"}
                    </button>
                </form>
                {err && <div className="alert alert-danger mt-5 text-center" role="alert">{err}</div>}
                <p className="text-center mt-3"><a href="/login">Back to login</a></p>
            </div>
        </div>
    );
}
