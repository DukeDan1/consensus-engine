import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Argument } from "@/app/models/argument";
import { Topic } from "@/app/models/topic";
import { getAIAnalysisForArgument, extractFactualInformationFromComment } from "@/app/services/openaiService";
import { Fact } from "@/app/models/facts";
import User from "@/app/models/user";
import mongoose from "mongoose";
import { trackBackgroundTask } from "@/app/lib/backgroundTasks";
import { classifyTextToOntology, classificationToAssignments } from "@/app/services/ontologyClassificationService";

type Body = {
    topicId: string;
    body: string;
    side?: "for" | "against" | "neutral" | "pro" | "con"; // accept legacy values, normalize below
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
    let { topicId, body, side = "neutral" } = payload || ({} as Body);
    // Normalize legacy values
    if (side === "pro") side = "for" as any;
    if (side === "con") side = "against" as any;

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

    try {
        const topicObjId = new mongoose.Types.ObjectId(topicId);
        const created = await Argument.create({
            topic: topicObjId,
            side: side as "for" | "against" | "neutral",
            body: trimmed,
            createdBy: user._id,
            upvoteCount: 0,
            downvoteCount: 0,
            score: 0,
            ontologyCategories: [],
        });

        const topic = await Topic.findById(topicObjId).select({ title: 1 }).lean().exec();
        
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

                const analysis = await getAIAnalysisForArgument(created.body, topic?.title || "");
                let factual = {} as {factualPart?: string, justification?: string};
                if (analysis.isFact) {
                    factual = await extractFactualInformationFromComment(created.body, topic?.title || "");
                }

                await Argument.findByIdAndUpdate(created._id, { aiAnalysis: analysis }).exec();

                if (analysis?.isFact && factual?.factualPart) {
                    // Ensure we don't duplicate a fact for the same source argument
                    const existing = await Fact.findOne({ sourceArgument: created._id }).lean();
                    if (!existing) {
                        await Fact.create({
                            linkedArguments: [created._id],
                            topic: topicObjId,
                            text: factual.factualPart,
                            sourceArgument: created._id,
                            aiJustification: factual.justification || "",
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
