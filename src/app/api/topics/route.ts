import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import User from "@/app/models/user";
import { getServerSession } from "next-auth";

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

// GET /api/topics?q=&creator=&page=1&pageSize=15
export async function GET(request: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const creator = (searchParams.get("creator") || "").trim();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") || "15", 10) || 15));

  const match: Record<string, any> = { isActive: true };

  if (q) {
    match.title = { $regex: q, $options: "i" };
  }

  if (creator) {
    const users = await User.find({
      $or: [
        { name: { $regex: creator, $options: "i" } },
        { email: { $regex: creator, $options: "i" } },
      ],
    }).select({ _id: 1 });
    const ids = users.map((u) => u._id);
    // If no users match, ensure no topics match
    match.createdBy = ids.length ? { $in: ids } : { $in: [] };
  }

  // Count total for pagination
  const total = await Topic.countDocuments(match).exec();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const skip = (page - 1) * pageSize;

  // Aggregate to shape output and include vote counts + creator name
  const results = await mongoose.connection
    .collection("topics")
    .aggregate([
      { $match: match },
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
  const tags: string[] = Array.isArray(body?.tags)
    ? body.tags.map((t: any) => (t ?? "").toString()).filter((s: string) => s.length)
    : [];

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

  const doc = await Topic.create({
    title,
    description,
    tags,
    createdBy: creator._id,
    isActive: true,
    slug,
  });

  return NextResponse.json(
    {
      id: doc._id,
      title: doc.title,
      description: doc.description,
      tags: doc.tags,
      createdAt: doc.createdAt,
    },
    { status: 201 }
  );
}
