import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Topic } from "@/app/models/topic";
import { getTopicSummary } from "@/app/services/topicSummaryService";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: any) {
    const resolvedCtx = await Promise.resolve(ctx.params);
    const id = resolvedCtx.id as string;
    if (!id || !mongoose.isValidObjectId(id)) {
        return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
    }

    await dbConnect();

    const topicObjectId = new mongoose.Types.ObjectId(id);
    try {
        const topic = await Topic.findById(topicObjectId).select({ isActive: 1, visibility: 1 }).lean();
        const visibilityStatus = topic?.visibility?.status;
        if (!topic || topic.isActive === false || (visibilityStatus && ["hidden", "blocked", "needs_review"].includes(visibilityStatus))) {
            return NextResponse.json({ error: "Topic not found" }, { status: 404 });
        }
        const summary = await getTopicSummary(topicObjectId);
        return NextResponse.json({
            topicId: id,
            generatedAt: summary.generatedAt,
            points: summary.points,
        });
    } catch (err) {
        console.error("Failed to fetch summary", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
