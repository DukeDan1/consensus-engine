import mongoose from 'mongoose';
import User from '@/app/models/user';
import Topic from '@/app/models/topic';
import { notifyModeratorStatusChange } from '@/app/services/moderatorNotificationService';

export type TrustTier = 'low' | 'new' | 'standard' | 'trusted' | 'high';

const TRUST_BASELINE = 50;
const TRUST_MIN = 0;
const TRUST_MAX = 100;

const HALF_LIFE_DAYS = 30;
const MODERATOR_ELIGIBLE_TIERS = new Set<TrustTier>(['trusted', 'high']);

async function demoteModeratorsIfLowTrust(params: {
  userId: mongoose.Types.ObjectId | string;
  prevTier: TrustTier;
  nextTier: TrustTier;
  isAdmin?: boolean;
}) {
  const { userId, prevTier, nextTier, isAdmin } = params;
  if (isAdmin) return;
  const wasEligible = MODERATOR_ELIGIBLE_TIERS.has(prevTier);
  const stillEligible = MODERATOR_ELIGIBLE_TIERS.has(nextTier);
  if (!wasEligible || stillEligible) return;

  const userIdValue = typeof userId === 'string' ? userId : userId.toString();
  const userObjectId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

  const topics = await Topic.find({
    moderators: userObjectId,
    manualModerators: { $ne: userObjectId },
  })
    .select({ _id: 1, title: 1 })
    .lean();
  if (!topics.length) return;

  await Topic.updateMany(
    { _id: { $in: topics.map((topic) => topic._id) } },
    { $pull: { moderators: userObjectId } }
  ).exec();

  await Promise.allSettled(
    topics.map((topic) =>
      notifyModeratorStatusChange({
        recipientId: userIdValue,
        topicId: topic._id?.toString?.() ?? '',
        topicTitle: topic.title || 'this topic',
        action: 'removed',
        source: 'auto',
      })
    )
  );
}

export function normaliseTrustScore(raw: unknown): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : TRUST_BASELINE;
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, value));
}

export function scoreToTier(score: number): TrustTier {
  if (score < 25) return 'low';
  if (score < 45) return 'new';
  if (score < 70) return 'standard';
  if (score < 90) return 'trusted';
  return 'high';
}

export function decayTrustScore(score: number, lastUpdatedAt: Date | null | undefined, now: Date): number {
  if (!lastUpdatedAt) return score;
  const elapsedMs = Math.max(0, now.getTime() - new Date(lastUpdatedAt).getTime());
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
  if (elapsedDays <= 0) return score;

  // Exponential decay towards baseline.
  const lambda = Math.log(2) / HALF_LIFE_DAYS;
  const factor = Math.exp(-lambda * elapsedDays);
  return TRUST_BASELINE + (score - TRUST_BASELINE) * factor;
}

export async function applyTrustDelta(params: {
  userId: mongoose.Types.ObjectId | string;
  delta: number;
  reason: string;
  meta?: Record<string, unknown>;
}) {
  const { userId, delta, reason, meta } = params;

  const now = new Date();
  const userDoc: any = await User.findById(userId)
    .select({ trustScore: 1, trustTier: 1, trustUpdatedAt: 1, isAdmin: 1 })
    .lean()
    .exec()
    .catch(() => null);

  if (!userDoc?._id) return;

  const current = normaliseTrustScore(userDoc.trustScore);
  const decayed = decayTrustScore(current, userDoc.trustUpdatedAt, now);
  const nextScore = normaliseTrustScore(decayed + (Number.isFinite(delta) ? delta : 0));
  const prevTier = typeof userDoc.trustTier === 'string'
    ? (userDoc.trustTier as TrustTier)
    : scoreToTier(decayed);
  const nextTier = scoreToTier(nextScore);

  await User.findOneAndUpdate(
    { _id: userDoc._id },
    {
      $set: {
        trustScore: nextScore,
        trustTier: nextTier,
        trustUpdatedAt: now,
      },
      $push: {
        trustEvents: {
          $each: [
            {
              ts: now,
              delta,
              reason,
              meta: meta || {},
            },
          ],
          $slice: -50,
        },
      },
    },
    { upsert: false }
  ).exec();

  const demotionTask = demoteModeratorsIfLowTrust({
    userId: userDoc._id,
    prevTier,
    nextTier,
    isAdmin: userDoc.isAdmin,
  });
  demotionTask.catch((err) => {
    console.error('Failed to auto-demote moderators for low trust', err);
  });
}

export function getTierRankPenalty(tier: TrustTier | string | undefined): number {
  switch (tier) {
    case 'high':
      return 2;
    case 'trusted':
      return 1;
    case 'standard':
      return 0;
    case 'new':
      return -2;
    case 'low':
      return -4;
    default:
      return -2;
  }
}

export function shouldApplyStrictPostingRules(tier: TrustTier | string | undefined): boolean {
  return tier === 'low' || tier === 'new';
}
