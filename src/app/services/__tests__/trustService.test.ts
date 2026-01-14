import { describe, it, expect } from 'vitest';
import {
  normaliseTrustScore,
  scoreToTier,
  decayTrustScore,
  getTierRankPenalty,
  shouldApplyStrictPostingRules,
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
