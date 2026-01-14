"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

type Props = {
  userId: string;
  initialBio?: string | null;
};

const MAX_BIO_LENGTH = 1000;

export default function ProfileBioCard({ userId, initialBio }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const isOwner = !!session?.user?.id && session.user.id === userId;
  const [bio, setBio] = useState(initialBio ?? "");
  const [draft, setDraft] = useState(initialBio ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasBio = bio.trim().length > 0;

  if (!isOwner && !hasBio) {
    return null;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const nextBio = draft.trim();
      const res = await fetch("/api/user/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: nextBio }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update bio");
      }
      setBio(nextBio);
      setEditing(false);
      toast.success("Bio updated");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to update bio");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(bio);
    setEditing(false);
  }

  return (
    <section className="card border-0 shadow-sm">
      <div className="card-header bg-white border-0 pb-0 d-flex justify-content-between align-items-center">
        <div>
          <h2 className="h5 mb-1">Bio</h2>
          <p className="text-muted small mb-0">Share a short description about yourself.</p>
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              setDraft(bio);
              setEditing(true);
            }}
          >
            {hasBio ? "Edit bio" : "Add bio"}
          </button>
        )}
      </div>
      <div className="card-body">
        {editing ? (
          <div className="d-flex flex-column gap-3">
            <textarea
              className="form-control"
              rows={5}
              maxLength={MAX_BIO_LENGTH}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Tell others about yourself..."
            />
            <div className="d-flex align-items-center justify-content-between">
              <small className="text-muted">
                {draft.length}/{MAX_BIO_LENGTH} characters
              </small>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary btn-sm"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save bio"}
                </button>
              </div>
            </div>
          </div>
        ) : hasBio ? (
          <p className="mb-0">{bio}</p>
        ) : (
          <p className="text-muted mb-0">No bio yet.</p>
        )}
      </div>
    </section>
  );
}
