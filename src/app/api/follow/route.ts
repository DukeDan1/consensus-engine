import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import UserFollow from "@/app/models/userFollow";

export async function GET(req: Request) {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewer = await User.findOne({ email: session.user.email }).select({ _id: 1 }).lean();
  if (!viewer?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const targetUserId = (searchParams.get("targetUserId") || "").trim();
  if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
    return NextResponse.json({ error: "Invalid target user id" }, { status: 400 });
  }

  const targetUser = await User.findById(targetUserId).select({ _id: 1 }).lean();
  if (!targetUser?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (viewer._id.toString() === targetUserId) {
    return NextResponse.json({ following: false }, { status: 200 });
  }

  const existing = await UserFollow.findOne({
    followerId: viewer._id,
    targetUserId,
  })
    .select({ _id: 1 })
    .lean();

  return NextResponse.json({ following: Boolean(existing) }, { status: 200 });
}

export async function POST(req: Request) {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewer = await User.findOne({ email: session.user.email }).select({ _id: 1 }).lean();
  if (!viewer?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const payload = await req.json().catch(() => ({}));
  const targetUserId = (payload?.targetUserId || "").trim();
  const follow = payload?.follow === true;

  if (!targetUserId || !mongoose.isValidObjectId(targetUserId)) {
    return NextResponse.json({ error: "Invalid target user id" }, { status: 400 });
  }

  const targetUser = await User.findById(targetUserId).select({ _id: 1 }).lean();
  if (!targetUser?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (viewer._id.toString() === targetUserId) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 400 });
  }

  if (follow) {
    await UserFollow.updateOne(
      { followerId: viewer._id, targetUserId },
      { $setOnInsert: { followerId: viewer._id, targetUserId } },
      { upsert: true }
    );
  } else {
    await UserFollow.deleteOne({ followerId: viewer._id, targetUserId });
  }

  return NextResponse.json({ following: follow }, { status: 200 });
}
