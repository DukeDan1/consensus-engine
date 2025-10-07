"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function ProfileSetup() {
  const { data: session } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) router.push("/register");
  }, [session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!session?.user?.id) {
      setError("User session not found");
      return;
    }

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: session.user.id, name, phone }),
    });

    if (res.ok) {
      router.push("/dashboard"); // or wherever
    } else {
      setError("Failed to update profile");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto mt-10">
      {error && <p className="text-red-500">{error}</p>}

      <div>
        <label>Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded w-full p-2"
        />
      </div>

      <div>
        <label>Phone</label>
        <input
          type="text"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border rounded w-full p-2"
        />
      </div>

      <button type="submit" className="bg-green-500 text-white px-4 py-2 rounded">
        Complete Profile
      </button>
    </form>
  );
}
