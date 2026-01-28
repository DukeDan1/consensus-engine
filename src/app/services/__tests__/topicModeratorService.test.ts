import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

// Mock dependencies - use vi.hoisted to ensure proper hoisting
const mockTopicFindById = vi.hoisted(() => vi.fn());
const mockTopicFindByIdAndUpdate = vi.hoisted(() => vi.fn());
const mockArgumentCountDocuments = vi.hoisted(() => vi.fn());
const mockArgumentAggregate = vi.hoisted(() => vi.fn());
const mockCommentCountDocuments = vi.hoisted(() => vi.fn());
const mockCommentAggregate = vi.hoisted(() => vi.fn());
const mockUserFindById = vi.hoisted(() => vi.fn());

vi.mock("@/app/models/topic", () => ({
  default: {
    findById: mockTopicFindById,
    findByIdAndUpdate: mockTopicFindByIdAndUpdate,
  },
}));

vi.mock("@/app/models/argument", () => ({
  default: {
    countDocuments: mockArgumentCountDocuments,
    aggregate: mockArgumentAggregate,
  },
}));

vi.mock("@/app/models/comment", () => ({
  default: {
    countDocuments: mockCommentCountDocuments,
    aggregate: mockCommentAggregate,
  },
}));

vi.mock("@/app/models/user", () => ({
  default: {
    findById: mockUserFindById,
  },
}));

import {
  hasTopicModeratorRole,
  maybeAutoPromoteModerator,
  maybeDemoteModeratorForTopic,
} from "@/app/services/topicModeratorService";

