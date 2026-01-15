import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { dbConnect } from "@/app/lib/mongoose";
import { updateUserProfileByEmail } from "@/app/services/userProfileService";

export async function POST(req: Request) {
  await dbConnect();
  // Removed authOptions import to fix build error
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const hasAvatarModeration = !!body
    && typeof body === "object"
    && Object.prototype.hasOwnProperty.call(body, "avatarModeration");
  if (hasAvatarModeration) {
    const moderation = body.avatarModeration;
    if (moderation !== null) {
      if (!moderation || typeof moderation !== "object" || Array.isArray(moderation)) {
        return NextResponse.json({ error: "Invalid avatarModeration" }, { status: 400 });
      }
      if (moderation.status !== "flagged") {
        return NextResponse.json({ error: "Invalid avatarModeration status" }, { status: 400 });
      }
      if (moderation.reasons !== undefined && !Array.isArray(moderation.reasons)) {
        return NextResponse.json({ error: "Invalid avatarModeration reasons" }, { status: 400 });
      }
      if (typeof moderation.flaggedAt !== "string") {
        moderation.flaggedAt = new Date().toISOString();
      }
    }
  }
  const user = await updateUserProfileByEmail(
    session.user.email,
    body,
    hasAvatarModeration ? { allowModeration: true } : undefined
  );
  return NextResponse.json(user ?? {});
}
