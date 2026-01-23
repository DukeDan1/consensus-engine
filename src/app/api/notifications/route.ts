import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import Notification from "@/app/models/notification";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";

function clampLimit(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function signAvatar(url?: string | null) {
  if (!url) return null;
  return getSignedReadUrlFromUrl(url).catch(() => url);
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
  const limitRaw = parseInt(searchParams.get("limit") || "20", 10);
  const limit = clampLimit(Number.isFinite(limitRaw) ? limitRaw : 20, 1, 50);
  const unreadOnly = searchParams.get("unreadOnly") === "1";

  const filter: Record<string, any> = { recipient: user._id };
  if (unreadOnly) {
    filter.readAt = { $exists: false };
  }

  const notifications = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const actorIds = notifications
    .map((item) => item.actor)
    .filter(Boolean)
    .map((id) => id?.toString?.() ?? "")
    .filter(Boolean);
  const uniqueActorIds = Array.from(new Set(actorIds));
  const actors = uniqueActorIds.length
    ? await User.find({ _id: { $in: uniqueActorIds } })
        .select({ name: 1, nickname: 1, avatarUrl: 1, avatarThumbUrl: 1 })
        .lean()
    : [];

  const actorMap = new Map<string, any>();
  for (const actor of actors) {
    const actorId = actor?._id?.toString?.() ?? "";
    if (!actorId) continue;
    const avatarUrl = await signAvatar(actor.avatarThumbUrl ?? actor.avatarUrl ?? null);
    actorMap.set(actorId, {
      id: actorId,
      name: actor.name ?? actor.nickname ?? "Member",
      avatarUrl,
    });
  }

  const results = notifications.map((item) => {
    const actorId = item.actor?.toString?.() ?? "";
    const topicId = item.topic?.toString?.() ?? "";
    const argumentId = item.argument?.toString?.() ?? "";
    const commentId = item.comment?.toString?.() ?? "";
    const href = topicId
      ? commentId
        ? `/topics/${topicId}#comment-${commentId}`
        : argumentId
          ? `/topics/${topicId}#argument-${argumentId}`
          : `/topics/${topicId}`
      : undefined;
    return {
      id: item._id?.toString?.() ?? "",
      type: item.type,
      message: item.message ?? "",
      topicTitle: item.topicTitle ?? "",
      argumentSnippet: item.argumentSnippet ?? "",
      commentSnippet: item.commentSnippet ?? "",
      actor: actorId ? actorMap.get(actorId) ?? null : null,
      topicId,
      argumentId,
      commentId,
      href,
      readAt: item.readAt ?? null,
      createdAt: item.createdAt,
    };
  });

  return NextResponse.json({ notifications: results }, { status: 200 });
}

export async function PATCH(req: Request) {
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
  const markAll = payload?.markAll === true;
  const ids = Array.isArray(payload?.ids) ? payload.ids.filter(Boolean) : [];

  const filter: Record<string, any> = { recipient: user._id, readAt: { $exists: false } };
  if (!markAll) {
    const validIds = ids.filter((id: string) => mongoose.isValidObjectId(id));
    if (!validIds.length) {
      return NextResponse.json({ error: "No notifications selected" }, { status: 400 });
    }
    filter._id = { $in: validIds };
  }

  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return NextResponse.json({ updated: result.modifiedCount ?? 0 }, { status: 200 });
}
