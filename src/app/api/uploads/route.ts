import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { deleteFileFromUrl, uploadFileToBucket, uploadProcessedImageVariants } from "@/app/services/gcsService";
import { processImageBuffer } from "@/app/services/imageProcessingService";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50MB hard cap
const allowedPrefixes = ["image/", "application/pdf", "text/", "video/", "audio/"];
const imageProcessingEnabled = process.env.IMAGE_PROCESSING_ENABLED !== "false";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "A file is required" }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "The uploaded file is too large" }, { status: 413 });
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

    if (imageProcessingEnabled && contentType.startsWith("image/")) {
      const { processedBuffer, thumbBuffer } = await processImageBuffer(buffer);
      const { storageUrl, signedUrl, previewUrl, signedPreviewUrl } = await uploadProcessedImageVariants({
        fileName: safeName,
        contentType,
        processedBuffer,
        thumbBuffer,
      });

      return NextResponse.json({
        url: signedUrl,
        storageUrl,
        previewUrl,
        previewSignedUrl: signedPreviewUrl,
        fileName: file.name,
        contentType,
      });
    }

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

export async function DELETE(req: Request) {
  try {
    const payload = await req.json().catch(() => ({}));
    const url = typeof payload?.url === "string" ? payload.url : "";
    const previewUrl = typeof payload?.previewUrl === "string" ? payload.previewUrl : "";
    if (!url) {
      return NextResponse.json({ error: "A file URL is required" }, { status: 400 });
    }

    const deleteTargets = [url, previewUrl].filter(Boolean);
    const results = await Promise.all(deleteTargets.map((target) => deleteFileFromUrl(target)));
    const hasFailure = results.some((result) => !result.deleted);
    if (hasFailure) {
      return NextResponse.json({ error: "Invalid file URL" }, { status: 400 });
    }

    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("Delete via backend failed", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
