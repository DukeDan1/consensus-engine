import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import "@/app/models/topic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

type TopicInfo = { id: string | null; title: string | null } | null;

type UserLean = {
    _id: mongoose.Types.ObjectId;
    name?: string | null;
    nickname?: string | null;
    email?: string | null;
    createdAt?: Date | null;
};

type ProfileResponse = {
    user: {
        id: string;
        name: string | null;
        nickname: string | null;
        email: string | null;
        createdAt: string | null;
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
        .select({ name: 1, nickname: 1, email: 1, createdAt: 1 })
        .lean()
        .exec()) as UserLean | null;

    if (!userDoc) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = sanitiseLimit(searchParams.get("limit"));

    const [argumentDocsRaw, commentDocsRaw] = await Promise.all([
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

    const response: ProfileResponse = {
        user: {
            id: userDoc._id.toString(),
            name: userDoc.name ?? null,
            nickname: userDoc.nickname ?? null,
            email: userDoc.email ?? null,
            createdAt: userDoc.createdAt ? userDoc.createdAt.toISOString() : null,
        },
        recentArguments,
        recentComments,
        meta: {
            limit,
        },
    };

    return NextResponse.json(response, { status: 200 });
}
