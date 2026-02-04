import { NextRequest, NextResponse } from "next/server";
import { generateProfileImage } from "@/app/services/openaiImageGenerationService";
import { dbConnect } from "@/app/lib/mongoose";
import User from "@/app/models/user";
import { genderOptions, hairColorOptions, ethnicityOptions } from "@/app/services/openaiImageGenerationService";
import { getAuthSession } from "@/app/services/authSessionService";

export async function POST(request: NextRequest) {
  const session = await getAuthSession(request);
  if (!session?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await dbConnect();
  const user = await User.findOne({ email: session.email }).select({ _id: 1 }).lean();
  const userId = user?._id?.toString?.() ?? session.id ?? session.email;

  const payload = await request.json().catch(() => ({}));
  const gender = payload?.gender;
  const age = Number(payload?.age);
  const hairColor = payload?.hairColor;
  const ethnicitySkin = payload?.ethnicitySkin;

  if (!genderOptions.includes(gender)) {
    return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
  }
  if (!Number.isFinite(age) || age < 18 || age > 85) {
    return NextResponse.json({ error: "Invalid age" }, { status: 400 });
  }
  if (!hairColorOptions.includes(hairColor)) {
    return NextResponse.json({ error: "Invalid hair color" }, { status: 400 });
  }
  if (!ethnicityOptions.includes(ethnicitySkin)) {
    return NextResponse.json({ error: "Invalid ethnicity/skin tone" }, { status: 400 });
  }

  try {
    const base64 = await generateProfileImage({
      gender,
      age,
      hairColor,
      ethnicitySkin,
    }, userId);
    if (!base64) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }
    return NextResponse.json({ base64 }, { status: 200 });
  } catch (err) {
    console.error("Failed to generate avatar image", err);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
