"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";

type Props = {
  targetType: "topic" | "argument";
  targetId: string;
  initialSubscribed?: boolean;
  showLabel?: boolean;
  className?: string;
  size?: "sm" | "md";
};

export default function NotificationSubscribeButton({
  targetType,
  targetId,
  initialSubscribed,
  showLabel = true,
  className,
  size = "sm",
}: Props) {
  const { data: session } = useSession();
  const [subscribed, setSubscribed] = useState<boolean | undefined>(initialSubscribed);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof initialSubscribed === "boolean") {
      setSubscribed(initialSubscribed);
      return;
    }
    if (!session?.user) return;
    if (!targetId) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/notifications/subscriptions?targetType=${targetType}&targetId=${targetId}`, {
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSubscribed(Boolean(data?.subscribed));
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("Failed to load subscription", err);
        }
      }
    };
    load();
    return () => controller.abort();
  }, [initialSubscribed, session?.user, targetId, targetType]);

  if (!session?.user) return null;

  const label = subscribed ? "Subscribed" : "Subscribe";
  const iconClass = subscribed ? "fa-solid fa-bell" : "fa-regular fa-bell";
  const sizeClass = size === "md" ? "" : "btn-sm";

  async function handleToggle() {
    if (saving) return;
    const next = !subscribed;
    setSaving(true);
    try {
      const res = await fetch("/api/notifications/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, subscribe: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update subscription");
      }
      setSubscribed(Boolean(data?.subscribed));
    } catch (err: any) {
      toast.error(err?.message || "Unable to update notifications");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={["btn btn-outline-secondary", sizeClass, className].filter(Boolean).join(" ")}
      onClick={handleToggle}
      aria-pressed={Boolean(subscribed)}
      aria-label={label}
      disabled={saving}
      title={label}
    >
      <i className={`${iconClass}${showLabel ? " me-1" : ""}`} aria-hidden="true"></i>
      {showLabel ? label : null}
    </button>
  );
}
