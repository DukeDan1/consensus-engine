"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProfileSetupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch user profile by email
  useEffect(() => {
    const fetchUserData = async () => {
      if (session?.user?.email) {
        setEmail(session.user.email);
        try {
          const res = await fetch("/api/user-by-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: session.user.email }),
          });

          if (!res.ok) {
              const text = await res.text();
              console.error("Non-OK response:", res.status, text);
              setError("Unable to fetch user profile");
              return;
            }

          const data = await res.json();
          console.log("Fetched user data:", data);
          const user = data.user;
          if (res.ok && user) {
            if (user.onboardingStep && user.onboardingStep >= 2) {
              router.push("/dashboard"); // already completed
              return;
            }

            if (user.name) setName(user.name);
            if (user.nickname) setNickname(user.nickname);
            if (user.phone) setPhone(user.phone);
          } else {
            setError("Unable to fetch user profile");
          }
        } catch (err) {
          console.error("Fetch error:", err);
          setError("Error fetching user profile");
        }
      }
    };

    fetchUserData();
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("User email not found");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          nickname,
          phone,
          onboardingStep: 2,
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      router.push("/profile-setup/step-2");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    if (!email) {
      setError("User email not found");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          onboardingStep: 2,
        }),
      });

      if (!res.ok) throw new Error("Failed to skip profile setup");

      router.push("/profile-setup/step-2");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = status !== "authenticated" || loading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 bg-white p-6 rounded shadow"
      >
        <h2 className="text-2xl font-bold">Step 1: Basic Info</h2>

        {error && <p className="text-red-500">{error}</p>}

        <div>
          <label className="block mb-1">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="border rounded w-full p-2"
            disabled={isDisabled}
          />
        </div>

        <div>
          <label className="block mb-1">Nickname</label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="What should we call you?"
            className="border rounded w-full p-2"
            disabled={isDisabled}
          />
        </div>

        <div>
          <label className="block mb-1">Phone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className="border rounded w-full p-2"
            disabled={isDisabled}
          />
        </div>

        <button
          type="submit"
          disabled={isDisabled}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600"
        >
          {loading ? "Saving..." : "Continue"}
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={isDisabled}
          className="w-full bg-gray-300 text-gray-700 py-2 px-4 rounded hover:bg-gray-400"
        >
          {loading ? "Skipping..." : "Skip"}
        </button>
      </form>
    </div>
  );
}
