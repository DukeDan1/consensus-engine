import OpenAI from "openai";

type RoutedClient = {
  client: OpenAI;
  model: string;
  provider: "openai" | "grok";
};

const useGrokBackup = (process.env.USE_GROK_AS_BACKUP ?? "").toLowerCase() === "true";
const grokBaseUrl = process.env.GROK_BASE_URL || "https://api.x.ai/v1";

let openaiClient: OpenAI | null = null;
let grokClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (openaiClient) return openaiClient;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function getGrokClient(): OpenAI | null {
  if (!process.env.GROK_API_KEY) return null;
  if (grokClient) return grokClient;
  grokClient = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL: grokBaseUrl });
  return grokClient;
}

async function isFlaggedByModeration(text: string): Promise<boolean> {
  const client = getOpenAIClient();
  if (!client) return false;
  try {
    const moderation = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });
    return Boolean(moderation.results?.[0]?.flagged);
  } catch (err) {
    console.warn("Moderation routing check failed; defaulting to OpenAI.", err);
    return false;
  }
}

export async function routeResponsesClient(params: {
  text: string;
  openAiModel?: string;
  grokModel?: string;
  userId?: string;
}): Promise<RoutedClient | null> {
  const openai = getOpenAIClient();
  if (!openai) return null;

  const openAiModel = params.openAiModel || process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2";
  if (!useGrokBackup) {
    return { client: openai, model: openAiModel, provider: "openai" };
  }

  const grok = getGrokClient();
  if (!grok) {
    return { client: openai, model: openAiModel, provider: "openai" };
  }

  const flagged = await isFlaggedByModeration(params.text, params.userId);
  if (!flagged) {
    return { client: openai, model: openAiModel, provider: "openai" };
  }

  const grokModel = params.grokModel || process.env.GROK_RESPONSES_MODEL || "grok-4-1-fast-non-reasoning";
  console.info("Routing request to Grok due to OpenAI moderation flag.", {
    model: grokModel,
    userId: params.userId ? String(params.userId) : "system",
  });
  return { client: grok, model: grokModel, provider: "grok" };
}
