import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: Request) {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await User.findOne({ email: session.user.email }).select({ isAdmin: 1 }).lean();
  if (!adminUser?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const rawQuery = (searchParams.get("q") || "").trim();
  if (!rawQuery) {
    return NextResponse.json({ users: [] }, { status: 200 });
  }

  const query = escapeRegex(rawQuery);
  const regex = new RegExp(query, "i");

  const users = await User.find({
    $or: [{ name: regex }, { nickname: regex }, { email: regex }],
  })
    .select({ name: 1, nickname: 1, email: 1, avatarUrl: 1, avatarThumbUrl: 1 })
    .limit(10)
    .lean();

  const results = users.map((user) => ({
    id: user?._id?.toString?.() ?? "",
    name: user?.name ?? undefined,
    nickname: user?.nickname ?? undefined,
    email: user?.email ?? undefined,
    avatarUrl: user?.avatarUrl ?? undefined,
    avatarThumbUrl: user?.avatarThumbUrl ?? undefined,
  }));

  return NextResponse.json({ users: results }, { status: 200 });
}
