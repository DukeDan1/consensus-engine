import mongoose from "mongoose";
import { Argument } from "@/app/models/argument";
import { TopicSummary, ITopicSummary } from "@/app/models/topicSummary";
import { trackBackgroundTask } from "@/app/lib/backgroundTasks";

const SUMMARY_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_POINTS_PER_COLUMN = 5;

type MongooseId = mongoose.Types.ObjectId;

type SummaryColumn = {
    text: string;
    argument?: MongooseId;
    stance: "for" | "against" | "neutral";
    lastUpdatedAt?: Date;
};

type SummaryResult = {
    generatedAt: Date;
    points: {
        for: SummaryColumn[];
        against: SummaryColumn[];
        neutral: SummaryColumn[];
    };
    refreshQueued: boolean;
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

async function simulateAISummarisation(_topicTitle: string, points: SummaryColumn[]): Promise<SummaryColumn[]> {
    // Dummy function mocking an OpenAI call; currently echoes the truncated text
    // to mimic AI summarisation latency.
    await new Promise((resolve) => setTimeout(resolve, 30));
    return points.map((point) => ({
        ...point,
        text: point.text,
        lastUpdatedAt: new Date(),
    }));
}

async function buildSummaryPoints(topicId: MongooseId): Promise<{ for: SummaryColumn[]; against: SummaryColumn[]; neutral: SummaryColumn[] }> {
    const args = await Argument.find({ topic: topicId, isRemoved: false })
        .sort({ score: -1, createdAt: -1 })
        .limit(MAX_POINTS_PER_COLUMN * 3)
        .select({ body: 1, side: 1, score: 1 })
        .lean();

    const groups: Record<string, SummaryColumn[]> = { for: [], against: [], neutral: [] };

    for (const arg of args) {
        const stance = (arg.side ?? "neutral") as "for" | "against" | "neutral";
        if (!groups[stance]) {
            groups["neutral"].push({
                text: truncateForSummary(arg.body),
                argument: arg._id as MongooseId,
                stance: "neutral",
            });
            continue;
        }
        groups[stance].push({
            text: truncateForSummary(arg.body),
            argument: arg._id as MongooseId,
            stance,
        });
    }

    return {
        for: await simulateAISummarisation("", groups.for.slice(0, MAX_POINTS_PER_COLUMN)),
        against: await simulateAISummarisation("", groups.against.slice(0, MAX_POINTS_PER_COLUMN)),
        neutral: await simulateAISummarisation("", groups.neutral.slice(0, MAX_POINTS_PER_COLUMN)),
    };
}

async function rebuildSummary(topicId: MongooseId): Promise<void> {
    const points = await buildSummaryPoints(topicId);
    await TopicSummary.findOneAndUpdate(
        { topic: topicId },
        { $set: { generatedAt: new Date(), points } },
        { upsert: true }
    ).exec();
}

export async function getTopicSummaryWithRefresh(topicId: MongooseId): Promise<SummaryResult> {
    let summary = await TopicSummary.findOne({ topic: topicId }).lean<ITopicSummary | null>();
    let refreshQueued = false;

    if (!summary) {
        await rebuildSummary(topicId);
        summary = await TopicSummary.findOne({ topic: topicId }).lean<ITopicSummary | null>();
    } else if (Date.now() - new Date(summary.generatedAt).getTime() > SUMMARY_REFRESH_INTERVAL_MS) {
        refreshQueued = true;
        const task = rebuildSummary(topicId).catch((err) => {
            console.error("Failed to refresh topic summary", topicId.toString(), err);
        });
        trackBackgroundTask(task);
    }

    return {
        generatedAt: summary?.generatedAt ?? new Date(),
        points: {
            for: summary?.points?.for ?? [],
            against: summary?.points?.against ?? [],
            neutral: summary?.points?.neutral ?? [],
        },
        refreshQueued,
    };
}
