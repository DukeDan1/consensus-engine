import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import Topic from "@/app/models/topic";
import { buildBaseUrl } from "@/app/lib/commonFunctions";
import { notifyModeratorStatusChange } from "@/app/services/moderatorNotificationService";

async function requireAdmin() {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const adminUser = await User.findOne({ email: session.user.email })
    .select({ isAdmin: 1 })
    .lean();
  if (!adminUser?.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { session };
}

function normaliseModerator(value: any) {
  return {
    id: value?._id?.toString?.() ?? "",
    name: value?.name ?? undefined,
    nickname: value?.nickname ?? undefined,
    email: value?.email ?? undefined,
    avatarUrl: value?.avatarUrl ?? undefined,
    avatarThumbUrl: value?.avatarThumbUrl ?? undefined,
  };
}

async function loadModerators(topicId: string) {
  const topic = await Topic.findById(topicId).select({ moderators: 1, autoModeratorEnabled: 1 }).lean();
  if (!topic) return { error: NextResponse.json({ error: "Topic not found" }, { status: 404 }) };

  const moderatorIds = (topic.moderators ?? [])
    .map((value: any) => value?.toString?.())
    .filter(Boolean);
  if (!moderatorIds.length) {
    return { moderators: [], autoModeratorEnabled: topic.autoModeratorEnabled !== false };
  }

  const users = await User.find({ _id: { $in: moderatorIds } })
    .select({ name: 1, nickname: 1, email: 1, avatarUrl: 1, avatarThumbUrl: 1 })
    .lean();

  const userMap = new Map<string, any>();
  users.forEach((user) => {
    const id = user?._id?.toString?.() ?? "";
    if (id) userMap.set(id, user);
  });

  const ordered = moderatorIds
    .map((id: string) => userMap.get(id))
    .filter(Boolean)
    .map(normaliseModerator);

  return { moderators: ordered, autoModeratorEnabled: topic.autoModeratorEnabled !== false };
}

async function resolveModerator(identifier: string) {
  if (mongoose.isValidObjectId(identifier)) {
    return User.findById(identifier)
      .select({ _id: 1, name: 1, nickname: 1, email: 1, avatarUrl: 1, avatarThumbUrl: 1 })
      .lean();
  }
  return User.findOne({ email: identifier })
    .select({ _id: 1, name: 1, nickname: 1, email: 1, avatarUrl: 1, avatarThumbUrl: 1 })
    .lean();
}

export async function GET(_req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const topicId = resolvedCtx.id as string;

  if (!topicId || !mongoose.isValidObjectId(topicId)) {
    return NextResponse.json({ error: "Invalid topic id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const result = await loadModerators(topicId);
  if ("error" in result) return result.error;
  return NextResponse.json({
    moderators: result.moderators ?? [],
    autoModeratorEnabled: result.autoModeratorEnabled ?? true,
  });
}

export async function POST(req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const topicId = resolvedCtx.id as string;

  if (!topicId || !mongoose.isValidObjectId(topicId)) {
    return NextResponse.json({ error: "Invalid topic id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const payload = await req.json().catch(() => ({}));
  const identifier = (payload?.userId || payload?.email || payload?.identifier || "").toString().trim();
  if (!identifier) {
    return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
  }

  const user = await resolveModerator(identifier);
  if (!user?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const topic = await Topic.findById(topicId).select({ moderators: 1, title: 1 }).lean();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const alreadyModerator = Array.isArray(topic.moderators)
    ? topic.moderators.some((value: any) => value?.toString?.() === user._id?.toString?.())
    : false;

  if (!alreadyModerator) {
    await Topic.findByIdAndUpdate(
      topicId,
      { $addToSet: { moderators: user._id, manualModerators: user._id } }
    ).exec();
    const adminUser = await User.findOne({ email: adminResult.session?.user?.email })
      .select({ _id: 1, name: 1, nickname: 1 })
      .lean();
    const actorName = adminUser?.name ?? adminUser?.nickname ?? "An administrator";
    const baseUrl = buildBaseUrl(req.headers);

    void notifyModeratorStatusChange({
      recipientId: user._id.toString(),
      topicId,
      topicTitle: topic.title ?? "this topic",
      action: "promoted",
      source: "admin",
      actorId: adminUser?._id?.toString?.() ?? null,
      actorName,
      baseUrl,
    });
  } else {
    await Topic.findByIdAndUpdate(
      topicId,
      { $addToSet: { manualModerators: user._id } }
    ).exec();
  }

  const result = await loadModerators(topicId);
  if ("error" in result) return result.error;
  return NextResponse.json({
    moderators: result.moderators ?? [],
    autoModeratorEnabled: result.autoModeratorEnabled ?? true,
  });
}

export async function DELETE(req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const topicId = resolvedCtx.id as string;

  if (!topicId || !mongoose.isValidObjectId(topicId)) {
    return NextResponse.json({ error: "Invalid topic id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const payload = await req.json().catch(() => ({}));
  const identifier = (payload?.userId || payload?.email || payload?.identifier || "").toString().trim();
  if (!identifier) {
    return NextResponse.json({ error: "Missing userId or email" }, { status: 400 });
  }

  const user = await resolveModerator(identifier);
  if (!user?._id) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const topic = await Topic.findById(topicId).select({ moderators: 1, title: 1 }).lean();
  if (!topic) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  const wasModerator = Array.isArray(topic.moderators)
    ? topic.moderators.some((value: any) => value?.toString?.() === user._id?.toString?.())
    : false;

  if (wasModerator) {
    await Topic.findByIdAndUpdate(
      topicId,
      { $pull: { moderators: user._id, manualModerators: user._id } }
    ).exec();

    const adminUser = await User.findOne({ email: adminResult.session?.user?.email })
      .select({ _id: 1, name: 1, nickname: 1 })
      .lean();
    const actorName = adminUser?.name ?? adminUser?.nickname ?? "An administrator";
    const baseUrl = buildBaseUrl(req.headers);

    void notifyModeratorStatusChange({
      recipientId: user._id.toString(),
      topicId,
      topicTitle: topic.title ?? "this topic",
      action: "removed",
      source: "admin",
      actorId: adminUser?._id?.toString?.() ?? null,
      actorName,
      baseUrl,
    });
  }

  const result = await loadModerators(topicId);
  if ("error" in result) return result.error;
  return NextResponse.json({
    moderators: result.moderators ?? [],
    autoModeratorEnabled: result.autoModeratorEnabled ?? true,
  });
}

export async function PATCH(req: Request, ctx: any) {
  const resolvedCtx = await Promise.resolve(ctx.params);
  const topicId = resolvedCtx.id as string;

  if (!topicId || !mongoose.isValidObjectId(topicId)) {
    return NextResponse.json({ error: "Invalid topic id" }, { status: 400 });
  }

  await dbConnect();
  const adminResult = await requireAdmin();
  if (adminResult.error) return adminResult.error;

  const payload = await req.json().catch(() => ({}));
  const autoModeratorEnabled = payload?.autoModeratorEnabled;
  if (typeof autoModeratorEnabled !== "boolean") {
    return NextResponse.json({ error: "Invalid autoModeratorEnabled value" }, { status: 400 });
  }

  const updated = await Topic.findByIdAndUpdate(
    topicId,
    { $set: { autoModeratorEnabled } },
    { new: true }
  )
    .select({ autoModeratorEnabled: 1 })
    .lean()
    .exec();
  if (!updated) {
    return NextResponse.json({ error: "Topic not found" }, { status: 404 });
  }

  return NextResponse.json({ autoModeratorEnabled: updated.autoModeratorEnabled !== false });
}
