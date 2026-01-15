import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";

const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const safetyChecksEnabled = process.env.IMAGE_SAFETY_CHECKS_ENABLED !== "false";
const blurSigma = Number.parseFloat(process.env.IMAGE_BLUR_SIGMA || "12") || 12;
const thumbSize = Math.max(32, Number.parseInt(process.env.IMAGE_THUMB_SIZE || "128", 10) || 128);
const sensitivityThreshold = (process.env.IMAGE_SENSITIVE_LIKELIHOOD || "LIKELY").toUpperCase();
const sensitiveFields = (process.env.IMAGE_SENSITIVE_FIELDS || "adult,violence,racy,medical")
  .split(",")
  .map((field) => field.trim().toLowerCase())
  .filter(Boolean);

const likelihoodOrder = [
  "UNKNOWN",
  "VERY_UNLIKELY",
  "UNLIKELY",
  "POSSIBLE",
  "LIKELY",
  "VERY_LIKELY",
];

let visionClient: ImageAnnotatorClient | null = null;

function parseServiceAccount(jsonish: string) {
  try {
    return JSON.parse(jsonish);
  } catch {
    try {
      const decoded = Buffer.from(jsonish, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (inner) {
      console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY", inner);
      return null;
    }
  }
}

function normalizePrivateKey(key: string | undefined) {
  if (!key) return undefined;
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

function getVisionClient() {
  if (!safetyChecksEnabled) return null;
  if (visionClient) return visionClient;
  if (!rawKey) return null;
  const keyObj = parseServiceAccount(rawKey);
  if (!keyObj) return null;
  const privateKey = normalizePrivateKey(keyObj.private_key as string | undefined);
  if (!privateKey) return null;
  visionClient = new ImageAnnotatorClient({
    projectId: keyObj.project_id,
    credentials: {
      client_email: keyObj.client_email,
      private_key: privateKey,
    },
  });
  return visionClient;
}

function shouldBlur(annotation: Record<string, string | undefined> | null | undefined) {
  if (!annotation) return false;
  const thresholdIndex = likelihoodOrder.indexOf(sensitivityThreshold);
  const minIndex = thresholdIndex >= 0 ? thresholdIndex : likelihoodOrder.indexOf("LIKELY");
  return sensitiveFields.some((field) => {
    const value = annotation[field];
    if (!value) return false;
    const index = likelihoodOrder.indexOf(String(value).toUpperCase());
    return index >= minIndex && index >= 0;
  });
}

async function checkSensitive(buffer: Buffer) {
  const client = getVisionClient();
  if (!client) return false;
  try {
    const [result] = await client.safeSearchDetection({
      image: { content: buffer },
    });
    return shouldBlur(result.safeSearchAnnotation as Record<string, string> | null | undefined);
  } catch (err) {
    console.error("SafeSearch detection failed", err);
    return false;
  }
}

export async function processImageBuffer(buffer: Buffer) {
  const baseImage = sharp(buffer).rotate();
  const shouldBlurImage = await checkSensitive(buffer);
  const processedPipeline = shouldBlurImage ? baseImage.clone().blur(blurSigma) : baseImage.clone();

  const [processedBuffer, thumbBuffer] = await Promise.all([
    processedPipeline.toBuffer(),
    baseImage.clone().resize(thumbSize, thumbSize, { fit: "cover" }).toBuffer(),
  ]);

  return {
    processedBuffer,
    thumbBuffer,
    blurred: shouldBlurImage,
    thumbSize,
  };
}
