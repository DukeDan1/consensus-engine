import { FactCheckVerdict } from "@/app/lib/evidence";
import { routeResponsesClient } from "@/app/services/aiRoutingService";

export type ContentFactCheckSource = {
  title?: string;
  url?: string;
  snippet?: string;
};

export type ContentFactCheckResult = {
  verdict: FactCheckVerdict;
  confidence?: number;
  summary?: string;
  sources?: ContentFactCheckSource[];
  checkedAt: Date;
  model?: string;
};

const CONTENT_FACT_CHECK_ENABLED =
  (process.env.CONTENT_FACT_CHECK_ENABLED ?? "true").toLowerCase() !== "false";
const MAX_TEXT_CHARS = 4000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function truncateText(value: string, maxChars = MAX_TEXT_CHARS) {
  if (!value) return "";
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars);
}

function normaliseVerdict(value: unknown): FactCheckVerdict {
  if (value === "verified" || value === "inaccurate" || value === "mixed" || value === "unverified") {
    return value;
  }
  return "unverified";
}

function normaliseSources(value: unknown): ContentFactCheckSource[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = item as { title?: unknown; url?: unknown; snippet?: unknown };
      const url = typeof source.url === "string" ? source.url.trim() : "";
      if (!url) return null;
      return {
        title: typeof source.title === "string" ? source.title.trim().slice(0, 200) : undefined,
        url,
        snippet: typeof source.snippet === "string" ? source.snippet.trim().slice(0, 240) : undefined,
      };
    })
    .filter(Boolean) as ContentFactCheckSource[];
}

function buildFallbackResult(summary: string, model?: string): ContentFactCheckResult {
  return {
    verdict: "unverified",
    summary,
    sources: [],
    checkedAt: new Date(),
    model,
  };
}

export async function factCheckPostContent(params: {
  text: string;
  contentType?: "topic" | "argument" | "comment";
  topicTitle?: string;
  context?: string;
  userId?: string;
}): Promise<ContentFactCheckResult> {
  if (!CONTENT_FACT_CHECK_ENABLED) {
    return buildFallbackResult("Fact checking unavailable.", "disabled");
  }

  const trimmed = (params.text || "").trim();
  if (!trimmed) {
    return buildFallbackResult("No content to check.", "disabled");
  }

  const routed = await routeResponsesClient({
    text: trimmed,
    openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
    grokModel: process.env.GROK_RESPONSES_MODEL,
    userId: params.userId,
  });
  if (!routed) {
    return buildFallbackResult("Fact checking unavailable.", "disabled");
  }

  const model = routed.model;
  const contextBits = [
    params.contentType ? `Content type: ${params.contentType}` : null,
    params.topicTitle ? `Topic: ${params.topicTitle}` : null,
    params.context ? `Context: ${params.context}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await routed.client.responses.create({
      model,
      safety_identifier: params.userId ? String(params.userId) : "system",
      ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
      input: [
        {
          role: "developer",
          content:
            "You are a careful fact-checker for a discussion platform. " +
            "Only flag content as inaccurate when it contains a specific, easily verifiable factual claim that is clearly false. " +
            "Use the web search tool to find reliable, authoritative sources that directly refute the claim. " +
            "If the content is opinion, subjective, ambiguous, or not easily verifiable, return unverified. " +
            "Provide up to 3 sources when you mark something inaccurate. Do not guess or fabricate sources. " +
            "Return your assessment by calling the fact_check_post tool.",
        },
        {
          role: "user",
          content:
            `${contextBits}\n\n` +
            `Content to check:\n${truncateText(trimmed)}`,
        },
      ],
      tool_choice: "required",
      tools: [
        { type: "web_search" },
        {
          type: "function",
          name: "fact_check_post",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["verdict", "confidence", "summary", "sources"],
            properties: {
              verdict: { type: "string", enum: ["verified", "inaccurate", "mixed", "unverified"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              summary: { type: "string" },
              sources: {
                type: "array",
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "url", "snippet"],
                  properties: {
                    title: { type: "string", maxLength: 200 },
                    url: { type: "string", maxLength: 500 },
                    snippet: { type: "string", maxLength: 240 },
                  },
                },
              },
            },
          },
        },
      ],
    });

    const functionCallItem = response.output.find((item) => item.type === "function_call");
    if (!functionCallItem || !("arguments" in functionCallItem)) {
      return buildFallbackResult("Unable to verify this post right now.", model);
    }

    let parsed: any;
    try {
      parsed = JSON.parse((functionCallItem as any).arguments);
    } catch {
      return buildFallbackResult("Unable to verify this post right now.", model);
    }

    const verdict = normaliseVerdict(parsed.verdict);
    const confidence = typeof parsed.confidence === "number" ? clamp(parsed.confidence, 0, 1) : undefined;
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 240) : undefined;
    const sources = normaliseSources(parsed.sources);

    return {
      verdict,
      confidence,
      summary,
      sources,
      checkedAt: new Date(),
      model,
    };
  } catch (err) {
    console.error("Content fact check failed", err);
    return buildFallbackResult("Fact check failed.", model);
  }
}
