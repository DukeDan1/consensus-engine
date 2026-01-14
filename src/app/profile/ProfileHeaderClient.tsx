"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import UserAvatar from "@/app/components/users/UserAvatar";
import ProfileAvatarUploader from "@/app/profile/ProfileAvatarUploader";

type Props = {
  userId: string;
  displayName: string;
  memberSince?: string | null;
  avatarUrl?: string | null;
  email?: string | null;
  canViewEmail?: boolean;
  isSuspended?: boolean;
};

export default function ProfileHeaderClient({
  userId,
  displayName,
  memberSince,
  avatarUrl,
  email,
  canViewEmail = false,
  isSuspended = false,
}: Props) {
  const { data: session } = useSession();
  const isOwner = !!session?.user?.id && session.user.id === userId;
  const isAdmin = !!session?.user?.isAdmin;
  const canManageAvatar = isOwner || isAdmin;
  const [showEmail, setShowEmail] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl ?? null);

  useEffect(() => {
    setAvatarPreview(avatarUrl ?? null);
  }, [avatarUrl]);

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
          {isSuspended && <span className="badge text-bg-danger">SUSPENDED</span>}
        </div>
        {memberSince && <p className="text-muted small mb-2">Member since {memberSince}</p>}
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
