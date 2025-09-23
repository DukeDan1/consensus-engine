"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast, ToastContainer } from "react-toastify";

export default function LoginForm() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get("reset") === "success") {
            toast.success("Password reset successful! You can now log in.", { autoClose: 10000 });
        }
        else if (searchParams.get("logged_out") === "true") {
            toast.info("You have been logged out.", { autoClose: 10000 });
        }
    }, [searchParams]);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true); 
        setErr(null);
        try {
            const res = await fetch("/api/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            setLoading(false);
            const resJson = await res.json();
            if (resJson.success) window.location.href = "/app";
            else setErr(resJson.error ?? "Login failed");
        } catch (err) {
            console.error(err);
            setErr("An error occurred");
            setLoading(false);
        }
    }

    return (
        <>
        <div className="container mt-5">
            <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
                <h1 className="mb-4 text-center">Log in</h1>
                <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
                    <div className="form-floating">
                        <input
                            type="email"
                            className="form-control"
                            id="loginEmail"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            autoComplete="email"
                            required
                        />
                        <label htmlFor="loginEmail">Email</label>
                    </div>
                    <div className="form-floating">
                        <input
                            type="password"
                            className="form-control"
                            id="loginPassword"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                        <label htmlFor="loginPassword">Password</label>
                    </div>
                    <button disabled={loading} type="submit" className="btn btn-primary mt-2">
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : "Log in"}
                    </button>
                </form>
                {err && <div className="alert alert-danger mt-5 text-center" role="alert">{err}</div>}
                <p className="text-center mt-3">
                    <span>Need an account? </span><a href="/register">Register</a>
                    <br></br><a href="/forgot-password">Forgot password?</a>
                </p>
            </div>
        </div>
        <ToastContainer />
     </>
    );
}
