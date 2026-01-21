import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";

export async function POST() {
  await dbConnect();

  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await User.findOneAndUpdate(
    { email: session.user.email },
    { $inc: { sessionVersion: 1 } },
    { new: true }
  )
    .select({ sessionVersion: 1 })
    .lean();

  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    sessionVersion: typeof updated.sessionVersion === "number" ? updated.sessionVersion : 1,
  });
}
