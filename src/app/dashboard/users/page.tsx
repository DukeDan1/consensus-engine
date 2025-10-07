"use client";

import { useEffect, useState } from "react";

interface User {
  _id: string;
  email?: string;
  phone?: string;
  name?: string;
  authProvider?: string;
  createdAt?: string;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (res.ok) {
          setUsers(data.users);
        } else {
          setError(data.error || "Failed to load users");
        }
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>

      {loading && <p>Loading users...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && (
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Name</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Phone</th>
              <th className="border p-2">Provider</th>
              <th className="border p-2">Created At</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id}>
                <td className="border p-2">{user.name || "-"}</td>
                <td className="border p-2">{user.email || "-"}</td>
                <td className="border p-2">{user.phone || "-"}</td>
                <td className="border p-2">{user.authProvider || "-"}</td>
                <td className="border p-2">{new Date(user.createdAt!).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
