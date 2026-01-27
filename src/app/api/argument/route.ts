import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import Argument, { ArgumentSide } from "@/app/models/argument";
import Topic from "@/app/models/topic";
import { getAIAnalysisForArgument } from "@/app/services/openaiService";
import Fact from "@/app/models/facts";
import User from "@/app/models/user";
import mongoose from "mongoose";
import { trackBackgroundTask } from "@/app/lib/backgroundTasks";
import { classifyTextToOntology, classificationToAssignments } from "@/app/services/ontologyClassificationService";
import { moderateUserGeneratedText, moderationToVisibility } from "@/app/services/moderationService";
import { applyTrustDelta } from "@/app/services/trustService";
import { sanitiseEvidence, type EvidenceItemInput } from "@/app/lib/evidence";
import { deleteEvidenceFiles } from "@/app/services/evidenceCleanupService";
import { sendEmail } from "@/app/services/emailService";
import { buildBaseUrl } from "@/app/lib/commonFunctions";
import NotificationSubscription from "@/app/models/notificationSubscription";
import Notification from "@/app/models/notification";
import UserFollow from "@/app/models/userFollow";
import PostApprovedEmail from "@/app/emails/templates/PostApprovedEmail";
import { renderEmail } from "@/app/emails/renderEmail";
import { sendNotificationEmails } from "@/app/services/notificationEmailService";
import { hasTopicModeratorRole, maybeAutoPromoteModerator } from "@/app/services/topicModeratorService";
import { notifyModeratorStatusChange } from "@/app/services/moderatorNotificationService";
import { factCheckEvidenceItems } from "@/app/services/evidenceFactCheckService";

