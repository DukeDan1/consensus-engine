// app/api/top-topics/route.ts
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";

export async function GET() {
  try {
    await dbConnect();

    // Aggregate vote counts and creator name, sorted by total votes desc
    const results = await mongoose.connection
      .collection("topics")
      .aggregate([
        {
          $match: {
            isActive: true,
            "visibility.status": { $nin: ["blocked", "hidden", "needs_review"] },
          },
        },
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
        {
          $addFields: {
            totalVotes: { $add: ["$upvoteCount", "$downvoteCount"] },
          },
        },
        {
          $sort: { totalVotes: -1, createdAt: -1 },
        },
        {
          $limit: 6,
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "creator",
          },
        },
        {
          $unwind: {
            path: "$creator",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            title: 1,
            upvoteCount: 1,
            downvoteCount: 1,
            totalVotes: 1,
            ontologyCategories: 1,
            creatorName: {
              $ifNull: ["$creator.name", "Unknown"],
            },
          },
        },
      ])
      .toArray();

    return NextResponse.json({ topics: results }, { status: 200 });
  } catch (err) {
    console.error("GET /api/top-topics error:", err);
    return NextResponse.json(
      { error: "Failed to load topics" },
      { status: 500 }
    );
  }
}
