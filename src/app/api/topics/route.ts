import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import User from "@/app/models/user";
import { getServerSession } from "next-auth";
import { trackBackgroundTask } from "@/app/lib/backgroundTasks";
import { classifyTextToOntology, classificationToAssignments } from "@/app/services/ontologyClassificationService";
import { moderateUserGeneratedText, moderationToVisibility } from "@/app/services/moderationService";
import { applyTrustDelta } from "@/app/services/trustService";

function slugify(input: string) {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

function parseCategoryFilters(searchParams: URLSearchParams): string[] {
  const list: string[] = [];
  const direct = searchParams.getAll("categoryId");
  const combined = searchParams.get("categoryIds");
  if (combined) {
    list.push(...combined.split(","));
  }
  list.push(...direct);
  return Array.from(new Set(list.map((item) => item?.trim()).filter(Boolean)));
}

// GET /api/topics?q=&creator=&page=1&pageSize=15
export async function GET(request: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const creator = (searchParams.get("creator") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "15", 10) || 15));
  const categoryFilter = parseCategoryFilters(searchParams);

  const match: Record<string, any> = { isActive: true, "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] } };

  // Build a case-insensitive OR filter across title and creator
  const or: any[] = [];

  if (q) {
    or.push({ title: { $regex: q, $options: "i" } });
  }

  if (creator) {
    const users = await User.find({
      $or: [
        { name: { $regex: creator, $options: "i" } },
        { email: { $regex: creator, $options: "i" } },
      ],
    }).select({ _id: 1 });
    const ids = users.map((u) => u._id);
    if (ids.length) {
      or.push({ createdBy: { $in: ids } });
    }
  }

  if (or.length) {
    match.$or = or;
  }

  const categoryStages = categoryFilter.length
    ? [
        {
          $lookup: {
            from: "arguments",
            let: { topicId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$topic", "$$topicId"] },
                  isRemoved: false,
                  "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] },
                },
              },
              { $project: { ontologyCategories: 1 } },
            ],
            as: "arguments",
          },
        },
        {
          $lookup: {
            from: "comments",
            let: { topicId: "$_id" },
            pipeline: [
              {
                $lookup: {
                  from: "arguments",
                  localField: "argument",
                  foreignField: "_id",
                  as: "argument",
                },
              },
              { $unwind: "$argument" },
              {
                $match: {
                  $expr: { $eq: ["$argument.topic", "$$topicId"] },
                  isRemoved: false,
                  "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] },
                },
              },
              { $project: { ontologyCategories: 1 } },
            ],
            as: "comments",
          },
        },
        {
          $addFields: {
            topicCategoryIds: {
              $map: {
                input: { $ifNull: ["$ontologyCategories", []] },
                as: "cat",
                in: "$$cat.id",
              },
            },
            argumentCategoryIds: {
              $reduce: {
                input: { $ifNull: ["$arguments", []] },
                initialValue: [],
                in: {
                  $setUnion: [
                    "$$value",
                    {
                      $map: {
                        input: { $ifNull: ["$$this.ontologyCategories", []] },
                        as: "cat",
                        in: "$$cat.id",
                      },
                    },
                  ],
                },
              },
            },
            commentCategoryIds: {
              $reduce: {
                input: { $ifNull: ["$comments", []] },
                initialValue: [],
                in: {
                  $setUnion: [
                    "$$value",
                    {
                      $map: {
                        input: { $ifNull: ["$$this.ontologyCategories", []] },
                        as: "cat",
                        in: "$$cat.id",
                      },
                    },
                  ],
                },
              },
            },
          },
        },
        {
          $addFields: {
            allCategoryIds: {
              $setUnion: ["$topicCategoryIds", "$argumentCategoryIds", "$commentCategoryIds"],
            },
          },
        },
        {
          $addFields: {
            categoryMatch: {
              $gt: [{ $size: { $setIntersection: ["$allCategoryIds", categoryFilter] } }, 0],
            },
          },
        },
        { $match: { categoryMatch: true } },
      ]
    : [];

  const basePipeline = [{ $match: match }, ...categoryStages];

  const countPipeline = categoryFilter.length ? [...basePipeline, { $count: "count" }] : null;
  const total = countPipeline
    ? (await mongoose.connection.collection("topics").aggregate(countPipeline).toArray())[0]?.count ?? 0
    : await Topic.countDocuments(match).exec();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const skip = (page - 1) * pageSize;

  const results = await mongoose.connection
    .collection("topics")
    .aggregate([
      ...basePipeline,
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: pageSize },
      {
        $project: {
          title: 1,
          description: 1,
          createdBy: 1,
          createdAt: 1,
          upvoteCount: { $size: { $ifNull: ["$upvotes", []] } },
          downvoteCount: { $size: { $ifNull: ["$downvotes", []] } },
          ontologyCategories: { $ifNull: ["$ontologyCategories", []] },
        },
      },
      { $addFields: { totalVotes: { $add: ["$upvoteCount", "$downvoteCount"] } } },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          as: "creator",
        },
      },
      { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          title: 1,
          upvoteCount: 1,
          downvoteCount: 1,
          totalVotes: 1,
          creatorName: { $ifNull: ["$creator.name", "Unknown"] },
          ontologyCategories: 1,
        },
      },
    ])
    .toArray();

  return NextResponse.json(
    {
      topics: results,
      page,
      pageSize,
      total,
      totalPages,
    },
    { status: 200 }
  );
}

