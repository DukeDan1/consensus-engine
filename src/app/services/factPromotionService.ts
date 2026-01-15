import mongoose from "mongoose";
import { Argument } from "@/app/models/argument";
import { Fact } from "@/app/models/facts";
import { Vote } from "@/app/models/vote";

type FactPromotionStatus = "none" | "candidate" | "promoted" | "demoted";
type FactStatus = "active" | "candidate" | "demoted";

type VoteSnapshot = {
  upvoteCount: number;
  downvoteCount: number;
  uniqueVoters: number;
  netVotes: number;
};

type PromotionConfig = {
  minNetVotes: number;
  minUniqueVoters: number;
  demoteNetVotes: number;
  requireAiVerification: boolean;
};

const DEFAULT_MIN_NET_VOTES = 5;
const DEFAULT_MIN_UNIQUE_VOTERS = 3;

function parseEnvInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEnvBool(value: string | undefined) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true";
}

export function getFactPromotionConfig(): PromotionConfig {
  const minNetVotes = parseEnvInt(process.env.FACT_PROMOTION_MIN_NET_VOTES, DEFAULT_MIN_NET_VOTES);
  const minUniqueVoters = parseEnvInt(process.env.FACT_PROMOTION_MIN_UNIQUE_VOTERS, DEFAULT_MIN_UNIQUE_VOTERS);
  const demoteNetVotes = parseEnvInt(process.env.FACT_PROMOTION_DEMOTE_NET_VOTES, minNetVotes);
  return {
    minNetVotes: Math.max(0, minNetVotes),
    minUniqueVoters: Math.max(0, minUniqueVoters),
    demoteNetVotes: Math.max(0, demoteNetVotes),
    requireAiVerification: parseEnvBool(process.env.FACT_PROMOTION_REQUIRE_AI_VERIFY),
  };
}

function normalizeFactStatus(status?: string | null): FactStatus | null {
  if (!status) return null;
  if (status === "active" || status === "candidate" || status === "demoted") {
    return status;
  }
  return "active";
}

function resolveFactText(argument: {
  body?: string;
  aiAnalysis?: { factualPart?: string; aiSummary?: string };
}) {
  const ai = argument.aiAnalysis;
  const candidate = ai?.factualPart?.trim() || ai?.aiSummary?.trim() || argument.body?.trim();
  const raw = candidate || argument.body || "Fact candidate";
  if (raw.length <= 5000) return raw;
  return raw.slice(0, 5000).trim();
}

function buildHistoryEntry(
  status: FactStatus,
  reason: string,
  snapshot: VoteSnapshot,
  now: Date
) {
  return {
    status,
    reason,
    upvoteCount: snapshot.upvoteCount,
    downvoteCount: snapshot.downvoteCount,
    uniqueVoters: snapshot.uniqueVoters,
    netVotes: snapshot.netVotes,
    createdAt: now,
  };
}

async function buildVoteSnapshot(
  argumentId: mongoose.Types.ObjectId,
  overrides?: Partial<VoteSnapshot>
): Promise<VoteSnapshot> {
  let upvoteCount = overrides?.upvoteCount;
  let downvoteCount = overrides?.downvoteCount;
  let uniqueVoters = overrides?.uniqueVoters;

  if (typeof upvoteCount !== "number" || typeof downvoteCount !== "number") {
    const [up, down] = await Promise.all([
      Vote.countDocuments({ targetType: "Argument", targetId: argumentId, value: 1 }).exec(),
      Vote.countDocuments({ targetType: "Argument", targetId: argumentId, value: -1 }).exec(),
    ]);
    upvoteCount = up;
    downvoteCount = down;
  }

  if (typeof uniqueVoters !== "number") {
    uniqueVoters = await Vote.countDocuments({ targetType: "Argument", targetId: argumentId }).exec();
  }

  return {
    upvoteCount,
    downvoteCount,
    uniqueVoters,
    netVotes: upvoteCount - downvoteCount,
  };
}

function buildArgumentPromotionPayload(params: {
  previous?: {
    candidateAt?: Date;
    promotedAt?: Date;
    demotedAt?: Date;
  };
  status: FactPromotionStatus;
  reason: string;
  snapshot: VoteSnapshot;
  now: Date;
}) {
  const { previous, status, reason, snapshot, now } = params;
  const candidateAt = previous?.candidateAt ?? ((status === "candidate" || status === "promoted") ? now : undefined);
  const promotedAt = previous?.promotedAt ?? (status === "promoted" ? now : undefined);
  const demotedAt = status === "demoted" ? now : previous?.demotedAt;

  return {
    status,
    candidateAt,
    promotedAt,
    demotedAt,
    lastEvaluatedAt: now,
    reason,
    upvoteCount: snapshot.upvoteCount,
    downvoteCount: snapshot.downvoteCount,
    uniqueVoters: snapshot.uniqueVoters,
    netVotes: snapshot.netVotes,
  };
}

