import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import Fact from "@/app/models/facts";
import Topic from "@/app/models/topic";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, ctx: any) {
    const resolvedCtx = await Promise.resolve(ctx.params);
    const id = resolvedCtx.id as string;
    if (!id || !mongoose.isValidObjectId(id)) {
        return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
    }

    await dbConnect();

    try {
        const topicObjectId = new mongoose.Types.ObjectId(id);
        const topic = await Topic.findById(topicObjectId).select({ isActive: 1, visibility: 1 }).lean();
        const visibilityStatus = topic?.visibility?.status;
        if (!topic || topic.isActive === false || (visibilityStatus && ["hidden", "blocked", "needs_review", "noise"].includes(visibilityStatus))) {
            return NextResponse.json({ error: "Topic not found" }, { status: 404 });
        }
        const facts = await Fact.find({
            topic: topicObjectId,
            $or: [{ status: "active" }, { status: { $exists: false } }]
        })
            .sort({ createdAt: -1 })
            .limit(200)
            .select({
                text: 1, sourceArgument: 1, sourceComment: 1, createdAt: 1,
                upvoteCount: 1, downvoteCount: 1, score: 1,
                reassessmentHistory: { $slice: -1 },
            })
            .lean();

        return NextResponse.json({
            topicId: id,
            facts: facts.map((fact) => {
                const latestReassessment = fact.reassessmentHistory?.length
                    ? fact.reassessmentHistory[fact.reassessmentHistory.length - 1]
                    : undefined;
                return {
                    id: fact._id?.toString?.() ?? "",
                    text: fact.text,
                    sourceArgument: fact.sourceArgument?.toString?.() ?? "",
                    sourceComment: fact.sourceComment?.toString?.() ?? "",
                    createdAt: fact.createdAt,
                    upvoteCount: fact.upvoteCount ?? 0,
                    downvoteCount: fact.downvoteCount ?? 0,
                    score: fact.score ?? 0,
                    latestReassessment: latestReassessment
                        ? {
                            reassessedAt: (latestReassessment as any).reassessedAt,
                            action: (latestReassessment as any).action,
                            rationale: (latestReassessment as any).rationale,
                        }
                        : undefined,
                };
            }),
        });
    } catch (err) {
        console.error("Failed to fetch facts", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
