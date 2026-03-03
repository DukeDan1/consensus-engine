/**
 * AI Routing Service
 *
 * Routes AI requests to the best available provider (OpenAI, Grok, or OpenRouter)
 * with automatic fallback and content moderation gating.
 *
 * ## Provider selection order
 *
 * 1. **Forced provider** (if set) — either per-call via `forcedDefaultModelAndProvider`
 *    or globally via `FORCED_AI_PROVIDER` / `FORCED_AI_MODEL` env vars.
 * 2. **OpenAI** — default first choice; must pass moderation when fallbacks exist.
 * 3. **Grok** — first fallback; no moderation gate.
 * 4. **OpenRouter** — second fallback; no moderation gate.
 *
 * If a provider is unavailable (no API key) or skipped (OpenAI moderation flag),
 * the next provider in the chain is tried. The function only returns `null` when
 * no providers are configured at all.
 *
 * For automatic retry on request failure, use {@link executeWithFallback} instead
 * of calling `routed.client.responses.create()` directly — it will catch errors
 * and transparently retry with the next available provider.
 *
 * ## Environment variables
 *
 * | Variable                   | Purpose                                          |
 * |----------------------------|--------------------------------------------------|
 * | `OPENAI_API_KEY`           | Enables the OpenAI provider                      |
 * | `OPENAI_RESPONSES_MODEL`   | Default model for OpenAI (fallback: `gpt-5.2`)   |
 * | `GROK_API_KEY`             | Enables the Grok provider                        |
 * | `GROK_BASE_URL`            | Grok API base URL (default: `https://api.x.ai/v1`) |
 * | `GROK_RESPONSES_MODEL`     | Default model for Grok (fallback: `grok-4-1-fast-non-reasoning`) |
 * | `OPENROUTER_API_KEY`       | Enables the OpenRouter provider                   |
 * | `OPENROUTER_BASE_URL`      | OpenRouter API base URL (default: `https://openrouter.ai/api/v1`) |
 * | `OPENROUTER_RESPONSES_MODEL` | Default model for OpenRouter (fallback: `openai/gpt-5.2`) |
 * | `FORCED_AI_PROVIDER`       | Force a provider globally (`openai`, `grok`, or `openrouter`) |
 * | `FORCED_AI_MODEL`          | Model to use with the forced provider             |
 */
import OpenAI from "openai";

// ────────────────────────── Types ──────────────────────────

/** Supported AI provider identifiers. */
export type Provider = "openai" | "grok" | "openrouter";

/** The resolved client, model, and provider returned by {@link routeResponsesClient}. */
export type RoutedClient = {
  /** OpenAI-compatible SDK instance (works for all three providers). */
  client: OpenAI;
  /** The model identifier to pass to `responses.create()`. */
  model: string;
  /** Which provider this client connects to. */
  provider: Provider;
};

type Candidate = RoutedClient;

// ────────────────────────── Client singletons ──────────────────────────

let openaiClient: OpenAI | null = null;
let grokClient: OpenAI | null = null;
let openRouterClient: OpenAI | null = null;

/**
 * Returns a lazily-initialised, singleton OpenAI SDK instance for the given
 * provider. Returns `null` if the required API key env var is not set.
 */
function getClient(provider: Provider): OpenAI | null {
  switch (provider) {
    case "openai": {
      if (!process.env.OPENAI_API_KEY) return null;
      if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openaiClient;
    }
    case "grok": {
      if (!process.env.GROK_API_KEY) return null;
      if (!grokClient) {
        const baseURL = process.env.GROK_BASE_URL || "https://api.x.ai/v1";
        grokClient = new OpenAI({ apiKey: process.env.GROK_API_KEY, baseURL });
      }
      return grokClient;
    }
    case "openrouter": {
      if (!process.env.OPENROUTER_API_KEY) return null;
      if (!openRouterClient) {
        const baseURL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
        openRouterClient = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL });
      }
      return openRouterClient;
    }
  }
}

// ────────────────────────── Model defaults ──────────────────────────

/**
 * Maps each provider to the env var that overrides its default model,
 * plus a hardcoded fallback if the env var is unset.
 */
const DEFAULT_MODELS: Record<Provider, { envKey: string; fallback: string }> = {
  openai: { envKey: "OPENAI_RESPONSES_MODEL", fallback: "gpt-5.2" },
  grok: { envKey: "GROK_RESPONSES_MODEL", fallback: "grok-4-1-fast-non-reasoning" },
  openrouter: { envKey: "OPENROUTER_RESPONSES_MODEL", fallback: "openai/gpt-5.2" },
};

/**
 * Resolves the model to use for a provider. Priority:
 * 1. Per-call override (e.g. `openAiModel` param)
 * 2. Environment variable (e.g. `OPENAI_RESPONSES_MODEL`)
 * 3. Hardcoded fallback
 */
