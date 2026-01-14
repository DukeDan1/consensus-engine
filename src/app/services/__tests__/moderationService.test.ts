import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  moderateUserGeneratedText,
  moderationToVisibility,
  type ModerationResult,
  type ModerationDecision,
  type ModerationSeverity,
} from '@/app/services/moderationService';

// Mock the OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn(() => ({
      responses: {
        create: vi.fn(),
      },
    })),
  };
});

describe('moderationService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('moderateUserGeneratedText - basic functionality', () => {
    it('uses heuristic moderation when OpenAI is not available', async () => {
      // When MODERATION_ENABLED=false is set at module load time, it would be disabled,
      // but since the module is already loaded, we test the heuristic fallback instead
      delete process.env.OPENAI_API_KEY;
      
      const result = await moderateUserGeneratedText({
        text: 'This is a test message',
        contentType: 'comment',
      });

      expect(result.decision).toBe('allow');
      expect(result.severity).toBe('low');
      expect(result.model).toBe('heuristic');
    });

    it('blocks empty content', async () => {
      const result = await moderateUserGeneratedText({
        text: '   ',
        contentType: 'comment',
      });

      expect(result.decision).toBe('block');
      expect(result.severity).toBe('low');
      expect(result.categories).toContain('empty');
      expect(result.quality).toBe(0);
      expect(result.shortReason).toBe('Empty content.');
      expect(result.recommendedTrustDelta).toBe(-1);
    });

    it('blocks truly empty content', async () => {
      const result = await moderateUserGeneratedText({
        text: '',
        contentType: 'topic',
      });

      expect(result.decision).toBe('block');
      expect(result.categories).toContain('empty');
    });
  });

  describe('moderateUserGeneratedText - heuristic fallback', () => {
    beforeEach(() => {
      // Remove OpenAI API key to trigger heuristic fallback
      delete process.env.OPENAI_API_KEY;
      process.env.MODERATION_ENABLED = 'true';
    });

    it('uses heuristic moderation when OpenAI is unavailable', async () => {
      const result = await moderateUserGeneratedText({
        text: 'This is a normal comment',
        contentType: 'comment',
      });

      expect(result.model).toBe('heuristic');
      expect(result.decision).toBe('allow');
    });

    it('detects spam-like content with multiple URLs and keywords', async () => {
      // Need 3+ spam signals to trigger review: 2+ URLs, spam keywords, and repeated chars
      const result = await moderateUserGeneratedText({
        text: 'BUY NOW!!! Check out https://example.com and https://spam.com for FREE MONEY!!!!!',
        contentType: 'comment',
      });

      expect(result.decision).toBe('review');
      expect(result.severity).toBe('medium');
      expect(result.categories).toContain('spam');
      expect(result.spamLikelihood).toBeGreaterThanOrEqual(60);
      expect(result.recommendedTrustDelta).toBe(-3);
    });

    it('detects spam keywords with multiple signals', async () => {
      // Need multiple spam signals: keywords + repeated chars + short content
      const result = await moderateUserGeneratedText({
        text: 'BUY NOW!!!!! https://spam.com https://fake.com',
        contentType: 'comment',
      });

      expect(result.decision).toBe('review');
      expect(result.spamLikelihood).toBeGreaterThanOrEqual(60);
      expect(result.categories).toContain('spam');
    });

    it('detects repeated characters as spam signal', async () => {
      const result = await moderateUserGeneratedText({
        text: 'HELLOOOOOOO everyone!!!!!',
        contentType: 'comment',
      });

      expect(result.spamLikelihood).toBeGreaterThan(0);
    });

    it('allows normal content through heuristics', async () => {
      const result = await moderateUserGeneratedText({
        text: 'This is a thoughtful comment about the debate topic. I believe we should consider multiple perspectives.',
        contentType: 'comment',
      });

      expect(result.decision).toBe('allow');
      expect(result.severity).toBe('low');
      expect(result.spamLikelihood).toBeLessThan(60);
      expect(result.quality).toBeGreaterThan(50);
    });

    it('flags very short content with lower quality score', async () => {
      const result = await moderateUserGeneratedText({
        text: 'ok',
        contentType: 'comment',
      });

      expect(result.quality).toBe(15);
      expect(result.decision).toBe('allow');
    });

    it('flags very long content with moderate quality score', async () => {
      const longText = 'a'.repeat(10000);
      const result = await moderateUserGeneratedText({
        text: longText,
        contentType: 'argument',
      });

      expect(result.quality).toBe(40);
    });
  });

  describe('moderateUserGeneratedText - trust system integration', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      process.env.MODERATION_ENABLED = 'true';
    });

    it('accepts user trust score parameter', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Normal content',
        contentType: 'comment',
        userTrustScore: 80,
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('accepts user trust tier parameter', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Normal content',
        contentType: 'comment',
        userTrustTier: 'trusted',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('accepts userId parameter', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Normal content',
        contentType: 'comment',
        userId: '507f1f77bcf86cd799439011',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('accepts topic title for context', async () => {
      const result = await moderateUserGeneratedText({
        text: 'I agree with this',
        contentType: 'argument',
        topicTitle: 'Should we increase funding for education?',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });
  });

  describe('moderateUserGeneratedText - content types', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      process.env.MODERATION_ENABLED = 'true';
    });

    it('handles topic content type', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Should we adopt renewable energy sources?',
        contentType: 'topic',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('handles argument content type', async () => {
      const result = await moderateUserGeneratedText({
        text: 'I believe renewable energy is essential because...',
        contentType: 'argument',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });

    it('handles comment content type', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Great point!',
        contentType: 'comment',
      });

      expect(result).toBeDefined();
      expect(result.decision).toBeDefined();
    });
  });

  describe('moderateUserGeneratedText - result structure', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
      process.env.MODERATION_ENABLED = 'true';
    });

    it('returns all required fields in result', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Test content',
        contentType: 'comment',
      });

      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('severity');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('spamLikelihood');
      expect(result).toHaveProperty('trollingLikelihood');
      expect(result).toHaveProperty('offTopicLikelihood');
      expect(result).toHaveProperty('illegalOrHarmfulLikelihood');
      expect(result).toHaveProperty('quality');
      expect(result).toHaveProperty('shortReason');
      expect(result).toHaveProperty('recommendedTrustDelta');
      expect(result).toHaveProperty('model');
    });

    it('ensures likelihood scores are within 0-100 range', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Test content',
        contentType: 'comment',
      });

      expect(result.spamLikelihood).toBeGreaterThanOrEqual(0);
      expect(result.spamLikelihood).toBeLessThanOrEqual(100);
      expect(result.trollingLikelihood).toBeGreaterThanOrEqual(0);
      expect(result.trollingLikelihood).toBeLessThanOrEqual(100);
      expect(result.offTopicLikelihood).toBeGreaterThanOrEqual(0);
      expect(result.offTopicLikelihood).toBeLessThanOrEqual(100);
      expect(result.illegalOrHarmfulLikelihood).toBeGreaterThanOrEqual(0);
      expect(result.illegalOrHarmfulLikelihood).toBeLessThanOrEqual(100);
      expect(result.quality).toBeGreaterThanOrEqual(0);
      expect(result.quality).toBeLessThanOrEqual(100);
    });

    it('ensures categories is an array', async () => {
      const result = await moderateUserGeneratedText({
        text: 'Test content',
        contentType: 'comment',
      });

      expect(Array.isArray(result.categories)).toBe(true);
    });
  });

  describe('moderationToVisibility', () => {
    it('blocks content with block decision', () => {
      const moderation: ModerationResult = {
        decision: 'block',
        severity: 'high',
        categories: ['spam'],
        spamLikelihood: 90,
        trollingLikelihood: 10,
        offTopicLikelihood: 10,
        illegalOrHarmfulLikelihood: 10,
        quality: 10,
        shortReason: 'Spam detected',
        recommendedTrustDelta: -10,
        model: 'test',
      };

      const result = moderationToVisibility({ moderation });

      expect(result.status).toBe('blocked');
      expect(result.rankPenalty).toBe(-1000);
    });

    it('hides content with review decision', () => {
      const moderation: ModerationResult = {
        decision: 'review',
        severity: 'medium',
        categories: ['spam'],
        spamLikelihood: 60,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 20,
        quality: 40,
        shortReason: 'Needs review',
        recommendedTrustDelta: -3,
        model: 'test',
      };

      const result = moderationToVisibility({ moderation });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('hides suspicious content for low-trust users', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 55,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 20,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'low' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('hides suspicious content for new users', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 50,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 20,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'new' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('allows clean content to be visible', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 10,
        trollingLikelihood: 10,
        offTopicLikelihood: 10,
        illegalOrHarmfulLikelihood: 10,
        quality: 80,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ moderation });

      expect(result.status).toBe('visible');
      expect(result.rankPenalty).toBe(0);
    });

    it('applies rank penalty to borderline content', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 40,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 10,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ moderation });

      expect(result.status).toBe('visible');
      expect(result.rankPenalty).toBe(-5);
    });

    it('applies rank penalty to low quality content', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 10,
        trollingLikelihood: 10,
        offTopicLikelihood: 10,
        illegalOrHarmfulLikelihood: 10,
        quality: 35,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ moderation });

      expect(result.status).toBe('visible');
      expect(result.rankPenalty).toBe(-5);
    });

    it('hides content with high trolling likelihood', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 20,
        trollingLikelihood: 60,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 10,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'low' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('hides content with high illegal/harmful likelihood', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 20,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 45,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'new' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('hides very low quality content for low-trust users', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 20,
        trollingLikelihood: 20,
        offTopicLikelihood: 20,
        illegalOrHarmfulLikelihood: 10,
        quality: 20,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'low' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('hides highly off-topic content for strict users', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 20,
        trollingLikelihood: 20,
        offTopicLikelihood: 70,
        illegalOrHarmfulLikelihood: 10,
        quality: 50,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'new' 
      });

      expect(result.status).toBe('hidden');
      expect(result.rankPenalty).toBe(-25);
    });

    it('allows clean content from trusted users', () => {
      const moderation: ModerationResult = {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 10,
        trollingLikelihood: 10,
        offTopicLikelihood: 10,
        illegalOrHarmfulLikelihood: 10,
        quality: 70,
        shortReason: 'OK',
        recommendedTrustDelta: 0,
        model: 'test',
      };

      const result = moderationToVisibility({ 
        moderation, 
        userTrustTier: 'trusted' 
      });

      expect(result.status).toBe('visible');
      expect(result.rankPenalty).toBe(0);
    });
  });
});
