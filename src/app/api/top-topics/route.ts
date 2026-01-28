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
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } },
                  downvotes: { $sum: { $ifNull: ["$downvoteCount", 0] } },
                },
              },
            ],
            as: "argumentStats",
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
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } },
                  downvotes: { $sum: { $ifNull: ["$downvoteCount", 0] } },
                },
              },
            ],
            as: "commentStats",
          },
        },
        {
          $addFields: {
            argumentCount: { $ifNull: [{ $first: "$argumentStats.count" }, 0] },
            commentCount: { $ifNull: [{ $first: "$commentStats.count" }, 0] },
            upvoteCount: {
              $add: [
                { $ifNull: [{ $first: "$argumentStats.upvotes" }, 0] },
                { $ifNull: [{ $first: "$commentStats.upvotes" }, 0] },
              ],
            },
            downvoteCount: {
              $add: [
                { $ifNull: [{ $first: "$argumentStats.downvotes" }, 0] },
                { $ifNull: [{ $first: "$commentStats.downvotes" }, 0] },
              ],
            },
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
            argumentCount: 1,
            commentCount: 1,
            ontologyCategories: { $ifNull: ["$ontologyCategories", []] },
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
