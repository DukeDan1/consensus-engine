import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';

// Mock dependencies using vi.hoisted for proper hoisting
const mockUserFindById = vi.hoisted(() => vi.fn());
const mockUserFindOneAndUpdate = vi.hoisted(() => vi.fn());
const mockTopicFind = vi.hoisted(() => vi.fn());
const mockTopicUpdateMany = vi.hoisted(() => vi.fn());
const mockNotifyModeratorStatusChange = vi.hoisted(() => vi.fn());

vi.mock('@/app/models/user', () => ({
  default: {
    findById: mockUserFindById,
    findOneAndUpdate: mockUserFindOneAndUpdate,
  },
}));

vi.mock('@/app/models/topic', () => ({
  default: {
    find: mockTopicFind,
    updateMany: mockTopicUpdateMany,
  },
}));

vi.mock('@/app/services/moderatorNotificationService', () => ({
  notifyModeratorStatusChange: mockNotifyModeratorStatusChange,
}));

import {
  normaliseTrustScore,
  scoreToTier,
  decayTrustScore,
  getTierRankPenalty,
  shouldApplyStrictPostingRules,
  applyTrustDelta,
} from '@/app/services/trustService';

const approx = (value: number, target: number, tolerance = 0.01) => {
  expect(Math.abs(value - target)).toBeLessThanOrEqual(tolerance * Math.max(1, target));
};

describe('trustService helpers', () => {
  it('normalises score within bounds', () => {
    expect(normaliseTrustScore(-5)).toBe(0);
    expect(normaliseTrustScore(150)).toBe(100);
    expect(normaliseTrustScore(undefined)).toBe(50);
  });

  it('maps scores to tiers', () => {
    expect(scoreToTier(5)).toBe('low');
    expect(scoreToTier(30)).toBe('new');
    expect(scoreToTier(55)).toBe('standard');
    expect(scoreToTier(80)).toBe('trusted');
    expect(scoreToTier(95)).toBe('high');
  });

  it('decays towards baseline with half-life of ~30 days', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const past = new Date('2024-01-02T00:00:00Z');
    const decayed = decayTrustScore(100, past, now);
    // After ~30 days, value should be roughly midway between 100 and baseline 50 => ~75.
    approx(decayed, 75, 0.1);
  });

  it('returns same score when no lastUpdatedAt', () => {
    expect(decayTrustScore(80, null, new Date())).toBe(80);
  });

  it('tier rank penalties follow expected ordering', () => {
    expect(getTierRankPenalty('high')).toBeGreaterThan(getTierRankPenalty('trusted'));
    expect(getTierRankPenalty('trusted')).toBeGreaterThan(getTierRankPenalty('standard'));
    expect(getTierRankPenalty('standard')).toBeGreaterThan(getTierRankPenalty('new'));
    expect(getTierRankPenalty('new')).toBeGreaterThan(getTierRankPenalty('low'));
  });

  it('strict posting applies to low and new tiers', () => {
    expect(shouldApplyStrictPostingRules('low')).toBe(true);
    expect(shouldApplyStrictPostingRules('new')).toBe(true);
    expect(shouldApplyStrictPostingRules('trusted')).toBe(false);
  });
});

