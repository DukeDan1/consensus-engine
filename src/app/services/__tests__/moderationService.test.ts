import { describe, it, expect, vi, afterEach } from 'vitest';

const mockResponsesCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = { create: mockResponsesCreate };
      constructor() {}
    },
  };
});

type ModerationModule = typeof import('@/app/services/moderationService');

async function loadModerationService(env?: Record<string, string | undefined>): Promise<ModerationModule> {
  vi.resetModules();
  delete process.env.MODERATION_ENABLED;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODERATION_MODEL;
  delete process.env.OPENAI_RESPONSES_MODEL;

  if (env) {
    Object.entries(env).forEach(([key, value]) => {
      if (value !== undefined) {
        process.env[key] = value;
      }
    });
  }
  return import('@/app/services/moderationService');
}

afterEach(() => {
  mockResponsesCreate.mockReset();
  delete process.env.MODERATION_ENABLED;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODERATION_MODEL;
  delete process.env.OPENAI_RESPONSES_MODEL;
  vi.clearAllMocks();
});

describe('moderationService.moderateUserGeneratedText', () => {
  it('returns allow when moderation is disabled', async () => {
    const { moderateUserGeneratedText } = await loadModerationService({ MODERATION_ENABLED: 'false' });

    const result = await moderateUserGeneratedText({ text: 'hello world', contentType: 'argument' });

    expect(result.decision).toBe('allow');
    expect(result.model).toBe('disabled');
    expect(result.shortReason).toBe('Moderation disabled.');
  });

  it('falls back to heuristic when no OpenAI key and flags spammy text for review', async () => {
    const { moderateUserGeneratedText } = await loadModerationService({});

    const result = await moderateUserGeneratedText({
      text: 'buy now!!!!! http://a.com http://b.com aaaaa',
      contentType: 'argument',
    });

    expect(result.decision).toBe('review');
    expect(result.categories).toContain('spam');
    expect(result.model).toBe('heuristic');
  });

  it('uses OpenAI response when present', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: 'function_call',
          name: 'moderate_content',
          arguments: JSON.stringify({
            decision: 'block',
            severity: 'high',
            categories: ['illegal'],
            spamLikelihood: 1,
            trollingLikelihood: 2,
            offTopicLikelihood: 3,
            illegalOrHarmfulLikelihood: 80,
            quality: 10,
            shortReason: 'bad',
            recommendedTrustDelta: -5,
          }),
        },
      ],
    });

    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'test-key' });

    const result = await moderateUserGeneratedText({ text: 'content', contentType: 'argument' });

    expect(result.decision).toBe('block');
    expect(result.severity).toBe('high');
    expect(result.categories).toEqual(['illegal']);
    expect(result.illegalOrHarmfulLikelihood).toBe(80);
    expect(result.shortReason).toBe('bad');
    expect(result.model).toBe('gpt-5.5');
    expect(mockResponsesCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to heuristic when OpenAI returns no function call', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ output: [] });
    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'key' });

    const result = await moderateUserGeneratedText({ text: 'hi there', contentType: 'comment' });

    expect(result.decision).toBe('allow');
    expect(result.model).toBe('heuristic');
  });

  it('accepts high positive recommendedTrustDelta values up to +25 for quality content', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: 'function_call',
          name: 'moderate_content',
          arguments: JSON.stringify({
            decision: 'allow',
            severity: 'low',
            categories: [],
            spamLikelihood: 0,
            trollingLikelihood: 0,
            offTopicLikelihood: 0,
            illegalOrHarmfulLikelihood: 0,
            quality: 95,
            shortReason: 'High quality argument with strong evidence',
            recommendedTrustDelta: 22,
          }),
        },
      ],
    });

    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'test-key' });

    const result = await moderateUserGeneratedText({
      text: 'A well-researched argument with multiple peer-reviewed sources supporting the claims.',
      contentType: 'argument',
    });

    expect(result.decision).toBe('allow');
    expect(result.recommendedTrustDelta).toBe(22);
    expect(result.quality).toBe(95);
  });

  it('accepts recommendedTrustDelta at maximum boundary of +25', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: 'function_call',
          name: 'moderate_content',
          arguments: JSON.stringify({
            decision: 'allow',
            severity: 'low',
            categories: [],
            spamLikelihood: 0,
            trollingLikelihood: 0,
            offTopicLikelihood: 0,
            illegalOrHarmfulLikelihood: 0,
            quality: 100,
            shortReason: 'Exceptional contribution with original research',
            recommendedTrustDelta: 25,
          }),
        },
      ],
    });

    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'test-key' });

    const result = await moderateUserGeneratedText({
      text: 'Exceptional content worthy of maximum trust reward.',
      contentType: 'argument',
    });

    expect(result.decision).toBe('allow');
    expect(result.recommendedTrustDelta).toBe(25);
  });

  it('accepts negative recommendedTrustDelta down to -25 for severe violations', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: 'function_call',
          name: 'moderate_content',
          arguments: JSON.stringify({
            decision: 'block',
            severity: 'high',
            categories: ['abuse', 'harassment'],
            spamLikelihood: 10,
            trollingLikelihood: 90,
            offTopicLikelihood: 20,
            illegalOrHarmfulLikelihood: 85,
            quality: 5,
            shortReason: 'Severe harassment and abuse',
            recommendedTrustDelta: -25,
          }),
        },
      ],
    });

    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'test-key' });

    const result = await moderateUserGeneratedText({
      text: 'Content that warrants maximum penalty.',
      contentType: 'argument',
    });

    expect(result.decision).toBe('block');
    expect(result.recommendedTrustDelta).toBe(-25);
    expect(result.illegalOrHarmfulLikelihood).toBe(85);
  });

  it('uses moderate positive delta for solid contributions', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [
        {
          type: 'function_call',
          name: 'moderate_content',
          arguments: JSON.stringify({
            decision: 'allow',
            severity: 'low',
            categories: [],
            spamLikelihood: 0,
            trollingLikelihood: 0,
            offTopicLikelihood: 5,
            illegalOrHarmfulLikelihood: 0,
            quality: 75,
            shortReason: 'Good thoughtful comment',
            recommendedTrustDelta: 12,
          }),
        },
      ],
    });

    const { moderateUserGeneratedText } = await loadModerationService({ OPENAI_API_KEY: 'test-key' });

    const result = await moderateUserGeneratedText({
      text: 'A thoughtful response contributing to the discussion.',
      contentType: 'comment',
    });

    expect(result.decision).toBe('allow');
    expect(result.recommendedTrustDelta).toBe(12);
    expect(result.quality).toBe(75);
  });
});

