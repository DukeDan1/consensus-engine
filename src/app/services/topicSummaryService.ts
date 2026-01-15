import mongoose from "mongoose";
import { Argument } from "@/app/models/argument";

const MAX_POINTS_PER_COLUMN = 5;

type MongooseId = mongoose.Types.ObjectId;

type SummaryColumn = {
    text: string;
    argument?: string;
    stance: "for" | "against" | "neutral";
    justification?: string;
    lastUpdatedAt?: Date;
    upvoteCount?: number;
    downvoteCount?: number;
    factPromotion?: {
        status?: "none" | "candidate" | "promoted" | "demoted";
        reason?: string;
        uniqueVoters?: number;
        netVotes?: number;
    };
};

type SummaryResult = {
    generatedAt: Date;
    points: {
        for: SummaryColumn[];
        against: SummaryColumn[];
        neutral: SummaryColumn[];
    };
};

function truncateForSummary(text: string, maxLength = 260): string {
    if (!text) return "";
    const trimmed = text.trim();
    if (trimmed.length <= maxLength) return trimmed;
    const sentenceEnd = trimmed.indexOf(".", Math.min(maxLength, trimmed.length - 1));
    if (sentenceEnd > -1 && sentenceEnd <= maxLength + 40) {
        return `${trimmed.slice(0, sentenceEnd + 1)} …`;
    }
    return `${trimmed.slice(0, maxLength)}…`;
}

async function buildSummaryPoints(topicId: MongooseId): Promise<{ for: SummaryColumn[]; against: SummaryColumn[]; neutral: SummaryColumn[] }> {
    const args = await Argument.find({ topic: topicId, isRemoved: false })
        .sort({ score: -1, createdAt: -1 })
        .limit(MAX_POINTS_PER_COLUMN * 3)
        .select({ side: 1, score: 1, aiAnalysis: 1, updatedAt: 1, createdAt: 1, upvoteCount: 1, downvoteCount: 1, factPromotion: 1 })
        .lean();

    const groups: Record<string, SummaryColumn[]> = { for: [], against: [], neutral: [] };

    for (const arg of args) {
        const stance = (arg.side ?? "neutral") as "for" | "against" | "neutral";
        const targetGroup = groups[stance] ?? groups.neutral;
        const textSource = arg.aiAnalysis?.aiSummary?.trim() || "AI summary unavailable.";

        targetGroup.push({
            text: truncateForSummary(textSource),
            argument: arg._id?.toString?.() ?? "",
            stance,
            justification: arg.aiAnalysis?.justification,
            lastUpdatedAt: arg.updatedAt ?? arg.createdAt,
            upvoteCount: arg.upvoteCount ?? 0,
            downvoteCount: arg.downvoteCount ?? 0,
            factPromotion: arg.factPromotion ? {
                status: arg.factPromotion.status,
                reason: arg.factPromotion.reason,
                uniqueVoters: arg.factPromotion.uniqueVoters,
                netVotes: arg.factPromotion.netVotes,
            } : undefined,
        });
    }

    return {
        for: groups.for.slice(0, MAX_POINTS_PER_COLUMN),
        against: groups.against.slice(0, MAX_POINTS_PER_COLUMN),
        neutral: groups.neutral.slice(0, MAX_POINTS_PER_COLUMN),
    };
}

export async function getTopicSummary(topicId: MongooseId): Promise<SummaryResult> {
    const points = await buildSummaryPoints(topicId);

    return {
        generatedAt: new Date(),
        points,
    };
}
