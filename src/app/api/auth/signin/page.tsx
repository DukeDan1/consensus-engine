"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");

  const handleEmailSignIn = () => {
    if (!email) return;
    signIn("email", { email, callbackUrl: "/profile" });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl font-bold mb-4">Sign In</h1>

      <button
        className="mb-2 px-4 py-2 bg-blue-500 text-white rounded"
        onClick={() => signIn("google", { callbackUrl: "/profile" })}
      >
        Sign in with Google
      </button>

      <div className="mb-4 flex flex-col items-center">
        <input
          type="email"
          placeholder="Email address"
          className="mb-2 px-2 py-1 border rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          className="px-4 py-2 bg-green-500 text-white rounded"
          onClick={handleEmailSignIn}
        >
          Sign in with Email
        </button>
      </div>

      <p>
        Need an account?
        <Link href="/register" className="text-blue-600 underline">
          Sign Up
        </Link>
      </p>
    </div>
  );
}
