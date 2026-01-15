import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { updateUserProfileById } from "@/app/services/userProfileService";
import { sendEmail } from "@/app/services/emailService";

type Action = "approve" | "remove";

async function requireAdmin() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const adminUser = await User.findOne({ email: session.user.email }).select({ isAdmin: 1, email: 1 }).lean();
  if (!adminUser?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), adminEmail: session.user.email };
  }

  return { adminEmail: session.user.email };
}

function buildModerationUpdate(existing: any, status: "approved" | "removed", reviewer?: string | null) {
  return {
    status,
    reasons: Array.isArray(existing?.reasons) ? existing.reasons : [],
    flaggedAt: existing?.flaggedAt ?? new Date(),
    reviewedAt: new Date(),
    reviewedBy: reviewer ?? undefined,
  };
}

async function notifyAvatarOutcome(user: { email?: string | null; name?: string | null }, action: Action) {
  if (!user?.email) return;
  const name = user?.name?.trim() || "there";
  const subject = action === "approve" ? "Your avatar has been approved" : "Your avatar has been removed";
  const bodyText = action === "approve"
    ? `Hi ${name},\n\nYour avatar has been approved by a moderator and is now visible on your profile.\n\nThanks,\nThe Consensus Engine Team`
    : `Hi ${name},\n\nYour avatar has been removed by a moderator. You can upload a new avatar at any time.\n\nThanks,\nThe Consensus Engine Team`;
  const bodyHtml = action === "approve"
    ? `<p>Hi ${name},</p><p>Your avatar has been approved by a moderator and is now visible on your profile.</p><p>Thanks,<br/>The Consensus Engine Team</p>`
    : `<p>Hi ${name},</p><p>Your avatar has been removed by a moderator. You can upload a new avatar at any time.</p><p>Thanks,<br/>The Consensus Engine Team</p>`;

  try {
    await sendEmail(user.email, subject, bodyHtml, bodyText);
  } catch (err) {
    console.error("Failed to send avatar moderation email", err);
  }
}

export async function POST(req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const userId = resolvedCtx.userId as string;

  if (!userId || !mongoose.isValidObjectId(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const payload = await req.json().catch(() => ({}));
  const action = payload?.action as Action | undefined;
  if (action !== "approve" && action !== "remove") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const user = await User.findById(userId)
    .select({
      name: 1,
      email: 1,
      avatarUrl: 1,
      avatarThumbUrl: 1,
      avatarOriginalUrl: 1,
      avatarOriginalThumbUrl: 1,
      avatarModeration: 1,
    })
    .lean();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (user.avatarModeration?.status !== "flagged") {
    return NextResponse.json({ error: "Avatar is not awaiting review" }, { status: 409 });
  }

  if (action === "approve") {
    const nextAvatarUrl = user.avatarOriginalUrl ?? user.avatarUrl ?? null;
    const nextAvatarThumbUrl = user.avatarOriginalThumbUrl ?? user.avatarThumbUrl ?? null;
    await updateUserProfileById(userId, {
      avatarUrl: nextAvatarUrl,
      avatarThumbUrl: nextAvatarThumbUrl,
      avatarOriginalUrl: user.avatarOriginalUrl ?? null,
      avatarOriginalThumbUrl: user.avatarOriginalThumbUrl ?? null,
      avatarModeration: buildModerationUpdate(user.avatarModeration, "approved", adminResult.adminEmail),
    });
  } else {
    await updateUserProfileById(userId, {
      avatarUrl: null,
      avatarThumbUrl: null,
      avatarOriginalUrl: null,
      avatarOriginalThumbUrl: null,
      avatarModeration: buildModerationUpdate(user.avatarModeration, "removed", adminResult.adminEmail),
    });
  }

  notifyAvatarOutcome({ email: user.email, name: user.name }, action);

  return NextResponse.json({ ok: true }, { status: 200 });
}
