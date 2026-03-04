import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { getAuthSession } from "@/app/services/authSessionService";
import Fact from "@/app/models/facts";
import FactVote from "@/app/models/factVote";
import Topic from "@/app/models/topic";
import User from "@/app/models/user";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import UserFollow from "@/app/models/userFollow";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";
import { hasTopicModeratorRole } from "@/app/services/topicModeratorService";
import { reassessFact } from "@/app/services/factReassessmentService";

async function signAvatarUrl(url?: string | null) {
    if (!url) return null;
    return getSignedReadUrlFromUrl(url).catch(() => url);
}

export const dynamic = "force-dynamic";

async function requireModeratorOrAdmin(req: NextRequest, topicId: string) {
    const authSession = await getAuthSession(req);
    if (!authSession?.email) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    const user = await User.findOne({ email: authSession.email }).select({ _id: 1, isAdmin: 1 }).lean();
    if (!user) {
        return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
    }
    if (user.isAdmin) {
        return { user };
    }
    const topic = await Topic.findById(topicId).select({ moderators: 1 }).lean();
    if (!topic) {
        return { error: NextResponse.json({ error: "Topic not found" }, { status: 404 }) };
    }
    if (!hasTopicModeratorRole(topic, user._id.toString())) {
        return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { user };
}

/** GET /api/topics/:id/facts/:factId — get a single fact with votes and reassessment history */
export async function GET(_req: NextRequest, ctx: any) {
    const { id, factId } = await Promise.resolve(ctx.params);
    if (!id || !mongoose.isValidObjectId(id) || !factId || !mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await dbConnect();

    const fact = await Fact.findOne({
        _id: new mongoose.Types.ObjectId(factId),
        topic: new mongoose.Types.ObjectId(id),
    }).lean();
    if (!fact) {
        return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    // Get vote reasons (comments) for this fact — populate user profile info
    const voteReasons = await FactVote.find({ fact: fact._id, reason: { $exists: true, $ne: "" } })
        .select({ value: 1, reason: 1, user: 1, createdAt: 1 })
        .populate("user", "name nickname avatarUrl avatarThumbUrl createdAt")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    // Compute user stats for tooltip (consistent with posts/comments)
    const userIds = [...new Set(
        voteReasons.map((v: any) => v.user?._id?.toString?.()).filter(Boolean)
    )];
    type UserStats = { posts: number; comments: number; upvotes: number; followers: number };
    const statsById = new Map<string, UserStats>();
    if (userIds.length) {
        const objectIds = userIds.map((uid) => new mongoose.Types.ObjectId(uid));
        const [argStats, commentStats, followerStats] = await Promise.all([
            Argument.aggregate([
                { $match: { createdBy: { $in: objectIds }, isRemoved: false } },
                { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
            ]),
            Comment.aggregate([
                { $match: { createdBy: { $in: objectIds }, isRemoved: false } },
                { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
            ]),
            UserFollow.aggregate([
                { $match: { targetUserId: { $in: objectIds } } },
                { $group: { _id: "$targetUserId", count: { $sum: 1 } } },
            ]),
        ]);
        userIds.forEach((uid) => statsById.set(uid, { posts: 0, comments: 0, upvotes: 0, followers: 0 }));
        argStats.forEach((r: any) => {
            const uid = r._id?.toString?.() ?? "";
            const s = statsById.get(uid);
            if (s) { s.posts = r.count ?? 0; s.upvotes += r.upvotes ?? 0; }
        });
        commentStats.forEach((r: any) => {
            const uid = r._id?.toString?.() ?? "";
            const s = statsById.get(uid);
            if (s) { s.comments = r.count ?? 0; s.upvotes += r.upvotes ?? 0; }
        });
        followerStats.forEach((r: any) => {
            const uid = r._id?.toString?.() ?? "";
            const s = statsById.get(uid);
            if (s) { s.followers = r.count ?? 0; }
        });
    }

    // Sign avatar URLs and build response
    const mappedVoteReasons = await Promise.all(voteReasons.map(async (v: any) => {
        if (!v.user) {
            return { id: v._id?.toString?.() ?? "", value: v.value, reason: v.reason, createdAt: v.createdAt, user: null };
        }
        const uid = v.user._id?.toString?.() ?? "";
        const [signedAvatar, signedThumb] = await Promise.all([
            signAvatarUrl(v.user.avatarUrl),
            signAvatarUrl(v.user.avatarThumbUrl),
        ]);
        return {
            id: v._id?.toString?.() ?? "",
            value: v.value,
            reason: v.reason,
            createdAt: v.createdAt,
            user: {
                id: uid,
                name: v.user.name ?? null,
                nickname: v.user.nickname ?? null,
                avatarUrl: signedAvatar,
                avatarThumbUrl: signedThumb,
                createdAt: v.user.createdAt ?? null,
                stats: statsById.get(uid) ?? undefined,
            },
        };
    }));

    return NextResponse.json({
        fact: {
            id: fact._id?.toString?.() ?? "",
            text: fact.text,
            status: fact.status ?? "active",
            upvoteCount: fact.upvoteCount ?? 0,
            downvoteCount: fact.downvoteCount ?? 0,
            score: fact.score ?? 0,
            sourceArgument: fact.sourceArgument?.toString?.() ?? "",
            sourceComment: fact.sourceComment?.toString?.() ?? "",
            createdAt: fact.createdAt,
            updatedAt: fact.updatedAt,
            reassessmentHistory: (fact.reassessmentHistory ?? []).map((r: any) => ({
                reassessedAt: r.reassessedAt,
                action: r.action,
                previousText: r.previousText,
                rationale: r.rationale,
                upvotesConsidered: r.upvotesConsidered,
                downvotesConsidered: r.downvotesConsidered,
                commentsConsidered: r.commentsConsidered,
                triggeredBy: r.triggeredBy,
            })),
        },
        voteReasons: mappedVoteReasons,
    });
}

/** PATCH /api/topics/:id/facts/:factId — moderator update fact text or status */
export async function PATCH(req: NextRequest, ctx: any) {
    const { id, factId } = await Promise.resolve(ctx.params);
    if (!id || !mongoose.isValidObjectId(id) || !factId || !mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await dbConnect();

    const auth = await requireModeratorOrAdmin(req, id);
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const { text, status, reason } = body as { text?: string; status?: "active" | "removed"; reason?: string };

    const factObjectId = new mongoose.Types.ObjectId(factId);
    const fact = await Fact.findOne({ _id: factObjectId, topic: new mongoose.Types.ObjectId(id) });
    if (!fact) {
        return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    if (text && typeof text === "string" && text.trim().length > 0 && text.trim().length <= 5000) {
        fact.text = text.trim();
    }

    if (status === "removed") {
        fact.status = "removed";
        fact.removedAt = new Date();
        fact.removedBy = auth.user._id;
        fact.removalReason = reason || "Removed by moderator";
    } else if (status === "active") {
        fact.status = "active";
        fact.removedAt = undefined;
        fact.removedBy = undefined;
        fact.removalReason = undefined;
    }

    await fact.save();

    return NextResponse.json({
        fact: {
            id: fact._id?.toString?.() ?? "",
            text: fact.text,
            status: fact.status,
            updatedAt: fact.updatedAt,
        },
    });
}

/** DELETE /api/topics/:id/facts/:factId — moderator remove fact */
export async function DELETE(req: NextRequest, ctx: any) {
    const { id, factId } = await Promise.resolve(ctx.params);
    if (!id || !mongoose.isValidObjectId(id) || !factId || !mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await dbConnect();

    const auth = await requireModeratorOrAdmin(req, id);
    if ("error" in auth) return auth.error;

    const factObjectId = new mongoose.Types.ObjectId(factId);
    const fact = await Fact.findOne({ _id: factObjectId, topic: new mongoose.Types.ObjectId(id) });
    if (!fact) {
        return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    fact.status = "removed";
    fact.removedAt = new Date();
    fact.removedBy = auth.user._id;
    fact.removalReason = "Removed by moderator";
    await fact.save();

    return NextResponse.json({ success: true });
}

/** POST /api/topics/:id/facts/:factId — moderator triggers AI reassessment */
export async function POST(req: NextRequest, ctx: any) {
    const { id, factId } = await Promise.resolve(ctx.params);
    if (!id || !mongoose.isValidObjectId(id) || !factId || !mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    await dbConnect();

    const auth = await requireModeratorOrAdmin(req, id);
    if ("error" in auth) return auth.error;

    const factObjectId = new mongoose.Types.ObjectId(factId);
    const fact = await Fact.findOne({ _id: factObjectId, topic: new mongoose.Types.ObjectId(id) });
    if (!fact) {
        return NextResponse.json({ error: "Fact not found" }, { status: 404 });
    }

    try {
        const result = await reassessFact(fact, "moderator", auth.user._id.toString());
        return NextResponse.json({
            result,
            updatedFact: {
                id: fact._id?.toString?.() ?? "",
                text: fact.text,
                status: fact.status,
            },
        });
    } catch (err: any) {
        console.error("Fact reassessment error", err);
        return NextResponse.json({ error: "Reassessment failed" }, { status: 500 });
    }
}
