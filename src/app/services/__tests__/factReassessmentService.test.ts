import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Hoisted mocks ──
const mockFactVoteFind = vi.hoisted(() => vi.fn());
const mockExecuteWithFallback = vi.hoisted(() => vi.fn());
const mockTopicFindById = vi.hoisted(() => vi.fn());

vi.mock("@/app/models/factVote", () => ({
  __esModule: true,
  default: { find: mockFactVoteFind },
}));

vi.mock("@/app/services/aiRoutingService", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("@/app/models/topic", () => ({
  __esModule: true,
  default: { findById: mockTopicFindById },
}));

import {
  reassessFact,
  factNeedsReassessment,
  factNeedsReassessmentWithComments,
} from "@/app/services/factReassessmentService";

function findChain<T>(value: T) {
  const chain: any = {
    sort: vi.fn(),
    limit: vi.fn(),
    select: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  chain.exec.mockResolvedValue(value);
  chain.then = (onFulfilled: any, onRejected: any) =>
    Promise.resolve(value).then(onFulfilled, onRejected);
  return chain;
}

function makeFact(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => "fact-id-1" },
    text: "Test fact text",
    topic: { toString: () => "topic-id-1" },
    upvoteCount: 5,
    downvoteCount: 3,
    score: 2,
    status: "active",
    lastCheckedAt: null,
    lastCheckedUpvoteCount: 0,
    lastCheckedDownvoteCount: 0,
    lastCheckedCommentCount: 0,
    reassessmentHistory: [],
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("factReassessmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTopicFindById.mockReturnValue(findChain({ title: "Test topic" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("factNeedsReassessment", () => {
    it("returns true when 10+ new votes since last check", () => {
      const fact = makeFact({
        upvoteCount: 15,
        downvoteCount: 5,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
      });
      expect(factNeedsReassessment(fact as any)).toBe(true);
    });

    it("returns false when fewer than 10 new votes", () => {
      const fact = makeFact({
        upvoteCount: 8,
        downvoteCount: 3,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
      });
      expect(factNeedsReassessment(fact as any)).toBe(false);
    });

    it("returns false when no changes at all", () => {
      const fact = makeFact({
        upvoteCount: 5,
        downvoteCount: 3,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
      });
      expect(factNeedsReassessment(fact as any)).toBe(false);
    });

    it("returns true when exactly 10 new votes", () => {
      const fact = makeFact({
        upvoteCount: 10,
        downvoteCount: 3,
        lastCheckedUpvoteCount: 2,
        lastCheckedDownvoteCount: 1,
      });
      expect(factNeedsReassessment(fact as any)).toBe(true);
    });
  });

  describe("factNeedsReassessmentWithComments", () => {
    it("returns true when 10+ new votes since last check", () => {
      const fact = makeFact({
        upvoteCount: 15,
        downvoteCount: 5,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
      });
      expect(factNeedsReassessmentWithComments(fact as any, 0)).toBe(true);
    });

    it("returns true when new rationale comment added", () => {
      const fact = makeFact({
        upvoteCount: 5,
        downvoteCount: 3,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
        lastCheckedCommentCount: 2,
      });
      expect(factNeedsReassessmentWithComments(fact as any, 3)).toBe(true);
    });

    it("returns false when no new votes or comments", () => {
      const fact = makeFact({
        upvoteCount: 5,
        downvoteCount: 3,
        lastCheckedUpvoteCount: 5,
        lastCheckedDownvoteCount: 3,
        lastCheckedCommentCount: 2,
      });
      expect(factNeedsReassessmentWithComments(fact as any, 2)).toBe(false);
    });

    it("returns true with zero last-checked and any new comments", () => {
      const fact = makeFact({
        upvoteCount: 0,
        downvoteCount: 0,
        lastCheckedUpvoteCount: 0,
        lastCheckedDownvoteCount: 0,
        lastCheckedCommentCount: 0,
      });
      expect(factNeedsReassessmentWithComments(fact as any, 1)).toBe(true);
    });
  });

  describe("reassessFact", () => {
    it("calls AI and updates fact when action is 'kept'", async () => {
      mockFactVoteFind.mockReturnValue(
        findChain([
          { value: 1, reason: "Good fact" },
          { value: -1, reason: "Slightly inaccurate" },
        ])
      );

      mockExecuteWithFallback.mockImplementation(async (_params: any, fn: any) => {
        return fn({
          client: {
            responses: {
              create: vi.fn().mockResolvedValue({
                output: [
                  {
                    type: "function_call",
                    arguments: JSON.stringify({
                      action: "kept",
                      updatedText: "Test fact text",
                      rationale: "The fact is accurate based on external sources.",
                    }),
                  },
                ],
              }),
            },
          },
          model: "gpt-5.2",
          provider: "openai",
        });
      });

      const fact = makeFact();
      const result = await reassessFact(fact as any, "system");

      expect(result.action).toBe("kept");
      expect(result.rationale).toBe("The fact is accurate based on external sources.");
      expect(fact.save).toHaveBeenCalled();
      expect(fact.reassessmentHistory).toHaveLength(1);
      expect(fact.reassessmentHistory[0].action).toBe("kept");
      expect(fact.reassessmentHistory[0].triggeredBy).toBe("system");
      expect(fact.lastCheckedAt).toBeInstanceOf(Date);
    });

    it("updates fact text when action is 'updated'", async () => {
      mockFactVoteFind.mockReturnValue(findChain([]));

      mockExecuteWithFallback.mockImplementation(async (_params: any, fn: any) => {
        return fn({
          client: {
            responses: {
              create: vi.fn().mockResolvedValue({
                output: [
                  {
                    type: "function_call",
                    arguments: JSON.stringify({
                      action: "updated",
                      updatedText: "Updated fact text with corrections",
                      rationale: "The original text was slightly inaccurate.",
                    }),
                  },
                ],
              }),
            },
          },
          model: "gpt-5.2",
          provider: "openai",
        });
      });

      const fact = makeFact();
      const result = await reassessFact(fact as any, "moderator", "507f1f77bcf86cd799439033");

      expect(result.action).toBe("updated");
      expect(result.updatedText).toBe("Updated fact text with corrections");
      expect(fact.text).toBe("Updated fact text with corrections");
      expect(fact.reassessmentHistory[0].previousText).toBe("Test fact text");
      expect(fact.save).toHaveBeenCalled();
    });

    it("removes fact when action is 'removed'", async () => {
      mockFactVoteFind.mockReturnValue(findChain([]));

      mockExecuteWithFallback.mockImplementation(async (_params: any, fn: any) => {
        return fn({
          client: {
            responses: {
              create: vi.fn().mockResolvedValue({
                output: [
                  {
                    type: "function_call",
                    arguments: JSON.stringify({
                      action: "removed",
                      updatedText: "",
                      rationale: "The fact is demonstrably false.",
                    }),
                  },
                ],
              }),
            },
          },
          model: "gpt-5.2",
          provider: "openai",
        });
      });

      const fact = makeFact();
      const result = await reassessFact(fact as any, "system");

      expect(result.action).toBe("removed");
      expect(fact.status).toBe("removed");
      expect(fact.removedAt).toBeInstanceOf(Date);
      expect(fact.removalReason).toContain("AI reassessment");
      expect(fact.save).toHaveBeenCalled();
    });

    it("records vote counts at time of check", async () => {
      mockFactVoteFind.mockReturnValue(findChain([{ value: 1, reason: "Good" }]));

      mockExecuteWithFallback.mockImplementation(async (_params: any, fn: any) => {
        return fn({
          client: {
            responses: {
              create: vi.fn().mockResolvedValue({
                output: [
                  {
                    type: "function_call",
                    arguments: JSON.stringify({
                      action: "kept",
                      updatedText: "Test fact text",
                      rationale: "Accurate.",
                    }),
                  },
                ],
              }),
            },
          },
          model: "gpt-5.2",
          provider: "openai",
        });
      });

      const fact = makeFact({ upvoteCount: 10, downvoteCount: 3 });
      await reassessFact(fact as any, "system");

      expect(fact.lastCheckedUpvoteCount).toBe(10);
      expect(fact.lastCheckedDownvoteCount).toBe(3);
      expect(fact.lastCheckedCommentCount).toBe(1);
    });
  });
});
