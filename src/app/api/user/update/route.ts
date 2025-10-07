import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]/route";
import User from "@/models/UserSchema";
import dbConnect from "@/lib/dbConnect"; // your mongoose connector

export async function POST(req: Request) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // Only allow specific keys to update
  const allowedUpdates = ["name", "preferences.theme", "preferences.language", "preferences.notifications"];
  const update: Record<string, any> = {};
  for (const key of allowedUpdates) {
    const value = key.split('.').reduce((obj, k) => obj?.[k], body);
    if (value !== undefined) {
      update[key] = value;
    }
  }

  const user = await User.findOneAndUpdate(
    { email: session.user.email },
    { $set: update },
    { new: true, runValidators: true }
  );

  return NextResponse.json(user);
}
