"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import { signIn } from "next-auth/react";
import Link from "next/link";

const errorMessages: Record<string, string> = {
  CredentialsSignin: "Invalid email or password. Please try again.",
  EmailSignin: "Email sign-in failed. Please check your inbox or try again.",
  OAuthSignin: "OAuth sign-in failed. Please try a different provider.",
  OAuthCallback: "OAuth callback error. Please try again.",
  AccessDenied: "Access denied. You do not have permission to sign in.",
  Configuration: "Authentication configuration error. Contact support.",
  Verification: "Email verification failed. Please request a new link.",
};


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
    const router = useRouter();

    const handleEmailPasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr("");
        setLoading(true);
        try {
            const res = await signIn("email-password", {
            redirect: false,
            email,
            password,
            callbackUrl: "/app",
            });

            setLoading(false);

            if (res?.error) {
                setErr(errorMessages[res.error] || "Invalid email or password");
            } else {
                router.push("/app");
            }
        } catch(err) {
            console.error(err);
            setErr("An error occurred");
            setLoading(false);
        }
    };

    return (
        <>
        <div className="container mt-5">
            <div className="card" style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
                <h1 className="mb-4 text-center">Log in</h1>
                <form onSubmit={handleEmailPasswordLogin} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
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
                    <span>Need an account? </span><Link href="/register">Register</Link>
                    <br></br><Link href="/forgot-password">Forgot password?</Link>
                </p>
            </div>
        </div>
     </>
    );
}