describe('applyTrustDelta - moderator demotion on low trust', () => {
  const userId = new mongoose.Types.ObjectId();
  const topicId1 = new mongoose.Types.ObjectId();
  const topicId2 = new mongoose.Types.ObjectId();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUserFindOneAndUpdate.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    mockTopicUpdateMany.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    mockNotifyModeratorStatusChange.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('demotes user from auto-promoted moderator roles when tier drops from trusted to standard', async () => {
    // User with trusted tier (score 80) getting a -20 delta -> standard tier
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 80,
        trustTier: 'trusted',
        trustUpdatedAt: new Date(),
        isAdmin: false,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    mockTopicFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        { _id: topicId1, title: 'Topic One' },
        { _id: topicId2, title: 'Topic Two' },
      ]),
    });

    await applyTrustDelta({
      userId,
      delta: -20,
      reason: 'test demotion',
    });

    // Wait for async demotion task to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should have searched for topics where user is moderator but not manual moderator
    expect(mockTopicFind).toHaveBeenCalledWith({
      moderators: userId,
      manualModerators: { $ne: userId },
    });

    // Should have removed user from moderators
    expect(mockTopicUpdateMany).toHaveBeenCalled();

    // Should have notified user about removal from both topics
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledTimes(2);
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'removed',
        source: 'auto',
        topicTitle: 'Topic One',
      })
    );
    expect(mockNotifyModeratorStatusChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'removed',
        source: 'auto',
        topicTitle: 'Topic Two',
      })
    );
  });

  it('does not demote moderators when tier stays eligible (trusted -> trusted)', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 85,
        trustTier: 'trusted',
        trustUpdatedAt: new Date(),
        isAdmin: false,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    await applyTrustDelta({
      userId,
      delta: -5,
      reason: 'small penalty',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not search for topics since tier is still eligible
    expect(mockTopicFind).not.toHaveBeenCalled();
    expect(mockTopicUpdateMany).not.toHaveBeenCalled();
    expect(mockNotifyModeratorStatusChange).not.toHaveBeenCalled();
  });

  it('does not demote moderators when tier transitions from high to trusted (both eligible)', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 95,
        trustTier: 'high',
        trustUpdatedAt: new Date(),
        isAdmin: false,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    await applyTrustDelta({
      userId,
      delta: -10,
      reason: 'moderate penalty',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not search for topics since trusted tier is still eligible
    expect(mockTopicFind).not.toHaveBeenCalled();
    expect(mockNotifyModeratorStatusChange).not.toHaveBeenCalled();
  });

  it('does not demote admin users even if trust drops', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 80,
        trustTier: 'trusted',
        trustUpdatedAt: new Date(),
        isAdmin: true,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    await applyTrustDelta({
      userId,
      delta: -50,
      reason: 'large penalty on admin',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Admin should not be demoted
    expect(mockTopicFind).not.toHaveBeenCalled();
    expect(mockNotifyModeratorStatusChange).not.toHaveBeenCalled();
  });

  it('does not demote when user was not previously in an eligible tier', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 60,
        trustTier: 'standard',
        trustUpdatedAt: new Date(),
        isAdmin: false,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    await applyTrustDelta({
      userId,
      delta: -20,
      reason: 'drop from standard to new',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Standard was not an eligible tier, so no demotion needed
    expect(mockTopicFind).not.toHaveBeenCalled();
    expect(mockNotifyModeratorStatusChange).not.toHaveBeenCalled();
  });

  it('does not remove user from topics where they are a manual moderator', async () => {
    mockUserFindById.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue({
        _id: userId,
        trustScore: 80,
        trustTier: 'trusted',
        trustUpdatedAt: new Date(),
        isAdmin: false,
      }),
      catch: vi.fn().mockReturnThis(),
    });

    // Return empty array - user is only a manual moderator
    mockTopicFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([]),
    });

    await applyTrustDelta({
      userId,
      delta: -25,
      reason: 'drop trust',
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Query was made but found no topics (since manualModerators filter excluded them)
    expect(mockTopicFind).toHaveBeenCalledWith({
      moderators: userId,
      manualModerators: { $ne: userId },
    });

    // No topics to update or notify about
    expect(mockTopicUpdateMany).not.toHaveBeenCalled();
    expect(mockNotifyModeratorStatusChange).not.toHaveBeenCalled();
  });
});

describe('trustService tier eligibility boundaries', () => {
  it('correctly identifies moderator-eligible tiers', () => {
    // Only 'trusted' (70-89) and 'high' (90+) are eligible
    expect(scoreToTier(70)).toBe('trusted');
    expect(scoreToTier(89)).toBe('trusted');
    expect(scoreToTier(90)).toBe('high');
    expect(scoreToTier(100)).toBe('high');

    // Not eligible tiers
    expect(scoreToTier(69)).toBe('standard');
    expect(scoreToTier(44)).toBe('new');
    expect(scoreToTier(24)).toBe('low');
  });
});
