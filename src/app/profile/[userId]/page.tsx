import { notFound } from "next/navigation";
import { headers } from "next/headers";
import mongoose from "mongoose";
import { timeAgo, buildBaseUrl } from "@/app/lib/commonFunctions";
import ProfileHoverCard from "@/app/profile/ProfileHoverCard";
import AdminUserActions from "@/app/profile/AdminUserActions";
import ProfileHeaderClient from "@/app/profile/ProfileHeaderClient";
import ProfileBioCard from "@/app/profile/ProfileBioCard";

const RECENT_LIMIT = 10;

type ProfileApiResponse = {
  user: {
    id: string;
    name?: string | null;
    nickname?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    avatarThumbUrl?: string | null;
    email?: string | null;
    canViewEmail?: boolean;
    isSuspended?: boolean;
    createdAt?: string | null;
    stats?: {
      posts: number;
      comments: number;
      upvotes: number;
      followers: number;
    };
  };
  recentArguments: Array<{
    id: string;
    body: string;
    createdAt?: string | null;
    upvoteCount: number;
    downvoteCount: number;
    score: number;
    topic?: { id?: string | null; title?: string | null } | null;
  }>;
  recentComments: Array<{
    id: string;
    body: string;
    createdAt?: string | null;
    upvoteCount: number;
    downvoteCount: number;
    score: number;
    argument?: {
      id?: string | null;
      body?: string | null;
      topic?: { id?: string | null; title?: string | null } | null;
    } | null;
  }>;
};

type ArgumentItem = {
  id: string;
  body: string;
  createdAtLabel: string;
  topicTitle: string;
  topicLink?: string;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
};

type CommentItem = {
  id: string;
  body: string;
  createdAtLabel: string;
  topicTitle: string;
  topicLink?: string;
  argumentSnippet?: string;
  upvoteCount: number;
  downvoteCount: number;
  score: number;
};

function getDisplayName(user: { name?: string | null; nickname?: string | null; }): string {
  return (
    user.name?.trim() ||
    user.nickname?.trim() ||
    "Member"
  );
}

