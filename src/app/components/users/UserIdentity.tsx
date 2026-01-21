"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import UserAvatar from "@/app/components/users/UserAvatar";

type UserIdentityProps = {
  userId?: string;
  name?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  createdAt?: string | Date | null;
  size?: number;
  className?: string;
  nameClassName?: string;
  fallbackLabel?: string;
  showTooltip?: boolean;
  tooltipPlacement?: "top" | "bottom" | "left" | "right";
  stats?: {
    posts: number;
    comments: number;
    upvotes: number;
    followers: number;
  };
};

function getDisplayName(name?: string | null, nickname?: string | null, fallback = "Member") {
  return name?.trim() || nickname?.trim() || fallback;
}

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

function formatMemberSince(value?: string | Date | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function UserIdentity({
  userId,
  name,
  nickname,
  avatarUrl,
  avatarThumbUrl,
  createdAt,
  size = 32,
  className,
  nameClassName = "author-link",
  fallbackLabel = "Member",
  showTooltip = true,
  tooltipPlacement = "top",
  stats,
}: UserIdentityProps) {
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const tooltipInstance = useRef<any | null>(null);

  const displayName = getDisplayName(name, nickname, fallbackLabel);
  const memberSince = formatMemberSince(createdAt);
  const initials = getInitials(displayName);

  const shouldShowTooltip = showTooltip && Boolean(userId);
  const resolvedAvatarUrl = avatarThumbUrl || avatarUrl || null;

  const tooltipHtml = useMemo(() => {
    if (!shouldShowTooltip) return "";
    const safeName = escapeHtml(displayName);
    const safeAvatar = resolvedAvatarUrl ? escapeHtml(resolvedAvatarUrl) : "";
    const safeInitials = escapeHtml(initials);
    const joinedLabel = memberSince ? `Joined ${escapeHtml(memberSince)}` : "";
    const avatarMarkup = resolvedAvatarUrl
      ? `<img src="${safeAvatar}" alt="${safeName}" class="user-tooltip-avatar" />`
      : `<div class="user-tooltip-avatar user-tooltip-initials">${safeInitials}</div>`;
    const metaMarkup = joinedLabel ? `<div class="user-tooltip-meta">${joinedLabel}</div>` : "";
    const statsMarkup = stats
      ? `
        <div class="user-tooltip-stats">
          <span><i class="fa-solid fa-pen-to-square me-1" aria-hidden="true"></i>${stats.posts}</span>
          <span><i class="fa-regular fa-comments me-1" aria-hidden="true"></i>${stats.comments}</span>
          <span><i class="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>${stats.upvotes}</span>
          <span><i class="fa-solid fa-user-group me-1" aria-hidden="true"></i>${stats.followers}</span>
        </div>
      `.trim()
      : "";
    return `
      <div class="user-tooltip-card">
        ${avatarMarkup}
        <div>
          <div class="user-tooltip-name">${safeName}</div>
          ${metaMarkup}
          ${statsMarkup}
        </div>
      </div>
    `.trim();
  }, [displayName, initials, memberSince, shouldShowTooltip, resolvedAvatarUrl, stats]);

  useEffect(() => {
    let active = true;

    const setupTooltip = async () => {
      if (!shouldShowTooltip || !tooltipHtml || !tooltipRef.current) {
        if (tooltipInstance.current) {
          tooltipInstance.current.dispose();
          tooltipInstance.current = null;
        }
        return;
      }
      const Tooltip = (await import("bootstrap/js/dist/tooltip")).default;
      if (!active || !tooltipRef.current) return;
      if (tooltipInstance.current) {
        tooltipInstance.current.dispose();
      }
      tooltipInstance.current = new Tooltip(tooltipRef.current);
    };

    setupTooltip();

    return () => {
      active = false;
      if (tooltipInstance.current) {
        tooltipInstance.current.dispose();
        tooltipInstance.current = null;
      }
    };
  }, [shouldShowTooltip, tooltipHtml]);

  const tooltipProps = shouldShowTooltip && tooltipHtml
    ? {
        "data-bs-toggle": "tooltip",
        "data-bs-html": "true",
        "data-bs-custom-class": "user-tooltip",
        "data-bs-placement": tooltipPlacement,
        "data-bs-container": "body",
        "data-bs-title": tooltipHtml,
      }
    : {};

  return (
    <span
      ref={tooltipRef}
      className={`d-inline-flex align-items-center gap-2 ${className ?? ""}`.trim()}
      {...tooltipProps}
    >
      <UserAvatar name={displayName} avatarUrl={resolvedAvatarUrl} size={size} />
      {userId ? (
        <Link href={`/profile/${userId}`} className={nameClassName}>
          {displayName}
        </Link>
      ) : (
        <span className={nameClassName}>{displayName}</span>
      )}
    </span>
  );
}
