import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Argument, ArgumentSide } from "@/app/models/argument";
import { Topic } from "@/app/models/topic";
import { getAIAnalysisForArgument } from "@/app/services/openaiService";
import { Fact } from "@/app/models/facts";
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
import { NotificationSubscription } from "@/app/models/notificationSubscription";

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

        const visibility = moderationToVisibility({ moderation, userTrustTier: user.trustTier, contentType: "argument" });

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

    const argument = await Argument.findById(targetId).select({ createdBy: 1, evidence: 1, isRemoved: 1 }).lean();
    if (!argument) {
        return NextResponse.json({ error: "Argument not found" }, { status: 404 });
    }

    const ownerId = typeof argument.createdBy?.toString === "function" ? argument.createdBy.toString() : String(argument.createdBy);
    const userId = typeof user._id?.toString === "function" ? user._id.toString() : String(user._id);
    const canDelete = user.isAdmin || ownerId === userId;
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
    if (!user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
                const html = `<p>Hi ${name},</p><p>Your post has been approved and is now visible.</p><p><a href="${argumentUrl}">View your post</a></p><p>Thanks,<br/>The Consensus Engine Team</p>`;
                const text = `Hi ${name},\n\nYour post has been approved and is now visible.\n\nView your post: ${argumentUrl}\n\nThanks,\nThe Consensus Engine Team`;
                sendEmail(author.email, subject, html, text);
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