function truncateText(text: string, limit = 200): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1))}…`;
}

function buildProfileApiUrl(userId: string, limit: number, headersList: Headers): string {
  const base = buildBaseUrl(headersList);
  return `${base}/api/profile/${userId}?limit=${limit}`;
}

export default async function UserProfilePage({ params }: any) {
  const { userId } = await Promise.resolve(params);
  const requestHeaders = await headers();

  if (!mongoose.isValidObjectId(userId)) {
    notFound();
  }

  const response = await fetch(buildProfileApiUrl(userId, RECENT_LIMIT, requestHeaders), {
    cache: "no-store",
    headers: {
      cookie: requestHeaders.get("cookie") ?? "",
    },
  });

  if (response.status === 404) {
    notFound();
  }

  if (!response.ok) {
    throw new Error("Failed to load profile data");
  }

  const data = (await response.json()) as ProfileApiResponse;

  const displayName = getDisplayName({
    name: data.user?.name ?? null,
    nickname: data.user?.nickname ?? null,
  });

  const isSuspended = !!data.user?.isSuspended;
  const avatarUrl = data.user?.avatarUrl ?? null;
  const avatarThumbUrl = data.user?.avatarThumbUrl ?? null;
  const email = data.user?.email ?? null;
  const canViewEmail = !!data.user?.canViewEmail;

  const memberSinceDate = data.user?.createdAt ? new Date(data.user.createdAt) : null;
  const memberSince = memberSinceDate
    ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(memberSinceDate)
    : null;

  const recentArguments: ArgumentItem[] = (data.recentArguments ?? []).map((argument) => {
    const topicId = argument.topic?.id ?? undefined;
    const topicTitle = argument.topic?.title ?? "Topic";

    return {
      id: argument.id,
      body: truncateText(argument.body, 240),
      createdAtLabel: argument.createdAt ? timeAgo(argument.createdAt) : "",
      topicTitle,
      topicLink: topicId ? `/topics/${topicId}#argument-${argument.id}` : undefined,
      upvoteCount: argument.upvoteCount ?? 0,
      downvoteCount: argument.downvoteCount ?? 0,
      score: argument.score ?? (argument.upvoteCount ?? 0) - (argument.downvoteCount ?? 0),
    };
  });

  const recentComments: CommentItem[] = (data.recentComments ?? [])
    .filter((comment) => {
      const topicId = comment.argument?.topic?.id;
      const argumentId = comment.argument?.id;
      return Boolean(topicId && argumentId);
    })
    .map((comment) => {
      const topic = comment.argument?.topic;
      const topicId = topic?.id ?? undefined;
      const topicTitle = topic?.title ?? "Topic";
      return {
        id: comment.id,
        body: truncateText(comment.body, 240),
        createdAtLabel: comment.createdAt ? timeAgo(comment.createdAt) : "",
        topicTitle,
        topicLink: topicId ? `/topics/${topicId}#comment-${comment.id}` : undefined,
        argumentSnippet: comment.argument?.body ? truncateText(comment.argument.body, 160) : undefined,
        upvoteCount: comment.upvoteCount ?? 0,
        downvoteCount: comment.downvoteCount ?? 0,
        score: comment.score ?? (comment.upvoteCount ?? 0) - (comment.downvoteCount ?? 0),
      };
    });

  return (
    <div className="container py-4 py-md-5">
      <ProfileHeaderClient
        userId={data.user.id}
        displayName={displayName}
        memberSince={memberSince}
        avatarUrl={avatarUrl}
        avatarThumbUrl={avatarThumbUrl}
        email={email}
        canViewEmail={canViewEmail}
        isSuspended={isSuspended}
        stats={data.user.stats}
      />
      <div className="mb-4">
        <AdminUserActions userId={data.user.id} initialSuspended={isSuspended} displayName={displayName} />
      </div>
      <div className="mb-4">
        <ProfileBioCard userId={data.user.id} initialBio={data.user?.bio ?? null} />
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <section className="card h-100 border-0 shadow-sm">
            <div className="card-header bg-white border-0 pb-0">
              <h2 className="h5 mb-1">Recent Posts</h2>
              <p className="text-muted small mb-0">Perspectives this user has contributed to debates.</p>
            </div>
            <div className="card-body">
              {recentArguments.length > 0 ? (
                <ul className="list-unstyled mb-0 d-grid gap-3">
                  {recentArguments.map((argument) => (
                    <li key={argument.id}>
                      <ProfileHoverCard
                        href={argument.topicLink}
                        topLabel={`On ${argument.topicTitle}`}
                        timestamp={argument.createdAtLabel}
                        body={argument.body}
                        stats={[
                          { iconClass: "fa-solid fa-thumbs-up", textClassName: "text-success", value: argument.upvoteCount },
                          { iconClass: "fa-solid fa-thumbs-down", textClassName: "text-danger", value: argument.downvoteCount },
                          { iconClass: "fa-regular fa-star", textClassName: "text-warning", value: argument.score },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="fa-regular fa-lightbulb mb-2" style={{ fontSize: "2rem" }} aria-hidden="true"></i>
                  <p className="mb-0">No posts yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="col-lg-6">
          <section className="card h-100 border-0 shadow-sm">
            <div className="card-header bg-white border-0 pb-0">
              <h2 className="h5 mb-1">Recent Comments</h2>
              <p className="text-muted small mb-0">Reactions and follow-ups from this contributor.</p>
            </div>
            <div className="card-body">
              {recentComments.length > 0 ? (
                <ul className="list-unstyled mb-0 d-grid gap-3">
                  {recentComments.map((comment) => (
                    <li key={comment.id}>
                      <ProfileHoverCard
                        href={comment.topicLink}
                        topLabel={`On ${comment.topicTitle}`}
                        timestamp={comment.createdAtLabel}
                        body={comment.body}
                        quote={comment.argumentSnippet}
                        stats={[
                          { iconClass: "fa-solid fa-thumbs-up", textClassName: "text-success", value: comment.upvoteCount },
                          { iconClass: "fa-solid fa-thumbs-down", textClassName: "text-danger", value: comment.downvoteCount },
                          { iconClass: "fa-regular fa-star", textClassName: "text-warning", value: comment.score },
                        ]}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center text-muted py-4">
                  <i className="fa-regular fa-comment-dots mb-2" style={{ fontSize: "2rem" }} aria-hidden="true"></i>
                  <p className="mb-0">No comments yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
