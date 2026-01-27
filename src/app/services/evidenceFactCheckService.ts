import OpenAI from "openai";
import { Buffer } from "buffer";
import type { EvidenceItem } from "@/app/lib/evidence";
import { getSignedReadUrlFromUrl } from "@/app/services/gcsService";

type FactCheckVerdict = "verified" | "false" | "mixed" | "unverified";

export type EvidenceFactCheckResult = {
  verdict: FactCheckVerdict;
  qualityScore?: number;
  confidence?: number;
  summary?: string;
  checkedAt: Date;
  model?: string;
};

export type EvidenceFactCheckOutcome = {
  evidence: EvidenceItem[];
  evidenceRankScore: number;
};

const FACT_CHECK_ENABLED = (process.env.EVIDENCE_FACT_CHECK_ENABLED ?? "true").toLowerCase() !== "false";
const MAX_TEXT_CHARS = 12000;
const MAX_TEXT_BYTES = 1_000_000; // 1MB
const FETCH_TIMEOUT_MS = 15000;

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (openai) return openai;
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return value
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function truncateText(value: string, maxChars = MAX_TEXT_CHARS) {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function looksLikePdf(contentType?: string, url?: string) {
  if (contentType && contentType.toLowerCase().includes("pdf")) return true;
  const lower = (url || "").toLowerCase();
  return lower.endsWith(".pdf");
}

function shouldCheckEvidence(item: EvidenceItem) {
  if (!item?.url) return false;
  if (item.kind === "file") {
    const contentType = item.contentType || "";
    return looksLikePdf(contentType, item.url) || contentType.startsWith("text/");
  }
  return true;
}

function isSupportedTextContentType(contentType: string) {
  const lower = contentType.toLowerCase();
  return (
    lower.startsWith("text/") ||
    lower.includes("html") ||
    lower.includes("json") ||
    lower.includes("xml")
  );
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchBinary(url: string, maxBytes: number, truncate = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Fetch failed (${response.status})`);
    }
    const contentType = response.headers.get("content-type") || "";
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength && contentLength > maxBytes && !truncate) {
      throw new Error("Content too large");
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > maxBytes) {
      if (!truncate) {
        throw new Error("Content too large");
      }
      return { buffer: buffer.subarray(0, maxBytes), contentType };
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseVerdict(value: unknown): FactCheckVerdict {
  if (value === "verified" || value === "false" || value === "mixed" || value === "unverified") {
    return value;
  }
  return "unverified";
}

function buildFallbackResult(summary: string, model?: string): EvidenceFactCheckResult {
  return {
    verdict: "unverified",
    summary,
    checkedAt: new Date(),
    model,
  };
}

async function requestFactCheck(params: {
  url: string;
  contentType?: string;
  fileName?: string;
  text?: string;
  fileData?: string;
}): Promise<EvidenceFactCheckResult> {
  const client = getOpenAIClient();
  if (!client || !FACT_CHECK_ENABLED) {
    return buildFallbackResult("Fact checking unavailable.", "disabled");
  }

  const model = process.env.OPENAI_FACT_CHECK_MODEL || process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2";
  const metadata = [
    `Source URL: ${params.url}`,
    params.contentType ? `Content type: ${params.contentType}` : null,
    params.fileName ? `File name: ${params.fileName}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const userContent: Array<{ type: "input_text" | "input_file"; text?: string; file_url?: string; }> = [
    {
      type: "input_text",
      text:
        `${metadata}\n\n` +
        (params.fileData
          ? "The source content is attached as a file. Assess its factuality and source quality."
          : `Extracted text:\n${truncateText(params.text || "")}`),
    },
  ];

  if (params.fileData) {
    userContent.push({
      type: "input_file",
      file_url: params.url,
    });
  }

  const response = await client.responses.create({
    model,
    reasoning: { effort: "low" },
    input: [
      {
        role: "developer",
        content:
          "You are a source-quality and factuality evaluator for evidence in a debate platform. " +
          "Determine whether the source is factual/high quality or contains false/misleading information. " +
          "Return verified only when the source is reliable and factual; false only when the source is clearly unreliable or contains false claims. " +
          "Use mixed for partially reliable sources and unverified when uncertain. " +
          "You may use the web search tool to validate the source's legitimacy or provenance. You could do this by looking at the provided source directly, or by looking for other sources to corroborate the claims made by the provided source. " +
          "Always return your final assessment by calling the fact_check_source tool.",
      },
      {
        role: "user",
        content: userContent,
      } as OpenAI.Responses.ResponseInputItem,
    ],
    tool_choice: "required",
    tools: [
      { type: "web_search_preview" },
      {
        type: "function",
        name: "fact_check_source",
        strict: true,
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["verdict", "qualityScore", "confidence", "summary"],
          properties: {
            verdict: { type: "string", enum: ["verified", "false", "mixed", "unverified"] },
            qualityScore: { type: "number", minimum: 0, maximum: 100 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            summary: { type: "string", maxLength: 240 },
          },
        },
      },
    ],
  });

  const functionCallItem = response.output.find((item) => item.type === "function_call");
  if (!functionCallItem || !("arguments" in functionCallItem)) {
    return buildFallbackResult("Unable to verify this source right now.", model);
  }

  let parsed: any;
  try {
    parsed = JSON.parse((functionCallItem as any).arguments);
  } catch {
    return buildFallbackResult("Unable to verify this source right now.", model);
  }

  return {
    verdict: normaliseVerdict(parsed.verdict),
    qualityScore: typeof parsed.qualityScore === "number" ? clamp(parsed.qualityScore, 0, 100) : undefined,
    confidence: typeof parsed.confidence === "number" ? clamp(parsed.confidence, 0, 1) : undefined,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 240) : undefined,
    checkedAt: new Date(),
    model,
  };
}

function scoreEvidenceItem(item: EvidenceItem): number {
  const verdict = item.factCheck?.verdict;
  if (!verdict || verdict === "unverified") return 0;
  const base =
    verdict === "verified" ? 10
    : verdict === "mixed" ? 4
    : verdict === "false" ? -18
    : 0;
  const qualityScore = typeof item.factCheck?.qualityScore === "number" ? item.factCheck.qualityScore : undefined;
  const qualityAdj = typeof qualityScore === "number" ? clamp(Math.round((qualityScore - 50) / 10), -5, 5) : 0;
  return base + qualityAdj;
}

export function calculateEvidenceRankScore(evidence: EvidenceItem[]): number {
  const total = (evidence || []).reduce((sum, item) => sum + scoreEvidenceItem(item), 0);
  return clamp(total, -25, 20);
}

export async function factCheckEvidenceItems(
  evidence: EvidenceItem[]
): Promise<EvidenceFactCheckOutcome> {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    return { evidence: evidence || [], evidenceRankScore: 0 };
  }

  const updated: EvidenceItem[] = [];

  for (const item of evidence) {
    if (!item || !item.url || item.factCheck?.checkedAt || !shouldCheckEvidence(item)) {
      updated.push(item);
      continue;
    }

    try {
      if (!isHttpUrl(item.url)) {
        updated.push({ ...item, factCheck: buildFallbackResult("Unsupported URL scheme.") });
        continue;
      }

      const fetchUrl = item.kind === "file"
        ? await getSignedReadUrlFromUrl(item.url).catch(() => item.url)
        : item.url;

      if (!fetchUrl) {
        updated.push({ ...item, factCheck: buildFallbackResult("Missing evidence URL.") });
        continue;
      }

      const isPdf = looksLikePdf(item.contentType, fetchUrl);

      if (isPdf) {
        const result = await requestFactCheck({
          url: fetchUrl
        });
        updated.push({ ...item, factCheck: result });
        continue;
      }

      const { buffer, contentType } = await fetchBinary(fetchUrl, MAX_TEXT_BYTES, true);
      if (!isSupportedTextContentType(contentType)) {
        updated.push({ ...item, factCheck: buildFallbackResult("Unsupported content type.") });
        continue;
      }
      const rawText = buffer.toString("utf-8");
      const textContent = contentType.includes("html")
        ? normaliseWhitespace(stripHtml(rawText))
        : normaliseWhitespace(rawText);

      if (!textContent) {
        updated.push({ ...item, factCheck: buildFallbackResult("No readable text found.") });
        continue;
      }

      const result = await requestFactCheck({
        url: fetchUrl,
        contentType: item.contentType || contentType,
        fileName: item.fileName,
        text: textContent,
      });
      updated.push({ ...item, factCheck: result });
    } catch (err) {
      console.error("Evidence fact check failed", err);
      updated.push({ ...item, factCheck: buildFallbackResult("Fact check failed.") });
    }
  }

  return {
    evidence: updated,
    evidenceRankScore: calculateEvidenceRankScore(updated),
  };
}
