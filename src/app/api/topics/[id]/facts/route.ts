import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import { Fact } from "@/app/models/facts";

export const dynamic = "force-dynamic";

export async function GET(ctx: any ) {
    const resolvedCtx = await Promise.resolve(ctx.params);
    const id = resolvedCtx.id as string;
    if (!id || !mongoose.isValidObjectId(id)) {
        return NextResponse.json({ error: "Invalid or missing id" }, { status: 400 });
    }

    await dbConnect();

    try {
        const topicObjectId = new mongoose.Types.ObjectId(id);
        const facts = await Fact.find({ topic: topicObjectId })
            .sort({ createdAt: -1 })
            .limit(200)
            .select({ text: 1, sourceArgument: 1, createdAt: 1 })
            .lean();

        return NextResponse.json({
            topicId: id,
            facts: facts.map((fact) => ({
                id: fact._id?.toString?.() ?? "",
                text: fact.text,
                sourceArgument: fact.sourceArgument?.toString?.() ?? "",
                createdAt: fact.createdAt,
            })),
        });
    } catch (err) {
        console.error("Failed to fetch facts", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
