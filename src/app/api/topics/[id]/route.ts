import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import { Fact } from "@/app/models/facts";
import User from "@/app/models/user";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";
import { getServerSession } from "next-auth";

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

async function mapUserSummary(user: any) {
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
  if (session?.user?.email) {
    const adminUser = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
    isAdmin = !!adminUser?.isAdmin;
  }

  const topic = await Topic.findById(id)
    .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt" })
    .lean();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const visibilityStatus = topic.visibility?.status;
  const isHidden = !!visibilityStatus && ["hidden", "blocked", "needs_review"].includes(visibilityStatus);
  if (topic.isActive === false || isHidden) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Topic not found" }, { status: 404 });
    }
  }

  const canSeeModeration = includeModeration && isAdmin;

  // Arguments ordering: relevant -> score desc then createdAt desc; newest -> createdAt desc
  const argSort: Record<string, 1 | -1> = isRelevant
    ? { score: -1, createdAt: -1 }
    : { createdAt: -1 };

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
    .limit(numArguments)
    .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt" })
    .lean();

  // Fetch comments for each argument, ordering by relevancy (approx: newest first for now) or could extend with score if added later
  const argumentIds = argumentsList.map((a) => a._id);
  const commentsByArgument: Record<string, any[]> = {};
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
    const comments = await Comment.find(commentFilters)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: "createdBy", select: "name nickname avatarUrl avatarThumbUrl createdAt" })
      .lean();
    for (const c of comments) {
      const key = c.argument.toString();
      if (
        commentCategoryFilter.length === 0 ||
        (Array.isArray(c.ontologyCategories) && c.ontologyCategories.some((cat: any) => commentCategoryFilter.includes(cat?.id)))
      ) {
        const signedEvidence = await signEvidence(c.evidence ?? []);
        const createdBy = await mapUserSummary(c.createdBy);
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

  const argumentsForResponse = commentTextQuery
    ? argumentsList.filter((arg) => (commentsByArgument[arg._id.toString()] ?? []).length > 0)
    : argumentsList;

  // Fetch derived facts for this topic (limit reasonable number)
  const facts = await Fact.find({
    topic: topic._id,
    $or: [{ status: { $exists: false } }, { status: "active" }],
  })
    .sort({ createdAt: -1 })
    .limit(100)
    .select({ text: 1, sourceArgument: 1, createdAt: 1 })
    .lean();

  const response = {
    topic: {
      id: topic._id,
      title: topic.title,
      description: topic.description,
      createdBy: await mapUserSummary(topic.createdBy),
      ontologyCategories: topic.ontologyCategories ?? [],
      isActive: topic.isActive,
      argumentCounts: topic.argumentCounts,
      score: topic.score,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    },
    arguments: await Promise.all(
      argumentsForResponse.map(async (a) => {
        const rawSide = (a as any).side as string;
        const normalisedSide = rawSide === "pro" ? "for" : (rawSide === "con" ? "against" : rawSide);
        const commentList = commentsByArgument[a._id.toString()] || [];
        const signedEvidence = await signEvidence(a.evidence ?? []);
        const createdBy = await mapUserSummary(a.createdBy);
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
      returnedArguments: argumentsForResponse.length,
      requestedArguments: numArguments,
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
