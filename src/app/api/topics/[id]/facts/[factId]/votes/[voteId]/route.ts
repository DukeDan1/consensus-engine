import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { getAuthSession } from "@/app/services/authSessionService";
import FactVote from "@/app/models/factVote";
import Fact from "@/app/models/facts";
import Topic from "@/app/models/topic";
import User from "@/app/models/user";
import { hasTopicModeratorRole } from "@/app/services/topicModeratorService";

export const dynamic = "force-dynamic";

/** DELETE /api/topics/:id/facts/:factId/votes/:voteId — moderator deletes a vote reason */
export async function DELETE(req: NextRequest, ctx: any) {
    const { id, factId, voteId } = await Promise.resolve(ctx.params);
    if (
        !id || !mongoose.isValidObjectId(id) ||
        !factId || !mongoose.isValidObjectId(factId) ||
        !voteId || !mongoose.isValidObjectId(voteId)
    ) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await dbConnect();

    // Require moderator or admin
    const authSession = await getAuthSession(req);
    if (!authSession?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await User.findOne({ email: authSession.email }).select({ _id: 1, isAdmin: 1 }).lean();
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (!user.isAdmin) {
        const topic = await Topic.findById(id).select({ moderators: 1 }).lean();
        if (!topic || !hasTopicModeratorRole(topic, user._id.toString())) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
    }

    const topicObjectId = new mongoose.Types.ObjectId(id);
    const factObjectId = new mongoose.Types.ObjectId(factId);

    // Security check: ensure factId actually belongs to the topic in the URL
    const fact = await Fact.findOne({ _id: factObjectId, topic: topicObjectId })
        .select({ _id: 1 })
        .lean();
    if (!fact) {
        return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    const vote = await FactVote.findOne({
        _id: new mongoose.Types.ObjectId(voteId),
        fact: factObjectId,
    });
    if (!vote) {
        return NextResponse.json({ error: "Vote not found" }, { status: 404 });
    }

    // Clear the reason text but keep the vote itself
    vote.reason = undefined;
    await vote.save();

    // Recount votes to keep cached counts accurate
    const upCount = await FactVote.countDocuments({ fact: factObjectId, value: 1 }).exec();
    const downCount = await FactVote.countDocuments({ fact: factObjectId, value: -1 }).exec();
    await Fact.findByIdAndUpdate(factObjectId, {
        upvoteCount: upCount,
        downvoteCount: downCount,
        score: upCount - downCount,
    }).exec();

    return NextResponse.json({ success: true });
}
