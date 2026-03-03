/**
 * scenarioConfig.ts
 *
 * Defines the 5 evaluation scenarios, their content distributions,
 * shared types, and configurable parameters for scenario-based
 * simulation runs.
 */

import type { Provider } from "../../services/aiRoutingService";

// ────────────────────────── Content Categories ──────────────────────────

/**
 * All possible content categories that can appear across scenarios.
 * Matches the categories used in the existing simulateContent.ts pipeline.
 */
export type ContentCategory =
    | "highQualityFacts"
    | "highQualityEvidence"
    | "average"
    | "noise"
    | "troll"
    | "mildAbusive"
    | "highlyOffensive"
    | "mixedTrueFalse"
    | "purelyFalse"
    | "humanError"
    | "spam";

// ────────────────────────── Scenario Distribution ──────────────────────────

/** A mapping from content category → proportion (0-1). Must sum ≈ 1. */
export type ContentDistribution = Partial<Record<ContentCategory, number>>;

// ────────────────────────── Scenario Definition ──────────────────────────

export type ScenarioDefinition = {
    /** Short identifier for the scenario (used in JSON output). */
    id: string;
    /** Human-readable name. */
    name: string;
    /** Description of what this scenario tests. */
    description: string;
    /** Content distribution for this scenario. */
    distribution: ContentDistribution;
};

// ────────────────────────── Topic with Wikipedia ──────────────────────────

export type ScenarioTopic = {
    /** Topic title to create on the platform. */
    title: string;
    /** Topic description. */
    description: string;
    /** Wikipedia article URL whose content is used as context for AI generation. */
    wikipediaUrl: string;
};

// ────────────────────────── User Allocation ──────────────────────────

export type UserAllocation = {
    /** Total number of users. Reads from users JSON. */
    totalUsers: number;
    /** Number of users who actively create content (post arguments/comments). */
    activePosters: number;
    /** Remaining users only vote and view. */
    // voterViewers is computed as totalUsers - activePosters
};

// ────────────────────────── AI Provider Config ──────────────────────────

export type ScenarioAiConfig = {
    /**
     * Model to force for ALL AI content generation in scenarios.
     * Must be a model NOT used elsewhere in the platform
     * (not gpt-*, grok-*, or the default openrouter model).
     */
    model: string;
    /** Provider to force — should be "openrouter" for scenario sims. */
    provider: Provider;
};

// ────────────────────────── Full Config ──────────────────────────

export type ScenarioSimulationConfig = {
    /** App URL (from base config). */
    appUrl: string;
    /** Topics with Wikipedia source articles. */
    topics: ScenarioTopic[];
    /** User allocation settings. */
    users: UserAllocation;
    /** AI model/provider to force for content generation. */
    ai: ScenarioAiConfig;
    /** All 5 scenario definitions in order. */
    scenarios: ScenarioDefinition[];
    /** Concurrency for batched API calls. */
    concurrency: number;
    /** Arguments per topic per scenario. */
    argumentsPerTopic: number;
    /** Comments per argument per scenario. */
    commentsPerArgument: number;
    /** Time to wait (ms) for background AI processing before evaluation. */
    aiProcessingWaitMs: number;
    /** Probability (0-1) that a voter will vote on any given item. */
    voteProbability: number;
};

// ────────────────────────── The "control" distribution (Scenario 2) ──────────────────────────
// Used as a base that is mixed into Scenarios 4 and 5.

const CONTROL_DISTRIBUTION: ContentDistribution = {
    highQualityFacts: 0.40,
    highQualityEvidence: 0.20,
    average: 0.20,
    humanError: 0.10,
    mixedTrueFalse: 0.10,
};

// ────────────────────────── Scenario Definitions ──────────────────────────

