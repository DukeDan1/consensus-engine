import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Vote } from "@/app/models/vote";
import { Argument } from "@/app/models/argument";
import { Comment } from "@/app/models/comment";
import User from "@/app/models/user";
import mongoose from "mongoose";

type Body = {
    targetType: "Argument" | "Topic" | "Comment";
    targetId: string;
    value: 1 | -1;
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
        } else if (targetType === "Comment") {
            await Comment.findByIdAndUpdate(targetObjectId, {
                upvoteCount: upCount,
                downvoteCount: downCount,
                score: upCount - downCount,
            }).exec();
        }

        return NextResponse.json({ upvoteCount: upCount, downvoteCount: downCount });
    } catch (err: any) {
        console.error("Vote error", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
