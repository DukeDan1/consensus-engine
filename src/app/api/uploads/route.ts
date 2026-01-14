import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { uploadFileToBucket } from "@/app/services/gcsService";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB hard cap
const allowedPrefixes = ["image/", "application/pdf", "text/", "video/", "audio/"];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "File too large" }, { status: 413 });
    }

    const contentType = file.type || "application/octet-stream";
    if (!allowedPrefixes.some((p) => contentType.startsWith(p))) {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    const safeName = `${Date.now()}-${(file.name || "upload")
      .replace(/[^a-zA-Z0-9_.-]/g, "-")
      .slice(0, 180)}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { storageUrl, signedUrl } = await uploadFileToBucket({
      fileName: safeName,
      contentType,
      data: buffer,
    });

    return NextResponse.json({ url: signedUrl, storageUrl, fileName: file.name, contentType });
  } catch (err) {
    console.error("Upload via backend failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
