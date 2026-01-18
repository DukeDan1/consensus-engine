"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { timeAgo } from "@/app/lib/commonFunctions";

type NotificationItem = {
  id: string;
  message: string;
  topicTitle?: string;
  argumentSnippet?: string;
  commentSnippet?: string;
  createdAt?: string;
  readAt?: string | null;
  href?: string;
  actor?: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  } | null;
};

export default function NotificationsPanel() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.readAt).length,
    [notifications]
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/notifications?limit=25", { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load notifications");
        }
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setError(err?.message || "Failed to load notifications");
        }
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("notifications-open");
    return () => document.body.classList.remove("notifications-open");
  }, [open]);

  if (!session?.user) return null;

  async function markAllRead() {
    if (!notifications.length) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    }).catch(() => null);
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })));
  }

  async function markOneRead(id: string) {
    if (!id) return;
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => null);
    const now = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? now } : item))
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-link nav-link position-relative p-0"
        onClick={() => setOpen(true)}
        aria-label="Open notifications"
      >
        <i className="fa-regular fa-bell" aria-hidden="true"></i>
        {unreadCount > 0 ? (
          <span className="notifications-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <div
        className={`notifications-backdrop${open ? " show" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden={!open}
      />

      <aside
        className={`notifications-panel${open ? " show" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
      >
        <div className="d-flex align-items-center justify-content-between border-bottom px-3 py-3">
          <div>
            <div className="fw-semibold">Notifications</div>
            <div className="text-muted small">{unreadCount ? `${unreadCount} unread` : "All caught up"}</div>
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={markAllRead}
              disabled={!notifications.length || unreadCount === 0}
            >
              Mark all read
            </button>
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
            >
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        <div className="notifications-body">
          {loading ? (
            <div className="p-3 text-muted">Loading notifications…</div>
          ) : error ? (
            <div className="p-3 text-danger">{error}</div>
          ) : notifications.length === 0 ? (
            <div className="p-3 text-muted">No notifications yet.</div>
          ) : (
            <ul className="list-unstyled m-0">
              {notifications.map((item) => {
                const meta = item.topicTitle || item.argumentSnippet || "";
                return (
                  <li key={item.id} className={`notifications-item${item.readAt ? "" : " unread"}`}>
                    <Link
                      href={item.href || "#"}
                      className="notifications-link"
                      onClick={() => markOneRead(item.id)}
                    >
                      <div className="d-flex gap-2">
                        {item.actor?.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.actor.avatarUrl}
                            alt={item.actor.name}
                            className="notifications-avatar"
                          />
                        ) : (
                          <div className="notifications-avatar fallback">
                            <i className="fa-solid fa-user" aria-hidden="true"></i>
                          </div>
                        )}
                        <div className="flex-grow-1">
                          <div className="fw-semibold">{item.message || "New activity"}</div>
                          {meta ? <div className="text-muted small">{meta}</div> : null}
                          {item.createdAt ? (
                            <div className="text-muted small">{timeAgo(item.createdAt)}</div>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
