import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/app/lib/mongoose";
import Topic from "@/app/models/topic";
import User from "@/app/models/user";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(request: NextRequest) {
  await dbConnect();

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("q") || "").trim();
  if (raw.length < 2) {
    return NextResponse.json({ topics: [], users: [] }, { status: 200 });
  }

  const safe = escapeRegex(raw);
  const regex = new RegExp(safe, "i");

  const [topicsRaw, usersRaw] = await Promise.all([
    Topic.find({
      isActive: true,
      "visibility.status": { $nin: ["blocked", "hidden", "needs_review", "noise"] },
      title: regex,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ _id: 1, title: 1 })
      .lean(),
    User.find({
      $or: [
        { name: regex },
        { nickname: regex },
        { email: regex },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select({ _id: 1, name: 1, nickname: 1, avatarUrl: 1 })
      .lean(),
  ]);

  const users = await Promise.all(
    (usersRaw ?? []).map(async (user: any) => {
      let avatarUrl = user?.avatarUrl ?? null;
      if (avatarUrl) {
        avatarUrl = await getSignedReadUrlFromUrl(avatarUrl).catch(() => avatarUrl);
      }
      return {
        id: user._id?.toString?.() ?? "",
        name: user.name ?? null,
        nickname: user.nickname ?? null,
        avatarUrl,
      };
    })
  );

  const topics = (topicsRaw ?? []).map((topic: any) => ({
    id: topic._id?.toString?.() ?? "",
    title: topic.title ?? "",
  }));

  return NextResponse.json({ topics, users }, { status: 200 });
}
