import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/app/services/authSessionService";
import { dbConnect } from "@/app/lib/mongoose";
import FactVote from "@/app/models/factVote";
import Fact from "@/app/models/facts";
import User from "@/app/models/user";
import mongoose from "mongoose";

type Body = {
    factId: string;
    value: 1 | -1;
    reason?: string;
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
    const { factId, value, reason } = body;

    if (!factId || ![1, -1].includes(value)) {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    if (!mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid factId" }, { status: 400 });
    }

    if (reason && typeof reason === "string" && reason.length > 2000) {
        return NextResponse.json({ error: "Reason too long (max 2000 characters)" }, { status: 400 });
    }

    try {
        const factObjectId = new mongoose.Types.ObjectId(factId);

        // Check fact exists and is active (or has no status field for backward compatibility)
        const fact = await Fact.findOne({
            _id: factObjectId,
            $or: [{ status: "active" }, { status: { $exists: false } }]
        }).select({ _id: 1 }).lean();
        if (!fact) {
            return NextResponse.json({ error: "Fact not found" }, { status: 404 });
        }

        try {
            await FactVote.init();
        } catch {
            // ignore initialization errors
        }

        const updateFields: Record<string, any> = { value };
        if (reason !== undefined) {
            updateFields.reason = reason;
        }

        try {
            await FactVote.findOneAndUpdate(
                { user: user._id, fact: factObjectId },
                { $set: updateFields },
                { upsert: true, new: false, setDefaultsOnInsert: true }
            ).exec();
        } catch (err: any) {
            if (err?.code === 11000) {
                // duplicate key race — continue to recount
            } else {
                throw err;
            }
        }

        // Recount votes
        const upCount = await FactVote.countDocuments({ fact: factObjectId, value: 1 }).exec();
        const downCount = await FactVote.countDocuments({ fact: factObjectId, value: -1 }).exec();

        // Update cached counts on the fact
        await Fact.findByIdAndUpdate(factObjectId, {
            upvoteCount: upCount,
            downvoteCount: downCount,
            score: upCount - downCount,
        }).exec();

        return NextResponse.json({ upvoteCount: upCount, downvoteCount: downCount });
    } catch (err: any) {
        console.error("Fact vote error", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}

/** GET /api/fact-vote?factId=...  — returns the current user's vote on a fact */
export async function GET(req: NextRequest) {
    await dbConnect();

    const authSession = await getAuthSession(req);
    if (!authSession?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await User.findOne({ email: authSession.email }).exec();
    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const factId = req.nextUrl.searchParams.get("factId");
    if (!factId || !mongoose.isValidObjectId(factId)) {
        return NextResponse.json({ error: "Invalid factId" }, { status: 400 });
    }

    const vote = await FactVote.findOne({
        user: user._id,
        fact: new mongoose.Types.ObjectId(factId),
    }).select({ value: 1, reason: 1 }).lean();

    return NextResponse.json({ vote: vote ? { value: vote.value, reason: vote.reason } : null });
}
