"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "react-toastify";
import { timeAgo } from "@/app/lib/commonFunctions";
import ConfirmModal from "@/app/components/ui/ConfirmModal";

type VisibilityInfo = {
  status?: string;
  reason?: string;
  categories?: string[];
  spamLikelihood?: number;
  trollingLikelihood?: number;
  offTopicLikelihood?: number;
  illegalOrHarmfulLikelihood?: number;
  quality?: number;
  model?: string;
};

type ModerationTopic = {
  id: string;
  title: string;
  description?: string;
  createdAt?: string;
  createdBy?: { _id?: string; name?: string };
  visibility?: VisibilityInfo;
};

type ModerationArgument = {
  id: string;
  body: string;
  createdAt?: string;
  createdBy?: { _id?: string; name?: string };
  topic?: { id?: string; title?: string };
  visibility?: VisibilityInfo;
};

type ModerationComment = {
  id: string;
  body: string;
  createdAt?: string;
  createdBy?: { _id?: string; name?: string };
  argument?: { id?: string; body?: string };
  topic?: { id?: string; title?: string };
  visibility?: VisibilityInfo;
};

type ModerationAvatar = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  avatarOriginalUrl?: string | null;
  avatarOriginalThumbUrl?: string | null;
  moderation?: {
    status?: string;
    reasons?: string[];
    flaggedAt?: string | Date | null;
  } | null;
};

type Props = {
  topics: ModerationTopic[];
  arguments: ModerationArgument[];
  comments: ModerationComment[];
  avatars: ModerationAvatar[];
};

type DeleteTarget = {
  type: "topic" | "argument" | "comment";
  id: string;
};

function snippet(text: string | undefined, max = 200) {
  if (!text) return "";
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const sliceLength = Math.max(0, max - 3);
  return `${trimmed.slice(0, sliceLength)}...`;
}

function formatTime(value?: string) {
  if (!value) return "";
  return timeAgo(value);
}

function renderCategories(categories?: string[]) {
  if (!categories?.length) return null;
  return (
    <div className="d-flex flex-wrap gap-1 mt-1">
      {categories.map((cat) => (
        <span key={cat} className="badge text-bg-warning">
          {cat}
        </span>
      ))}
    </div>
  );
}

function renderUserLink(user?: { _id?: string; name?: string }) {
  const name = user?.name || "Unknown";
  const userId = user?._id;
  if (!userId) return <span>{name}</span>;
  return (
    <Link href={`/profile/${userId}`} className="author-link">
      {name}
    </Link>
  );
}

