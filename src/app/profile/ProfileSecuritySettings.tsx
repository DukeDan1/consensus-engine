"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

type Props = {
  userId: string;
};

export default function ProfileSecuritySettings({ userId }: Props) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const isOwner = !!session?.user?.id && session.user.id === userId;
  const [saving, setSaving] = useState(false);

  if (!isOwner) return null;

  async function handleLogoutOtherDevices() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/revoke-sessions", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to log out other devices");
      }

      if (typeof data?.sessionVersion === "number") {
        await update({ user: { sessionVersion: data.sessionVersion } });
      }
      toast.success("Logged out on other devices");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to log out other devices");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card border-0 shadow-sm">
      <div className="card-header bg-white border-0 pb-0">
        <h2 className="h5 mb-1">Security</h2>
        <p className="text-muted small mb-0">Manage where your account is signed in.</p>
      </div>
      <div className="card-body d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div>
          <div className="fw-semibold">Log out other devices</div>
          <div className="text-muted small">Keep this device signed in and end other sessions.</div>
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={handleLogoutOtherDevices}
          disabled={saving}
        >
          {saving ? "Working..." : "Log out elsewhere"}
        </button>
      </div>
    </section>
  );
}
