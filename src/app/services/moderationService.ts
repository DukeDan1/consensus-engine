import type mongoose from 'mongoose';
import { normaliseTrustScore, scoreToTier, shouldApplyStrictPostingRules, type TrustTier } from '@/app/services/trustService';
import { routeResponsesClient, Provider } from '@/app/services/aiRoutingService';

export type ModerationDecision = 'allow' | 'review' | 'block';
export type ModerationSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ModerationContentType = 'topic' | 'argument' | 'comment';

export type ModerationResult = {
  decision: ModerationDecision;
  severity: ModerationSeverity;
  categories: string[];
  spamLikelihood: number; // 0-100
  trollingLikelihood: number; // 0-100
  offTopicLikelihood: number; // 0-100
  illegalOrHarmfulLikelihood: number; // 0-100
  quality: number; // 0-100
  shortReason: string;
  recommendedTrustDelta: number; // -25..+25
  model?: string;
  provider?: Provider | 'heuristic' | 'disabled';
};

const moderationEnabled = (process.env.MODERATION_ENABLED ?? 'true').toLowerCase() !== 'false';

function clamp0to100(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, n));
}

function heuristicModeration(
  text: string,
  contentType?: ModerationContentType,
  evidenceCount = 0
): ModerationResult {
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  const hasRepeated = /(.)\1\1\1\1/.test(text); // 5x repeated chars
  const isVeryShort = text.trim().length < 10;
  const isVeryLong = text.length > 9000;

  const relaxedComments = contentType === 'comment';
  const urlSignalThreshold = relaxedComments ? (evidenceCount > 0 ? 4 : 3) : (evidenceCount > 0 ? 3 : 2);

  const spamSignals = [
    urlCount >= urlSignalThreshold,
    hasRepeated,
    !relaxedComments && isVeryShort && evidenceCount === 0,
    /buy now|free money|work from home|crypto/i.test(text),
  ].filter(Boolean).length;
  const spamLikelihoodRaw = Math.min(100, spamSignals * 25);
  const spamLikelihood = Math.max(0, spamLikelihoodRaw - (evidenceCount > 0 ? 10 : 0));

  const decision: ModerationDecision = spamLikelihood >= (relaxedComments ? 70 : 60) ? 'review' : 'allow';

  return {
    decision,
    severity: spamLikelihood >= (relaxedComments ? 70 : 60) ? 'medium' : 'low',
    categories: spamLikelihood >= (relaxedComments ? 70 : 60) ? ['spam'] : [],
    spamLikelihood,
    trollingLikelihood: 0,
    offTopicLikelihood: 0,
    illegalOrHarmfulLikelihood: 0,
    quality: relaxedComments ? 60 : isVeryShort ? 15 : isVeryLong ? 40 : 60,
    shortReason: decision === 'review' ? 'Content looks spam-like and needs review.' : 'OK',
    recommendedTrustDelta: decision === 'review' ? -3 : 0,
    model: 'heuristic',
    provider: 'heuristic',
  };
}

