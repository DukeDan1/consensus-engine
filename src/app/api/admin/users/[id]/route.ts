import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import Topic from "@/app/models/topic";
import Argument  from "@/app/models/argument";
import Comment from "@/app/models/comment";
import Fact from "@/app/models/facts";
import Vote from "@/app/models/vote";
import { deleteEvidenceFilesForDocuments } from "@/app/services/evidenceCleanupService";
import { updateUserProfileById } from "@/app/services/userProfileService";

async function requireAdmin() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const adminUser = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
  if (!adminUser?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}

export async function PATCH(req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const userId = resolvedCtx.id as string;

  if (!mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const payload = await req.json().catch(() => ({}));
  const suspended = payload?.suspended;
  const hasSuspended = typeof suspended === "boolean";
  const hasAvatar = Object.prototype.hasOwnProperty.call(payload, "avatarUrl");
  const hasAvatarThumb = Object.prototype.hasOwnProperty.call(payload, "avatarThumbUrl");
  const hasAvatarOriginal = Object.prototype.hasOwnProperty.call(payload, "avatarOriginalUrl");
  const hasAvatarOriginalThumb = Object.prototype.hasOwnProperty.call(payload, "avatarOriginalThumbUrl");
  const hasAvatarModeration = Object.prototype.hasOwnProperty.call(payload, "avatarModeration");
  if (!hasSuspended && !hasAvatar && !hasAvatarThumb && !hasAvatarOriginal && !hasAvatarOriginalThumb && !hasAvatarModeration) {
    return NextResponse.json({ error: "Missing update payload" }, { status: 400 });
  }
  if (hasAvatar && payload.avatarUrl !== null && typeof payload.avatarUrl !== "string") {
    return NextResponse.json({ error: "Invalid avatarUrl" }, { status: 400 });
  }
  if (hasAvatarThumb && payload.avatarThumbUrl !== null && typeof payload.avatarThumbUrl !== "string") {
    return NextResponse.json({ error: "Invalid avatarThumbUrl" }, { status: 400 });
  }
  if (hasAvatarOriginal && payload.avatarOriginalUrl !== null && typeof payload.avatarOriginalUrl !== "string") {
    return NextResponse.json({ error: "Invalid avatarOriginalUrl" }, { status: 400 });
  }
  if (hasAvatarOriginalThumb && payload.avatarOriginalThumbUrl !== null && typeof payload.avatarOriginalThumbUrl !== "string") {
    return NextResponse.json({ error: "Invalid avatarOriginalThumbUrl" }, { status: 400 });
  }
  if (hasAvatarModeration && payload.avatarModeration !== null && typeof payload.avatarModeration !== "object") {
    return NextResponse.json({ error: "Invalid avatarModeration" }, { status: 400 });
  }

  if (hasAvatar || hasAvatarThumb || hasAvatarOriginal || hasAvatarOriginalThumb || hasAvatarModeration) {
    const updatedProfile = await updateUserProfileById(userId, {
      ...(hasAvatar ? { avatarUrl: payload.avatarUrl } : {}),
      ...(hasAvatarThumb ? { avatarThumbUrl: payload.avatarThumbUrl } : {}),
      ...(hasAvatarOriginal ? { avatarOriginalUrl: payload.avatarOriginalUrl } : {}),
      ...(hasAvatarOriginalThumb ? { avatarOriginalThumbUrl: payload.avatarOriginalThumbUrl } : {}),
      ...(hasAvatarModeration ? { avatarModeration: payload.avatarModeration } : {}),
    }, { allowModeration: true });
    if (!updatedProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  if (hasSuspended) {
    const update: Record<string, any> = {};
    if (hasSuspended) {
      update.$set = suspended
        ? { isSuspended: true, suspendedAt: new Date() }
        : { isSuspended: false, suspendedAt: null };
    }

    const updated = await User.findByIdAndUpdate(userId, update, { new: true })
      .select({ _id: 1 })
      .lean();
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
  }

  const finalUser = await User.findById(userId)
    .select({
      _id: 1,
      isSuspended: 1,
      suspendedAt: 1,
      avatarUrl: 1,
      avatarThumbUrl: 1,
      avatarOriginalUrl: 1,
      avatarOriginalThumbUrl: 1,
      avatarModeration: 1,
    })
    .lean();
  if (!finalUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: finalUser._id.toString(),
    isSuspended: !!finalUser.isSuspended,
    suspendedAt: finalUser.suspendedAt ?? null,
    avatarUrl: finalUser.avatarUrl ?? null,
    avatarThumbUrl: finalUser.avatarThumbUrl ?? null,
    avatarOriginalUrl: finalUser.avatarOriginalUrl ?? null,
    avatarOriginalThumbUrl: finalUser.avatarOriginalThumbUrl ?? null,
    avatarModeration: finalUser.avatarModeration ?? null,
  });
}

export async function DELETE(_req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const userId = resolvedCtx.id as string;

  if (!mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const targetUser = await User.findById(userId).select({ _id: 1 }).lean();
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    const [argumentsByUser, commentsByUser] = await Promise.all([
      Argument.find({ createdBy: targetUser._id }).select({ _id: 1, evidence: 1 }).lean(),
      Comment.find({ createdBy: targetUser._id }).select({ _id: 1, evidence: 1 }).lean(),
    ]);

    await deleteEvidenceFilesForDocuments([...(argumentsByUser ?? []), ...(commentsByUser ?? [])]);

    const argumentIds = (argumentsByUser ?? []).map((arg: any) => arg._id);

    await Promise.all([
      Comment.deleteMany({ createdBy: targetUser._id }).exec(),
      Argument.deleteMany({ createdBy: targetUser._id }).exec(),
      Topic.updateMany({ createdBy: targetUser._id }, { isActive: false }).exec(),
    ]);

    if (argumentIds.length) {
      await Fact.deleteMany({ sourceArgument: { $in: argumentIds } }).exec();
    }

    const votes = await Vote.find({ user: targetUser._id })
      .select({ targetId: 1, targetType: 1 })
      .lean();
    await Vote.deleteMany({ user: targetUser._id }).exec();

    const argumentVoteIds = new Set<string>();
    const commentVoteIds = new Set<string>();
    (votes ?? []).forEach((vote: any) => {
      const id = vote?.targetId?.toString?.();
      if (!id) return;
      if (vote.targetType === "Argument") argumentVoteIds.add(id);
      if (vote.targetType === "Comment") commentVoteIds.add(id);
    });

    await Promise.all([
      ...Array.from(argumentVoteIds).map(async (id) => {
        const targetId = new mongoose.Types.ObjectId(id);
        const upCount = await Vote.countDocuments({ targetType: "Argument", targetId, value: 1 }).exec();
        const downCount = await Vote.countDocuments({ targetType: "Argument", targetId, value: -1 }).exec();
        await Argument.findByIdAndUpdate(targetId, {
          upvoteCount: upCount,
          downvoteCount: downCount,
          score: upCount - downCount,
        }).exec();
      }),
      ...Array.from(commentVoteIds).map(async (id) => {
        const targetId = new mongoose.Types.ObjectId(id);
        const upCount = await Vote.countDocuments({ targetType: "Comment", targetId, value: 1 }).exec();
        const downCount = await Vote.countDocuments({ targetType: "Comment", targetId, value: -1 }).exec();
        await Comment.findByIdAndUpdate(targetId, {
          upvoteCount: upCount,
          downvoteCount: downCount,
          score: upCount - downCount,
        }).exec();
      }),
    ]);

    await User.findByIdAndDelete(targetUser._id).exec();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Delete user failed", err);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
