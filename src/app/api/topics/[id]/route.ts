import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import User from "@/app/models/user";

// GET /api/topics?id=...&num_arguments=10&ordering=relevant|newest
// Returns topic details + ordered arguments + comments per argument (relevant ordering by score/upvotes)
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const numArgsRaw = searchParams.get("num_arguments");
  const ordering = (searchParams.get("ordering") || "relevant").toLowerCase();

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
    .populate({ path: "createdBy", select: "name email" })
    .lean();

  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  // Arguments ordering: relevant -> score desc then createdAt desc; newest -> createdAt desc
  const argSort: Record<string, 1 | -1> = isRelevant
    ? { score: -1, createdAt: -1 }
    : { createdAt: -1 };

  const argumentsList = await Argument.find({ topic: topic._id, isRemoved: false })
    .sort(argSort)
    .limit(numArguments)
    .populate({ path: "createdBy", select: "name email" })
    .lean();

  // Fetch comments for each argument, ordering by relevancy (approx: newest first for now) or could extend with score if added later
  const argumentIds = argumentsList.map(a => a._id);
  const commentsByArgument: Record<string, any[]> = {};
  if (argumentIds.length) {
    const comments = await Comment.find({ argument: { $in: argumentIds }, isRemoved: false })
      .sort({ createdAt: -1 })
      .limit(500) // reasonable cap
      .populate({ path: "createdBy", select: "name email" })
      .lean();
    for (const c of comments) {
      const key = c.argument.toString();
      (commentsByArgument[key] = commentsByArgument[key] || []).push({
        id: c._id,
        body: c.body,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
      });
    }
  }

  const response = {
    topic: {
      id: topic._id,
      title: topic.title,
      description: topic.description,
      createdBy: topic.createdBy,
      tags: topic.tags ?? [],
      isActive: topic.isActive,
      argumentCounts: topic.argumentCounts,
      score: topic.score,
      createdAt: topic.createdAt,
      updatedAt: topic.updatedAt,
    },
    arguments: argumentsList.map(a => ({
      id: a._id,
      side: a.side,
      body: a.body,
      createdBy: a.createdBy,
      upvoteCount: a.upvoteCount,
      downvoteCount: a.downvoteCount,
      score: a.score,
      createdAt: a.createdAt,
      comments: commentsByArgument[a._id.toString()] || [],
    })),
    meta: {
      ordering: isRelevant ? "relevant" : "newest",
      returnedArguments: argumentsList.length,
      requestedArguments: numArguments,
    }
  };

  return NextResponse.json(response, { status: 200 });
}
