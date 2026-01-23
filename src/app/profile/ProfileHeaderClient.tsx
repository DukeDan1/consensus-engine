"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import UserAvatar from "@/app/components/users/UserAvatar";
import ProfileAvatarUploader from "@/app/profile/ProfileAvatarUploader";
import UserFollowButton from "@/app/components/users/UserFollowButton";

type Props = {
  userId: string;
  displayName: string;
  memberSince?: string | null;
  avatarUrl?: string | null;
  avatarThumbUrl?: string | null;
  email?: string | null;
  canViewEmail?: boolean;
  isAdmin?: boolean;
  isSuspended?: boolean;
  stats?: {
    posts: number;
    comments: number;
    upvotes: number;
    followers: number;
  };
};

export default function ProfileHeaderClient({
  userId,
  displayName,
  memberSince,
  avatarUrl,
  avatarThumbUrl,
  email,
  canViewEmail = false,
  isAdmin = false,
  isSuspended = false,
  stats,
}: Props) {
  const { data: session } = useSession();
  const isOwner = !!session?.user?.id && session.user.id === userId;
  const viewerIsAdmin = !!session?.user?.isAdmin;
  const canManageAvatar = isOwner || viewerIsAdmin;
  const [showEmail, setShowEmail] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl ?? avatarThumbUrl ?? null);
  const [followerCount, setFollowerCount] = useState(stats?.followers ?? 0);

  useEffect(() => {
    setFollowerCount(stats?.followers ?? 0);
  }, [stats?.followers]);

  useEffect(() => {
    setAvatarPreview(avatarUrl ?? avatarThumbUrl ?? null);
  }, [avatarUrl, avatarThumbUrl]);

  return (
    <div className="bg-body-secondary border rounded-4 p-4 p-md-5 d-flex flex-column flex-md-row align-items-center gap-4 mb-4">
      <div className="d-flex flex-column align-items-center">
        {avatarPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarPreview}
            alt={displayName}
            className="rounded-circle border"
            style={{ width: 88, height: 88, objectFit: "cover" }}
            onError={() => {
              if (avatarThumbUrl && avatarPreview !== avatarThumbUrl) {
                setAvatarPreview(avatarThumbUrl);
                return;
              }
              setAvatarPreview(null);
            }}
          />
        ) : (
          <UserAvatar
            name={displayName}
            size={88}
            className="border"
          />
        )}
        <ProfileAvatarUploader
          canManage={canManageAvatar}
          isOwner={isOwner}
          targetUserId={userId}
          currentAvatarUrl={avatarPreview}
          onAvatarUpdated={(url) => setAvatarPreview(url)}
        />
      </div>
      <div className="text-center text-md-start">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <h1 className="h3 mb-1">{displayName}</h1>
          {isAdmin && <span className="badge text-bg-primary">ADMIN</span>}
          {isSuspended && <span className="badge text-bg-danger">SUSPENDED</span>}
        </div>
        {memberSince && <p className="text-muted small mb-2">Member since {memberSince}</p>}
        {stats && (
          <div className="d-flex flex-wrap justify-content-center justify-content-md-start gap-3 small text-muted mb-2">
            <span><i className="fa-solid fa-pen-to-square me-1" aria-hidden="true"></i>{stats.posts} posts</span>
            <span><i className="fa-regular fa-comments me-1" aria-hidden="true"></i>{stats.comments} comments</span>
            <span><i className="fa-solid fa-thumbs-up me-1" aria-hidden="true"></i>{stats.upvotes} upvotes</span>
            <span><i className="fa-solid fa-user-group me-1" aria-hidden="true"></i>{followerCount} followers</span>
          </div>
        )}
        <div className="d-flex flex-wrap justify-content-center justify-content-md-start gap-2 mb-2">
          <UserFollowButton
            targetUserId={userId}
            onFollowChange={(isFollowing) => {
              setFollowerCount((prev) => Math.max(0, prev + (isFollowing ? 1 : -1)));
            }}
          />
        </div>
        {canViewEmail && email && (
          <div className="d-flex flex-column gap-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => setShowEmail((prev) => !prev)}
            >
              <i className={`fa-regular ${showEmail ? "fa-eye-slash" : "fa-eye"} me-1`} aria-hidden="true"></i>
              {showEmail ? "Hide email" : "View email"}
            </button>
            {showEmail && (
              <>
                <div className="small text-muted">{email}</div>
                {isOwner && (
                  <div className="small text-muted">Only you can view your email address.</div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
