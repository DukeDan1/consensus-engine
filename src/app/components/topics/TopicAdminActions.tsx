"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "react-toastify";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

type Props = {
  topicId: string;
  topicTitle?: string;
  enabled?: boolean;
};

export default function TopicAdminActions({ topicId, topicTitle, enabled = false }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showModerators, setShowModerators] = useState(false);
  const [moderators, setModerators] = useState<Array<{
    id: string;
    name?: string;
    nickname?: string;
    email?: string;
    avatarUrl?: string;
    avatarThumbUrl?: string;
  }>>([]);
  const [moderatorInput, setModeratorInput] = useState("");
  const [moderatorError, setModeratorError] = useState<string | null>(null);
  const [moderatorLoading, setModeratorLoading] = useState(false);
  const [moderatorSaving, setModeratorSaving] = useState(false);
  const [moderatorRemovingId, setModeratorRemovingId] = useState<string | null>(null);
  const [autoModeratorEnabled, setAutoModeratorEnabled] = useState(true);
  const [autoModeratorSaving, setAutoModeratorSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    name?: string;
    nickname?: string;
    email?: string;
    avatarUrl?: string;
    avatarThumbUrl?: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const modalTitleId = useId();
  const modalBodyId = useId();

  const canManage = !!session?.user?.isAdmin && enabled;

  useEffect(() => {
    if (!showModerators || !canManage) return;
    const load = async () => {
      setModeratorLoading(true);
      setModeratorError(null);
      try {
        const res = await fetch(`/api/topics/${topicId}/moderators`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load moderators");
        }
        setModerators(Array.isArray(data?.moderators) ? data.moderators : []);
        setAutoModeratorEnabled(data?.autoModeratorEnabled !== false);
      } catch (err: any) {
        setModeratorError(err?.message || "Failed to load moderators");
      } finally {
        setModeratorLoading(false);
      }
    };
    load();
  }, [showModerators, topicId, canManage]);

  useEffect(() => {
    if (!showModerators || !canManage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setShowModerators(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showModerators, canManage]);

  useEffect(() => {
    if (!showModerators || !canManage) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to search users");
        }
        if (!active) return;
        setSearchResults(Array.isArray(data?.users) ? data.users : []);
      } catch (err: any) {
        if (!active) return;
        setSearchResults([]);
        setModeratorError(err?.message || "Failed to search users");
      } finally {
        if (active) setSearchLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [searchQuery, showModerators, canManage]);

  async function handleDelete() {
    setPending(true);
    try {
      const res = await fetch(`/api/topics/${topicId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete topic");
      }
      toast.success("Topic deleted");
      router.push("/topics");
      router.refresh();
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete topic");
    } finally {
      setPending(false);
      setShowDelete(false);
    }
  }

  async function handleAddModerator(identifierOverride?: string) {
    const identifier = (identifierOverride || moderatorInput).trim();
    if (!identifier) {
      setModeratorError("Enter a user ID or email");
      return;
    }
    setModeratorSaving(true);
    setModeratorError(null);
    try {
      const res = await fetch(`/api/topics/${topicId}/moderators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to add moderator");
      }
      setModerators(Array.isArray(data?.moderators) ? data.moderators : []);
      setAutoModeratorEnabled(data?.autoModeratorEnabled !== false);
      setModeratorInput("");
      toast.success("Moderator added");
    } catch (err: any) {
      const message = err?.message || "Failed to add moderator";
      setModeratorError(message);
      toast.error(message);
    } finally {
      setModeratorSaving(false);
    }
  }

  async function handleAddModeratorFromSearch(userId: string) {
    if (!userId) return;
    await handleAddModerator(userId);
  }

  async function handleRemoveModerator(userId: string) {
    if (!userId) return;
    setModeratorRemovingId(userId);
    setModeratorError(null);
    try {
      const res = await fetch(`/api/topics/${topicId}/moderators`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove moderator");
      }
      setModerators(Array.isArray(data?.moderators) ? data.moderators : []);
      setAutoModeratorEnabled(data?.autoModeratorEnabled !== false);
      toast.success("Moderator removed");
    } catch (err: any) {
      const message = err?.message || "Failed to remove moderator";
      setModeratorError(message);
      toast.error(message);
    } finally {
      setModeratorRemovingId(null);
    }
  }

  async function handleAutoModeratorToggle(nextValue: boolean) {
    setAutoModeratorSaving(true);
    setModeratorError(null);
    try {
      const res = await fetch(`/api/topics/${topicId}/moderators`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoModeratorEnabled: nextValue }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update auto-moderator setting");
      }
      setAutoModeratorEnabled(data?.autoModeratorEnabled !== false);
      toast.success(nextValue ? "Automatic moderator promotion enabled" : "Automatic moderator promotion disabled");
    } catch (err: any) {
      const message = err?.message || "Failed to update auto-moderator setting";
      setModeratorError(message);
      toast.error(message);
    } finally {
      setAutoModeratorSaving(false);
    }
  }

  const label = topicTitle ? `"${topicTitle}"` : "this topic";

  if (!canManage) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline-danger btn-sm"
        onClick={() => setShowDelete(true)}
        disabled={pending}
      >
        Delete topic
      </button>
      <button
        type="button"
        className="btn btn-outline-secondary btn-sm"
        onClick={() => setShowModerators(true)}
        disabled={pending}
      >
        Manage moderators
      </button>
      <ConfirmModal
        isOpen={showDelete}
        title="Delete topic"
        body={<p className="mb-0">Delete {label}? This cannot be undone.</p>}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmIconClass="fa-solid fa-trash"
        isBusy={pending}
        onCancel={() => setShowDelete(false)}
        onConfirm={handleDelete}
      />
      {showModerators && (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={modalBodyId}
          >
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title" id={modalTitleId}>
                    Manage moderators
                  </h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setShowModerators(false)} />
                </div>
                <div className="modal-body" id={modalBodyId}>
                  <div className="d-flex align-items-center justify-content-between mb-3">
                    <div>
                      <div className="fw-semibold">Automatic moderator promotion</div>
                      <div className="text-muted small">Automatically promote eligible users for this topic.</div>
                    </div>
                    <div className="form-check form-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id={`${topicId}-auto-moderator`}
                        checked={autoModeratorEnabled}
                        onChange={(event) => handleAutoModeratorToggle(event.target.checked)}
                        disabled={autoModeratorSaving || moderatorLoading}
                      />
                    </div>
                  </div>
                  <label className="form-label">Search by name or email</label>
                  <input
                    className="form-control mb-2"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Start typing a name or email"
                  />
                  {searchLoading ? (
                    <div className="text-muted small mb-3">Searching users...</div>
                  ) : searchResults.length ? (
                    <ul className="list-group mb-3">
                      {searchResults.map((user) => (
                        <li key={user.id} className="list-group-item d-flex align-items-center justify-content-between">
                          <div>
                            <div className="fw-semibold">
                              {user.name || user.nickname || user.email || user.id}
                            </div>
                            {user.email && <div className="text-muted small">{user.email}</div>}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm"
                            onClick={() => handleAddModeratorFromSearch(user.id)}
                            disabled={moderatorSaving}
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : searchQuery.trim() ? (
                    <div className="text-muted small mb-3">No users found.</div>
                  ) : null}
                  <label className="form-label">Add moderator by user ID or email</label>
                  <div className="input-group mb-3">
                    <input
                      className="form-control"
                      value={moderatorInput}
                      onChange={(event) => setModeratorInput(event.target.value)}
                      placeholder="userId or email"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={async () => await handleAddModerator()}
                      disabled={moderatorSaving}
                    >
                      {moderatorSaving ? "Adding..." : "Add"}
                    </button>
                  </div>
                  {moderatorError && <div className="alert alert-danger py-2">{moderatorError}</div>}
                  <div className="fw-semibold mb-2">Current moderators</div>
                  {moderatorLoading ? (
                    <div className="text-muted small">Loading moderators...</div>
                  ) : moderators.length ? (
                    <ul className="list-group">
                      {moderators.map((mod) => (
                        <li key={mod.id} className="list-group-item d-flex align-items-center justify-content-between">
                          <div>
                            <div className="fw-semibold">
                              {mod.name || mod.nickname || mod.email || mod.id}
                            </div>
                            {mod.email && <div className="text-muted small">{mod.email}</div>}
                          </div>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => handleRemoveModerator(mod.id)}
                            disabled={moderatorRemovingId === mod.id}
                          >
                            {moderatorRemovingId === mod.id ? "Removing..." : "Remove"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-muted small">No moderators assigned to this topic.</div>
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModerators(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowModerators(false)} role="presentation" />
        </>
      )}
    </>
  );
}