describe('moderationService.moderationToVisibility', () => {
  it('keeps borderline content visible for trusted users', async () => {
    const { moderationToVisibility } = await loadModerationService();

    const result = moderationToVisibility({
      moderation: {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 38,
        trollingLikelihood: 30,
        offTopicLikelihood: 50,
        illegalOrHarmfulLikelihood: 10,
        quality: 39,
        shortReason: 'ok',
        recommendedTrustDelta: 0,
      },
      userTrustTier: 'trusted',
      contentType: 'argument',
    });

    expect(result.status).toBe('visible');
    expect(result.rankPenalty).toBe(-5);
  });

  it('hides borderline content for strict (low-trust) users', async () => {
    const { moderationToVisibility } = await loadModerationService();

    const result = moderationToVisibility({
      moderation: {
        decision: 'allow',
        severity: 'low',
        categories: [],
        spamLikelihood: 38,
        trollingLikelihood: 30,
        offTopicLikelihood: 50,
        illegalOrHarmfulLikelihood: 10,
        quality: 39,
        shortReason: 'ok',
        recommendedTrustDelta: 0,
      },
      userTrustTier: 'low',
      contentType: 'argument',
    });

    expect(result.status).toBe('noise');
    expect(result.rankPenalty).toBe(-50);
  });

  it('treats lower thresholds as suspicious for strict users', async () => {
    const { moderationToVisibility } = await loadModerationService();

    const result = moderationToVisibility({
      moderation: {
        decision: 'allow',
        severity: 'medium',
        categories: [],
        spamLikelihood: 42,
        trollingLikelihood: 20,
        offTopicLikelihood: 30,
        illegalOrHarmfulLikelihood: 5,
        quality: 80,
        shortReason: 'ok',
        recommendedTrustDelta: 0,
      },
      userTrustTier: 'low',
      contentType: 'argument',
    });

    expect(result.status).toBe('noise');
    expect(result.rankPenalty).toBe(-50);
  });
});
