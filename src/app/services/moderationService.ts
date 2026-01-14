import OpenAI from 'openai';
import type mongoose from 'mongoose';
import { normaliseTrustScore, scoreToTier, shouldApplyStrictPostingRules, type TrustTier } from '@/app/services/trustService';

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
  recommendedTrustDelta: number; // -25..+5
  model?: string;
};

const moderationEnabled = (process.env.MODERATION_ENABLED ?? 'true').toLowerCase() !== 'false';

let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (openai) return openai;
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

function clamp0to100(value: unknown, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, n));
}

function heuristicModeration(text: string, contentType?: ModerationContentType): ModerationResult {
  const urlCount = (text.match(/https?:\/\//g) || []).length;
  const hasRepeated = /(.)\1\1\1\1/.test(text); // 5x repeated chars
  const isVeryShort = text.trim().length < 10;
  const isVeryLong = text.length > 9000;

  const relaxedComments = contentType === 'comment';

  const spamSignals = [
    urlCount >= 2,
    hasRepeated,
    !relaxedComments && isVeryShort,
    /buy now|free money|work from home|crypto/i.test(text),
  ].filter(Boolean).length;
  const spamLikelihood = Math.min(100, spamSignals * 25);

  const decision: ModerationDecision = spamLikelihood >= 60 ? 'review' : 'allow';

  return {
    decision,
    severity: spamLikelihood >= 60 ? 'medium' : 'low',
    categories: spamLikelihood >= 60 ? ['spam'] : [],
    spamLikelihood,
    trollingLikelihood: 0,
    offTopicLikelihood: 0,
    illegalOrHarmfulLikelihood: 0,
    quality: relaxedComments ? 60 : isVeryShort ? 15 : isVeryLong ? 40 : 60,
    shortReason: decision === 'review' ? 'Content looks spam-like and needs review.' : 'OK',
    recommendedTrustDelta: decision === 'review' ? -3 : 0,
    model: 'heuristic',
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
  const { text, contentType, userTrustScore, userTrustTier, topicTitle, evidence } = params;
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
    };
  }

  const client = getOpenAIClient();

  // If OpenAI key isn't configured, fall back to lightweight heuristics.
  if (!client) {
    return heuristicModeration(contentWithEvidence, contentType);
  }

  const score = normaliseTrustScore(userTrustScore);
  const tier = (userTrustTier as TrustTier | undefined) ?? scoreToTier(score);
  const strict = shouldApplyStrictPostingRules(tier);

  const model = process.env.OPENAI_MODERATION_MODEL || process.env.OPENAI_RESPONSES_MODEL || 'gpt-5.2';

  try {
    const response = await client.responses.create({
      model,
      reasoning: { effort: 'none' },
      input: [
        {
          role: 'developer',
          content:
            'You are a safety + community integrity moderation classifier for a debate/discussion platform. ' +
            'Your job is to prevent spam, abuse, illegal/harmful content, and also detect troll/brigade-style manipulation. ' +
            'Return a decision: allow, review, or block. Prefer review over block when uncertain. ' +
            `The content type is: ${contentType}.` +
            (contentType === 'comment'
              ? ' Comments can be short and conversational; do not require new evidence or high verbosity. Only flag spam, obvious abuse/harassment, or clearly off-topic replies.'
              : ' For arguments and topics, prioritize substance and safety.'
            ) +
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
              shortReason: { type: 'string', maxLength: 240, description: 'A user-facing short explanation for the moderation decision.' },
              recommendedTrustDelta: { type: 'number', minimum: -25, maximum: 5 },
            },
          },
        },
      ],
    });

    const functionCallItem = response.output.find((item) => item.type === 'function_call');
    if (!functionCallItem || !('arguments' in functionCallItem)) {
      return heuristicModeration(contentWithEvidence, contentType);
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
    };

    return result;
  } catch (err) {
    console.error('Moderation call failed; falling back to heuristic moderation.', err);
    return heuristicModeration(trimmed, contentType);
  }
}

export function moderationToVisibility(params: {
  moderation: ModerationResult;
  userTrustTier?: TrustTier | string;
  contentType?: ModerationContentType;
}): {
  status: 'visible' | 'hidden' | 'needs_review' | 'blocked';
  rankPenalty: number;
} {
  const { moderation, userTrustTier, contentType } = params;
  const relaxedComments = contentType === 'comment';

  if (moderation.decision === 'block') {
    return { status: 'blocked', rankPenalty: -1000 };
  }

  // Strict behavior for low-trust: default to hidden on suspicious signals.
  const strict = shouldApplyStrictPostingRules(userTrustTier);
  const suspicious = relaxedComments
    ? (moderation.spamLikelihood >= 70 ||
      moderation.trollingLikelihood >= 70 ||
      moderation.illegalOrHarmfulLikelihood >= 40 ||
      moderation.offTopicLikelihood >= 80)
    : (moderation.spamLikelihood >= 50 ||
      moderation.trollingLikelihood >= 55 ||
      moderation.illegalOrHarmfulLikelihood >= 40 ||
      moderation.quality <= 25 ||
      moderation.offTopicLikelihood >= 65);

  if (moderation.decision === 'review') {
    return { status: 'hidden', rankPenalty: -25 };
  }

  // Allowed but a bit sketchy: visible, but demote.
  const borderline = relaxedComments
    ? (moderation.spamLikelihood >= 50 || moderation.trollingLikelihood >= 55 || moderation.offTopicLikelihood >= 70)
    : (moderation.spamLikelihood >= 35 || moderation.trollingLikelihood >= 40 || moderation.quality < 40);

  if (suspicious) {
    return { status: 'hidden', rankPenalty: -25 };
  }

  if (borderline) {
    return { status: 'visible', rankPenalty: -5 };
  }

  return { status: 'visible', rankPenalty: 0 };
}
