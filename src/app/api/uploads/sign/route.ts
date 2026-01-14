import { NextResponse } from "next/server";
import { getSignedUploadUrl } from "@/app/services/gcsService";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const fileName = (body?.fileName || "").toString().trim();
    const contentType = (body?.contentType || "").toString().trim();

    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName and contentType are required" }, { status: 400 });
    }

    const allowedPrefixes = ["image/", "application/pdf", "text/", "video/", "audio/"]; // light validation
    if (!allowedPrefixes.some((p) => contentType.startsWith(p))) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    const { uploadUrl, publicUrl } = await getSignedUploadUrl({ fileName, contentType });

    return NextResponse.json({ uploadUrl, publicUrl, contentType });
  } catch (err: any) {
    console.error("Sign upload URL failed", err);
    return NextResponse.json({ error: "Failed to sign upload URL" }, { status: 500 });
  }
}
