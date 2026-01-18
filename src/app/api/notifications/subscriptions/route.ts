import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { NotificationSubscription } from "@/app/models/notificationSubscription";

function isTargetType(value: string): value is "topic" | "argument" {
  return value === "topic" || value === "argument";
}

export async function GET(req: Request) {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findOne({ email: session.user.email }).select({ _id: 1 }).lean();
  if (!user?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const targetType = (searchParams.get("targetType") || "").trim();
  const targetId = (searchParams.get("targetId") || "").trim();

  if (!isTargetType(targetType)) {
    return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
  }
  if (!targetId || !mongoose.isValidObjectId(targetId)) {
    return NextResponse.json({ error: "Invalid target id" }, { status: 400 });
  }

  const subscription = await NotificationSubscription.findOne({
    userId: user._id,
    targetType,
    targetId,
  }).lean();

  return NextResponse.json(
    { subscribed: subscription ? !subscription.muted : false },
    { status: 200 }
  );
}

export async function POST(req: Request) {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await User.findOne({ email: session.user.email }).select({ _id: 1 }).lean();
  if (!user?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const payload = await req.json().catch(() => ({}));
  const targetType = (payload?.targetType || "").trim();
  const targetId = (payload?.targetId || "").trim();
  const subscribe = payload?.subscribe === true;

  if (!isTargetType(targetType)) {
    return NextResponse.json({ error: "Invalid target type" }, { status: 400 });
  }
  if (!targetId || !mongoose.isValidObjectId(targetId)) {
    return NextResponse.json({ error: "Invalid target id" }, { status: 400 });
  }

  const update = subscribe ? { muted: false } : { muted: true };
  await NotificationSubscription.updateOne(
    { userId: user._id, targetType, targetId },
    { $set: update, $setOnInsert: { userId: user._id, targetType, targetId } },
    { upsert: true }
  );

  return NextResponse.json({ subscribed: subscribe }, { status: 200 });
}
