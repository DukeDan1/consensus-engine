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
            "visibility.status": { $nin: ["blocked", "hidden", "needs_review", "noise"] },
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
            argumentCounts: 1,
          },
        },
        {
          $addFields: {
            totalVotes: { $add: ["$upvoteCount", "$downvoteCount"] },
          },
        },
        {
          $lookup: {
            from: "arguments",
            let: { topicId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ["$topic", "$$topicId"] },
                  isRemoved: false,
                  "visibility.status": { $nin: ["blocked", "hidden", "needs_review", "noise"] },
                },
              },
              { $count: "count" },
            ],
            as: "argumentCountsAgg",
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
                  "visibility.status": { $nin: ["blocked", "hidden", "needs_review", "noise"] },
                },
              },
              { $count: "count" },
            ],
            as: "commentCountsAgg",
          },
        },
        {
          $addFields: {
            argumentCount: {
              $ifNull: [
                { $first: "$argumentCountsAgg.count" },
                { $ifNull: ["$argumentCounts.total", 0] },
              ],
            },
            commentCount: { $ifNull: [{ $first: "$commentCountsAgg.count" }, 0] },
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
            argumentCount: 1,
            commentCount: 1,
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
