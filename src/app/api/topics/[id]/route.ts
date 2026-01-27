import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import Topic from "@/app/models/topic";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import Fact from "@/app/models/facts";
import User from "@/app/models/user";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";
import { getServerSession } from "next-auth";
import NotificationSubscription from "@/app/models/notificationSubscription";
import UserFollow from "@/app/models/userFollow";
import { hasTopicModeratorRole } from "@/app/services/topicModeratorService";

async function signEvidence(evidence: any[] = []) {
  return Promise.all(
    (evidence || []).map(async (ev) => {
      if (!ev || !ev.url) return ev;
      const signed = await getSignedReadUrlFromUrl(ev.url).catch(() => ev.url);
      const previewUrl = ev.previewUrl
        ? await getSignedReadUrlFromUrl(ev.previewUrl).catch(() => ev.previewUrl)
        : undefined;
      const originalUrl = ev.originalUrl
        ? await getSignedReadUrlFromUrl(ev.originalUrl).catch(() => ev.originalUrl)
        : undefined;
      const originalPreviewUrl = ev.originalPreviewUrl
        ? await getSignedReadUrlFromUrl(ev.originalPreviewUrl).catch(() => ev.originalPreviewUrl)
        : undefined;
      return { ...ev, url: signed, previewUrl, originalUrl, originalPreviewUrl };
    })
  );
}

async function signAvatarUrl(url?: string | null) {
  if (!url) return null;
  return getSignedReadUrlFromUrl(url).catch(() => url);
}

type UserStats = {
  posts: number;
  comments: number;
  upvotes: number;
  followers: number;
};

async function mapUserSummary(user: any, stats?: UserStats, moderatorIds?: Set<string>) {
  if (!user) return undefined;
  const id = user?._id?.toString?.() ?? undefined;
  const avatarUrl = await signAvatarUrl(user?.avatarUrl ?? null);
  const avatarThumbUrl = await signAvatarUrl(user?.avatarThumbUrl ?? null);
  return {
    _id: id,
    name: user?.name ?? undefined,
    nickname: user?.nickname ?? undefined,
    avatarUrl,
    avatarThumbUrl,
    createdAt: user?.createdAt ?? undefined,
    stats,
    isAdmin: !!user?.isAdmin,
    isModerator: id ? !!moderatorIds?.has(id) : false,
  };
}

