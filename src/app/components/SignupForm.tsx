"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!gdprConsent) {
      setError("You must agree to GDPR consent");
      return;
    }

    // Signup/Login via CredentialsProvider
    const res = await signIn("credentials", {
      redirect: true,
      email,
      password,
      gdprConsent,
    });

    if (res?.error) {
      setError(res.error);
    } else {
      // Redirect to progressive profile setup
      router.push("/profile-setup");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-10">
      {error && <p className="text-red-500">{error}</p>}

      <div>
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border rounded w-full p-2"
        />
      </div>

      <div>
        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border rounded w-full p-2"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          checked={gdprConsent}
          onChange={(e) => setGdprConsent(e.target.checked)}
          className="mr-2"
        />
        <label>I agree to GDPR consent</label>
      </div>

      <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
        Sign Up / Login
      </button>
    </form>
  );
}
