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

        const parentArgument = await Argument.findById(argObjId).select({ body: 1 }).lean();
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
