"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "react-toastify";

type Props = {
  targetUserId: string;
  initialFollowing?: boolean;
  onFollowChange?: (_following: boolean) => void;
  className?: string;
  size?: "sm" | "md";
};

export default function UserFollowButton({
  targetUserId,
  initialFollowing,
  onFollowChange,
  className,
  size = "sm",
}: Props) {
  const { data: session } = useSession();
  const [following, setFollowing] = useState<boolean | undefined>(initialFollowing);
  const [saving, setSaving] = useState(false);

  const isOwner = session?.user?.id && targetUserId && session.user.id === targetUserId;

  useEffect(() => {
    if (typeof initialFollowing === "boolean") {
      setFollowing(initialFollowing);
      return;
    }
    if (!session?.user || !targetUserId || isOwner) return;

    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/follow?targetUserId=${targetUserId}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setFollowing(Boolean(data?.following));
        }
      } catch (err) {
        if ((err as any)?.name !== "AbortError") {
          console.error("Failed to load follow status", err);
        }
      }
    };
    load();
    return () => controller.abort();
  }, [initialFollowing, isOwner, session?.user, targetUserId]);

  if (!session?.user || !targetUserId || isOwner) return null;

  const label = following ? "Following" : "Follow";
  const iconClass = following ? "fa-solid fa-user-check" : "fa-solid fa-user-plus";
  const sizeClass = size === "md" ? "" : "btn-sm";

  async function handleToggle() {
    if (saving) return;
    const next = !following;
    setSaving(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, follow: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to update follow");
      }
      const nextState = Boolean(data?.following);
      setFollowing(nextState);
      onFollowChange?.(nextState);
    } catch (err: any) {
      toast.error(err?.message || "Unable to update follow status");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      className={["btn btn-outline-secondary", sizeClass, className].filter(Boolean).join(" ")}
      onClick={handleToggle}
      aria-pressed={Boolean(following)}
      aria-label={label}
      disabled={saving}
      title={label}
    >
      <i className={`${iconClass} me-1`} aria-hidden="true"></i>
      {label}
    </button>
  );
}
