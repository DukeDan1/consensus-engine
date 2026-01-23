"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";

type NotificationPrefs = {
  email?: boolean;
  sms?: boolean;
  push?: boolean;
  emailTopics?: boolean;
  emailArguments?: boolean;
  emailUsers?: boolean;
  emailModeration?: boolean;
};

type Props = {
  userId: string;
  initialPreferences?: NotificationPrefs | null;
};

function buildDefaults(initial?: NotificationPrefs | null): Required<NotificationPrefs> {
  return {
    email: initial?.email ?? true,
    sms: initial?.sms ?? false,
    push: initial?.push ?? false,
    emailTopics: initial?.emailTopics ?? true,
    emailArguments: initial?.emailArguments ?? true,
    emailUsers: initial?.emailUsers ?? true,
    emailModeration: initial?.emailModeration ?? true,
  };
}

export default function ProfileNotificationSettings({ userId, initialPreferences }: Props) {
  const { data: session } = useSession();
  const isOwner = !!session?.user?.id && session.user.id === userId;
  const [prefs, setPrefs] = useState<Required<NotificationPrefs>>(() => buildDefaults(initialPreferences));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPrefs(buildDefaults(initialPreferences));
  }, [initialPreferences]);

  if (!isOwner) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            notifications: prefs,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update notification settings");
      }
      toast.success("Notification settings updated");
    } catch (err: any) {
      toast.error(err?.message || "Unable to update notification settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card border-0 shadow-sm">
      <div className="card-header bg-white border-0 pb-0">
        <h2 className="h5 mb-1">Email notifications</h2>
        <p className="text-muted small mb-0">Choose which activity sends you an email. In-app notifications still apply.</p>
      </div>
      <div className="card-body d-flex flex-column gap-3">
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={prefs.emailTopics}
            onChange={(event) => setPrefs((prev) => ({ ...prev, emailTopics: event.target.checked }))}
          />
          <span className="form-check-label">Activity on topics you follow (posts and comments)</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={prefs.emailArguments}
            onChange={(event) => setPrefs((prev) => ({ ...prev, emailArguments: event.target.checked }))}
          />
          <span className="form-check-label">Replies on posts you follow</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={prefs.emailUsers}
            onChange={(event) => setPrefs((prev) => ({ ...prev, emailUsers: event.target.checked }))}
          />
          <span className="form-check-label">Posts or comments from users you follow</span>
        </label>
        <label className="form-check">
          <input
            className="form-check-input"
            type="checkbox"
            checked={prefs.emailModeration}
            onChange={(event) => setPrefs((prev) => ({ ...prev, emailModeration: event.target.checked }))}
          />
          <span className="form-check-label">Moderator status updates</span>
        </label>
        <div className="d-flex justify-content-end">
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </section>
  );
}