export const SCENARIOS: ScenarioDefinition[] = [
    {
        id: "scenario_1_pure_factual",
        name: "Scenario 1: Pure Factual (Wikipedia)",
        description:
            "100% factual content derived directly from a Wikipedia article. " +
            "Tests whether the AI systems correctly identify, classify, and pass " +
            "purely factual, well-sourced content.",
        distribution: {
            highQualityFacts: 0.60,
            highQualityEvidence: 0.40,
        },
    },
    {
        id: "scenario_2_control",
        name: "Scenario 2: Control (80/20 factual vs human error)",
        description:
            "80% factual content, 20% human errors and opinions. " +
            "Establishes a baseline for AI system performance under realistic " +
            "conditions with mostly good content and some natural noise.",
        distribution: {
            highQualityFacts: 0.35,
            highQualityEvidence: 0.20,
            average: 0.25,
            humanError: 0.10,
            mixedTrueFalse: 0.10,
        },
    },
    {
        id: "scenario_3_misinfo_mixed",
        name: "Scenario 3: Mixed with Misinformation (80/10/10)",
        description:
            "80% factual, 10% human errors/opinions, 10% blatant misinformation. " +
            "Tests whether fact-checking and moderation correctly flag fabricated " +
            "claims while allowing legitimate content through.",
        distribution: {
            highQualityFacts: 0.35,
            highQualityEvidence: 0.20,
            average: 0.25,
            humanError: 0.10,
            purelyFalse: 0.10,
        },
    },
    {
        id: "scenario_4_spam_attack",
        name: "Scenario 4: Spam Attack (60% control, 40% spam)",
        description:
            "60% content following the control distribution (Scenario 2) mixed " +
            "with 40% spam. Tests moderation resilience under a coordinated " +
            "spam attack scenario.",
        distribution: {
            // 60% of control distribution
            highQualityFacts: 0.60 * (CONTROL_DISTRIBUTION.highQualityFacts ?? 0),
            highQualityEvidence: 0.60 * (CONTROL_DISTRIBUTION.highQualityEvidence ?? 0),
            average: 0.60 * (CONTROL_DISTRIBUTION.average ?? 0),
            humanError: 0.60 * (CONTROL_DISTRIBUTION.humanError ?? 0),
            mixedTrueFalse: 0.60 * (CONTROL_DISTRIBUTION.mixedTrueFalse ?? 0),
            // 40% spam
            spam: 0.25,
            noise: 0.15,
        },
    },
    {
        id: "scenario_5_misinfo_abuse_gang",
        name: "Scenario 5: Misinformation & Abuse Gang-Up (40/60)",
        description:
            "40% content following the control distribution mixed with 60% " +
            "deliberate misinformation and abuse. Tests system resilience under " +
            "a coordinated attack with abusive language and fabricated claims.",
        distribution: {
            // 40% of control distribution
            highQualityFacts: 0.40 * (CONTROL_DISTRIBUTION.highQualityFacts ?? 0),
            highQualityEvidence: 0.40 * (CONTROL_DISTRIBUTION.highQualityEvidence ?? 0),
            average: 0.40 * (CONTROL_DISTRIBUTION.average ?? 0),
            humanError: 0.40 * (CONTROL_DISTRIBUTION.humanError ?? 0),
            mixedTrueFalse: 0.40 * (CONTROL_DISTRIBUTION.mixedTrueFalse ?? 0),
            // 60% deliberate misinfo + abuse
            purelyFalse: 0.25,
            troll: 0.10,
            mildAbusive: 0.10,
            highlyOffensive: 0.05,
            noise: 0.10,
        },
    },
];

// ────────────────────────── Default Config ──────────────────────────

export const DEFAULT_SCENARIO_CONFIG: ScenarioSimulationConfig = {
    appUrl: "http://localhost:3000",
    topics: [
        {
            title: "Should abortion be legal in all cases?",
            description:
                "This topic explores the debate over reproductive rights, balancing personal autonomy with ethical and legal considerations.",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Abortion_debate",
        },
        {
            title: "Should stricter gun control laws be implemented?",
            description:
                "This discusses the balance between public safety and Second Amendment rights in the context of gun violence and ownership.",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Gun_control",
        },
        {
            title: "Is a two-state solution viable for Israel and Palestine?",
            description:
                "This topic explores the feasibility and implications of establishing independent Israeli and Palestinian states, addressing historical, political, and security challenges.",
            wikipediaUrl: "https://en.wikipedia.org/wiki/Two-state_solution",
        },
    ],
    users: {
        totalUsers: 100,
        activePosters: 40,
    },
    ai: {
        // Google Gemma 3 27B via OpenRouter — NOT used elsewhere in the platform
        model: "google/gemini-3-flash-preview",
        //model: "anthropic/claude-sonnet-4.6",
        provider: "openrouter",
    },
    concurrency: 20,
    argumentsPerTopic: 10,
    commentsPerArgument: 5,
    aiProcessingWaitMs: 10000,
    voteProbability: 0.6,
    scenarios: SCENARIOS,
};

// ────────────────────────── Utility ──────────────────────────

/**
 * Given a content distribution, pick a random category weighted by the
 * distribution proportions.
 */
export function pickCategory(distribution: ContentDistribution): ContentCategory {
    const entries = Object.entries(distribution) as [ContentCategory, number][];
    const r = Math.random();
    let cumulative = 0;
    for (const [category, weight] of entries) {
        cumulative += weight;
        if (r < cumulative) return category;
    }
    // Fallback to the last entry
    return entries[entries.length - 1]?.[0] ?? "average";
}

/**
 * Get a human-readable label + emoji for each content category.
 */
export const CATEGORY_LABELS: Record<ContentCategory, string> = {
    highQualityFacts: "⭐ HIGH-QUALITY FACTS",
    highQualityEvidence: "📎 HIGH-QUALITY + EVIDENCE",
    average: "📝 AVERAGE",
    noise: "🚨 NOISE",
    troll: "🤡 TROLL",
    mildAbusive: "😡 MILD ABUSIVE",
    highlyOffensive: "☠️  HIGHLY OFFENSIVE",
    mixedTrueFalse: "⚖️  MIXED TRUE/FALSE",
    purelyFalse: "❌ PURELY FALSE",
    humanError: "🤷 HUMAN ERROR/OPINION",
    spam: "📧 SPAM",
};
