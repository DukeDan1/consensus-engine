import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { getTopicSummaryWithRefresh } from "@/app/services/topicSummaryService";

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
        const summary = await getTopicSummaryWithRefresh(topicObjectId);
        return NextResponse.json({
            topicId: id,
            generatedAt: summary.generatedAt,
            refreshQueued: summary.refreshQueued,
            points: summary.points,
        });
    } catch (err) {
        console.error("Failed to fetch summary", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
