import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResponsesCreate = vi.fn();
const mockRouteResponsesClient = vi.fn();

vi.mock("@/app/services/aiRoutingService", () => ({
  routeResponsesClient: mockRouteResponsesClient,
}));

type ContentFactCheckModule = typeof import("@/app/services/contentFactCheckService");

async function loadModule(env?: Record<string, string | undefined>): Promise<ContentFactCheckModule> {
  vi.resetModules();

  delete process.env.CONTENT_FACT_CHECK_ENABLED;
  delete process.env.OPENAI_RESPONSES_MODEL;
  delete process.env.GROK_RESPONSES_MODEL;

  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  }

  return import("@/app/services/contentFactCheckService");
}

describe("contentFactCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResponsesCreate.mockReset();
    mockRouteResponsesClient.mockReset();
  });

  afterEach(() => {
    delete process.env.CONTENT_FACT_CHECK_ENABLED;
    delete process.env.OPENAI_RESPONSES_MODEL;
    delete process.env.GROK_RESPONSES_MODEL;
  });

  describe("factCheckPostContent", () => {
    it("returns unverified when fact checking is disabled", async () => {
      const { factCheckPostContent } = await loadModule({
        CONTENT_FACT_CHECK_ENABLED: "false",
      });

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("Fact checking unavailable.");
      expect(result.model).toBe("disabled");
      expect(mockRouteResponsesClient).not.toHaveBeenCalled();
    });

    it("returns unverified for empty text", async () => {
      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("No content to check.");
      expect(result.model).toBe("disabled");
    });

    it("returns unverified for whitespace-only text", async () => {
      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "   \n\t  " });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("No content to check.");
    });

    it("returns unverified when routing returns null", async () => {
      mockRouteResponsesClient.mockResolvedValueOnce(null);

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("Fact checking unavailable.");
      expect(result.model).toBe("disabled");
    });

    it("calls API and parses verified verdict correctly", async () => {
      const mockClient = {
        responses: {
          create: mockResponsesCreate,
        },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              confidence: 0.95,
              summary: "This is a factual claim.",
              sources: [
                {
                  title: "Wikipedia",
                  url: "https://en.wikipedia.org/wiki/Example",
                  snippet: "Supporting evidence",
                },
              ],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({
        text: "The sky is blue.",
        contentType: "argument",
        topicTitle: "Science",
        userId: "user-123",
      });

      expect(result.verdict).toBe("verified");
      expect(result.confidence).toBe(0.95);
      expect(result.summary).toBe("This is a factual claim.");
      expect(result.sources).toHaveLength(1);
      expect(result.sources![0].url).toBe("https://en.wikipedia.org/wiki/Example");
      expect(result.model).toBe("gpt-5.2");
      expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it("parses inaccurate verdict correctly", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "inaccurate",
              confidence: 0.88,
              summary: "This claim is false.",
              sources: [
                {
                  title: "Fact Check",
                  url: "https://factcheck.org/example",
                  snippet: "This claim has been debunked.",
                },
              ],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "False claim" });

      expect(result.verdict).toBe("inaccurate");
      expect(result.confidence).toBe(0.88);
    });

    it("parses mixed verdict correctly", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "mixed",
              confidence: 0.6,
              summary: "Partially true.",
              sources: [],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Partial claim" });

      expect(result.verdict).toBe("mixed");
    });

    it("normalises unknown verdict to unverified", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "unknown-value",
              confidence: 0.5,
              summary: "Test",
              sources: [],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
    });

    it("clamps confidence values to 0-1 range", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              confidence: 1.5,
              summary: "High confidence",
              sources: [],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.confidence).toBe(1);
    });

    it("handles missing function call in response", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("Unable to verify this post right now.");
    });

    it("handles invalid JSON in function call arguments", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: "invalid json {",
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("Unable to verify this post right now.");
    });

    it("handles API errors gracefully", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockRejectedValueOnce(new Error("API Error"));

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.verdict).toBe("unverified");
      expect(result.summary).toBe("Fact check failed.");
      expect(result.model).toBe("gpt-5.2");
    });

    it("filters out sources without URLs", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              confidence: 0.9,
              summary: "Valid claim",
              sources: [
                { title: "Source 1", url: "https://example.com", snippet: "Good" },
                { title: "Source 2", url: "", snippet: "No URL" },
                { title: "Source 3", url: null, snippet: "Null URL" },
                { title: "Source 4", url: "https://example2.com", snippet: "Also good" },
              ],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.sources).toHaveLength(2);
      expect(result.sources![0].url).toBe("https://example.com");
      expect(result.sources![1].url).toBe("https://example2.com");
    });

    it("handles non-array sources gracefully", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              confidence: 0.9,
              summary: "Valid claim",
              sources: "not an array",
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      const result = await factCheckPostContent({ text: "Some claim" });

      expect(result.sources).toEqual([]);
    });

    it("includes context in API call", async () => {
      const mockClient = {
        responses: { create: mockResponsesCreate },
      };
      mockRouteResponsesClient.mockResolvedValueOnce({
        client: mockClient,
        model: "gpt-5.2",
        provider: "openai",
      });
      mockResponsesCreate.mockResolvedValueOnce({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              confidence: 0.9,
              summary: "Valid",
              sources: [],
            }),
          },
        ],
      });

      const { factCheckPostContent } = await loadModule({});

      await factCheckPostContent({
        text: "Climate change is real.",
        contentType: "argument",
        topicTitle: "Climate Science",
        context: "Scientific debate",
        userId: "user-456",
      });

      expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
      const callArgs = mockResponsesCreate.mock.calls[0][0];
      const userMessage = callArgs.input.find((msg: any) => msg.role === "user");
      expect(userMessage.content).toContain("Content type: argument");
      expect(userMessage.content).toContain("Topic: Climate Science");
      expect(userMessage.content).toContain("Context: Scientific debate");
    });
  });
});
