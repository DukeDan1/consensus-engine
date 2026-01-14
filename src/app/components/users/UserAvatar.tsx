"use client";

type UserAvatarProps = {
  name?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
};

function getInitials(source?: string | null) {
  if (!source) return "U";
  const trimmed = source.trim();
  if (!trimmed) return "U";
  const parts = trimmed.split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const initials = (first + last || first).toUpperCase();
  return initials || "U";
}

function getDisplayName(name?: string | null, nickname?: string | null, fallback = "User") {
  return name?.trim() || nickname?.trim() || fallback;
}

export default function UserAvatar({
  name,
  nickname,
  avatarUrl,
  size = 32,
  className,
}: UserAvatarProps) {
  const displayName = getDisplayName(name, nickname, "User");
  const initials = getInitials(displayName);
  const dimension = Math.max(20, size);
  const fontSize = Math.max(12, Math.round(dimension * 0.45));

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={displayName}
        className={`rounded-circle border ${className ?? ""}`.trim()}
        style={{ width: dimension, height: dimension, objectFit: "cover" }}
      />
    );
  }

  return (
    <div
      className={`rounded-circle bg-primary text-white d-flex align-items-center justify-content-center ${className ?? ""}`.trim()}
      style={{ width: dimension, height: dimension, fontSize, fontWeight: 600 }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
