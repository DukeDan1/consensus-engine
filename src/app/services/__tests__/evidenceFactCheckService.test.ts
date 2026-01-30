import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceItem } from "@/app/lib/evidence";

// Mock dependencies
const getSignedReadUrlFromUrlMock = vi.hoisted(() => vi.fn());
const openaiMock = vi.hoisted(() => ({
  responses: {
    create: vi.fn(),
  },
}));
const routeResponsesClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/services/gcsService", () => ({
  getSignedReadUrlFromUrl: getSignedReadUrlFromUrlMock,
}));

vi.mock("openai", () => ({
  default: vi.fn(() => openaiMock),
}));

vi.mock("@/app/services/aiRoutingService", () => ({
  routeResponsesClient: routeResponsesClientMock,
}));

// Mock fetch globally
global.fetch = vi.fn();

import {
  calculateEvidenceRankScore,
  factCheckEvidenceItems,
  effectiveScore,
} from "@/app/services/evidenceFactCheckService";

describe("evidenceFactCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSignedReadUrlFromUrlMock.mockResolvedValue("https://signed.url/file.pdf");
    // Set environment variable to enable fact checking
    process.env.OPENAI_API_KEY = "test-key";
    process.env.EVIDENCE_FACT_CHECK_ENABLED = "true";
    // Mock routing to return OpenAI client
    routeResponsesClientMock.mockResolvedValue({
      client: openaiMock,
      model: "gpt-5.2",
      provider: "openai",
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.EVIDENCE_FACT_CHECK_ENABLED;
  });

  describe("calculateEvidenceRankScore", () => {
    it("returns 0 for empty evidence array", () => {
      expect(calculateEvidenceRankScore([])).toBe(0);
    });

    it("calculates positive score for verified evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/source",
          kind: "link",
          factCheck: {
            verdict: "verified",
            qualityScore: 90,
            confidence: 0.9,
            summary: "High quality source",
            checkedAt: new Date(),
          },
        },
      ];
      const score = calculateEvidenceRankScore(evidence);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(20);
    });

    it("calculates negative score for inaccurate evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/bad",
          kind: "link",
          factCheck: {
            verdict: "inaccurate",
            qualityScore: 20,
            confidence: 0.8,
            summary: "Unreliable source",
            checkedAt: new Date(),
          },
        },
      ];
      const score = calculateEvidenceRankScore(evidence);
      expect(score).toBeLessThan(0);
      expect(score).toBeGreaterThanOrEqual(-25);
    });

    it("calculates mixed score for mixed evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/mixed",
          kind: "link",
          factCheck: {
            verdict: "mixed",
            qualityScore: 50,
            confidence: 0.6,
            summary: "Partially reliable",
            checkedAt: new Date(),
          },
        },
      ];
      const score = calculateEvidenceRankScore(evidence);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(10);
    });

    it("returns 0 for unverified evidence", () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/unknown",
          kind: "link",
          factCheck: {
            verdict: "unverified",
            qualityScore: 50,
            confidence: 0.3,
            summary: "Cannot verify",
            checkedAt: new Date(),
          },
        },
      ];
      expect(calculateEvidenceRankScore(evidence)).toBe(0);
    });

    it("clamps total score between -25 and 20", () => {
      const manyVerified: EvidenceItem[] = Array(10).fill({
        url: "https://example.com/good",
        kind: "link",
        factCheck: {
          verdict: "verified",
          qualityScore: 100,
          confidence: 1,
          summary: "Excellent",
          checkedAt: new Date(),
        },
      });
      expect(calculateEvidenceRankScore(manyVerified)).toBe(20);

      const manyInaccurate: EvidenceItem[] = Array(10).fill({
        url: "https://example.com/bad",
        kind: "link",
        factCheck: {
          verdict: "inaccurate",
          qualityScore: 0,
          confidence: 1,
          summary: "False",
          checkedAt: new Date(),
        },
      });
      expect(calculateEvidenceRankScore(manyInaccurate)).toBe(-25);
    });
  });

  describe("effectiveScore", () => {
    it("combines base score and evidence rank score", () => {
      expect(effectiveScore(10, 5)).toBe(15);
      expect(effectiveScore(0, 10)).toBe(10);
      expect(effectiveScore(20, -5)).toBe(15);
    });

    it("handles undefined values", () => {
      expect(effectiveScore(undefined, 5)).toBe(5);
      expect(effectiveScore(10, undefined)).toBe(10);
      expect(effectiveScore(undefined, undefined)).toBe(0);
    });
  });

  describe("factCheckEvidenceItems", () => {
    const userId = "user-1";

    beforeEach(() => {
      // Mock successful OpenAI response
      openaiMock.responses.create.mockResolvedValue({
        output: [
          {
            type: "function_call",
            arguments: JSON.stringify({
              verdict: "verified",
              qualityScore: 85,
              confidence: 0.8,
              summary: "Reliable source",
            }),
          },
        ],
      });

      // Mock successful fetch
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => new ArrayBuffer(100),
      });
    });

    it("returns empty result for empty array", async () => {
      const result = await factCheckEvidenceItems([], userId);
      expect(result.evidence).toEqual([]);
      expect(result.evidenceRankScore).toBe(0);
    });

    it("skips items already checked", async () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/checked",
          kind: "link",
          factCheck: {
            verdict: "verified",
            checkedAt: new Date(),
            summary: "Already checked",
          },
        },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0]).toEqual(evidence[0]);
      expect(openaiMock.responses.create).not.toHaveBeenCalled();
    });

    it("blocks private IP addresses (SSRF protection)", async () => {
      const privateUrls: EvidenceItem[] = [
        { url: "http://localhost/secret", kind: "link" },
        { url: "http://127.0.0.1/internal", kind: "link" },
        { url: "http://192.168.1.1/router", kind: "link" },
        { url: "http://10.0.0.1/private", kind: "link" },
        { url: "http://169.254.169.254/metadata", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(privateUrls, userId);
      
      expect(result.evidence).toHaveLength(5);
      result.evidence.forEach((item) => {
        expect(item.factCheck?.verdict).toBe("unverified");
        expect(item.factCheck?.summary).toContain("security");
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("blocks non-http protocols", async () => {
      const evidence: EvidenceItem[] = [
        { url: "file:///etc/passwd", kind: "link" },
        { url: "ftp://example.com/file", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      expect(result.evidence).toHaveLength(2);
      result.evidence.forEach((item) => {
        expect(item.factCheck?.verdict).toBe("unverified");
        expect(item.factCheck?.summary).toBe("Unsupported URL scheme.");
      });
    });

    it("processes link evidence in parallel", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => {
          const encoder = new TextEncoder();
          return encoder.encode("<html><body>Test content</body></html>").buffer;
        },
      });

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/1", kind: "link" },
        { url: "https://example.com/2", kind: "link" },
        { url: "https://example.com/3", kind: "link" },
      ];

      const startTime = Date.now();
      const result = await factCheckEvidenceItems(evidence, userId);
      const duration = Date.now() - startTime;

      expect(result.evidence).toHaveLength(3);
      expect(openaiMock.responses.create).toHaveBeenCalledTimes(3);
      // Should be faster than sequential (< 1000ms for parallel vs > 3000ms for sequential)
      expect(duration).toBeLessThan(1000);
    });

    it("handles PDF file evidence", async () => {
      const evidence: EvidenceItem[] = [
        {
          url: "https://example.com/file.pdf",
          kind: "file",
          contentType: "application/pdf",
          fileName: "paper.pdf",
        },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].factCheck).toBeDefined();
      expect(result.evidence[0].factCheck?.verdict).toBe("verified");
    });

    it("handles fetch failures gracefully", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Network error"));

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/broken", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].factCheck?.verdict).toBe("unverified");
      expect(result.evidence[0].factCheck?.summary).toBe("Fact check failed.");
    });

    it("handles OpenAI API failures gracefully", async () => {
      openaiMock.responses.create.mockRejectedValue(new Error("API error"));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => {
          const encoder = new TextEncoder();
          return encoder.encode("<html>Content</html>").buffer;
        },
      });

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/test", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].factCheck?.verdict).toBe("unverified");
      // When OpenAI fails during processing, it catches and returns "Fact check failed."
      expect(result.evidence[0].factCheck?.summary).toMatch(/Fact check failed|Unable to verify/);
    });

    it("strips HTML and extracts text content", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => {
          const encoder = new TextEncoder();
          const html = `
            <html>
              <head><script>alert('xss')</script></head>
              <body>
                <h1>Title</h1>
                <p>This is the actual content.</p>
                <style>.hidden { display: none; }</style>
              </body>
            </html>
          `;
          return encoder.encode(html).buffer;
        },
      });

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/article", kind: "link" },
      ];

      await factCheckEvidenceItems(evidence, userId);

      // Verify OpenAI was called with HTML stripped
      expect(openaiMock.responses.create).toHaveBeenCalled();
      if (openaiMock.responses.create.mock.calls.length > 0) {
        const callArgs = openaiMock.responses.create.mock.calls[0][0];
        const userMessage = callArgs.input.find((msg: any) => msg.role === "user");
        const textContent = userMessage.content[0].text;

        expect(callArgs.safety_identifier).toBe(userId);
        expect(textContent).toContain("Title");
        expect(textContent).toContain("actual content");
        expect(textContent).not.toContain("<script>");
        expect(textContent).not.toContain("<style>");
        expect(textContent).not.toContain("alert");
      }
    });

    it("includes claim context when provided", async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => {
          const encoder = new TextEncoder();
          return encoder.encode("<html><body>Evidence content</body></html>").buffer;
        },
      });

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/claim", kind: "link" },
      ];

      await factCheckEvidenceItems(evidence, userId, { claimText: "Claim: The sky is blue." });

      expect(openaiMock.responses.create).toHaveBeenCalled();
      const callArgs = openaiMock.responses.create.mock.calls[0][0];
      const userMessage = callArgs.input.find((msg: any) => msg.role === "user");
      const textContent = userMessage.content[0].text;
      expect(textContent).toContain("Claim/Context: Claim: The sky is blue.");
    });

    it("rejects oversized content", async () => {
      (global.fetch as any).mockRejectedValue(new Error("Content too large"));

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/huge", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0].factCheck?.verdict).toBe("unverified");
      expect(result.evidence[0].factCheck?.summary).toBe("Fact check failed.");
    });

    it("calculates correct evidenceRankScore from results", async () => {
      openaiMock.responses.create
        .mockResolvedValueOnce({
          output: [
            {
              type: "function_call",
              arguments: JSON.stringify({
                verdict: "verified",
                qualityScore: 90,
                confidence: 0.9,
                summary: "Good source",
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          output: [
            {
              type: "function_call",
              arguments: JSON.stringify({
                verdict: "inaccurate",
                qualityScore: 20,
                confidence: 0.8,
                summary: "Bad source",
              }),
            },
          ],
        });

      (global.fetch as any).mockResolvedValue({
        ok: true,
        headers: new Map([["content-type", "text/html"]]),
        arrayBuffer: async () => {
          const encoder = new TextEncoder();
          return encoder.encode("<html>Content</html>").buffer;
        },
      });

      const evidence: EvidenceItem[] = [
        { url: "https://example.com/good", kind: "link" },
        { url: "https://example.com/bad", kind: "link" },
      ];

      const result = await factCheckEvidenceItems(evidence, userId);
      
      // Should have mixed scores: verified (+10-15) and inaccurate (-18 to -23)
      expect(result.evidenceRankScore).toBeLessThanOrEqual(0);
      expect(result.evidenceRankScore).toBeGreaterThanOrEqual(-25);
      expect(result.evidenceRankScore).toBeLessThan(20);
    });
  });
});
