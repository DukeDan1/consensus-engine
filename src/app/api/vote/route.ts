import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/app/services/authSessionService";
import { dbConnect } from "@/app/lib/mongoose";
import Vote from "@/app/models/vote";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import Topic from "@/app/models/topic";
import User from "@/app/models/user";
import mongoose from "mongoose";
import { maybeDemoteModeratorForTopic } from "@/app/services/topicModeratorService";
import { buildBaseUrl } from "@/app/lib/commonFunctions";
import { notifyModeratorStatusChange } from "@/app/services/moderatorNotificationService";

type Body = {
    targetType: "Argument" | "Topic" | "Comment";
    targetId: string;
    value: 1 | -1;
};

export async function POST(req: NextRequest) {
    await dbConnect();

    const authSession = await getAuthSession(req);
    if (!authSession?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ email: authSession.email }).exec();
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body: Body = await req.json();
    const { targetType, targetId, value } = body;

    if (!targetType || !targetId || ![1, -1].includes(value)) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    try {
        const targetObjectId = new mongoose.Types.ObjectId(targetId);

        try {
            await Vote.init();
        } catch {
            // ignore initialization errors
        }

        try {
            await Vote.findOneAndUpdate(
                { user: user._id, targetType, targetId: targetObjectId },
                { $set: { value } },
                { upsert: true, new: false, setDefaultsOnInsert: true }
            ).exec();
        } catch (err: any) {
            // Handle duplicate key race: another concurrent upsert may have won — fall back to counting
            if (err?.code === 11000) {
                // duplicate key error: ignore and continue to recount
            } else {
                throw err;
            }
        }

        // Recount votes for the target
        const upCount = await Vote.countDocuments({ targetType, targetId: targetObjectId, value: 1 }).exec();
        const downCount = await Vote.countDocuments({ targetType, targetId: targetObjectId, value: -1 }).exec();

        // If this is an Argument, update its cached counts/score
        if (targetType === "Argument") {
            await Argument.findByIdAndUpdate(targetObjectId, {
                upvoteCount: upCount,
                downvoteCount: downCount,
                score: upCount - downCount,
            }).exec();
            const argument = await Argument.findById(targetObjectId)
                .select({ createdBy: 1, topic: 1 })
                .lean();
            if (argument?.createdBy && argument?.topic) {
                const demotionTask = (async () => {
                    const result = await maybeDemoteModeratorForTopic({
                        userId: argument.createdBy.toString(),
                        topicId: argument.topic.toString(),
                    });
                    if (result?.demoted) {
                        const topic = await Topic.findById(argument.topic).select({ title: 1 }).lean();
                        const baseUrl = buildBaseUrl(req.headers);
                        void notifyModeratorStatusChange({
                            recipientId: argument.createdBy.toString(),
                            topicId: argument.topic.toString(),
                            topicTitle: topic?.title ?? "this topic",
                            action: "removed",
                            source: "community",
                            baseUrl,
                        });
                    }
                })();
                demotionTask.catch((err) => console.error("Moderator demotion check failed", err));
            }
        } else if (targetType === "Comment") {
            await Comment.findByIdAndUpdate(targetObjectId, {
                upvoteCount: upCount,
                downvoteCount: downCount,
                score: upCount - downCount,
            }).exec();
            const comment = await Comment.findById(targetObjectId)
                .select({ createdBy: 1, argument: 1 })
                .lean();
            if (comment?.createdBy && comment?.argument) {
                const argument = await Argument.findById(comment.argument)
                    .select({ topic: 1 })
                    .lean();
                if (argument?.topic) {
                    const demotionTask = (async () => {
                        const result = await maybeDemoteModeratorForTopic({
                            userId: comment.createdBy.toString(),
                            topicId: argument.topic.toString(),
                        });
                        if (result?.demoted) {
                            const topic = await Topic.findById(argument.topic).select({ title: 1 }).lean();
                            const baseUrl = buildBaseUrl(req.headers);
                            void notifyModeratorStatusChange({
                                recipientId: comment.createdBy.toString(),
                                topicId: argument.topic.toString(),
                                topicTitle: topic?.title ?? "this topic",
                                action: "removed",
                                source: "community",
                                baseUrl,
                            });
                        }
                    })();
                    demotionTask.catch((err) => console.error("Moderator demotion check failed", err));
                }
            }
        }

        return NextResponse.json({ upvoteCount: upCount, downvoteCount: downCount });
    } catch (err: any) {
        console.error("Vote error", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
