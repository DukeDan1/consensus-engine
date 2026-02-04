import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import Topic from "@/app/models/topic";
import Argument from "@/app/models/argument";
import Comment from "@/app/models/comment";
import Fact from "@/app/models/facts";
import Vote from "@/app/models/vote";
import { deleteEvidenceFilesForDocuments } from "@/app/services/evidenceCleanupService";
import { sendEmail } from "@/app/services/emailService";
import { renderEmail } from "@/app/emails/renderEmail";
import AccountDeletedEmail from "@/app/emails/templates/AccountDeletedEmail";

export async function DELETE() {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUser = await User.findOne({ email: session.user.email }).select({ _id: 1, email: 1, name: 1 }).lean();
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Store email info before deletion
  const userEmail = targetUser.email;
  const userName = targetUser.name || "User";

  try {
    const [argumentsByUser, commentsByUser] = await Promise.all([
      Argument.find({ createdBy: targetUser._id }).select({ _id: 1, evidence: 1 }).lean(),
      Comment.find({ createdBy: targetUser._id }).select({ _id: 1, evidence: 1 }).lean(),
    ]);

    await deleteEvidenceFilesForDocuments([...(argumentsByUser ?? []), ...(commentsByUser ?? [])]);

    const argumentIds = (argumentsByUser ?? []).map((arg: any) => arg._id);
    const commentIds = (commentsByUser ?? []).map((comment: any) => comment._id);

    await Promise.all([
      Comment.deleteMany({ createdBy: targetUser._id }).exec(),
      Argument.deleteMany({ createdBy: targetUser._id }).exec(),
      Topic.updateMany({ createdBy: targetUser._id }, { isActive: false }).exec(),
    ]);

    if (argumentIds.length || commentIds.length) {
      await Fact.deleteMany({
        $or: [
          ...(argumentIds.length ? [{ sourceArgument: { $in: argumentIds } }] : []),
          ...(commentIds.length ? [{ sourceComment: { $in: commentIds } }] : []),
        ],
      }).exec();
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

    // Send deletion confirmation email
    if (userEmail) {
      try {
        const { html, text } = await renderEmail(
          AccountDeletedEmail({ name: userName, deletedBy: "self" })
        );
        await sendEmail(userEmail, "Your Consensus Engine account has been deleted", html, text);
      } catch (err) {
        console.error("Failed to send deletion email", err);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Self-delete user failed", err);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
