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
