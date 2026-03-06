import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockModerationCreate = vi.fn();
const mockOpenAI = vi.fn(() => ({
  moderations: { create: mockModerationCreate },
  responses: { create: vi.fn() },
}));

vi.mock("openai", () => ({
  default: mockOpenAI,
}));

type RoutingModule = typeof import("@/app/services/aiRoutingService");

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GROK_API_KEY",
  "GROK_BASE_URL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENAI_RESPONSES_MODEL",
  "GROK_RESPONSES_MODEL",
  "OPENROUTER_RESPONSES_MODEL",
  "FORCED_AI_PROVIDER",
  "FORCED_AI_MODEL",
];

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

async function loadModule(env?: Record<string, string | undefined>): Promise<RoutingModule> {
  vi.resetModules();
  clearEnv();

  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  }

  return import("@/app/services/aiRoutingService");
}

describe("aiRoutingService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockModerationCreate.mockReset();
  });

  afterEach(() => {
    clearEnv();
  });

  describe("routeResponsesClient", () => {
    // ── Basic routing ──

    it("returns null when no API keys are configured", async () => {
      const { routeResponsesClient } = await loadModule({});

      const result = await routeResponsesClient({ text: "Hello world" });

      expect(result).toBeNull();
    });

    it("returns OpenAI client when only OpenAI key is set", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
      });

      const result = await routeResponsesClient({ text: "Hello world" });

      expect(result).not.toBeNull();
      expect(result?.provider).toBe("openai");
      expect(result?.model).toBe("gpt-5.4");
    });

    it("returns Grok client when only Grok key is set", async () => {
      const { routeResponsesClient } = await loadModule({
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({ text: "Hello world" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-1-fast-non-reasoning");
    });

    it("returns OpenRouter client when only OpenRouter key is set", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENROUTER_API_KEY: "test-or-key",
      });

      const result = await routeResponsesClient({ text: "Hello world" });

      expect(result?.provider).toBe("openrouter");
      expect(result?.model).toBe("openai/gpt-5.4");
    });

    // ── Model selection ──

    it("uses custom OpenAI model from params", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
      });

      const result = await routeResponsesClient({
        text: "Hello world",
        openAiModel: "gpt-4o",
      });

      expect(result?.provider).toBe("openai");
      expect(result?.model).toBe("gpt-4o");
    });

    it("uses custom OpenAI model from environment", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_RESPONSES_MODEL: "gpt-4-turbo",
      });

      const result = await routeResponsesClient({ text: "Hello world" });

      expect(result?.provider).toBe("openai");
      expect(result?.model).toBe("gpt-4-turbo");
    });

    it("uses custom Grok model from params", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({
        text: "Flagged content",
        grokModel: "grok-3-mini",
      });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-3-mini");
    });

    it("uses custom Grok model from environment", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        GROK_RESPONSES_MODEL: "grok-4-vision",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-vision");
    });

    // ── Moderation gating (OpenAI → fallback) ──

    it("returns OpenAI when content is not flagged and fallbacks exist", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({ text: "Normal content" });

      expect(result?.provider).toBe("openai");
      expect(mockModerationCreate).toHaveBeenCalledTimes(1);
    });

    it("falls through to Grok when OpenAI content is flagged", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("grok");
    });

    it("falls through to OpenRouter when OpenAI is flagged and no Grok key", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        OPENROUTER_API_KEY: "test-or-key",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("openrouter");
    });

    it("skips moderation when OpenAI is the only provider (no fallback)", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("openai");
      expect(mockModerationCreate).not.toHaveBeenCalled();
    });

    it("falls through to Grok when moderation API call fails", async () => {
      mockModerationCreate.mockRejectedValueOnce(new Error("API error"));

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("grok");
    });

    it("returns OpenAI when moderation results are empty (not flagged)", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("openai");
    });

    // ── Forced provider (param-level) ──

    it("uses forced provider from params as first choice", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        forcedDefaultModelAndProvider: { model: "grok-custom", provider: "grok" },
      });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-custom");
      expect(mockModerationCreate).not.toHaveBeenCalled();
    });

    it("falls back to next provider when forced provider has no API key", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        // No GROK_API_KEY
      });

      const result = await routeResponsesClient({
        text: "Hello",
        forcedDefaultModelAndProvider: { model: "grok-custom", provider: "grok" },
      });

      // Grok unavailable → falls back to OpenAI (only provider, so no moderation check)
      expect(result?.provider).toBe("openai");
    });

    // ── Forced provider (env-level) ──

    it("uses forced provider from FORCED_AI_PROVIDER env var", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-4-latest",
      });

      const result = await routeResponsesClient({ text: "Hello" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-latest");
    });

    it("falls back from env-forced provider when its API key is missing", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-special",
        // No GROK_API_KEY
      });

      const result = await routeResponsesClient({ text: "Hello" });

      // Grok unavailable → falls back to OpenAI
      expect(result?.provider).toBe("openai");
    });

    it("param-level forced provider takes priority over env-level", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        OPENROUTER_API_KEY: "test-or-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-env-model",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        forcedDefaultModelAndProvider: { model: "or-model", provider: "openrouter" },
      });

      expect(result?.provider).toBe("openrouter");
      expect(result?.model).toBe("or-model");
    });

    it("uses default model for env-forced provider when FORCED_AI_MODEL is not set", async () => {
      const { routeResponsesClient } = await loadModule({
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "grok",
      });

      const result = await routeResponsesClient({ text: "Hello" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-1-fast-non-reasoning");
    });

    it("ignores invalid FORCED_AI_PROVIDER value", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        FORCED_AI_PROVIDER: "invalid-provider",
      });

      const result = await routeResponsesClient({ text: "Hello" });

      expect(result?.provider).toBe("openai");
    });

    // ── Full fallback chain ──

    it("walks the full fallback chain: forced(unavail) → openai(flagged) → grok", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        // No OPENROUTER_API_KEY → forced provider unavailable
        FORCED_AI_PROVIDER: "openrouter",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      // openrouter skipped (no key) → openai skipped (flagged) → grok
      expect(result?.provider).toBe("grok");
    });

    // ── ignoreEnvironmentDefaults ──

    it("ignores env model overrides when ignoreEnvironmentDefaults is true", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_RESPONSES_MODEL: "gpt-4-turbo-custom",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        ignoreEnvironmentDefaults: true,
      });

      expect(result?.provider).toBe("openai");
      // Should use hardcoded fallback, not the env var
      expect(result?.model).toBe("gpt-5.4");
    });

    it("ignores FORCED_AI_PROVIDER env var when ignoreEnvironmentDefaults is true", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-forced",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        ignoreEnvironmentDefaults: true,
      });

      // Should follow default openai→grok→openrouter order, not forced grok
      expect(result?.provider).toBe("openai");
      expect(result?.model).toBe("gpt-5.4");
    });

    it("still honours param-level forcedDefaultModelAndProvider when ignoreEnvironmentDefaults is true", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "openai",
        FORCED_AI_MODEL: "env-model",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        ignoreEnvironmentDefaults: true,
        forcedDefaultModelAndProvider: { model: "grok-custom", provider: "grok" },
      });

      // Param-level forced provider should still be respected
      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-custom");
    });

    it("uses env model overrides when ignoreEnvironmentDefaults is false", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_RESPONSES_MODEL: "gpt-4-turbo-custom",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        ignoreEnvironmentDefaults: false,
      });

      expect(result?.provider).toBe("openai");
      expect(result?.model).toBe("gpt-4-turbo-custom");
    });

    it("defaults ignoreEnvironmentDefaults to false when omitted", async () => {
      const { routeResponsesClient } = await loadModule({
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-env-forced",
      });

      const result = await routeResponsesClient({ text: "Hello" });

      // Env forced provider should still apply when flag is omitted
      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-env-forced");
    });

    it("ignores env model for Grok fallback when ignoreEnvironmentDefaults is true", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        GROK_RESPONSES_MODEL: "grok-env-custom",
      });

      const result = await routeResponsesClient({
        text: "Flagged content",
        ignoreEnvironmentDefaults: true,
      });

      expect(result?.provider).toBe("grok");
      // Should use hardcoded fallback, not env var
      expect(result?.model).toBe("grok-4-1-fast-non-reasoning");
    });

    it("per-call model override still works when ignoreEnvironmentDefaults is true", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        OPENAI_RESPONSES_MODEL: "should-be-ignored",
      });

      const result = await routeResponsesClient({
        text: "Hello",
        openAiModel: "gpt-4o-mini",
        ignoreEnvironmentDefaults: true,
      });

      expect(result?.provider).toBe("openai");
      // Per-call param takes priority over both env and fallback
      expect(result?.model).toBe("gpt-4o-mini");
    });
  });

  describe("executeWithFallback", () => {
    it("returns the result from the first successful provider", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-1" });

      const result = await executeWithFallback({ text: "Hello" }, fn);

      expect(result).toEqual({ id: "resp-1" });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "openai" }),
      );
    });

    it("retries with next provider when the first one fails", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenAI rate limit"))
        .mockResolvedValueOnce({ id: "resp-grok" });

      const result = await executeWithFallback({ text: "Hello" }, fn);

      expect(result).toEqual({ id: "resp-grok" });
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn.mock.calls[0][0].provider).toBe("openai");
      expect(fn.mock.calls[1][0].provider).toBe("grok");
    });

    it("throws the last error when all providers fail", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenAI down"))
        .mockRejectedValueOnce(new Error("Grok down"));

      await expect(executeWithFallback({ text: "Hello" }, fn)).rejects.toThrow("Grok down");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("throws when no providers are configured", async () => {
      const { executeWithFallback } = await loadModule({});

      const fn = vi.fn();

      await expect(executeWithFallback({ text: "Hello" }, fn)).rejects.toThrow(
        "No AI providers configured",
      );
      expect(fn).not.toHaveBeenCalled();
    });

    it("skips moderation-flagged OpenAI and still catches request errors on fallback", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        OPENROUTER_API_KEY: "test-or-key",
      });

      const fn = vi
        .fn()
        // OpenAI is skipped by moderation, so fn is NOT called for it
        .mockRejectedValueOnce(new Error("Grok 500"))
        .mockResolvedValueOnce({ id: "resp-or" });

      const result = await executeWithFallback({ text: "Flagged content" }, fn);

      expect(result).toEqual({ id: "resp-or" });
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn.mock.calls[0][0].provider).toBe("grok");
      expect(fn.mock.calls[1][0].provider).toBe("openrouter");
    });

    it("walks full chain: forced(unavail) → openai(flagged) → grok(error) → openrouter(ok)", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        // No OPENROUTER_API_KEY for forced provider, but set it for fallback
        FORCED_AI_PROVIDER: "openrouter",
      });

      // openrouter skipped (no key) → openai skipped (flagged) → grok is called
      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-grok" });

      const result = await executeWithFallback({ text: "Flagged" }, fn);

      expect(result).toEqual({ id: "resp-grok" });
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0][0].provider).toBe("grok");
    });

    it("passes the correct RoutedClient so callers can adapt per-provider", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockImplementationOnce(async (routed) => {
          // Callers typically do this to strip reasoning for Grok
          return {
            provider: routed.provider,
            hasReasoning: routed.provider !== "grok",
          };
        });

      const result = await executeWithFallback({ text: "Hello" }, fn);

      expect(result).toEqual({ provider: "grok", hasReasoning: false });
    });

    it("does not call moderation when OpenAI is the only provider", async () => {
      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
      });

      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-openai" });

      const result = await executeWithFallback({ text: "Hello" }, fn);

      expect(result).toEqual({ id: "resp-openai" });
      expect(mockModerationCreate).not.toHaveBeenCalled();
    });

    // ── ignoreEnvironmentDefaults ──

    it("ignores FORCED_AI_PROVIDER when ignoreEnvironmentDefaults is true", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "grok",
        FORCED_AI_MODEL: "grok-forced",
      });

      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-openai" });

      const result = await executeWithFallback(
        { text: "Hello", ignoreEnvironmentDefaults: true },
        fn,
      );

      // Should route to OpenAI (default order), not env-forced grok
      expect(result).toEqual({ id: "resp-openai" });
      expect(fn.mock.calls[0][0].provider).toBe("openai");
      expect(fn.mock.calls[0][0].model).toBe("gpt-5.4");
    });

    it("uses hardcoded fallback models when ignoreEnvironmentDefaults is true", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: true }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        GROK_RESPONSES_MODEL: "grok-custom-env",
      });

      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-grok" });

      const result = await executeWithFallback(
        { text: "Flagged", ignoreEnvironmentDefaults: true },
        fn,
      );

      expect(result).toEqual({ id: "resp-grok" });
      // Model should be the hardcoded fallback, not env override
      expect(fn.mock.calls[0][0].provider).toBe("grok");
      expect(fn.mock.calls[0][0].model).toBe("grok-4-1-fast-non-reasoning");
    });

    it("still honours param-level forced provider when ignoreEnvironmentDefaults is true", async () => {
      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        FORCED_AI_PROVIDER: "openai",
      });

      const fn = vi.fn().mockResolvedValueOnce({ id: "resp-grok" });

      const result = await executeWithFallback(
        {
          text: "Hello",
          ignoreEnvironmentDefaults: true,
          forcedDefaultModelAndProvider: { model: "grok-param", provider: "grok" },
        },
        fn,
      );

      expect(result).toEqual({ id: "resp-grok" });
      expect(fn.mock.calls[0][0].provider).toBe("grok");
      expect(fn.mock.calls[0][0].model).toBe("grok-param");
    });

    it("retries with fallback using hardcoded models when ignoreEnvironmentDefaults is true", async () => {
      mockModerationCreate.mockResolvedValueOnce({ results: [{ flagged: false }] });

      const { executeWithFallback } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        OPENAI_RESPONSES_MODEL: "custom-openai",
        GROK_RESPONSES_MODEL: "custom-grok",
      });

      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("OpenAI fail"))
        .mockResolvedValueOnce({ id: "resp-grok" });

      const result = await executeWithFallback(
        { text: "Hello", ignoreEnvironmentDefaults: true },
        fn,
      );

      expect(result).toEqual({ id: "resp-grok" });
      // First call: OpenAI with hardcoded fallback
      expect(fn.mock.calls[0][0].provider).toBe("openai");
      expect(fn.mock.calls[0][0].model).toBe("gpt-5.4");
      // Second call: Grok with hardcoded fallback
      expect(fn.mock.calls[1][0].provider).toBe("grok");
      expect(fn.mock.calls[1][0].model).toBe("grok-4-1-fast-non-reasoning");
    });
  });
});
