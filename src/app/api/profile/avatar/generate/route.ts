import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { generateProfileImage } from "@/app/services/openaiImageGenerationService";

const genderOptions = ["male", "female"] as const;
const hairColorOptions = [
  "black",
  "dark brown",
  "brown",
  "light brown",
  "blonde",
  "red",
  "auburn",
  "grey",
  "white",
] as const;
const ethnicityOptions = [
  "East Asian (light to medium skin tone)",
  "South Asian (medium to deep skin tone)",
  "Black (deep skin tone)",
  "White (light skin tone)",
  "Middle Eastern (medium skin tone)",
  "Latino (light to medium skin tone)",
  "Southeast Asian (medium skin tone)",
  "North African (medium to deep skin tone)",
] as const;

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    });
    if (!base64) {
      return NextResponse.json({ error: "No image generated" }, { status: 500 });
    }
    return NextResponse.json({ base64 }, { status: 200 });
  } catch (err) {
    console.error("Failed to generate avatar image", err);
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 });
  }
}