// POST /api/topics
export async function POST(request: NextRequest) {
  await dbConnect();
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creator = await User.findOne({ email: session.user.email }).exec();
  if (!creator) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await request.json();
  const titleRaw = (body?.title || "").toString();
  const description = typeof body?.description === "string" ? body.description : "";
  const title = titleRaw.trim();
  if (!title || title.length > 180) {
    return NextResponse.json({ error: "Title is required (<= 180 chars)" }, { status: 400 });
  }

  if (description.length > 5000) {
    return NextResponse.json({ error: "Description must be <= 5000 chars" }, { status: 400 });
  }

  // Best-effort unique slug
  let slug = slugify(title);
  for (let i = 0; i < 3; i++) {
    // retry a couple of times if collision
    const exists = await Topic.findOne({ slug }).select({ _id: 1 }).lean();
    if (!exists) break;
    slug = slugify(title);
  }

  const moderation = await moderateUserGeneratedText({
    text: `${title}\n\n${description}`.trim(),
    contentType: "topic",
    userTrustScore: creator.trustScore,
    userTrustTier: creator.trustTier,
    topicTitle: title,
  });

  const visibility = moderationToVisibility({
    moderation,
    userTrustTier: creator.trustTier,
    contentType: "topic",
    evidenceCount: 0,
  });

  if (visibility.status === "blocked") {
    if (moderation.recommendedTrustDelta) {
      await applyTrustDelta({
        userId: creator._id,
        delta: moderation.recommendedTrustDelta,
        reason: "moderation:topic_blocked",
        meta: { categories: moderation.categories, severity: moderation.severity },
      });
    }
    return NextResponse.json({ error: "Topic blocked by moderation", reason: moderation.shortReason }, { status: 403 });
  }

  const doc = await Topic.create({
    title,
    description,
    ontologyCategories: [],
    createdBy: creator._id,
    isActive: true,
    slug,
    visibility: {
      status: visibility.status,
      moderatedAt: new Date(),
      reason: moderation.shortReason,
      categories: moderation.categories,
      spamLikelihood: moderation.spamLikelihood,
      trollingLikelihood: moderation.trollingLikelihood,
      offTopicLikelihood: moderation.offTopicLikelihood,
      illegalOrHarmfulLikelihood: moderation.illegalOrHarmfulLikelihood,
      quality: moderation.quality,
      model: moderation.model,
    },
  });

  if (moderation.recommendedTrustDelta) {
    await applyTrustDelta({
      userId: creator._id,
      delta: moderation.recommendedTrustDelta,
      reason: "moderation:topic",
      meta: { categories: moderation.categories, severity: moderation.severity },
    });
  }

  const backgroundTask = (async () => {
    try {
      const classifications = await classifyTextToOntology(`${title}\n\n${description}`.trim(), {
        topK: 12,
      }).catch((err) => {
        console.error("Topic classification failed", err);
        return [];
      });
      const ontologyCategories = classificationToAssignments(classifications, 6);
      if (ontologyCategories.length) {
        await Topic.findByIdAndUpdate(doc._id, { ontologyCategories }).exec();
      }
    } catch (err) {
      console.error("Async topic classification failed", err);
    }
  })();

  trackBackgroundTask(backgroundTask);

  return NextResponse.json(
    {
      id: doc._id,
      _id: doc._id,
      title: doc.title,
      description: doc.description,
  ontologyCategories: doc.ontologyCategories ?? [],
      createdAt: doc.createdAt,
      upvoteCount: 0,
      downvoteCount: 0,
      totalVotes: 0,
      creatorName: creator.name || "Unknown",
      visibility: visibility.status,
    },
    { status: 201 }
  );
}