function getDefaultModel(
  provider: Provider,
  overrides?: { openAiModel?: string; grokModel?: string; openRouterModel?: string },
  ignoreEnvironmentDefaults = false,
): string {
  // Per-call overrides take priority
  if (overrides) {
    if (provider === "openai" && overrides.openAiModel) return overrides.openAiModel;
    if (provider === "grok" && overrides.grokModel) return overrides.grokModel;
    if (provider === "openrouter" && overrides.openRouterModel) return overrides.openRouterModel;
  }
  const { envKey, fallback } = DEFAULT_MODELS[provider];
  // When ignoreEnvironmentDefaults is true, skip the env var and use the hardcoded fallback
  if (ignoreEnvironmentDefaults) return fallback;
  return process.env[envKey] || fallback;
}

// ────────────────────────── Moderation ──────────────────────────

/**
 * Runs the input text through OpenAI's moderation endpoint.
 * Returns `true` if the content is flagged (or if the check fails — fail-closed).
 * Returns `false` if no OpenAI client is available (fail-open, since there's
 * nothing to protect).
 */
async function isFlaggedByModeration(text: string): Promise<boolean> {
  const client = getClient("openai");
  if (!client) return false;
  try {
    const moderation = await client.moderations.create({
      model: "omni-moderation-latest",
      input: text,
    });
    return Boolean(moderation.results?.[0]?.flagged);
  } catch (err) {
    console.warn("Moderation check failed; assuming flagged.", err);
    return true;
  }
}

// ────────────────────────── Forced provider resolution ──────────────────────────

const VALID_PROVIDERS = new Set<Provider>(["openai", "grok", "openrouter"]);

function isValidProvider(value: unknown): value is Provider {
  return typeof value === "string" && VALID_PROVIDERS.has(value as Provider);
}

/**
 * Determines whether a forced provider/model has been configured.
 *
 * Checked in order:
 * 1. `paramLevel` — passed directly to `routeResponsesClient()` via
 *    `forcedDefaultModelAndProvider`.
 * 2. `FORCED_AI_PROVIDER` + optional `FORCED_AI_MODEL` env vars.
 *
 * @returns The forced provider/model, or `null` if none is set.
 */
function getForcedDefault(
  paramLevel?: { model: string; provider: Provider },
  ignoreEnvironmentDefaults = false,
): { model?: string; provider: Provider } | null {
  // Param-level override takes priority over env-level
  if (paramLevel) return paramLevel;

  // When ignoreEnvironmentDefaults is true, skip env-level forced provider
  if (ignoreEnvironmentDefaults) return null;

  const envProvider = process.env.FORCED_AI_PROVIDER?.toLowerCase();
  if (envProvider && isValidProvider(envProvider)) {
    return {
      model: process.env.FORCED_AI_MODEL || undefined,
      provider: envProvider,
    };
  }
  return null;
}

// ────────────────────────── Provider ordering ──────────────────────────

const DEFAULT_PROVIDER_ORDER: Provider[] = ["openai", "grok", "openrouter"];

/**
 * Builds the ordered list of providers to try.
 * If a forced provider is specified it goes first; the remaining providers
 * follow in the default order (`openai → grok → openrouter`).
 */
function buildProviderOrder(forcedProvider?: Provider): Provider[] {
  if (!forcedProvider) return DEFAULT_PROVIDER_ORDER;
  return [forcedProvider, ...DEFAULT_PROVIDER_ORDER.filter((p) => p !== forcedProvider)];
}

// ────────────────────────── Shared param type ──────────────────────────

/** Common parameters accepted by both {@link routeResponsesClient} and {@link executeWithFallback}. */
export type RoutingParams = {
  /** The input text; used for OpenAI moderation gating. */
  text: string;
  /** Per-call model override for OpenAI. */
  openAiModel?: string;
  /** Per-call model override for Grok. */
  grokModel?: string;
  /** Per-call model override for OpenRouter. */
  openRouterModel?: string;
  /**
   * Force a specific provider/model for this call.
   * Takes priority over `FORCED_AI_PROVIDER` env var.
   * If the forced provider is unavailable, remaining providers are tried as fallbacks.
   */
  forcedDefaultModelAndProvider?: { model: string; provider: Provider };
  /** Logged alongside routing decisions for debugging. */
  userId?: string;
  /**
   * When `true`, environment variables for provider/model defaults
   * (`FORCED_AI_PROVIDER`, `FORCED_AI_MODEL`, `*_RESPONSES_MODEL`) are
   * ignored — only per-call overrides and hardcoded fallbacks are used.
   * Set to `true` for embeddings and image-generation calls so they
   * always follow the openai→grok→openrouter pattern.
   * @default false
   */
  ignoreEnvironmentDefaults?: boolean;
  skipModeration?: boolean; // Skips moderation check, should only be used for embeddings or unmoderated models
};

