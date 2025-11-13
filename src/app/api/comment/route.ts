import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { Comment } from "@/app/models/comment";
import User from "@/app/models/user";
import mongoose from "mongoose";

type Body = {
    argumentId: string;
    body: string;
    parentId?: string;
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
    const { argumentId, body, parentId } = payload || {} as Body;

    if (!argumentId || typeof body !== "string") {
        return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const trimmed = body.trim();
    if (!trimmed || trimmed.length > 5000) {
        return NextResponse.json({ error: "Comment must be 1-5000 characters" }, { status: 400 });
    }

    try {
        const argObjId = new mongoose.Types.ObjectId(argumentId);
        const parentObjId = parentId ? new mongoose.Types.ObjectId(parentId) : undefined;

        const created = await Comment.create({
            argument: argObjId,
            parent: parentObjId,
            body: trimmed,
            createdBy: user._id,
        });

        return NextResponse.json({
            id: (created._id as mongoose.Types.ObjectId).toString(),
            body: created.body,
            createdBy: { _id: (user._id as mongoose.Types.ObjectId).toString(), name: user.name },
            createdAt: created.createdAt?.toISOString?.() ?? new Date().toISOString(),
            upvoteCount: 0,
            downvoteCount: 0,
        });
    } catch (err: any) {
        console.error("Create comment error", err);
        if (err?.name === "CastError") {
            return NextResponse.json({ error: "Invalid IDs" }, { status: 400 });
        }
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
