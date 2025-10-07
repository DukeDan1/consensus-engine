"use client";
// app/profile/step-2/page.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function ProfileStep2Page() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [userId, setUserId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch user ID
  useEffect(() => {
    const fetchUserId = async () => {
      if (session?.user?.id) {
        setUserId(session.user.id);
      } else if (session?.user?.email) {
        try {
          const res = await fetch(`/api/user-by-email?email=${session.user.email}`);
          const data = await res.json();
          if (res.ok && data?.id) {
            setUserId(data.id);
          } else {
            setError("Unable to fetch user ID");
          }
        } catch (err) {
          setError("Error fetching user ID");
        }
      }
    };

    fetchUserId();
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!userId) {
      setError("User details not found");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          address,
          bio,
          onboardingStep: 3,
        }),
      });

      if (!res.ok) throw new Error("Failed to update profile");

      router.push("/profile/complete");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError("");

    if (!userId) {
      setError("User details not found");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: userId,
          onboardingStep: 3,
        }),
      });

      if (!res.ok) throw new Error("Failed to skip profile step");

      router.push("/profile/complete");
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
        <h2 className="text-2xl font-bold">Step 2: Additional Info</h2>

        {error && <p className="text-red-500">{error}</p>}

        <div>
          <label className="block mb-1">Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Your address"
            className="border rounded w-full p-2"
            disabled={isDisabled}
          />
        </div>

        <div>
          <label className="block mb-1">Short Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself"
            className="border rounded w-full p-2"
            rows={4}
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