export async function moderateUserGeneratedText(params: {
  text: string;
  contentType: ModerationContentType;
  userId?: mongoose.Types.ObjectId | string;
  userTrustScore?: number;
  userTrustTier?: TrustTier | string;
  topicTitle?: string;
  evidence?: Array<{ url?: string | null } | null>;
}): Promise<ModerationResult> {
  const { text, contentType, userId, userTrustScore, userTrustTier, topicTitle, evidence } = params;
  const evidenceUrls = (evidence || [])
    .map((item) => (item?.url ? String(item.url) : undefined))
    .filter((u): u is string => Boolean(u))
    .slice(0, 12);

  if (!moderationEnabled) {
    return {
      decision: 'allow',
      severity: 'low',
      categories: [],
      spamLikelihood: 0,
      trollingLikelihood: 0,
      offTopicLikelihood: 0,
      illegalOrHarmfulLikelihood: 0,
      quality: 60,
      shortReason: 'Moderation disabled.',
      recommendedTrustDelta: 0,
      model: 'disabled',
      provider: 'disabled',
    };
  }

  const trimmed = (text || '').trim();
  const evidenceSection = evidenceUrls.length
    ? `\n\nAttached evidence URLs (for context only, do not fetch):\n${evidenceUrls.map((u) => `- ${u}`).join('\n')}`
    : '';
  const contentWithEvidence = `${trimmed}${evidenceSection}`;
  if (!trimmed) {
    return {
      decision: 'block',
      severity: 'low',
      categories: ['empty'],
      spamLikelihood: 0,
      trollingLikelihood: 0,
      offTopicLikelihood: 0,
      illegalOrHarmfulLikelihood: 0,
      quality: 0,
      shortReason: 'Empty content.',
      recommendedTrustDelta: -1,
      model: 'local',
      provider: 'heuristic',
    };
  }

  // If OpenAI key isn't configured, fall back to lightweight heuristics.
  if (!process.env.OPENAI_API_KEY) {
    return heuristicModeration(trimmed, contentType, evidenceUrls.length);
  }

  const score = normaliseTrustScore(userTrustScore);
  const tier = (userTrustTier as TrustTier | undefined) ?? scoreToTier(score);
  const strict = shouldApplyStrictPostingRules(tier);

  const routed = await routeResponsesClient({
    text: trimmed,
    openAiModel: process.env.OPENAI_MODERATION_MODEL || process.env.OPENAI_RESPONSES_MODEL || 'gpt-5.5',
    grokModel: process.env.GROK_RESPONSES_MODEL,
    userId: userId ? String(userId) : undefined,
  });
  if (!routed) {
    return heuristicModeration(trimmed, contentType, evidenceUrls.length);
  }
  const model = routed.model;

  try {
    const response = await routed.client.responses.create({
      model,
      safety_identifier: userId ? String(userId) : "system",
      ...(routed.provider === "grok" ? {} : { reasoning: { effort: "none" } }),
      input: [
        {
          role: 'developer',
          content:
            'You are a safety + community integrity moderation classifier for a debate/discussion platform. ' +
            'Your job is to prevent spam, abuse, illegal/harmful content, and also detect troll/brigade-style manipulation. ' +
            'Return a decision: allow, review, or block. Prefer review over block when uncertain. ' +
            'Quality should reflect how substantive and interesting the content is (higher for insightful, evidence-backed, or thought-provoking content; lower for low-effort). ' +
            'IMPORTANT: For recommendedTrustDelta, actively reward good contributions! Use the full positive range: +15 to +25 for high-quality content with sources/evidence, +8 to +15 for solid contributions, +3 to +8 for acceptable content. Only use 0 to +3 for minimal-effort content. Negative values are for problematic content only. ' +
            `The content type is: ${contentType}.` +
            (contentType === 'comment'
              ? ' Comments can be short and conversational; do not require new evidence or high verbosity. Only flag spam, obvious abuse/harassment, or clearly off-topic replies.'
              : ' For arguments and topics, prioritize substance and safety.'
            ) +
            ' Evidence links/attachments are common and not inherently spammy. Do not penalize for one or two links or attached evidence.' +
            (topicTitle ? ` Topic title context: "${topicTitle}".` : '') +
            (strict ? ' The author is low-trust; be stricter on spam/trolling/low-quality.' : ''),
        },
        { role: 'user', content: contentWithEvidence },
      ],
      tool_choice: { type: 'function', name: 'moderate_content' },
      tools: [
        {
          type: 'function',
          name: 'moderate_content',
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: [
              'decision',
              'severity',
              'categories',
              'spamLikelihood',
              'trollingLikelihood',
              'offTopicLikelihood',
              'illegalOrHarmfulLikelihood',
              'quality',
              'shortReason',
              'recommendedTrustDelta',
            ],
            properties: {
              decision: { type: 'string', enum: ['allow', 'review', 'block'] },
              severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              categories: {
                type: 'array',
                items: { type: 'string' },
                description: 'High-level tags like spam, harassment, hate, violence, sexual, self_harm, illicit, extremism, doxxing, impersonation, manipulation, off_topic, low_quality.',
              },
              spamLikelihood: { type: 'number', minimum: 0, maximum: 100 },
              trollingLikelihood: { type: 'number', minimum: 0, maximum: 100 },
              offTopicLikelihood: { type: 'number', minimum: 0, maximum: 100 },
              illegalOrHarmfulLikelihood: { type: 'number', minimum: 0, maximum: 100 },
              quality: { type: 'number', minimum: 0, maximum: 100 },
              shortReason: { type: 'string', description: 'A user-facing short explanation for the moderation decision.' },
              recommendedTrustDelta: { type: 'number', minimum: -25, maximum: 25, description: 'Recommended change to user trust score. ACTIVELY REWARD QUALITY: +20 to +25 for exceptional content with evidence/sources, +12 to +20 for well-reasoned arguments, +5 to +12 for decent contributions, +1 to +5 for minimal acceptable content, 0 for neutral, negative for problematic content (-5 to -10 for low quality, -10 to -20 for violations, -20 to -25 for severe abuse). Do not default to small positive values - use the full range.' },
            },
          },
        },
      ],
    });

    const functionCallItem = response.output.find((item) => item.type === 'function_call');
    if (!functionCallItem || !('arguments' in functionCallItem)) {
      return heuristicModeration(trimmed, contentType, evidenceUrls.length);
    }

    const parsed = JSON.parse((functionCallItem as any).arguments);

    const result: ModerationResult = {
      decision: (parsed.decision as ModerationDecision) ?? 'review',
      severity: (parsed.severity as ModerationSeverity) ?? 'medium',
      categories: Array.isArray(parsed.categories) ? parsed.categories.map(String).slice(0, 12) : [],
      spamLikelihood: clamp0to100(parsed.spamLikelihood, 0),
      trollingLikelihood: clamp0to100(parsed.trollingLikelihood, 0),
      offTopicLikelihood: clamp0to100(parsed.offTopicLikelihood, 0),
      illegalOrHarmfulLikelihood: clamp0to100(parsed.illegalOrHarmfulLikelihood, 0),
      quality: clamp0to100(parsed.quality, 50),
      shortReason: typeof parsed.shortReason === 'string' ? parsed.shortReason : 'Needs review.',
      recommendedTrustDelta: typeof parsed.recommendedTrustDelta === 'number' ? parsed.recommendedTrustDelta : 0,
      model,
      provider: routed.provider,
    };

    if (evidenceUrls.length) {
      result.spamLikelihood = clamp0to100(result.spamLikelihood - 10, result.spamLikelihood);
      result.offTopicLikelihood = clamp0to100(result.offTopicLikelihood - 5, result.offTopicLikelihood);
      result.quality = clamp0to100(result.quality + 5, result.quality);
      if (
        result.decision === 'review' &&
        result.severity !== 'high' &&
        result.illegalOrHarmfulLikelihood < 40 &&
        result.spamLikelihood < (contentType === 'comment' ? 75 : 70)
      ) {
        result.decision = 'allow';
        result.shortReason = 'OK';
      }
    }

    return result;
  } catch (err) {
    console.error('Moderation call failed; falling back to heuristic moderation.', err);
    return heuristicModeration(trimmed, contentType, evidenceUrls.length);
  }
}

