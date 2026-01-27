import mongoose from "mongoose";
import Argument from "@/app/models/argument";
import { effectiveScore } from "@/app/services/evidenceFactCheckService";

const MAX_POINTS_PER_COLUMN = 5;
const RANKING_BUFFER = 3;

type MongooseId = mongoose.Types.ObjectId;

type SummaryColumn = {
    text: string;
    argument?: MongooseId;
    stance: "for" | "against" | "neutral";
    justification?: string;
    lastUpdatedAt?: Date;
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
        .limit(MAX_POINTS_PER_COLUMN * RANKING_BUFFER * 2)
        .select({ side: 1, score: 1, evidenceRankScore: 1, aiAnalysis: 1, updatedAt: 1, createdAt: 1 })
        .lean();

    const orderedArgs = [...args].sort((a, b) => {
        const aScore = effectiveScore(a.score, (a as any).evidenceRankScore);
        const bScore = effectiveScore(b.score, (b as any).evidenceRankScore);
        if (bScore !== aScore) return bScore - aScore;
        return (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0);
    });

    const groups: Record<string, SummaryColumn[]> = { for: [], against: [], neutral: [] };

    for (const arg of orderedArgs) {
        const stance = (arg.side ?? "neutral") as "for" | "against" | "neutral";
        const targetGroup = groups[stance] ?? groups.neutral;
        const textSource = arg.aiAnalysis?.aiSummary?.trim() || "AI summary unavailable.";

        targetGroup.push({
            text: truncateForSummary(textSource),
            argument: arg._id as MongooseId,
            stance,
            justification: arg.aiAnalysis?.justification,
            lastUpdatedAt: arg.updatedAt ?? arg.createdAt,
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
