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

async function loadModule(env?: Record<string, string | undefined>): Promise<RoutingModule> {
  vi.resetModules();

  // Clear all relevant environment variables
  delete process.env.OPENAI_API_KEY;
  delete process.env.GROK_API_KEY;
  delete process.env.GROK_BASE_URL;
  delete process.env.USE_GROK_AS_BACKUP;
  delete process.env.OPENAI_RESPONSES_MODEL;
  delete process.env.GROK_RESPONSES_MODEL;

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
    delete process.env.OPENAI_API_KEY;
    delete process.env.GROK_API_KEY;
    delete process.env.GROK_BASE_URL;
    delete process.env.USE_GROK_AS_BACKUP;
    delete process.env.OPENAI_RESPONSES_MODEL;
    delete process.env.GROK_RESPONSES_MODEL;
  });

  describe("routeResponsesClient", () => {
    it("returns null when no OpenAI API key is configured", async () => {
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
      expect(result?.model).toBe("gpt-5.2");
    });

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

    it("returns OpenAI client when Grok backup is disabled", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "false",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("openai");
      expect(mockModerationCreate).not.toHaveBeenCalled();
    });

    it("returns OpenAI when content is not flagged by moderation", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [{ flagged: false }],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({ text: "Normal content" });

      expect(result?.provider).toBe("openai");
      expect(mockModerationCreate).toHaveBeenCalledTimes(1);
    });

    it("routes to Grok when content is flagged by moderation", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [{ flagged: true }],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-1-fast-non-reasoning");
    });

    it("uses custom Grok model from params when routing to Grok", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [{ flagged: true }],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({
        text: "Flagged content",
        grokModel: "grok-3-mini",
      });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-3-mini");
    });

    it("uses custom Grok model from environment", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [{ flagged: true }],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
        GROK_RESPONSES_MODEL: "grok-4-vision",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("grok");
      expect(result?.model).toBe("grok-4-vision");
    });

    it("falls back to OpenAI when Grok key is not set", async () => {
      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("openai");
      expect(mockModerationCreate).not.toHaveBeenCalled();
    });

    it("falls back to Grok when moderation check fails", async () => {
      mockModerationCreate.mockRejectedValueOnce(new Error("API error"));

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("grok");
    });

    it("handles empty moderation results gracefully", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "true",
      });

      const result = await routeResponsesClient({ text: "Some text" });

      expect(result?.provider).toBe("openai");
    });

    it("is case-insensitive for USE_GROK_AS_BACKUP env var", async () => {
      mockModerationCreate.mockResolvedValueOnce({
        results: [{ flagged: true }],
      });

      const { routeResponsesClient } = await loadModule({
        OPENAI_API_KEY: "test-openai-key",
        GROK_API_KEY: "test-grok-key",
        USE_GROK_AS_BACKUP: "TRUE",
      });

      const result = await routeResponsesClient({ text: "Flagged content" });

      expect(result?.provider).toBe("grok");
    });
  });
});
