import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/app/services/authSessionService";
import { dbConnect } from "@/app/lib/mongoose";
import { updateUserProfileByEmail } from "@/app/services/userProfileService";

export async function POST(req: NextRequest) {
  await dbConnect();
  const authSession = await getAuthSession(req);
  if (!authSession?.email) {
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
    authSession.email!,
    body,
    hasAvatarModeration ? { allowModeration: true } : undefined
  );
  return NextResponse.json(user ?? {});
}
