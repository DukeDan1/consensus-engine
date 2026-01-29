import mongoose from "mongoose";
import Topic from "@/app/models/topic";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import User from "@/app/models/user";
import { normaliseTrustScore, scoreToTier } from "@/app/services/trustService";

// Change requirements as needed
const MIN_MEMBER_DAYS = 0;
const MIN_GLOBAL_ACTIVITY = 50;
const MIN_TOPIC_ACTIVITY = 5;
const EARLY_ACTIVITY_THRESHOLD = 5;
const MIN_TOTAL_VOTES_FOR_DEMOTION = 50;
const MAX_DOWNVOTE_RATIO = 0.4;

const HIGH_TRUST_TIERS = new Set(["trusted", "high"]);

function toObjectId(value: string | mongoose.Types.ObjectId) {
  return typeof value === "string" ? new mongoose.Types.ObjectId(value) : value;
}

function isHighTrust(user: { trustTier?: string; trustScore?: number } | null) {
  if (!user) return false;
  const tier = typeof user.trustTier === "string"
    ? user.trustTier
    : scoreToTier(normaliseTrustScore(user.trustScore));
  return HIGH_TRUST_TIERS.has(tier);
}

export function hasTopicModeratorRole(topic: any, userId: string) {
  if (!topic || !userId) return false;
  const userIdValue = userId.toString();
  return Array.isArray(topic?.moderators)
    ? topic.moderators.some((value: any) => value?.toString?.() === userIdValue)
    : false;
}

const EXCLUDED_VISIBILITY_STATUSES = ["blocked", "hidden", "needs_review"];

async function getUserGlobalActivityCount(userId: string) {
  const userObjectId = toObjectId(userId);
  const [argumentCount, commentCount] = await Promise.all([
    Argument.countDocuments({
      createdBy: userObjectId,
      isRemoved: false,
      "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
    }),
    Comment.countDocuments({
      createdBy: userObjectId,
      isRemoved: false,
      "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
    }),
  ]);
  return argumentCount + commentCount;
}

async function getUserTopicActivityCount(userId: string, topicId: string) {
  const userObjectId = toObjectId(userId);
  const topicObjectId = toObjectId(topicId);

  const [argumentCount, commentCounts] = await Promise.all([
    Argument.countDocuments({
      topic: topicObjectId,
      createdBy: userObjectId,
      isRemoved: false,
      "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
    }),
    Comment.aggregate([
      {
        $match: {
          createdBy: userObjectId,
          isRemoved: false,
          "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
        },
      },
      { $lookup: { from: "arguments", localField: "argument", foreignField: "_id", as: "argument" } },
      { $unwind: "$argument" },
      { $match: { "argument.topic": topicObjectId } },
      { $count: "count" },
    ]),
  ]);

  const commentCount = commentCounts?.[0]?.count ?? 0;
  return argumentCount + commentCount;
}

async function getTopicActivityCount(topicId: string) {
  const topicObjectId = toObjectId(topicId);
  const [argumentCount, commentCounts] = await Promise.all([
    Argument.countDocuments({
      topic: topicObjectId,
      isRemoved: false,
      "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
    }),
    Comment.aggregate([
      {
        $match: {
          isRemoved: false,
          "visibility.status": { $nin: EXCLUDED_VISIBILITY_STATUSES },
        },
      },
      { $lookup: { from: "arguments", localField: "argument", foreignField: "_id", as: "argument" } },
      { $unwind: "$argument" },
      { $match: { "argument.topic": topicObjectId } },
      { $count: "count" },
    ]),
  ]);
  const commentCount = commentCounts?.[0]?.count ?? 0;
  return argumentCount + commentCount;
}

