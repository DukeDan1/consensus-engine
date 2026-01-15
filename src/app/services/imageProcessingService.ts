import { ImageAnnotatorClient } from "@google-cloud/vision";
import { Buffer } from "buffer";
import sharp from "sharp";

const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const safetyChecksEnabled = process.env.IMAGE_SAFETY_CHECKS_ENABLED !== "false";
const blurSigma = Number.parseFloat(process.env.IMAGE_BLUR_SIGMA || "50") || 50;
const thumbSize = Math.max(32, Number.parseInt(process.env.IMAGE_THUMB_SIZE || "128", 10) || 128);
const sensitivityThreshold = (process.env.IMAGE_SENSITIVE_LIKELIHOOD || "VERY_LIKELY").toUpperCase();
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

const fieldLabels: Record<string, string> = {
  adult: "Adult Content",
  violence: "Violence",
  racy: "Racy Content",
  medical: "Medical Content",
  spoof: "Spoofed Content",
};

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

function extractReasons(annotation: Record<string, string | undefined> | null | undefined) {
  if (!annotation) return [];
  const thresholdIndex = likelihoodOrder.indexOf(sensitivityThreshold);
  const minIndex = thresholdIndex >= 0 ? thresholdIndex : likelihoodOrder.indexOf("LIKELY");
  return sensitiveFields
    .map((field) => {
      const value = annotation[field];
      if (!value) return null;
      const index = likelihoodOrder.indexOf(String(value).toUpperCase());
      if (index >= minIndex && index >= 0) {
        return fieldLabels[field] || field.replace(/(^.|_.)/g, (match) => match.replace("_", " ").toUpperCase());
      }
      return null;
    })
    .filter(Boolean) as string[];
}

async function checkSensitive(buffer: Buffer) {
  const client = getVisionClient();
  if (!client) {
    return { blurred: false, reasons: [], annotation: null };
  }
  try {
    const [result] = await client.safeSearchDetection({
      image: { content: buffer },
    });
    const annotation = result.safeSearchAnnotation as Record<string, string> | null | undefined;
    const blurred = shouldBlur(annotation);
    const reasons = blurred ? extractReasons(annotation) : [];
    return { blurred, reasons, annotation };
  } catch (err) {
    console.error("SafeSearch detection failed", err);
    return { blurred: false, reasons: [], annotation: null };
  }
}

export async function processImageBuffer(buffer: Buffer) {
  const baseImage = sharp(buffer).rotate();
  const safety = await checkSensitive(buffer);
  const processedPipeline = safety.blurred ? baseImage.clone().blur(blurSigma) : baseImage.clone();
  const thumbPipeline = safety.blurred ? baseImage.clone().blur(blurSigma) : baseImage.clone();

  const [processedBuffer, thumbBuffer, originalBuffer, originalThumbBuffer] = await Promise.all([
    processedPipeline.toBuffer(),
    thumbPipeline.resize(thumbSize, thumbSize, { fit: "cover" }).toBuffer(),
    baseImage.clone().toBuffer(),
    baseImage.clone().resize(thumbSize, thumbSize, { fit: "cover" }).toBuffer(),
  ]);

  return {
    processedBuffer,
    thumbBuffer,
    originalBuffer,
    originalThumbBuffer,
    blurred: safety.blurred,
    blurReasons: safety.reasons,
    thumbSize,
  };
}