export function moderationToVisibility(params: {
  moderation: ModerationResult;
  userTrustTier?: TrustTier | string;
  contentType?: ModerationContentType;
  evidenceCount?: number;
}): {
  status: 'visible' | 'noise' | 'needs_review' | 'blocked';
  rankPenalty: number;
} {
  const { moderation, userTrustTier, contentType, evidenceCount = 0 } = params;
  const relaxedComments = contentType === 'comment';
  const evidenceBoost = evidenceCount > 0 ? 10 : 0;
  const categories = Array.isArray(moderation.categories)
    ? moderation.categories.map((cat) => cat.toLowerCase())
    : [];
  const severeCategories = new Set([
    'hate',
    'violence',
    'self_harm',
    'illicit',
    'extremism',
    'terrorism',
    'doxxing',
    'sexual',
    'child_abuse',
    'illegal',
  ]);
  const hasSevereCategory = categories.some((cat) => severeCategories.has(cat));
  const hasSpamCategory = categories.includes('spam');

  const obviousHarm =
    moderation.illegalOrHarmfulLikelihood >= 70 ||
    (hasSevereCategory && moderation.illegalOrHarmfulLikelihood >= 50) ||
    moderation.spamLikelihood >= 85 + evidenceBoost ||
    (hasSpamCategory && moderation.spamLikelihood >= 75 + evidenceBoost);

  if (moderation.decision === 'block' && obviousHarm) {
    return { status: 'blocked', rankPenalty: -1000 };
  }

  const strict = shouldApplyStrictPostingRules(userTrustTier);
  const needsReview =
    moderation.decision === 'review' &&
    (moderation.illegalOrHarmfulLikelihood >= 50 ||
      hasSevereCategory ||
      moderation.spamLikelihood >= 70 + evidenceBoost);

  if (needsReview) {
    return { status: 'needs_review', rankPenalty: -200 };
  }

  const noiseSignals =
    moderation.decision === 'review' ||
    moderation.offTopicLikelihood >= (relaxedComments ? 65 : 55) + evidenceBoost ||
    moderation.spamLikelihood >= (relaxedComments ? 55 : 45) + evidenceBoost ||
    moderation.trollingLikelihood >= (relaxedComments ? 60 : 50) + evidenceBoost ||
    moderation.quality <= (relaxedComments ? 25 : 35);

  const strictNoise =
    strict &&
    (moderation.spamLikelihood >= 35 + evidenceBoost ||
      moderation.trollingLikelihood >= 40 + evidenceBoost ||
      moderation.offTopicLikelihood >= 45 + evidenceBoost ||
      moderation.quality <= (relaxedComments ? 20 : 30));

  if (moderation.decision === 'block') {
    if (contentType === 'topic') {
      return { status: 'needs_review', rankPenalty: -200 };
    }
    return { status: 'noise', rankPenalty: -50 };
  }

  if (noiseSignals || strictNoise) {
    if (contentType === 'topic') {
      return { status: 'visible', rankPenalty: -10 };
    }
    return { status: 'noise', rankPenalty: -50 };
  }

  const borderline = relaxedComments
    ? moderation.spamLikelihood >= 45 + evidenceBoost || moderation.trollingLikelihood >= 45 + evidenceBoost
    : moderation.spamLikelihood >= 30 + evidenceBoost || moderation.trollingLikelihood >= 35 + evidenceBoost;

  if (borderline) {
    return { status: 'visible', rankPenalty: -5 };
  }

  return { status: 'visible', rankPenalty: 0 };
}
