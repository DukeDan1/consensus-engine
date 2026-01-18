import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Comment } from "@/app/models/comment";
import { Argument } from "@/app/models/argument";
import User from "@/app/models/user";
import mongoose from "mongoose";
import { classifyTextToOntology, classificationToAssignments } from "@/app/services/ontologyClassificationService";
import { trackBackgroundTask } from "@/app/lib/backgroundTasks";
import { moderateUserGeneratedText, moderationToVisibility } from "@/app/services/moderationService";
import { applyTrustDelta } from "@/app/services/trustService";
import { sanitiseEvidence, type EvidenceItemInput } from "@/app/lib/evidence";
import { deleteEvidenceFiles } from "@/app/services/evidenceCleanupService";
import { sendEmail } from "@/app/services/emailService";
import { buildBaseUrl } from "@/app/lib/commonFunctions";
import { Notification } from "@/app/models/notification";
import { NotificationSubscription } from "@/app/models/notificationSubscription";
import { Topic } from "@/app/models/topic";

type Body = {
    argumentId: string;
    body: string;
    parentId?: string;
    evidence?: EvidenceItemInput[];
};

export async function POST(req: Request) {
    await dbConnect();

    const session = await getServerSession();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ email: session.user.email }).exec();
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const payload: Body = await req.json();
    const { argumentId, body, parentId, evidence = [] } = payload || {} as Body;

    if (!argumentId || typeof body !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 5000) {
        return NextResponse.json({ error: "Comment must be 1-5000 characters" }, { status: 400 });
    }

    const safeEvidence = sanitiseEvidence(evidence, 10);

    try {
        const argObjId = new mongoose.Types.ObjectId(argumentId);
        const parentObjId = parentId ? new mongoose.Types.ObjectId(parentId) : undefined;

        const parentArgument = await Argument.findById(argObjId).select({ body: 1, createdBy: 1, topic: 1 }).lean();
        if (!parentArgument) {
            return NextResponse.json({ error: "Argument not found" }, { status: 404 });
        }

        const parentText = (parentArgument.body || "").toString().slice(0, 4000);
        const contentWithContext = `${trimmed}\n\nReplying to argument: ${parentText}`;

        const moderation = await moderateUserGeneratedText({
            text: contentWithContext,
            contentType: "comment",
            userTrustScore: user.trustScore,
            userTrustTier: user.trustTier,
            evidence: safeEvidence,
        });

        const visibility = moderationToVisibility({ moderation, userTrustTier: user.trustTier, contentType: "comment" });

        if (visibility.status === "blocked") {
            if (moderation.recommendedTrustDelta) {
                await applyTrustDelta({
                    userId: user._id,
                    delta: moderation.recommendedTrustDelta,
                    reason: "moderation:comment_blocked",
                    meta: { categories: moderation.categories, severity: moderation.severity },
                });
            }
            return NextResponse.json({ error: "Content blocked by moderation", reason: moderation.shortReason }, { status: 403 });
        }

        const created = await Comment.create({
            argument: argObjId,
            parent: parentObjId,
            body: trimmed,
            createdBy: user._id,
            ontologyCategories: [],
            evidence: safeEvidence,
            visibility: {
                status: visibility.status,
                rankPenalty: visibility.rankPenalty,
                moderatedAt: new Date(),
                reason: moderation.shortReason,
                categories: moderation.categories,
                spamLikelihood: moderation.spamLikelihood,
                trollingLikelihood: moderation.trollingLikelihood,
                offTopicLikelihood: moderation.offTopicLikelihood,
                illegalOrHarmfulLikelihood: moderation.illegalOrHarmfulLikelihood,
                quality: moderation.quality,
                model: moderation.model,
            },
        });

        await NotificationSubscription.updateOne(
            { userId: user._id, targetType: "argument", targetId: argObjId },
            { $setOnInsert: { muted: false } },
            { upsert: true }
        );

        if (moderation.recommendedTrustDelta) {
            await applyTrustDelta({
                userId: user._id,
                delta: moderation.recommendedTrustDelta,
                reason: "moderation:comment",
                meta: { categories: moderation.categories, severity: moderation.severity },
            });
        }

        const backgroundTask = (async () => {
            try {
                const classifications = await classifyTextToOntology(trimmed, { topK: 12 }).catch((err) => {
                    console.error("Comment classification failed", err);
                    return [];
                });
                const ontologyCategories = classificationToAssignments(classifications, 6);
                if (ontologyCategories.length) {
                    await Comment.findByIdAndUpdate(created._id, { ontologyCategories }).exec();
                }
            } catch (err) {
                console.error("Async comment classification failed", err);
            }
        })();

        trackBackgroundTask(backgroundTask);

        const notificationTask = (async () => {
            try {
                if (visibility.status !== "visible") return;
                if (!parentArgument?.topic) return;

                const topic = await Topic.findById(parentArgument.topic).select({ title: 1 }).lean();
                const topicTitle = (topic?.title || "").toString().trim() || "a topic";
                const argumentSnippet = (parentArgument.body || "").toString().trim().slice(0, 180);
                const commentSnippet = trimmed.slice(0, 180);
                const commenterName = user.name?.trim() || user.nickname?.trim() || "Someone";

                const [commenterIds, argumentSubscriptions, topicSubscriptions] = await Promise.all([
                    Comment.distinct("createdBy", { argument: argObjId }),
                    NotificationSubscription.find({ targetType: "argument", targetId: argObjId })
                        .select({ userId: 1, muted: 1 })
                        .lean(),
                    NotificationSubscription.find({ targetType: "topic", targetId: parentArgument.topic })
                        .select({ userId: 1, muted: 1 })
                        .lean(),
                ]);

                const recipientIds = new Set<string>();
                const mutedIds = new Set<string>();

                const addRecipient = (value: any) => {
                    const id = value?.toString?.() ?? "";
                    if (id) recipientIds.add(id);
                };
                const addMuted = (value: any) => {
                    const id = value?.toString?.() ?? "";
                    if (id) mutedIds.add(id);
                };

                commenterIds.forEach(addRecipient);
                addRecipient(parentArgument.createdBy);
                argumentSubscriptions.forEach((sub) => {
                    if (sub.muted) addMuted(sub.userId);
                    else addRecipient(sub.userId);
                });
                topicSubscriptions.forEach((sub) => {
                    if (sub.muted) addMuted(sub.userId);
                    else addRecipient(sub.userId);
                });

                const actorId = user._id?.toString?.() ?? "";
                if (actorId) recipientIds.delete(actorId);
                mutedIds.forEach((id) => recipientIds.delete(id));

                if (!recipientIds.size) return;

                const payload = Array.from(recipientIds).map((recipientId) => ({
                    recipient: recipientId,
                    actor: user._id,
                    type: "comment_reply",
                    topic: parentArgument.topic,
                    argument: argObjId,
                    comment: created._id,
                    message: `${commenterName} replied to an argument you follow`,
                    topicTitle,
                    argumentSnippet,
                    commentSnippet,
                }));

                await Notification.insertMany(payload, { ordered: false });
            } catch (err) {
                console.error("Notification dispatch failed", err);
            }
        })();

        trackBackgroundTask(notificationTask);

        return NextResponse.json({
            id: (created._id as mongoose.Types.ObjectId).toString(),
            body: created.body,
            createdBy: { _id: (user._id as mongoose.Types.ObjectId).toString(), name: user.name },
            createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
            upvoteCount: 0,
            downvoteCount: 0,
            ontologyCategories: created.ontologyCategories ?? [],
            evidence: created.evidence ?? [],
            visibility: created.visibility,
        });
    } catch (err: any) {
        console.error("Create comment error", err);
        if (err?.name === "CastError") {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    await dbConnect();

    const session = await getServerSession();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ email: session.user.email }).select({ _id: 1, isAdmin: 1 }).lean();
    if (!user?._id) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const payload = await req.json().catch(() => ({}));
    const targetId = payload?.id || payload?.commentId;
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
    }

    const comment = await Comment.findById(targetId).select({ createdBy: 1, evidence: 1, isRemoved: 1 }).lean();
    if (!comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const ownerId = typeof comment.createdBy?.toString === "function" ? comment.createdBy.toString() : String(comment.createdBy);
    const userId = typeof user._id?.toString === "function" ? user._id.toString() : String(user._id);
    const canDelete = user.isAdmin || ownerId === userId;
    if (!canDelete) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        await deleteEvidenceFiles(comment?.evidence ?? []);
        if (user.isAdmin) {
            await Comment.findByIdAndDelete(targetId).exec();
            return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
        }
        await Comment.findByIdAndUpdate(targetId, { isRemoved: true, evidence: [] }).exec();
        return NextResponse.json({ ok: true, removed: true }, { status: 200 });
    } catch (err) {
        console.error("Delete comment failed", err);
        return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    await dbConnect();

    const session = await getServerSession();
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ email: session.user.email }).select({ _id: 1, isAdmin: 1 }).lean();
    if (!user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await req.json().catch(() => ({}));
    const targetId = payload?.id || payload?.commentId;
    const status = payload?.status;
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
    }
    if (status !== "visible") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await Comment.findById(targetId).select({ isRemoved: 1, createdBy: 1, visibility: 1, argument: 1 }).lean();
    if (!existing) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.isRemoved) {
        return NextResponse.json({ error: "Comment is deleted" }, { status: 409 });
    }

    const updated = await Comment.findByIdAndUpdate(
        targetId,
        {
            $set: {
                "visibility.status": "visible",
                "visibility.moderatedAt": new Date(),
                "visibility.reason": "Restored by moderator",
                "visibility.rankPenalty": 0,
            },
        },
        { new: true }
    ).lean();

    const shouldNotify = existing?.visibility?.status && existing.visibility.status !== "visible";
    if (shouldNotify && existing.createdBy && existing.argument) {
        try {
            const author = await User.findById(existing.createdBy).select({ email: 1, name: 1 }).lean();
            const argument = await Argument.findById(existing.argument).select({ topic: 1 }).lean();
            const topicId = argument?.topic?.toString?.() ?? "";
            if (author?.email && topicId) {
                const baseUrl = buildBaseUrl(req.headers);
                const commentUrl = `${baseUrl}/topics/${topicId}#comment-${targetId}`;
                const name = author.name?.trim() || "there";
                const subject = "Your post has been approved";
                const html = `<p>Hi ${name},</p><p>Your post has been approved and is now visible.</p><p><a href="${commentUrl}">View your post</a></p>`;
                const text = `Hi ${name},\n\nYour post has been approved and is now visible.\n\nView your post: ${commentUrl}`;
                await sendEmail(author.email, subject, html, text);
            }
        } catch (err) {
            console.error("Failed to send post approval email", err);
        }
    }

    return NextResponse.json({
        id: updated?._id?.toString?.() ?? targetId,
        visibility: updated?.visibility ?? { status: "visible" },
    });
}