describe("topicModeratorService", () => {
  const userId = new mongoose.Types.ObjectId().toString();
  const topicId = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    mockTopicFindByIdAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    mockArgumentAggregate.mockResolvedValue([]);
    mockCommentAggregate.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("hasTopicModeratorRole", () => {
    it("returns false for null topic", () => {
      expect(hasTopicModeratorRole(null, userId)).toBe(false);
    });

    it("returns false for null userId", () => {
      const topic = { moderators: [userId] };
      expect(hasTopicModeratorRole(topic, "")).toBe(false);
    });

    it("returns false when moderators array is empty", () => {
      const topic = { moderators: [] };
      expect(hasTopicModeratorRole(topic, userId)).toBe(false);
    });

    it("returns false when user is not in moderators list", () => {
      const otherUserId = new mongoose.Types.ObjectId().toString();
      const topic = { moderators: [new mongoose.Types.ObjectId(otherUserId)] };
      expect(hasTopicModeratorRole(topic, userId)).toBe(false);
    });

    it("returns true when user is in moderators list (ObjectId)", () => {
      const topic = { moderators: [new mongoose.Types.ObjectId(userId)] };
      expect(hasTopicModeratorRole(topic, userId)).toBe(true);
    });

    it("returns true when user is in moderators list (string)", () => {
      const topic = { moderators: [userId] };
      expect(hasTopicModeratorRole(topic, userId)).toBe(true);
    });

    it("handles topic without moderators property", () => {
      const topic = {};
      expect(hasTopicModeratorRole(topic, userId)).toBe(false);
    });
  });

  describe("maybeAutoPromoteModerator", () => {
    const mockUser = {
      _id: new mongoose.Types.ObjectId(userId),
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
      trustTier: "trusted",
      trustScore: 85,
      isAdmin: false,
    };

    const mockTopic = {
      _id: new mongoose.Types.ObjectId(topicId),
      moderators: [],
      createdBy: new mongoose.Types.ObjectId(),
      autoModeratorEnabled: true,
    };

    it("returns not promoted when userId is missing", async () => {
      const result = await maybeAutoPromoteModerator({ userId: "", topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when topicId is missing", async () => {
      const result = await maybeAutoPromoteModerator({ userId, topicId: "" });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user not found", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(null),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when topic not found", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(null),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user is admin", async () => {
      const adminUser = { ...mockUser, isAdmin: true };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(adminUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when autoModeratorEnabled is false", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ ...mockTopic, autoModeratorEnabled: false }),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user is already a moderator", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            ...mockTopic,
            moderators: [new mongoose.Types.ObjectId(userId)],
          }),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user trust tier is low", async () => {
      const lowTrustUser = { ...mockUser, trustTier: "low", trustScore: 20 };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(lowTrustUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user trust tier is new", async () => {
      const newUser = { ...mockUser, trustTier: "new", trustScore: 40 };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(newUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when user account is too new", async () => {
      const recentUser = {
        ...mockUser,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
      };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(recentUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("returns not promoted when global activity is insufficient", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });
      mockArgumentCountDocuments.mockResolvedValue(10);
      mockCommentCountDocuments.mockResolvedValue(10);

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(false);
    });

    it("promotes user who is the topic creator with sufficient activity", async () => {
      const creatorTopic = {
        ...mockTopic,
        createdBy: new mongoose.Types.ObjectId(userId),
      };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(creatorTopic),
        }),
      });
      mockArgumentCountDocuments.mockResolvedValue(30);
      mockCommentCountDocuments.mockResolvedValue(25);

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(true);
      expect(mockTopicFindByIdAndUpdate).toHaveBeenCalled();
    });

    it("promotes user with high topic activity", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });
      // Global activity >= 50
      mockArgumentCountDocuments.mockResolvedValueOnce(30).mockResolvedValueOnce(10);
      mockCommentCountDocuments.mockResolvedValue(25);
      // Topic activity >= 5 (returned via aggregate)
      mockCommentAggregate.mockResolvedValue([{ count: 5 }]);

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(true);
    });

    it("promotes user in early-activity topic (< 5 total posts)", async () => {
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockUser),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(mockTopic),
        }),
      });
      // Global activity >= 50
      mockArgumentCountDocuments
        .mockResolvedValueOnce(30) // global args
        .mockResolvedValueOnce(0) // user topic args
        .mockResolvedValueOnce(2); // total topic args
      mockCommentCountDocuments.mockResolvedValue(25);
      mockCommentAggregate.mockResolvedValue([{ count: 0 }]);

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(true);
    });

    it("handles users with high trust score but no tier set", async () => {
      const userWithScore = { ...mockUser, trustTier: undefined, trustScore: 92 };
      mockUserFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(userWithScore),
        }),
      });
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            ...mockTopic,
            createdBy: new mongoose.Types.ObjectId(userId),
          }),
        }),
      });
      mockArgumentCountDocuments.mockResolvedValue(30);
      mockCommentCountDocuments.mockResolvedValue(25);

      const result = await maybeAutoPromoteModerator({ userId, topicId });
      expect(result.promoted).toBe(true);
    });
  });

  describe("maybeDemoteModeratorForTopic", () => {
    it("returns not demoted when userId is missing", async () => {
      const result = await maybeDemoteModeratorForTopic({ userId: "", topicId });
      expect(result.demoted).toBe(false);
    });

    it("returns not demoted when topicId is missing", async () => {
      const result = await maybeDemoteModeratorForTopic({ userId, topicId: "" });
      expect(result.demoted).toBe(false);
    });

    it("returns not demoted when topic not found", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve(null),
        }),
      });

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(false);
    });

    it("returns not demoted when user is not a moderator", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({ moderators: [] }),
        }),
      });

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(false);
    });

    it("returns not demoted when total votes below threshold", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            moderators: [new mongoose.Types.ObjectId(userId)],
          }),
        }),
      });
      mockArgumentAggregate.mockResolvedValue([{ upvotes: 10, downvotes: 5 }]);
      mockCommentAggregate.mockResolvedValue([{ upvotes: 5, downvotes: 3 }]);

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(false);
      expect(result.totalVotes).toBe(23);
    });

    it("returns not demoted when downvote ratio is acceptable", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            moderators: [new mongoose.Types.ObjectId(userId)],
          }),
        }),
      });
      // 60 upvotes, 15 downvotes = 20% downvote ratio (acceptable)
      mockArgumentAggregate.mockResolvedValue([{ upvotes: 40, downvotes: 10 }]);
      mockCommentAggregate.mockResolvedValue([{ upvotes: 20, downvotes: 5 }]);

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(false);
      expect(result.downvoteRatio).toBeCloseTo(0.2, 2);
    });

    it("demotes moderator with high downvote ratio", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            moderators: [new mongoose.Types.ObjectId(userId)],
          }),
        }),
      });
      // 30 upvotes, 30 downvotes = 50% downvote ratio (exceeds 40% threshold)
      mockArgumentAggregate.mockResolvedValue([{ upvotes: 20, downvotes: 20 }]);
      mockCommentAggregate.mockResolvedValue([{ upvotes: 10, downvotes: 10 }]);

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(true);
      expect(result.totalVotes).toBe(60);
      expect(result.downvoteRatio).toBe(0.5);
      expect(mockTopicFindByIdAndUpdate).toHaveBeenCalledWith(
        topicId,
        { $pull: { moderators: expect.any(mongoose.Types.ObjectId) } }
      );
    });

    it("handles empty aggregation results", async () => {
      mockTopicFindById.mockReturnValue({
        select: () => ({
          lean: () => Promise.resolve({
            moderators: [new mongoose.Types.ObjectId(userId)],
          }),
        }),
      });
      mockArgumentAggregate.mockResolvedValue([]);
      mockCommentAggregate.mockResolvedValue([]);

      const result = await maybeDemoteModeratorForTopic({ userId, topicId });
      expect(result.demoted).toBe(false);
      expect(result.totalVotes).toBe(0);
    });
  });
});