function parseCategoryFilters(searchParams: URLSearchParams, singularKey: string, pluralKey: string) {
  const values: string[] = [];
  searchParams.getAll(singularKey).forEach((value) => values.push(value));
  const combined = searchParams.get(pluralKey);
  if (combined) {
    values.push(...combined.split(","));
  }
  return Array.from(new Set(values.map((v) => v?.trim()).filter(Boolean)));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function effectiveScore(score?: number, evidenceRankScore?: number) {
  const base = typeof score === "number" ? score : 0;
  const boost = typeof evidenceRankScore === "number" ? evidenceRankScore : 0;
  return base + boost;
}

// GET /api/topics/:id=?num_arguments=10&ordering=relevant|newest
// Returns topic details + ordered arguments + comments per argument (relevant ordering by score/upvotes)
export async function GET(
  request: NextRequest,
  ctx: any
) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const id = resolvedCtx.id as string;
  const { searchParams } = new URL(request.url);
  const numArgsRaw = searchParams.get("num_arguments");
  const ordering = (searchParams.get("ordering") || "relevant").toLowerCase();
  const includeModeration = searchParams.get("includeModeration") === "1";
  const argumentCategoryFilter = parseCategoryFilters(searchParams, "argumentCategory", "argumentCategories");
  const commentCategoryFilter = parseCategoryFilters(searchParams, "commentCategory", "commentCategories");
  const argumentTextQuery = (searchParams.get("argumentQuery") || "").trim();
  const commentTextQuery = (searchParams.get("commentQuery") || "").trim();

  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
  }

  const numArguments = Math.max(1, Math.min(50, parseInt(numArgsRaw || "10", 10) || 10));
  const isRelevant = ordering === "relevant";

  await dbConnect();

  // Register User model to avoid OverwriteModelError in development
  if (!mongoose.models.User) {
    mongoose.model("User", User.schema);
  }

  const session = await getServerSession();
  let isAdmin = false;
  let viewerId: string | null = null;
  if (session?.user?.email) {
    const viewer = await User.findOne({ email: session.user.email }).select({ _id: 1, isAdmin: 1 }).lean();
    isAdmin = !!viewer?.isAdmin;
    viewerId = viewer?._id?.toString?.() ?? null;
  }

  const topic = await Topic.findById(id)
    .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt isAdmin" })
    .lean();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const isModerator = !!viewerId && hasTopicModeratorRole(topic, viewerId);
  const canModerate = isAdmin || isModerator;
  const moderatorIds = new Set(
    (topic.moderators ?? []).map((value: any) => value?.toString?.()).filter(Boolean)
  );

  const visibilityStatus = topic.visibility?.status;
  const isHidden = !!visibilityStatus && ["hidden", "blocked", "needs_review"].includes(visibilityStatus);
  if (topic.isActive === false || isHidden) {
    if (!canModerate) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
  }

  const canSeeModeration = includeModeration && canModerate;

  // Arguments ordering: relevant -> score desc then createdAt desc; newest -> createdAt desc
  const argSort: Record<string, 1 | -1> = isRelevant
    ? { score: -1, createdAt: -1 }
    : { createdAt: -1 };
  const argumentFetchLimit = isRelevant ? Math.min(numArguments * 3, 200) : numArguments;

  const argumentFilters: Record<string, any> = canSeeModeration
    ? { topic: topic._id }
    : {
      topic: topic._id,
      isRemoved: false,
      "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] },
    };
  if (argumentCategoryFilter.length) {
    argumentFilters["ontologyCategories.id"] = { $in: argumentCategoryFilter };
  }
  if (argumentTextQuery) {
    argumentFilters.body = { $regex: escapeRegex(argumentTextQuery), $options: "i" };
  }

  const argumentsList = await Argument.find(argumentFilters)
    .sort(argSort)
    .limit(argumentFetchLimit)
    .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt isAdmin" })
    .lean();

  // Fetch comments for each argument, ordering by relevancy (approx: newest first for now) or could extend with score if added later
  const argumentIds = argumentsList.map((a) => a._id);
  const commentsByArgument: Record<string, any[]> = {};
  let commentDocs: any[] = [];
  if (argumentIds.length) {
    const commentFilters: Record<string, any> = canSeeModeration
      ? { argument: { $in: argumentIds } }
      : {
        argument: { $in: argumentIds },
        isRemoved: false,
        "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] },
      };
    if (commentTextQuery) {
      commentFilters.body = { $regex: escapeRegex(commentTextQuery), $options: "i" };
    }
    commentDocs = await Comment.find(commentFilters)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt isAdmin" })
      .lean();
  }

  const statsMap = new Map<string, UserStats>();
  {
    const userIdSet = new Set<string>();
    const addUserId = (value: any) => {
      const id = value?._id?.toString?.() ?? value?.toString?.() ?? "";
      if (id) userIdSet.add(id);
    };
    addUserId(topic.createdBy);
    argumentsList.forEach((arg) => addUserId(arg.createdBy));
    commentDocs.forEach((comment) => addUserId(comment.createdBy));

    const userIds = Array.from(userIdSet);
    if (userIds.length) {
      const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
      const [argumentStats, commentStats, followerStats] = await Promise.all([
        Argument.aggregate([
          { $match: { createdBy: { $in: objectIds }, isRemoved: false } },
          { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
        ]),
        Comment.aggregate([
          { $match: { createdBy: { $in: objectIds }, isRemoved: false } },
          { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
        ]),
        UserFollow.aggregate([
          { $match: { targetUserId: { $in: objectIds } } },
          { $group: { _id: "$targetUserId", count: { $sum: 1 } } },
        ]),
      ]);

      const statsById = new Map<string, UserStats>();
      userIds.forEach((id) => {
        statsById.set(id, { posts: 0, comments: 0, upvotes: 0, followers: 0 });
      });

      argumentStats.forEach((row: any) => {
        const id = row?._id?.toString?.() ?? "";
        if (!id) return;
        const existing = statsById.get(id) ?? { posts: 0, comments: 0, upvotes: 0, followers: 0 };
        existing.posts = row.count ?? existing.posts;
        existing.upvotes += row.upvotes ?? 0;
        statsById.set(id, existing);
      });

      commentStats.forEach((row: any) => {
        const id = row?._id?.toString?.() ?? "";
        if (!id) return;
        const existing = statsById.get(id) ?? { posts: 0, comments: 0, upvotes: 0, followers: 0 };
        existing.comments = row.count ?? existing.comments;
        existing.upvotes += row.upvotes ?? 0;
        statsById.set(id, existing);
      });

      followerStats.forEach((row: any) => {
        const id = row?._id?.toString?.() ?? "";
        if (!id) return;
        const existing = statsById.get(id) ?? { posts: 0, comments: 0, upvotes: 0, followers: 0 };
        existing.followers = row.count ?? existing.followers;
        statsById.set(id, existing);
      });

      statsById.forEach((value, key) => {
        statsMap.set(key, value);
      });
    }
  }

  if (commentDocs.length) {
    for (const c of commentDocs) {
      const key = c.argument.toString();
      if (
        commentCategoryFilter.length === 0 ||
        (Array.isArray(c.ontologyCategories) && c.ontologyCategories.some((cat: any) => commentCategoryFilter.includes(cat?.id)))
      ) {
        const signedEvidence = await signEvidence(c.evidence ?? []);
        const commenterId = c.createdBy?._id?.toString?.() ?? "";
        const createdBy = await mapUserSummary(c.createdBy, statsMap.get(commenterId), moderatorIds as Set<string>);
        (commentsByArgument[key] = commentsByArgument[key] || []).push({
          id: c._id,
          body: c.body,
          createdBy,
          createdAt: c.createdAt,
          upvoteCount: c.upvoteCount ?? 0,
          downvoteCount: c.downvoteCount ?? 0,
          score: c.score ?? ((c.upvoteCount ?? 0) - (c.downvoteCount ?? 0)),
          ontologyCategories: c.ontologyCategories ?? [],
          evidence: signedEvidence,
          visibility: c.visibility,
          isRemoved: c.isRemoved ?? false,
        });
      }
    }
  }

  const orderedArguments = isRelevant
    ? [...argumentsList].sort((a, b) => {
        const aScore = effectiveScore(a.score, (a as any).evidenceRankScore);
        const bScore = effectiveScore(b.score, (b as any).evidenceRankScore);
        if (bScore !== aScore) return bScore - aScore;
        return (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0);
      })
    : argumentsList;

  const argumentsForResponse = commentTextQuery
    ? orderedArguments.filter((arg) => (commentsByArgument[arg._id.toString()] ?? []).length > 0)
    : orderedArguments;

  const limitedArguments = isRelevant ? argumentsForResponse.slice(0, numArguments) : argumentsForResponse;

  const subscriptionMap = new Map<string, { muted?: boolean }>();
  if (viewerId) {
    const targetIds = [topic._id, ...argumentIds];
    const subscriptions = await NotificationSubscription.find({
      userId: viewerId,
      targetType: { $in: ["topic", "argument"] },
      targetId: { $in: targetIds },
    }).lean();

    subscriptions.forEach((sub) => {
      const key = `${sub.targetType}:${sub.targetId?.toString?.() ?? ""}`;
      if (key) subscriptionMap.set(key, { muted: !!sub.muted });
    });
  }

  // Fetch derived facts for this topic (limit reasonable number)
  const facts = await Fact.find({ topic: topic._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .select({ text: 1, sourceArgument: 1, createdAt: 1 })
    .lean();

  const response = {
    topic: {
      id: topic._id,
      title: topic.title,
      description: topic.description,
      createdBy: await mapUserSummary(
        topic.createdBy,
        statsMap.get(topic.createdBy?._id?.toString?.() ?? ""),
        moderatorIds as Set<string>
      ),
      ontologyCategories: topic.ontologyCategories ?? [],
      isActive: topic.isActive,
      argumentCounts: topic.argumentCounts,
      score: topic.score,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
      ...(viewerId
        ? {
            subscription: {
              isSubscribed: (() => {
                const key = `topic:${topic._id.toString()}`;
                const sub = subscriptionMap.get(key);
                return sub ? !sub.muted : false;
              })(),
            },
          }
        : {}),
    },
    arguments: await Promise.all(
      limitedArguments.map(async (a) => {
        const rawSide = (a as any).side as string;
        const normalisedSide = rawSide === "pro" ? "for" : (rawSide === "con" ? "against" : rawSide);
        const commentList = commentsByArgument[a._id.toString()] || [];
        const signedEvidence = await signEvidence(a.evidence ?? []);
        const createdById = a.createdBy?._id?.toString?.() ?? "";
        const createdBy = await mapUserSummary(a.createdBy, statsMap.get(createdById), moderatorIds as Set<string>);
        const argumentSubscription = (() => {
          if (!viewerId) return undefined;
          const key = `argument:${a._id.toString()}`;
          const sub = subscriptionMap.get(key);
          if (sub) {
            return { isSubscribed: !sub.muted };
          }
          const createdByIdValue = createdById || (createdBy?._id?.toString?.() ?? "");
          const hasCommented = commentList.some((comment) => {
            const commenterId = comment?.createdBy?._id?.toString?.() ?? "";
            return commenterId && commenterId === viewerId;
          });
          const isAuthor = createdByIdValue && createdByIdValue === viewerId;
          return { isSubscribed: isAuthor || hasCommented };
        })();
        return {
          id: a._id,
          side: normalisedSide,
          body: a.body,
          createdBy,
          upvoteCount: a.upvoteCount,
          downvoteCount: a.downvoteCount,
          score: a.score,
          createdAt: a.createdAt,
          ontologyCategories: a.ontologyCategories ?? [],
          evidence: signedEvidence,
          visibility: a.visibility,
          isRemoved: a.isRemoved ?? false,
          comments: commentList,
          commentCount: commentList.length,
          aiAnalysis: a.aiAnalysis,
          ...(argumentSubscription ? { subscription: argumentSubscription } : {}),
        };
      })
    ),
    facts: facts.map((f) => ({
      id: f._id,
      text: f.text,
      sourceArgument: f.sourceArgument?.toString?.() || "",
      createdAt: f.createdAt,
    })),
    meta: {
      ordering: isRelevant ? "relevant" : "newest",
      returnedArguments: limitedArguments.length,
      requestedArguments: numArguments,
      viewer: viewerId
        ? { isAdmin, isModerator, canModerate }
        : { isAdmin: false, isModerator: false, canModerate: false },
    },
  };

  return NextResponse.json(response, { status: 200 });
}

export async function DELETE(_request: NextRequest, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const id = resolvedCtx.id as string;

  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
  }

  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const topic = await Topic.findById(id).select({ _id: 1, isActive: 1 }).lean();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  await Topic.findByIdAndUpdate(id, { isActive: false }).exec();
  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function PATCH(request: NextRequest, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const id = resolvedCtx.id as string;

  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
  }

  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json().catch(() => ({}));
  const status = payload?.status;
  if (status !== "visible") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const existing = await Topic.findById(id).select({ _id: 1 }).lean();
  if (!existing) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const updated = await Topic.findByIdAndUpdate(
    id,
    {
      $set: {
        "visibility.status": "visible",
        "visibility.moderatedAt": new Date(),
        "visibility.reason": "Restored by moderator",
      },
    },
    { new: true }
  ).lean();

  return NextResponse.json({
    id: updated?._id?.toString?.() ?? id,
    visibility: updated?.visibility ?? { status: "visible" },
  });
}