export async function evaluateFactPromotionForArgument(params: {
  argumentId: mongoose.Types.ObjectId;
  upvoteCount?: number;
  downvoteCount?: number;
  uniqueVoters?: number;
}) {
  const { argumentId } = params;
  const config = getFactPromotionConfig();

  const argument = await Argument.findById(argumentId)
    .select({ topic: 1, body: 1, aiAnalysis: 1, isRemoved: 1, visibility: 1, factPromotion: 1 })
    .lean();

  if (!argument || argument.isRemoved) return null;
  const visibilityStatus = argument.visibility?.status;
  if (visibilityStatus && ["blocked", "hidden", "needs_review"].includes(visibilityStatus)) {
    return null;
  }

  const snapshot = await buildVoteSnapshot(argumentId, params);
  const meetsThreshold = snapshot.netVotes >= config.minNetVotes && snapshot.uniqueVoters >= config.minUniqueVoters;
  const shouldDemote = snapshot.netVotes < config.demoteNetVotes || snapshot.uniqueVoters < config.minUniqueVoters;
  const now = new Date();

  const existingFact = await Fact.findOne({ sourceArgument: argumentId }).exec();
  const factStatus = normalizeFactStatus(existingFact?.status);
  const factSource = existingFact?.promotionSource ?? (existingFact ? "ai" : undefined);

  if (existingFact && factSource !== "community") {
    const promotionPayload = buildArgumentPromotionPayload({
      previous: argument.factPromotion,
      status: "promoted",
      reason: "ai_fact",
      snapshot,
      now,
    });
    await Argument.findByIdAndUpdate(argumentId, { factPromotion: promotionPayload }).exec();
    return { factPromotion: promotionPayload };
  }

  let nextStatus: FactPromotionStatus = argument.factPromotion?.status ?? "none";
  let reason = argument.factPromotion?.reason ?? "vote_threshold_pending";

  if (meetsThreshold) {
    const alreadyActive = factStatus === "active";
    let aiVerified = !config.requireAiVerification || argument.aiAnalysis?.isFact === true;
    const shouldCreateCandidate = !existingFact || !factStatus || factStatus === "demoted";

    if (shouldCreateCandidate) {
      nextStatus = "candidate";
      reason = "vote_threshold_met";
      const candidateEntry = buildHistoryEntry("candidate", reason, snapshot, now);
      if (!existingFact) {
        await Fact.create({
          linkedArguments: [argumentId],
          topic: argument.topic,
          text: resolveFactText(argument),
          sourceArgument: argumentId,
          status: "candidate",
          promotionSource: "community",
          promotionHistory: [candidateEntry],
        });
      } else {
        await Fact.findByIdAndUpdate(existingFact._id, {
          status: "candidate",
          demotedAt: undefined,
          $push: { promotionHistory: candidateEntry },
        }).exec();
      }
    } else {
      nextStatus = "promoted";
      reason = "vote_threshold_met_verified";
    }

    if (alreadyActive) {
      nextStatus = "promoted";
      reason = "already_promoted";
      aiVerified = true;
    }

    if (aiVerified) {
      nextStatus = "promoted";
      reason = alreadyActive ? reason : "vote_threshold_met_verified";
      if (existingFact) {
        if (factStatus !== "active") {
          const promotionEntry = buildHistoryEntry("active", reason, snapshot, now);
          await Fact.findByIdAndUpdate(existingFact._id, {
            status: "active",
            promotedAt: now,
            $push: { promotionHistory: promotionEntry },
          }).exec();
        }
      } else {
        const fact = await Fact.findOne({ sourceArgument: argumentId }).exec();
        if (fact && normalizeFactStatus(fact.status) !== "active") {
          const promotionEntry = buildHistoryEntry("active", reason, snapshot, now);
          await Fact.findByIdAndUpdate(fact._id, {
            status: "active",
            promotedAt: now,
            $push: { promotionHistory: promotionEntry },
          }).exec();
        }
      }
    } else {
      nextStatus = "candidate";
      reason = "ai_verification_failed";
    }
  } else if (shouldDemote) {
    if (existingFact && factStatus && factStatus !== "demoted") {
      nextStatus = "demoted";
      reason = "vote_threshold_lost";
      const demotionEntry = buildHistoryEntry("demoted", reason, snapshot, now);
      await Fact.findByIdAndUpdate(existingFact._id, {
        status: "demoted",
        demotedAt: now,
        $push: { promotionHistory: demotionEntry },
      }).exec();
    } else {
      nextStatus = "none";
      reason = "vote_threshold_lost";
    }
  }

  const promotionPayload = buildArgumentPromotionPayload({
    previous: argument.factPromotion,
    status: nextStatus,
    reason,
    snapshot,
    now,
  });

  await Argument.findByIdAndUpdate(argumentId, { factPromotion: promotionPayload }).exec();

  return { factPromotion: promotionPayload };
}