type Body = {
    topicId: string;
    body: string;
    side?: ArgumentSide;
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
    let { topicId, body, side = "neutral", evidence = [] } = payload || ({} as Body);

    if (!topicId || typeof body !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 10000) {
        return NextResponse.json({ error: "Argument must be 1-10000 characters" }, { status: 400 });
    }
    if (!["for", "against", "neutral"].includes(side)) {
        return NextResponse.json({ error: "Invalid stance" }, { status: 400 });
    }
    
    const safeEvidence = sanitiseEvidence(evidence, 10);

    try {
        const topicObjId = new mongoose.Types.ObjectId(topicId);

        const topic = await Topic.findById(topicObjId).select({ title: 1 }).lean().exec();
        if (!topic) {
            return NextResponse.json({ error: "Topic not found" }, { status: 404 });
        }

        const moderation = await moderateUserGeneratedText({
            text: trimmed,
            contentType: "argument",
            userTrustScore: user.trustScore,
            userTrustTier: user.trustTier,
            topicTitle: topic.title,
            evidence: safeEvidence,
        });

        const visibility = moderationToVisibility({
            moderation,
            userTrustTier: user.trustTier,
            contentType: "argument",
            evidenceCount: safeEvidence.length,
        });

        if (visibility.status === "blocked") {
            if (moderation.recommendedTrustDelta) {
                await applyTrustDelta({
                    userId: user._id,
                    delta: moderation.recommendedTrustDelta,
                    reason: "moderation:argument_blocked",
                    meta: { categories: moderation.categories, severity: moderation.severity },
                });
            }
            return NextResponse.json({ error: "Content blocked by moderation", reason: moderation.shortReason }, { status: 403 });
        }
        const created = await Argument.create({
            topic: topicObjId,
            side: side as ArgumentSide,
            body: trimmed,
            createdBy: user._id,
            upvoteCount: 0,
            downvoteCount: 0,
            score: 0,
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
            { userId: user._id, targetType: "argument", targetId: created._id },
            { $setOnInsert: { muted: false } },
            { upsert: true }
        );

        if (moderation.recommendedTrustDelta) {
            await applyTrustDelta({
                userId: user._id,
                delta: moderation.recommendedTrustDelta,
                reason: "moderation:argument",
                meta: { categories: moderation.categories, severity: moderation.severity },
            });
        }

        let moderatorPromotion = { promoted: false };
        try {
            moderatorPromotion = await maybeAutoPromoteModerator({
                userId: user._id.toString(),
                topicId: topicObjId.toString(),
            });
        } catch (err) {
            console.error("Auto-promote moderator failed", err);
        }

        if (moderatorPromotion?.promoted) {
            const baseUrl = buildBaseUrl(req.headers);
            void notifyModeratorStatusChange({
                recipientId: user._id.toString(),
                topicId: topicObjId.toString(),
                topicTitle: topic?.title ?? "this topic",
                action: "promoted",
                source: "auto",
                baseUrl,
            });
        }
        
        const notificationTask = (async () => {
            try {
                if (visibility.status !== "visible") return;

                const [topicSubscriptions, followerDocs] = await Promise.all([
                    NotificationSubscription.find({ targetType: "topic", targetId: topicObjId })
                        .select({ userId: 1, muted: 1 })
                        .lean(),
                    UserFollow.find({ targetUserId: user._id }).select({ followerId: 1 }).lean(),
                ]);

                const authorName = user.name?.trim() || user.nickname?.trim() || "Someone";
                const topicTitle = (topic?.title || "").toString().trim() || "a topic";
                const argumentSnippet = trimmed.slice(0, 180);
                const actorId = user._id?.toString?.() ?? "";

                const topicRecipients = new Set<string>();
                const userRecipients = new Set<string>();

                topicSubscriptions.forEach((sub) => {
                    const id = sub.userId?.toString?.() ?? "";
                    if (!id || sub.muted) return;
                    topicRecipients.add(id);
                });
                followerDocs.forEach((doc) => {
                    const id = doc.followerId?.toString?.() ?? "";
                    if (id) userRecipients.add(id);
                });

                topicRecipients.delete(actorId);
                userRecipients.delete(actorId);

                const reasonMap = new Map<string, "topic" | "user">();
                const addRecipients = (ids: Set<string>, reason: "topic" | "user") => {
                    ids.forEach((id) => {
                        if (!reasonMap.has(id)) {
                            reasonMap.set(id, reason);
                        }
                    });
                };
                addRecipients(topicRecipients, "topic");
                addRecipients(userRecipients, "user");

                if (!reasonMap.size) return;

                const topicMessage = `${authorName} posted in ${topicTitle}`;
                const userMessage = `${authorName} posted a new post`;
                const payload = Array.from(reasonMap.entries()).map(([recipientId, reason]) => ({
                    recipient: recipientId,
                    actor: user._id,
                    type: reason === "topic" ? "topic_activity" : "user_activity",
                    topic: topicObjId,
                    argument: created._id,
                    message: reason === "topic" ? topicMessage : userMessage,
                    topicTitle,
                    argumentSnippet,
                }));

                await Notification.insertMany(payload, { ordered: false });

                const baseUrl = buildBaseUrl(req.headers);
                const argumentUrl = `${baseUrl}/topics/${topicObjId.toString()}#argument-${created._id.toString()}`;
                const topicRecipientIds = Array.from(reasonMap.entries())
                    .filter(([, reason]) => reason === "topic")
                    .map(([id]) => id);
                const userRecipientIds = Array.from(reasonMap.entries())
                    .filter(([, reason]) => reason === "user")
                    .map(([id]) => id);

                const topicSent = await sendNotificationEmails({
                        recipientIds: topicRecipientIds,
                        preferenceKey: "emailTopics",
                        subject: "New post in a topic you follow",
                        message: topicMessage,
                        actionUrl: argumentUrl,
                        actionLabel: "View post",
                        preview: topicMessage,
                    });
                const remainingUserRecipients = userRecipientIds.filter((id) => !topicSent.includes(id));
                await sendNotificationEmails({
                        recipientIds: remainingUserRecipients,
                        preferenceKey: "emailUsers",
                        subject: "New post from someone you follow",
                        message: userMessage,
                        actionUrl: argumentUrl,
                        actionLabel: "View post",
                        preview: userMessage,
                    });
            } catch (err) {
                console.error("Follower notification dispatch failed", err);
            }
        })();

        trackBackgroundTask(notificationTask);

        // Track background AI processing for graceful shutdown
        const backgroundTask = (async () => {
            try {
                const classifications = await classifyTextToOntology(trimmed, { topK: 12 }).catch((err) => {
                    console.error("Argument classification failed", err);
                    return [];
                });
                const ontologyCategories = classificationToAssignments(classifications, 6);
                if (ontologyCategories.length) {
                    await Argument.findByIdAndUpdate(created._id, { ontologyCategories }).exec();
                }

                const analysis = await getAIAnalysisForArgument(trimmed, topic?.title || "");

                await Argument.findByIdAndUpdate(created._id, { 
                    side: analysis.side,
                    aiAnalysis: {
                        isFact: analysis.isFact,
                        aiSummary: analysis.aiSummary,
                        justification: analysis.justification,
                    },
                 });

                if (analysis?.isFact && analysis?.factualPart) {
                    // Ensure we don't duplicate a fact for the same source argument
                    const existing = await Fact.findOne({ sourceArgument: created._id }).lean();
                    if (!existing) {
                        await Fact.create({
                            linkedArguments: [created._id],
                            topic: topicObjId,
                            text: analysis.factualPart,
                            sourceArgument: created._id,
                        });
                    }
                }
            } catch (err) {
                console.error("Background AI processing failed for argument", created._id, err);
            }

            if (safeEvidence.length) {
                try {
                    const evidenceForCheck = (created.evidence ?? safeEvidence).map((item: any) =>
                        typeof item?.toObject === "function" ? item.toObject() : item
                    );
                    const { evidence: checkedEvidence, evidenceRankScore } = await factCheckEvidenceItems(evidenceForCheck);
                    await Argument.updateOne(
                        { _id: created._id },
                        { $set: { evidence: checkedEvidence, evidenceRankScore } }
                    ).exec();
                } catch (err) {
                    console.error("Evidence fact check failed for argument", created._id, err);
                }
            }
        })();
        
        trackBackgroundTask(backgroundTask);

        return NextResponse.json({
            id: (created._id as mongoose.Types.ObjectId).toString(),
            side: created.side,
            body: created.body,
            createdBy: { _id: (user._id as mongoose.Types.ObjectId).toString(), name: user.name },
            createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
            ontologyCategories: created.ontologyCategories ?? [],
            evidence: created.evidence ?? [],
            visibility: created.visibility,
            comments: [],
            moderatorPromotion: moderatorPromotion?.promoted
                ? { promoted: true, topicId: topicObjId.toString(), topicTitle: topic?.title ?? undefined }
                : { promoted: false },
        });
    } catch (err: any) {
        console.error("Create argument error", err);
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
    const targetId = payload?.id || payload?.argumentId;
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return NextResponse.json({ error: "Invalid argument id" }, { status: 400 });
    }

    const argument = await Argument.findById(targetId)
        .select({ createdBy: 1, evidence: 1, isRemoved: 1, topic: 1 })
        .lean();
    if (!argument) {
        return NextResponse.json({ error: "Argument not found" }, { status: 404 });
    }

    const ownerId = typeof argument.createdBy?.toString === "function" ? argument.createdBy.toString() : String(argument.createdBy);
    const userId = typeof user._id?.toString === "function" ? user._id.toString() : String(user._id);
    let isModerator = false;
    if (!user.isAdmin && argument?.topic) {
        const topic = await Topic.findById(argument.topic).select({ moderators: 1 }).lean();
        isModerator = hasTopicModeratorRole(topic, userId);
    }

    const canDelete = user.isAdmin || ownerId === userId || isModerator;
    if (!canDelete) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        await deleteEvidenceFiles(argument?.evidence ?? []);
        if (user.isAdmin) {
            await Argument.findByIdAndDelete(targetId).exec();
            return NextResponse.json({ ok: true, deleted: true }, { status: 200 });
        }
        await Argument.findByIdAndUpdate(targetId, { isRemoved: true, evidence: [] }).exec();
        return NextResponse.json({ ok: true, removed: true }, { status: 200 });
    } catch (err) {
        console.error("Delete argument failed", err);
        return NextResponse.json({ error: "Failed to delete argument" }, { status: 500 });
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
    const targetId = payload?.id || payload?.argumentId;
    const status = payload?.status;
    if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return NextResponse.json({ error: "Invalid argument id" }, { status: 400 });
    }
    if (status !== "visible") {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const existing = await Argument.findById(targetId)
        .select({ isRemoved: 1, createdBy: 1, visibility: 1, topic: 1 })
        .lean();
    if (!existing) {
        return NextResponse.json({ error: "Argument not found" }, { status: 404 });
    }
    if (existing.isRemoved) {
        return NextResponse.json({ error: "Argument is deleted" }, { status: 409 });
    }

    const userId = user._id.toString();
    let isModerator = false;
    if (!user.isAdmin && existing?.topic) {
        const topic = await Topic.findById(existing.topic).select({ moderators: 1 }).lean();
        isModerator = hasTopicModeratorRole(topic, userId);
    }
    if (!user.isAdmin && !isModerator) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await Argument.findByIdAndUpdate(
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
    if (shouldNotify && existing.createdBy) {
        try {
            const author = await User.findById(existing.createdBy).select({ email: 1, name: 1 }).lean();
            const topicId = typeof existing.topic?.toString === "function" ? existing.topic.toString() : String(existing.topic || "");
            if (author?.email && topicId) {
                const baseUrl = buildBaseUrl(req.headers);
                const argumentUrl = `${baseUrl}/topics/${topicId}#argument-${targetId}`;
                const name = author.name?.trim() || "there";
                const subject = "Your post has been approved";
                const { html, text } = await renderEmail(PostApprovedEmail({
                    name,
                    postUrl: argumentUrl,
                    label: "post",
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