/**
 * Builds the ordered list of available candidates based on forced-provider
 * settings, API key availability, and per-call model overrides.
 */
function buildCandidates(params: RoutingParams): Candidate[] {
  const ignore = params.ignoreEnvironmentDefaults ?? false;
  const forced = getForcedDefault(params.forcedDefaultModelAndProvider, ignore);
  const providerOrder = buildProviderOrder(forced?.provider);

  const candidates: Candidate[] = [];
  for (const provider of providerOrder) {
    const client = getClient(provider);
    if (!client) continue;
    const model =
      forced?.provider === provider && forced.model
        ? forced.model
        : getDefaultModel(provider, params, ignore);
    candidates.push({ client, model, provider });
  }
  return candidates;
}

// ────────────────────────── Main routing function ──────────────────────────

/**
 * Selects the best available AI provider and returns a ready-to-use client.
 *
 * This returns the **first** suitable provider. If you also want automatic
 * retry when the actual API request fails, use {@link executeWithFallback}.
 *
 * @returns A {@link RoutedClient} for the selected provider, or `null` if no
 *   providers are configured (all API keys missing).
 *
 * @example
 * ```ts
 * const routed = await routeResponsesClient({ text: userInput });
 * if (!routed) throw new Error("No AI provider available");
 *
 * const response = await routed.client.responses.create({
 *   model: routed.model,
 *   input: [{ role: "user", content: userInput }],
 * });
 * ```
 *
 * @example Force Grok for a specific call:
 * ```ts
 * const routed = await routeResponsesClient({
 *   text: userInput,
 *   forcedDefaultModelAndProvider: { model: "grok-4", provider: "grok" },
 * });
 * ```
 */
export async function routeResponsesClient(params: RoutingParams): Promise<RoutedClient | null> {
  const candidates = buildCandidates(params);
  if (candidates.length === 0) return null;

  // Try each candidate; OpenAI must pass moderation (only when fallbacks exist)
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (candidate.provider === "openai" && candidates.length > 1) {
      let flagged = false;

      if (!params.skipModeration) {
        flagged = await isFlaggedByModeration(params.text);
      }

      if (flagged) {
        console.info("Skipping OpenAI due to moderation flag, trying next provider.", {
          userId: params.userId ?? "system",
        });
        continue;
      }
    }

    return candidate;
  }

  // All candidates were skipped (only possible if every candidate was OpenAI + flagged,
  // which can't happen since providers are unique). Return last as safety net.
  return candidates[candidates.length - 1];
}

// ────────────────────────── Execute with fallback ──────────────────────────

/**
 * Routes to the best provider, executes the callback, and **automatically
 * retries with the next provider** if the request fails.
 *
 * This is the recommended way to make AI calls — it gives you both
 * moderation-based routing (same as {@link routeResponsesClient}) *and*
 * request-level resilience. The callback receives a {@link RoutedClient}
 * so you can adapt request parameters per-provider (e.g. strip `reasoning`
 * for Grok).
 *
 * @param params - Routing parameters (same shape as {@link routeResponsesClient}).
 * @param fn - Async callback that receives the selected {@link RoutedClient} and
 *   should make the actual API call. If it throws, the next provider is tried.
 * @returns The value returned by `fn` on the first successful call.
 * @throws The error from the **last** provider if all providers fail,
 *   or an `Error` if no providers are configured.
 *
 * @example
 * ```ts
 * const response = await executeWithFallback(
 *   { text: userInput, userId },
 *   async (routed) =>
 *     routed.client.responses.create({
 *       model: routed.model,
 *       input: [{ role: "user", content: userInput }],
 *       ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
 *     }),
 * );
 * ```
 */
export async function executeWithFallback<T>(
  params: RoutingParams,
  fn: (_routed: RoutedClient) => Promise<T>,
): Promise<T> {
  const candidates = buildCandidates(params);
  if (candidates.length === 0) {
    throw new Error("No AI providers configured");
  }

  let lastError: unknown;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // OpenAI moderation gate (same logic as routeResponsesClient)
    // Skip moderation when OpenAI is the only candidate — nowhere to fall back to
    if (candidate.provider === "openai" && candidates.length > 1) {
      const flagged = await isFlaggedByModeration(params.text);
      if (flagged) {
        console.info("Skipping OpenAI due to moderation flag, trying next provider.", {
          userId: params.userId ?? "system",
        });
        continue;
      }
    }

    try {
      return await fn(candidate);
    } catch (err) {
      lastError = err;
      console.warn(
        `Provider ${candidate.provider} (${candidate.model}) failed, trying next provider.`,
        { error: err instanceof Error ? err.message : err, userId: params.userId ?? "system" },
      );
      continue;
    }
  }

  throw lastError;
}
