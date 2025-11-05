import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Argument } from "@/app/models/argument";
import { getAIAnlysisForArgument } from "@/app/services/openaiService";
import User from "@/app/models/user";
import mongoose from "mongoose";

type Body = {
    topicId: string;
    body: string;
    side?: "for" | "against" | "pro" | "con"; // accept legacy values, normalize below
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
    let { topicId, body, side = "for" } = payload || ({} as Body);
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
    if (!["for", "against"].includes(side)) {
        return NextResponse.json({ error: "Invalid side" }, { status: 400 });
    }

    try {
        const topicObjId = new mongoose.Types.ObjectId(topicId);
        const created = await Argument.create({
            topic: topicObjId,
            side: side as "for" | "against",
            body: trimmed,
            createdBy: user._id,
            upvoteCount: 0,
            downvoteCount: 0,
            score: 0,
        });
        
        // Asynchronously get AI analysis and update the argument
        getAIAnlysisForArgument(created.body).then(analysis => {
            Argument.findByIdAndUpdate(created._id, { aiAnalysis: analysis }).exec().catch(err => {
                console.error("Failed to update AI analysis for argument", created._id, err);
            });
        }).catch(err => {
            console.error("Failed to get AI analysis for argument", created._id, err);
        });

        return NextResponse.json({
            id: (created._id as mongoose.Types.ObjectId).toString(),
            side: created.side,
            body: created.body,
            createdBy: { _id: (user._id as mongoose.Types.ObjectId).toString(), name: user.name },
            createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
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
