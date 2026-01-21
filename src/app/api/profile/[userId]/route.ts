import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";
import { UserFollow } from "@/app/models/userFollow";
import "@/app/models/topic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type TopicInfo = { id: string | null; title: string | null } | null;

type UserLean = {
    _id: mongoose.Types.ObjectId;
    name?: string | null;
    nickname?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
    avatarThumbUrl?: string | null;
    email?: string | null;
    isSuspended?: boolean;
    createdAt?: Date | null;
};

type ProfileResponse = {
    user: {
        id: string;
        name: string | null;
        nickname: string | null;
        bio?: string | null;
        avatarUrl?: string | null;
        avatarThumbUrl?: string | null;
        email?: string | null;
        canViewEmail?: boolean;
        isSuspended?: boolean;
        createdAt: string | null;
        stats?: {
            posts: number;
            comments: number;
            upvotes: number;
            followers: number;
        };
    };
    recentArguments: Array<{
        id: string;
        body: string;
        createdAt: string | null;
        upvoteCount: number;
        downvoteCount: number;
        score: number;
        topic: TopicInfo;
    }>;
    recentComments: Array<{
        id: string;
        body: string;
        createdAt: string | null;
        upvoteCount: number;
        downvoteCount: number;
        score: number;
        argument: {
            id: string | null;
            body: string | null;
            topic: TopicInfo;
        } | null;
    }>;
    meta: {
        limit: number;
    };
};

function extractTopicInfo(topic: any): TopicInfo {
    if (!topic) {
        return null;
    }

    if (typeof topic === "string") {
        return { id: topic, title: null };
    }

    if (typeof topic === "object") {
        const id = "_id" in topic && topic._id ? topic._id.toString() : null;
        const title = "title" in topic ? (topic.title as string | null) ?? null : null;
        return id || title ? { id, title } : null;
    }

    return null;
}

function sanitiseLimit(raw: string | null): number {
    const parsed = Number.parseInt(raw ?? "", 10);
    if (Number.isNaN(parsed)) return DEFAULT_LIMIT;
    return Math.max(1, Math.min(MAX_LIMIT, parsed));
}

export async function GET(request: NextRequest, ctx: any) {
    const resolvedCtx = await Promise.resolve(ctx.params);
    const userId = resolvedCtx.userId as string;

    if (!mongoose.isValidObjectId(userId)) {
        return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
    }

    await dbConnect();

    const userDoc = (await User.findById(userId)
        .select({ name: 1, nickname: 1, bio: 1, avatarUrl: 1, avatarThumbUrl: 1, email: 1, createdAt: 1, isSuspended: 1 })
        .lean()
        .exec()) as UserLean | null;

    if (!userDoc) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const session = await getServerSession();
    let viewerUser: { _id?: mongoose.Types.ObjectId; isAdmin?: boolean } | null = null;
    if (session?.user?.email) {
        viewerUser = await User.findOne({ email: session.user.email }).select({ _id: 1, isAdmin: 1 }).lean();
    }

    const viewerId = viewerUser?._id?.toString?.();
    const canViewEmail = !!viewerUser?.isAdmin || Boolean(viewerId && viewerId === userDoc._id.toString());

    let avatarUrl = userDoc.avatarUrl ?? null;
    if (avatarUrl) {
        avatarUrl = await getSignedReadUrlFromUrl(avatarUrl).catch(() => avatarUrl);
    }
    let avatarThumbUrl = userDoc.avatarThumbUrl ?? null;
    if (avatarThumbUrl) {
        avatarThumbUrl = await getSignedReadUrlFromUrl(avatarThumbUrl).catch(() => avatarThumbUrl);
    }

    const { searchParams } = new URL(request.url);
    const limit = sanitiseLimit(searchParams.get("limit"));

    const [argumentDocsRaw, commentDocsRaw, argumentStats, commentStats, followerStats] = await Promise.all([
        Argument.find({ createdBy: userDoc._id, isRemoved: false })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate({ path: "topic", select: "title" })
            .lean()
            .exec(),
        Comment.find({ createdBy: userDoc._id, isRemoved: false })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate({
                path: "argument",
                select: "body topic",
                populate: { path: "topic", select: "title" },
            })
            .lean()
            .exec(),
        Argument.aggregate([
            { $match: { createdBy: userDoc._id, isRemoved: false } },
            { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
        ]),
        Comment.aggregate([
            { $match: { createdBy: userDoc._id, isRemoved: false } },
            { $group: { _id: "$createdBy", count: { $sum: 1 }, upvotes: { $sum: { $ifNull: ["$upvoteCount", 0] } } } },
        ]),
        UserFollow.aggregate([
            { $match: { targetUserId: userDoc._id } },
            { $group: { _id: "$targetUserId", count: { $sum: 1 } } },
        ]),
    ]);

    const argumentDocs = (argumentDocsRaw ?? []) as any[];
    const commentDocs = (commentDocsRaw ?? []) as any[];

    const recentArguments = (argumentDocs ?? []).map((argument: any) => {
        const topic = extractTopicInfo(argument?.topic);
        const upvotes = argument?.upvoteCount ?? 0;
        const downvotes = argument?.downvoteCount ?? 0;
        const score = argument?.score ?? upvotes - downvotes;

        return {
            id: argument?._id?.toString?.() ?? "",
            body: argument?.body ?? "",
            createdAt: argument?.createdAt ? new Date(argument.createdAt).toISOString() : null,
            upvoteCount: upvotes,
            downvoteCount: downvotes,
            score,
            topic,
        };
    });

    const recentComments = (commentDocs ?? []).map((comment: any) => {
        const argument = comment?.argument;
        const argumentId = argument?._id ? argument._id.toString() : typeof argument === "string" ? argument : null;
        const argumentBody = argument?.body ?? null;
        const topic = argument ? extractTopicInfo(argument?.topic) : null;
        const upvotes = comment?.upvoteCount ?? 0;
        const downvotes = comment?.downvoteCount ?? 0;
        const score = comment?.score ?? upvotes - downvotes;

        return {
            id: comment?._id?.toString?.() ?? "",
            body: comment?.body ?? "",
            createdAt: comment?.createdAt ? new Date(comment.createdAt).toISOString() : null,
            upvoteCount: upvotes,
            downvoteCount: downvotes,
            score,
            argument: argumentId
                ? {
                    id: argumentId,
                    body: argumentBody,
                    topic,
                }
                : null,
        };
    });

    const postCount = argumentStats?.[0]?.count ?? 0;
    const commentCount = commentStats?.[0]?.count ?? 0;
    const upvoteCount = (argumentStats?.[0]?.upvotes ?? 0) + (commentStats?.[0]?.upvotes ?? 0);
    const followerCount = followerStats?.[0]?.count ?? 0;

    const response: ProfileResponse = {
        user: {
            id: userDoc._id.toString(),
            name: userDoc.name ?? null,
            nickname: userDoc.nickname ?? null,
            bio: userDoc.bio ?? null,
            avatarUrl,
            avatarThumbUrl,
            email: canViewEmail ? userDoc.email ?? null : null,
            canViewEmail,
            isSuspended: !!userDoc.isSuspended,
            createdAt: userDoc.createdAt ? userDoc.createdAt.toISOString() : null,
            stats: {
                posts: postCount,
                comments: commentCount,
                upvotes: upvoteCount,
                followers: followerCount,
            },
        },
        recentArguments,
        recentComments,
        meta: {
            limit,
        },
    };

    return NextResponse.json(response, { status: 200 });
}
