import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import { Fact } from "@/app/models/facts";
import User from "@/app/models/user";
import { requireAuth } from "@/app/lib/authMiddleware";

function parseCategoryFilters(searchParams: URLSearchParams, singularKey: string, pluralKey: string) {
  const values: string[] = [];
  searchParams.getAll(singularKey).forEach((value) => values.push(value));
  const combined = searchParams.get(pluralKey);
  if (combined) {
    values.push(...combined.split(","));
  }
  return Array.from(new Set(values.map((v) => v?.trim()).filter(Boolean)));
}

// GET /api/topics/:id=?num_arguments=10&ordering=relevant|newest
// Returns topic details + ordered arguments + comments per argument (relevant ordering by score/upvotes)
export async function GET(
  request: NextRequest,
  ctx: any
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const resolvedCtx = await Promise.resolve(ctx.params);
  const id = resolvedCtx.id as string;
  const { searchParams } = new URL(request.url);
  const numArgsRaw = searchParams.get("num_arguments");
  const ordering = (searchParams.get("ordering") || "relevant").toLowerCase();
  const argumentCategoryFilter = parseCategoryFilters(searchParams, "argumentCategory", "argumentCategories");
  const commentCategoryFilter = parseCategoryFilters(searchParams, "commentCategory", "commentCategories");

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

  const topic = await Topic.findById(id)
    .populate({ path: "createdBy", select: "name" })
    .lean();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Arguments ordering: relevant -> score desc then createdAt desc; newest -> createdAt desc
  const argSort: Record<string, 1 | -1> = isRelevant
    ? { score: -1, createdAt: -1 }
    : { createdAt: -1 };

  const argumentQuery: Record<string, any> = { topic: topic._id, isRemoved: false };
  if (argumentCategoryFilter.length) {
    argumentQuery["ontologyCategories.id"] = { $in: argumentCategoryFilter };
  }

  const argumentsList = await Argument.find(argumentQuery)
    .sort(argSort)
    .limit(numArguments)
    .populate({ path: "createdBy", select: "name" })
    .lean();

  // Fetch comments for each argument, ordering by relevancy (approx: newest first for now) or could extend with score if added later
  const argumentIds = argumentsList.map(a => a._id);
  const commentsByArgument: Record<string, any[]> = {};
  if (argumentIds.length) {
    const comments = await Comment.find({ argument: { $in: argumentIds }, isRemoved: false })
      .sort({ createdAt: -1 })
      .limit(500)
      .populate({ path: "createdBy", select: "name" })
      .lean();
    for (const c of comments) {
      const key = c.argument.toString();
      if (
        commentCategoryFilter.length === 0 ||
        (Array.isArray(c.ontologyCategories) && c.ontologyCategories.some((cat: any) => commentCategoryFilter.includes(cat?.id)))
      ) {
        (commentsByArgument[key] = commentsByArgument[key] || []).push({
          id: c._id,
          body: c.body,
          createdBy: c.createdBy,
          createdAt: c.createdAt,
          upvoteCount: c.upvoteCount ?? 0,
          downvoteCount: c.downvoteCount ?? 0,
          score: c.score ?? ((c.upvoteCount ?? 0) - (c.downvoteCount ?? 0)),
          ontologyCategories: c.ontologyCategories ?? [],
        });
      }
    }
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
      createdBy: topic.createdBy,
  ontologyCategories: topic.ontologyCategories ?? [],
      isActive: topic.isActive,
      argumentCounts: topic.argumentCounts,
      score: topic.score,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    },
    arguments: argumentsList.map(a => {
      const rawSide = (a as any).side as string;
      const normalizedSide = rawSide === 'pro' ? 'for' : (rawSide === 'con' ? 'against' : rawSide);
      const commentList = commentsByArgument[a._id.toString()] || [];
      return ({
      id: a._id,
      side: normalizedSide,
      body: a.body,
      createdBy: a.createdBy,
      upvoteCount: a.upvoteCount,
      downvoteCount: a.downvoteCount,
      score: a.score,
      createdAt: a.createdAt,
  ontologyCategories: a.ontologyCategories ?? [],
      comments: commentList,
      commentCount: commentList.length,
      aiAnalysis: a.aiAnalysis,
    })}),
    facts: facts.map(f => ({
      id: f._id,
      text: f.text,
      sourceArgument: f.sourceArgument?.toString?.() || "",
      createdAt: f.createdAt,
    })),
    meta: {
      ordering: isRelevant ? "relevant" : "newest",
      returnedArguments: argumentsList.length,
      requestedArguments: numArguments,
    }
  };

  return NextResponse.json(response, { status: 200 });
}