export default function ModerationQueue({
  topics: initialTopics,
  arguments: initialArguments,
  comments: initialComments,
  avatars: initialAvatars,
}: Props) {
  const [topics, setTopics] = useState(initialTopics);
  const [argumentsList, setArgumentsList] = useState(initialArguments);
  const [comments, setComments] = useState(initialComments);
  const [avatars, setAvatars] = useState(initialAvatars);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [restoring, setRestoring] = useState<Record<string, boolean>>({});

  function setPendingKey(key: string, value: boolean) {
    setPending((prev) => ({ ...prev, [key]: value }));
  }

  function setRestoringKey(key: string, value: boolean) {
    setRestoring((prev) => ({ ...prev, [key]: value }));
  }

  async function deleteTopic(id: string) {
    const key = `topic-${id}`;
    setPendingKey(key, true);
    try {
      const res = await fetch(`/api/topics/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete topic");
      }
      setTopics((prev) => prev.filter((item) => item.id !== id));
      toast.success("Topic deleted");
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete topic");
    } finally {
      setPendingKey(key, false);
    }
  }

  async function restoreItem(options: {
    type: DeleteTarget["type"];
    id: string;
    endpoint: string;
    body: Record<string, any>;
    onSuccess: () => void;
    successMessage: string;
  }) {
    const { type, id, endpoint, body, onSuccess, successMessage } = options;
    const key = `${type}-${id}`;
    setRestoringKey(key, true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to restore item");
      }
      onSuccess();
      toast.success(successMessage);
    } catch (err: any) {
      toast.error(err?.message || "Unable to restore item");
    } finally {
      setRestoringKey(key, false);
    }
  }

  async function deleteArgument(id: string) {
    const key = `argument-${id}`;
    setPendingKey(key, true);
    try {
      const res = await fetch("/api/argument", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete argument");
      }
      setArgumentsList((prev) => prev.filter((item) => item.id !== id));
      toast.success("Argument deleted");
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete argument");
    } finally {
      setPendingKey(key, false);
    }
  }

  async function deleteComment(id: string) {
    const key = `comment-${id}`;
    setPendingKey(key, true);
    try {
      const res = await fetch("/api/comment", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to delete comment");
      }
      setComments((prev) => prev.filter((item) => item.id !== id));
      toast.success("Comment deleted");
    } catch (err: any) {
      toast.error(err?.message || "Unable to delete comment");
    } finally {
      setPendingKey(key, false);
    }
  }

  async function moderateAvatar(userId: string, action: "approve" | "remove") {
    const key = `avatar-${userId}-${action}`;
    setPendingKey(key, true);
    try {
      const res = await fetch(`/api/admin/avatars/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update avatar");
      }
      setAvatars((prev) => prev.filter((item) => item.id !== userId));
      toast.success(action === "approve" ? "Avatar approved" : "Avatar removed");
    } catch (err: any) {
      toast.error(err?.message || "Unable to update avatar");
    } finally {
      setPendingKey(key, false);
    }
  }

  async function restoreTopic(id: string) {
    await restoreItem({
      type: "topic",
      id,
      endpoint: `/api/topics/${id}`,
      body: { status: "visible" },
      onSuccess: () => setTopics((prev) => prev.filter((item) => item.id !== id)),
      successMessage: "Topic restored",
    });
  }

  async function restoreArgument(id: string) {
    await restoreItem({
      type: "argument",
      id,
      endpoint: "/api/argument",
      body: { id, status: "visible" },
      onSuccess: () => setArgumentsList((prev) => prev.filter((item) => item.id !== id)),
      successMessage: "Argument restored",
    });
  }

  async function restoreComment(id: string) {
    await restoreItem({
      type: "comment",
      id,
      endpoint: "/api/comment",
      body: { id, status: "visible" },
      onSuccess: () => setComments((prev) => prev.filter((item) => item.id !== id)),
      successMessage: "Comment restored",
    });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    if (type === "topic") await deleteTopic(id);
    if (type === "argument") await deleteArgument(id);
    if (type === "comment") await deleteComment(id);
    setDeleteTarget(null);
  }

  function buildDeleteMessage(target: DeleteTarget | null) {
    if (!target) return "Delete this item?";
    if (target.type === "topic") return "Delete this topic? This cannot be undone.";
    if (target.type === "argument") return "Delete this argument? This cannot be undone.";
    return "Delete this comment? This cannot be undone.";
  }

  return (
    <div className="d-flex flex-column gap-4">
      <section>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Avatars held for review</h2>
          <span className="badge text-bg-secondary">{avatars.length}</span>
        </div>
        {avatars.length === 0 ? (
          <div className="alert alert-light">No avatars awaiting review.</div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {avatars.map((avatar) => {
              const reasons = avatar.moderation?.reasons ?? [];
              const flaggedAt = avatar.moderation?.flaggedAt
                ? formatTime(String(avatar.moderation.flaggedAt))
                : "";
              const previewUrl = avatar.avatarThumbUrl || avatar.avatarUrl || undefined;
              const originalUrl = avatar.avatarOriginalUrl || avatar.avatarOriginalThumbUrl || undefined;
              return (
                <div key={avatar.id} className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between gap-3">
                      <div className="d-flex align-items-center gap-3">
                        {previewUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrl}
                            alt={`${avatar.name} avatar`}
                            width={64}
                            height={64}
                            className="rounded-circle border"
                            style={{ objectFit: "cover" }}
                          />
                        ) : (
                          <div className="rounded-circle bg-secondary-subtle border" style={{ width: 64, height: 64 }} />
                        )}
                        <div>
                          <div className="fw-semibold">{avatar.name}</div>
                          {avatar.email && <div className="text-muted small">{avatar.email}</div>}
                          {flaggedAt && <div className="text-muted small">Flagged {flaggedAt}</div>}
                          {reasons.length > 0 && (
                            <div className="d-flex flex-wrap gap-1 mt-1">
                              {reasons.map((reason) => (
                                <span key={reason} className="badge text-bg-warning">
                                  {reason}
                                </span>
                              ))}
                            </div>
                          )}
                          {originalUrl && (
                            <div className="small text-muted mt-1">
                              <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="text-decoration-none">
                                View original
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => moderateAvatar(avatar.id, "remove")}
                          disabled={pending[`avatar-${avatar.id}-remove`]}
                        >
                          {pending[`avatar-${avatar.id}-remove`] ? "Removing..." : "Remove"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => moderateAvatar(avatar.id, "approve")}
                          disabled={pending[`avatar-${avatar.id}-approve`]}
                        >
                          {pending[`avatar-${avatar.id}-approve`] ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <section>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Topics held for review</h2>
          <span className="badge text-bg-secondary">{topics.length}</span>
        </div>
        {topics.length === 0 ? (
          <div className="alert alert-light">No topics awaiting review.</div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {topics.map((topic) => {
              const visibility = topic.visibility;
              const pendingKey = `topic-${topic.id}`;
              const canRestore = visibility?.status && visibility.status !== "visible";
              const restoringKey = `topic-${topic.id}`;
              return (
                <div key={topic.id} className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <Link href={`/topics/${topic.id}`} className="h6 text-decoration-none">
                          {topic.title}
                        </Link>
                        <div className="text-muted small">
                          {renderUserLink(topic.createdBy)} - {formatTime(topic.createdAt)}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleteTarget({ type: "topic", id: topic.id })}
                          disabled={pending[pendingKey]}
                        >
                          {pending[pendingKey] ? "Deleting..." : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => restoreTopic(topic.id)}
                          disabled={restoring[restoringKey] || !canRestore}
                        >
                          {restoring[restoringKey] ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    </div>
                    {topic.description && <p className="mt-2 mb-1">{snippet(topic.description, 220)}</p>}
                    {visibility?.reason && <div className="small text-muted">Reason: {visibility.reason}</div>}
                    {visibility?.spamLikelihood !== undefined && (
                      <div className="small text-muted">Spam likelihood: {visibility.spamLikelihood}</div>
                    )}
                    {renderCategories(visibility?.categories)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Arguments held for review</h2>
          <span className="badge text-bg-secondary">{argumentsList.length}</span>
        </div>
        {argumentsList.length === 0 ? (
          <div className="alert alert-light">No arguments awaiting review.</div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {argumentsList.map((argument) => {
              const visibility = argument.visibility;
              const pendingKey = `argument-${argument.id}`;
              const canRestore = visibility?.status && visibility.status !== "visible";
              const restoringKey = `argument-${argument.id}`;
              const topicHref = argument.topic?.id
                ? `/topics/${argument.topic.id}#argument-${argument.id}`
                : "#";
              return (
                <div key={argument.id} className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <Link href={topicHref} className="h6 text-decoration-none">
                          {argument.topic?.title || "View argument"}
                        </Link>
                        <div className="text-muted small">
                          {renderUserLink(argument.createdBy)} - {formatTime(argument.createdAt)}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleteTarget({ type: "argument", id: argument.id })}
                          disabled={pending[pendingKey]}
                        >
                          {pending[pendingKey] ? "Deleting..." : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => restoreArgument(argument.id)}
                          disabled={restoring[restoringKey] || !canRestore}
                        >
                          {restoring[restoringKey] ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 mb-1">{snippet(argument.body, 260)}</p>
                    {visibility?.reason && <div className="small text-muted">Reason: {visibility.reason}</div>}
                    {visibility?.spamLikelihood !== undefined && (
                      <div className="small text-muted">Spam likelihood: {visibility.spamLikelihood}</div>
                    )}
                    {renderCategories(visibility?.categories)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="d-flex align-items-center justify-content-between mb-2">
          <h2 className="h5 mb-0">Comments held for review</h2>
          <span className="badge text-bg-secondary">{comments.length}</span>
        </div>
        {comments.length === 0 ? (
          <div className="alert alert-light">No comments awaiting review.</div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {comments.map((comment) => {
              const visibility = comment.visibility;
              const pendingKey = `comment-${comment.id}`;
              const canRestore = visibility?.status && visibility.status !== "visible";
              const restoringKey = `comment-${comment.id}`;
              const topicHref = comment.topic?.id
                ? `/topics/${comment.topic.id}#comment-${comment.id}`
                : "#";
              return (
                <div key={comment.id} className="card shadow-sm">
                  <div className="card-body">
                    <div className="d-flex flex-wrap justify-content-between gap-2">
                      <div>
                        <Link href={topicHref} className="h6 text-decoration-none">
                          {comment.topic?.title || "View comment"}
                        </Link>
                        <div className="text-muted small">
                          {renderUserLink(comment.createdBy)} - {formatTime(comment.createdAt)}
                        </div>
                      </div>
                      <div className="d-flex flex-wrap align-items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => setDeleteTarget({ type: "comment", id: comment.id })}
                          disabled={pending[pendingKey]}
                        >
                          {pending[pendingKey] ? "Deleting..." : "Delete"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success"
                          onClick={() => restoreComment(comment.id)}
                          disabled={restoring[restoringKey] || !canRestore}
                        >
                          {restoring[restoringKey] ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-2 mb-1">{snippet(comment.body, 220)}</p>
                    {visibility?.reason && <div className="small text-muted">Reason: {visibility.reason}</div>}
                    {visibility?.spamLikelihood !== undefined && (
                      <div className="small text-muted">Spam likelihood: {visibility.spamLikelihood}</div>
                    )}
                    {renderCategories(visibility?.categories)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Confirm delete"
        body={<p className="mb-0">{buildDeleteMessage(deleteTarget)}</p>}
        confirmLabel="Delete"
        confirmVariant="danger"
        confirmIconClass="fa-solid fa-trash"
        isBusy={deleteTarget ? !!pending[`${deleteTarget.type}-${deleteTarget.id}`] : false}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
