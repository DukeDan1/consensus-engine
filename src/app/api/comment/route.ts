import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import Comment from "@/app/models/comment";
import Argument from "@/app/models/argument";
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
import Notification from "@/app/models/notification";
import NotificationSubscription from "@/app/models/notificationSubscription";
import Topic from "@/app/models/topic";
import PostApprovedEmail from "@/app/emails/templates/PostApprovedEmail";
import { renderEmail } from "@/app/emails/renderEmail";
import UserFollow from "@/app/models/userFollow";
import { sendNotificationEmails } from "@/app/services/notificationEmailService";
import { hasTopicModeratorRole, maybeAutoPromoteModerator } from "@/app/services/topicModeratorService";
import { notifyModeratorStatusChange } from "@/app/services/moderatorNotificationService";
import { factCheckEvidenceItems } from "@/app/services/evidenceFactCheckService";
import { factCheckPostContent } from "@/app/services/contentFactCheckService";

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
            userId: user._id,
            userTrustScore: user.trustScore,
            userTrustTier: user.trustTier,
            evidence: safeEvidence,
        });

        const visibility = moderationToVisibility({
            moderation,
            userTrustTier: user.trustTier,
            contentType: "comment",
            evidenceCount: safeEvidence.length,
        });

        if (visibility.status === "blocked") {
            if (moderation.recommendedTrustDelta) {
                await applyTrustDelta({
                    userId: user._id,
                    delta: moderation.recommendedTrustDelta,
                    reason: "moderation:comment_blocked",
                    meta: { categories: moderation.categories, severity: moderation.severity },
                });
            }
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

        if (moderation.recommendedTrustDelta && visibility.status !== "blocked") {
            await applyTrustDelta({
                userId: user._id,
                delta: moderation.recommendedTrustDelta,
                reason: "moderation:comment",
                meta: { categories: moderation.categories, severity: moderation.severity },
            });
        }

        let moderatorPromotion = { promoted: false };
        const topicId = parentArgument?.topic?.toString?.() ?? "";
        try {
            if (topicId) {
                moderatorPromotion = await maybeAutoPromoteModerator({
                    userId: user._id.toString(),
                    topicId,
                });
            }
        } catch (err) {
            console.error("Auto-promote moderator failed", err);
        }

        if (moderatorPromotion?.promoted && topicId) {
            const topic = await Topic.findById(topicId).select({ title: 1 }).lean();
            const baseUrl = buildBaseUrl(req.headers);
            void notifyModeratorStatusChange({
                recipientId: user._id.toString(),
                topicId,
                topicTitle: topic?.title ?? "this topic",
                action: "promoted",
                source: "auto",
                baseUrl,
            });
        }

        const backgroundTask = (async () => {
            try {
                const classifications = await classifyTextToOntology(trimmed, { topK: 12, safetyIdentifier: user._id.toString() }).catch((err) => {
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

            if (safeEvidence.length) {
                try {
                    const evidenceForCheck = (created.evidence ?? safeEvidence).map((item: any) =>
                        typeof item?.toObject === "function" ? item.toObject() : item
                    );
                    const { evidence: checkedEvidence, evidenceRankScore } = await factCheckEvidenceItems(evidenceForCheck, user._id.toString());
                    await Comment.updateOne(
                        { _id: created._id },
                        { $set: { evidence: checkedEvidence, evidenceRankScore } }
                    ).exec();
                } catch (err) {
                    console.error("Evidence fact check failed for comment", created._id, err);
                }
            }

            try {
                const parentContext = parentArgument?.body
                    ? `Replying to: ${String(parentArgument.body).slice(0, 600)}`
                    : undefined;
                const contentFactCheck = await factCheckPostContent({
                    text: trimmed,
                    contentType: "comment",
                    context: parentContext,
                    userId: user._id.toString(),
                });
                if (contentFactCheck) {
                    const shouldNoise =
                        contentFactCheck.verdict === "inaccurate" &&
                        !["blocked", "needs_review"].includes(created.visibility?.status || "");
                    await Comment.updateOne(
                        { _id: created._id },
                        {
                            $set: {
                                contentFactCheck,
                                ...(shouldNoise
                                    ? {
                                        "visibility.status": "noise",
                                        "visibility.moderatedAt": new Date(),
                                        "visibility.reason": "Marked incorrect by automated fact check",
                                        "visibility.rankPenalty": -50,
                                    }
                                    : {}),
                            },
                        }
                    ).exec();
                }
            } catch (err) {
                console.error("Content fact check failed for comment", created._id, err);
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

                const [commenterIds, argumentSubscriptions, topicSubscriptions, followerDocs] = await Promise.all([
                    Comment.distinct("createdBy", { argument: argObjId }),
                    NotificationSubscription.find({ targetType: "argument", targetId: argObjId })
                        .select({ userId: 1, muted: 1 })
                        .lean(),
                    NotificationSubscription.find({ targetType: "topic", targetId: parentArgument.topic })
                        .select({ userId: 1, muted: 1 })
                        .lean(),
                    UserFollow.find({ targetUserId: user._id }).select({ followerId: 1 }).lean(),
                ]);

                const argumentRecipients = new Set<string>();
                const topicRecipients = new Set<string>();
                const userRecipients = new Set<string>();
                const mutedArgumentIds = new Set<string>();
                const mutedTopicIds = new Set<string>();

                commenterIds.forEach((value: any) => {
                    const id = value?.toString?.() ?? "";
                    if (id) argumentRecipients.add(id);
                });

                argumentSubscriptions.forEach((sub) => {
                    const id = sub.userId?.toString?.() ?? "";
                    if (!id) return;
                    if (sub.muted) mutedArgumentIds.add(id);
                    else argumentRecipients.add(id);
                });
                topicSubscriptions.forEach((sub) => {
                    const id = sub.userId?.toString?.() ?? "";
                    if (!id) return;
                    if (sub.muted) mutedTopicIds.add(id);
                    else topicRecipients.add(id);
                });
                followerDocs.forEach((doc) => {
                    const id = doc.followerId?.toString?.() ?? "";
                    if (id) userRecipients.add(id);
                });

                const actorId = user._id?.toString?.() ?? "";
                [argumentRecipients, topicRecipients, userRecipients].forEach((set) => set.delete(actorId));
                mutedArgumentIds.forEach((id) => argumentRecipients.delete(id));
                mutedTopicIds.forEach((id) => topicRecipients.delete(id));

                const reasonMap = new Map<string, "argument" | "topic" | "user">();
                const addRecipients = (ids: Set<string>, reason: "argument" | "topic" | "user") => {
                    ids.forEach((id) => {
                        if (!reasonMap.has(id)) {
                            reasonMap.set(id, reason);
                        }
                    });
                };
                addRecipients(argumentRecipients, "argument");
                addRecipients(topicRecipients, "topic");
                addRecipients(userRecipients, "user");

                if (!reasonMap.size) return;

                const argumentMessage = `${commenterName} commented on a post you follow`;
                const topicMessage = `${commenterName} commented on ${topicTitle}`;
                const userMessage = `${commenterName} commented on ${topicTitle}`;

                const payload = Array.from(reasonMap.entries()).map(([recipientId, reason]) => ({
                    recipient: recipientId,
                    actor: user._id,
                    type: reason === "argument" ? "argument_reply" : reason === "topic" ? "topic_activity" : "user_activity",
                    topic: parentArgument.topic,
                    argument: argObjId,
                    comment: created._id,
                    message: reason === "argument" ? argumentMessage : reason === "topic" ? topicMessage : userMessage,
                    topicTitle,
                    argumentSnippet,
                    commentSnippet,
                }));

                await Notification.insertMany(payload, { ordered: false });

                const baseUrl = buildBaseUrl(req.headers);
                const commentUrl = `${baseUrl}/topics/${parentArgument.topic.toString()}#comment-${created._id.toString()}`;
                const argumentRecipientIds = Array.from(reasonMap.entries())
                    .filter(([, reason]) => reason === "argument")
                    .map(([id]) => id);
                const topicRecipientIds = Array.from(reasonMap.entries())
                    .filter(([, reason]) => reason === "topic")
                    .map(([id]) => id);
                const userRecipientIds = Array.from(reasonMap.entries())
                    .filter(([, reason]) => reason === "user")
                    .map(([id]) => id);

                const argumentSent = await sendNotificationEmails({
                    recipientIds: argumentRecipientIds,
                    preferenceKey: "emailArguments",
                    subject: "New reply on a post you follow",
                    message: argumentMessage,
                    actionUrl: commentUrl,
                    actionLabel: "View comment",
                    preview: argumentMessage,
                });
                const remainingTopicRecipients = topicRecipientIds.filter((id) => !argumentSent.includes(id));
                const topicSent = await sendNotificationEmails({
                    recipientIds: remainingTopicRecipients,
                    preferenceKey: "emailTopics",
                    subject: "New comment in a topic you follow",
                    message: topicMessage,
                    actionUrl: commentUrl,
                    actionLabel: "View comment",
                    preview: topicMessage,
                });
                const remainingUserRecipients = userRecipientIds
                    .filter((id) => !argumentSent.includes(id))
                    .filter((id) => !topicSent.includes(id));
                await sendNotificationEmails({
                    recipientIds: remainingUserRecipients,
                    preferenceKey: "emailUsers",
                    subject: "New comment from someone you follow",
                    message: userMessage,
                    actionUrl: commentUrl,
                    actionLabel: "View comment",
                    preview: userMessage,
                });
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
            moderatorPromotion: moderatorPromotion?.promoted
                ? { promoted: true, topicId: parentArgument?.topic?.toString?.() ?? "" }
                : { promoted: false },
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

    const comment = await Comment.findById(targetId)
        .select({ createdBy: 1, evidence: 1, isRemoved: 1, argument: 1 })
        .lean();
    if (!comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const ownerId = typeof comment.createdBy?.toString === "function" ? comment.createdBy.toString() : String(comment.createdBy);
    const userId = typeof user._id?.toString === "function" ? user._id.toString() : String(user._id);
    let isModerator = false;
    if (!user.isAdmin && comment?.argument) {
        const argument = await Argument.findById(comment.argument).select({ topic: 1 }).lean();
        if (argument?.topic) {
            const topic = await Topic.findById(argument.topic).select({ moderators: 1 }).lean();
            isModerator = hasTopicModeratorRole(topic, userId);
        }
    }
    const canDelete = user.isAdmin || ownerId === userId || isModerator;
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
    if (!user?._id) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const payload = await req.json().catch(() => ({}));
    const targetId = payload?.id || payload?.commentId;
    const status = payload?.status;
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return NextResponse.json({ error: "Invalid comment id" }, { status: 400 });
    }
    if (status !== "visible" && status !== "noise") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await Comment.findById(targetId).select({ isRemoved: 1, createdBy: 1, visibility: 1, argument: 1 }).lean();
    if (!existing) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    if (existing.isRemoved) {
        return NextResponse.json({ error: "Comment is deleted" }, { status: 409 });
    }

    const userId = user._id.toString();
    let isModerator = false;
    if (!user.isAdmin && existing?.argument) {
        const argument = await Argument.findById(existing.argument).select({ topic: 1 }).lean();
        if (argument?.topic) {
            const topic = await Topic.findById(argument.topic).select({ moderators: 1 }).lean();
            isModerator = hasTopicModeratorRole(topic, userId);
        }
    }
    if (!user.isAdmin && !isModerator) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const statusUpdate =
        status === "noise"
            ? {
                "visibility.status": "noise",
                "visibility.moderatedAt": new Date(),
                "visibility.reason": "Marked as noise by moderator",
                "visibility.rankPenalty": -50,
            }
            : {
                "visibility.status": "visible",
                "visibility.moderatedAt": new Date(),
                "visibility.reason": "Restored by moderator",
                "visibility.rankPenalty": 0,
            };

    const updated = await Comment.findByIdAndUpdate(
        targetId,
        { $set: statusUpdate },
        { new: true }
    ).lean();

    const shouldNotify = status === "visible" && existing?.visibility?.status && existing.visibility.status !== "visible";
    if (shouldNotify && existing.createdBy && existing.argument) {
        try {
            const author = await User.findById(existing.createdBy).select({ email: 1, name: 1 }).lean();
            const argument = await Argument.findById(existing.argument).select({ topic: 1 }).lean();
            const topicId = argument?.topic?.toString?.() ?? "";
            if (author?.email && topicId) {
                const baseUrl = buildBaseUrl(req.headers);
                const commentUrl = `${baseUrl}/topics/${topicId}#comment-${targetId}`;
                const name = author.name?.trim() || "there";
                const subject = "Your comment has been approved";
                const { html, text } = await renderEmail(PostApprovedEmail({
                    name,
                    postUrl: commentUrl,
                    label: "comment",
                }));
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