async function getUserTopicVoteTotals(userId: string, topicId: string) {
  const userObjectId = toObjectId(userId);
  const topicObjectId = toObjectId(topicId);

  const [argumentTotals, commentTotals] = await Promise.all([
    Argument.aggregate([
      { $match: { createdBy: userObjectId, topic: topicObjectId } },
      {
        $group: {
          _id: null,
          upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } },
          downvotes: { $sum: { $ifNull: ["$downvoteCount", 0] } },
        },
      },
    ]),
    Comment.aggregate([
      { $match: { createdBy: userObjectId } },
      { $lookup: { from: "arguments", localField: "argument", foreignField: "_id", as: "argument" } },
      { $unwind: "$argument" },
      { $match: { "argument.topic": topicObjectId } },
      {
        $group: {
          _id: null,
          upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } },
          downvotes: { $sum: { $ifNull: ["$downvoteCount", 0] } },
        },
      },
    ]),
  ]);

  const argumentTotalsRow = argumentTotals?.[0] ?? {};
  const commentTotalsRow = commentTotals?.[0] ?? {};

  return {
    upvotes: (argumentTotalsRow.upvotes ?? 0) + (commentTotalsRow.upvotes ?? 0),
    downvotes: (argumentTotalsRow.downvotes ?? 0) + (commentTotalsRow.downvotes ?? 0),
  };
}

function meetsMemberDuration(user: { createdAt?: Date | string | null }) {
  if (!user?.createdAt) return false;
  const createdAt = new Date(user.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const minAgeMs = MIN_MEMBER_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - createdAt.getTime() >= minAgeMs;
}

export async function maybeAutoPromoteModerator(params: { userId: string; topicId: string }) {
  const { userId, topicId } = params;
  if (!userId || !topicId) return { promoted: false };

  const [user, topic] = await Promise.all([
    User.findById(userId).select({ createdAt: 1, trustTier: 1, trustScore: 1, isAdmin: 1 }).lean(),
    Topic.findById(topicId).select({ moderators: 1, createdBy: 1, autoModeratorEnabled: 1 }).lean(),
  ]);

  if (!user || !topic || user.isAdmin) return { promoted: false };
  if (topic.autoModeratorEnabled === false) return { promoted: false };
  if (hasTopicModeratorRole(topic, userId)) return { promoted: false };

  const meetsGlobalTrust = isHighTrust(user);
  const meetsMemberAge = meetsMemberDuration(user);
  if (!meetsGlobalTrust || !meetsMemberAge) return { promoted: false };

  const globalActivityCount = await getUserGlobalActivityCount(userId);
  if (globalActivityCount < MIN_GLOBAL_ACTIVITY) return { promoted: false };

  const isCreator = topic?.createdBy?.toString?.() === userId;
  let meetsTopicRequirement = isCreator;

  if (!meetsTopicRequirement) {
    const userTopicActivity = await getUserTopicActivityCount(userId, topicId);
    meetsTopicRequirement = userTopicActivity >= MIN_TOPIC_ACTIVITY;
  }

  if (!meetsTopicRequirement) {
    const totalTopicActivity = await getTopicActivityCount(topicId);
    if (totalTopicActivity <= EARLY_ACTIVITY_THRESHOLD) {
      meetsTopicRequirement = true;
    }
  }

  if (!meetsTopicRequirement) return { promoted: false };

  await Topic.findByIdAndUpdate(topicId, { $addToSet: { moderators: user._id } }).exec();
  return { promoted: true };
}

export async function maybeDemoteModeratorForTopic(params: { userId: string; topicId: string }) {
  const { userId, topicId } = params;
  if (!userId || !topicId) return { demoted: false };

  const topic = await Topic.findById(topicId).select({ moderators: 1 }).lean();
  if (!topic || !hasTopicModeratorRole(topic, userId)) return { demoted: false };

  const totals = await getUserTopicVoteTotals(userId, topicId);
  const totalVotes = totals.upvotes + totals.downvotes;
  if (totalVotes < MIN_TOTAL_VOTES_FOR_DEMOTION) {
    return { demoted: false, totalVotes, downvoteRatio: 0 };
  }

  const downvoteRatio = totals.downvotes / totalVotes;
  if (downvoteRatio <= MAX_DOWNVOTE_RATIO) {
    return { demoted: false, totalVotes, downvoteRatio };
  }

  await Topic.findByIdAndUpdate(topicId, { $pull: { moderators: toObjectId(userId) } }).exec();
  return { demoted: true, totalVotes, downvoteRatio };
}
