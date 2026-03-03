/**
 * simulateScenarios.ts
 *
 * Main orchestrator for scenario-based evaluation simulations.
 * Runs 5 defined scenarios sequentially, generates content using
 * Wikipedia articles as context, records trust deltas, evaluates
 * AI system decisions, and outputs a comprehensive JSON report.
 *
 * Usage:
 *   npx tsx src/app/scripts/userSimulation/simulateScenarios.ts <simulation_file.json> [--scenarios 1,2,3]
 *
 * Options:
 *   --scenarios <ids>   Comma-separated scenario numbers (1-5) to run. Default: all.
 *   --topics <count>    Override number of topics per scenario.
 *   --args <count>      Override arguments per topic.
 *   --comments <count>  Override comments per argument.
 *   --posters <count>   Override number of active posters.
 *   --wait <ms>         Override AI processing wait time.
 *   --model <model>     Override the OpenRouter model.
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";

import { routeResponsesClient } from "../../services/aiRoutingService";
import { fetchAllArticles, type WikipediaArticle } from "./wikipediaFetcher";
import {
    snapshotTrust,
    buildTrustReport,
    resetTrustForUsers,
    getUserIdsByEmails,
    type TrustReport,
} from "./trustTracker";
import {
    DEFAULT_SCENARIO_CONFIG,
    SCENARIOS,
    CATEGORY_LABELS,
    pickCategory,
    type ContentCategory,
    type ScenarioDefinition,
    type ScenarioSimulationConfig,
    type ScenarioAiConfig,
} from "./scenarioConfig";

// ────────────────────────── Types ──────────────────────────

type SavedUser = {
    username: string;
    email: string;
    password: string;
    name: string;
    bio: string;
    registered: boolean;
};

type AuthenticatedUser = SavedUser & { token: string };

type CreatedTopic = {
    id: string;
    title: string;
    description?: string;
    createdBy: string;
};

type CreatedArgument = {
    id: string;
    topicId: string;
    side: "for" | "against" | "neutral";
    body: string;
    createdBy: string;
    category: ContentCategory;
};

type CreatedComment = {
    id: string;
    argumentId: string;
    body: string;
    createdBy: string;
    category: ContentCategory;
};

type CastVote = {
    targetType: "Topic" | "Argument" | "Comment";
    targetId: string;
    value: 1 | -1;
    votedBy: string;
    upvoteCount: number;
    downvoteCount: number;
};

type VisibilityInfo = {
    status?: string;
    reason?: string;
    categories?: string[];
    spamLikelihood?: number;
    trollingLikelihood?: number;
    offTopicLikelihood?: number;
    quality?: number;
    model?: string;
};

type ContentFactCheckInfo = {
    verdict?: string;
    confidence?: number;
    summary?: string;
    sources?: Array<{ title?: string; url?: string; snippet?: string }>;
    model?: string;
};

type AiAnalysisInfo = {
    isFact?: boolean;
    isOpinion?: boolean;
    justification?: string;
};

type OntologyCategory = {
    id: string;
    label: string;
    description?: string;
    confidence?: number;
    similarity?: number;
};

type EvidenceFactCheck = {
    verdict?: string;
    qualityScore?: number;
    confidence?: number;
    summary?: string;
    model?: string;
};

type AiEvaluation = {
    topicId: string;
    title: string;
    arguments: Array<{
        id: string;
        side: string;
        bodySnippet: string;
        category: ContentCategory;
        visibility?: VisibilityInfo;
        ontologyCategories?: OntologyCategory[];
        contentFactCheck?: ContentFactCheckInfo;
        aiAnalysis?: AiAnalysisInfo;
        evidenceFactChecks?: EvidenceFactCheck[];
        comments: Array<{
            id: string;
            bodySnippet: string;
            category: ContentCategory;
            visibility?: VisibilityInfo;
            ontologyCategories?: OntologyCategory[];
            contentFactCheck?: ContentFactCheckInfo;
        }>;
    }>;
};

type AiSystemReport = {
    moderation: {
        total: number;
        visible: number;
        needsReview: number;
        noise: number;
        blocked: number;
        hidden: number;
        byCategory: Record<string, { total: number; visible: number; blocked: number; hidden: number; needsReview: number; noise: number }>;
    };
    factChecking: {
        total: number;
        verified: number;
        inaccurate: number;
        mixed: number;
        unverified: number;
        notChecked: number;
        byCategory: Record<string, { total: number; verified: number; inaccurate: number; mixed: number; unverified: number }>;
    };
    ontology: { totalTagged: number; totalCategories: number; avgCategoriesPerItem: number };
    aiAnalysis: { total: number; facts: number; opinions: number; withJustification: number };
};

type ScenarioResult = {
    scenario: ScenarioDefinition;
    topicsCreated: CreatedTopic[];
    argumentsCreated: CreatedArgument[];
    commentsCreated: CreatedComment[];
    votesCast: CastVote[];
    aiEvaluations: AiEvaluation[];
    aiSystemReport: AiSystemReport;
    trustReport: TrustReport;
    errors: string[];
    durationMs: number;
};

type FullSimulationReport = {
    timestamp: string;
    usersFile: string;
    config: {
        model: string;
        provider: string;
        activePosters: number;
        voterViewers: number;
        argumentsPerTopic: number;
        commentsPerArgument: number;
    };
    scenarioResults: ScenarioResult[];
    crossScenarioSummary?: string;
};

// ────────────────────────── Helpers ──────────────────────────

function snippet(text: string, maxLen = 120): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "…";
}

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

async function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

async function runBatched<T>(tasks: (() => Promise<T>)[], batchSize: number): Promise<T[]> {
    const results: T[] = [];
    for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((fn) => fn()));
        results.push(...batchResults);
    }
    return results;
}

function parseFunctionCallArgs<T>(rawArgs: unknown): T {
    if (typeof rawArgs === "string") return JSON.parse(rawArgs) as T;
    if (rawArgs && typeof rawArgs === "object") return rawArgs as T;
    throw new Error("Tool call arguments were empty or invalid");
}

// ────────────────────────── Auth ──────────────────────────

async function loginUser(appUrl: string, user: SavedUser): Promise<AuthenticatedUser | null> {
    try {
        const res = await fetch(`${appUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, password: user.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data?.token !== "string") return null;
        return { ...user, token: data.token };
    } catch {
        return null;
    }
}

function buildAuthHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
    return { ...(extra || {}), Authorization: `Bearer ${token}` };
}

// ────────────────────────── API Actions ──────────────────────────

async function createTopic(appUrl: string, user: AuthenticatedUser, title: string, description: string): Promise<CreatedTopic | null> {
    try {
        const res = await fetch(`${appUrl}/api/topics`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ title, description }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create topic "${snippet(title, 60)}": ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id || data._id, title, description, createdBy: user.username };
    } catch (err) {
        console.warn(`  ⚠ Topic creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function createArgument(
    appUrl: string,
    user: AuthenticatedUser,
    topicId: string,
    body: string,
    side: "for" | "against" | "neutral",
): Promise<{ id: string } | null> {
    try {
        const res = await fetch(`${appUrl}/api/argument`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ topicId, body, side }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create argument: ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id || data._id };
    } catch (err) {
        console.warn(`  ⚠ Argument creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function createComment(
    appUrl: string,
    user: AuthenticatedUser,
    argumentId: string,
    body: string,
): Promise<{ id: string } | null> {
    try {
        const res = await fetch(`${appUrl}/api/comment`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ argumentId, body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create comment: ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id || data._id };
    } catch (err) {
        console.warn(`  ⚠ Comment creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function castVote(
    appUrl: string,
    user: AuthenticatedUser,
    targetType: CastVote["targetType"],
    targetId: string,
    value: 1 | -1,
): Promise<CastVote | null> {
    try {
        const res = await fetch(`${appUrl}/api/vote`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ targetType, targetId, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return null;
        return {
            targetType,
            targetId,
            value,
            votedBy: user.username,
            upvoteCount: data.upvoteCount ?? 0,
            downvoteCount: data.downvoteCount ?? 0,
        };
    } catch {
        return null;
    }
}

async function fetchTopicDetails(appUrl: string, topicId: string, token: string): Promise<any | null> {
    try {
        const res = await fetch(`${appUrl}/api/topics/${topicId}?num_arguments=50`, {
            headers: buildAuthHeaders(token),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// ────────────────────────── AI Content Generation ──────────────────────────

type GeneratedArgument = { body: string; side: "for" | "against" | "neutral" };
type GeneratedComment = { body: string };

/**
 * Prompt templates per content category.
 * Wikipedia article text is injected as grounding context.
 */
function getArgumentPrompt(
    category: ContentCategory,
    topicTitle: string,
    topicDescription: string,
    wikiText: string,
    count: number,
): { system: string; user: string } {
    const wikiContext = `\n\n--- WIKIPEDIA SOURCE ---\n${wikiText.slice(0, 6000)}\n--- END SOURCE ---\n`;

    const prompts: Record<ContentCategory, { system: string; user: string }> = {
        highQualityFacts: {
            system:
                "You are an expert researcher writing high-quality, well-reasoned arguments for a public deliberation platform. " +
                "Use ONLY facts from the provided Wikipedia source article. Include specific, verifiable facts, real statistics, " +
                "and references to actual studies or data from the article. Arguments should be articulate and well-structured.",
            user:
                `Topic: "${topicTitle}"\nDescription: ${topicDescription}${wikiContext}\n\n` +
                `Write ${count} high-quality factual arguments grounded in the Wikipedia article above. ` +
                `Each 3-6 sentences with at least 2 specific verifiable claims from the source. Mix "for" and "against" sides.`,
        },
        highQualityEvidence: {
            system:
                "You are an expert researcher writing high-quality, evidence-backed arguments for a public deliberation platform. " +
                "Use the provided Wikipedia source as your primary reference. Include specific verifiable facts and cite the source material.",
            user:
                `Topic: "${topicTitle}"\nDescription: ${topicDescription}${wikiContext}\n\n` +
                `Write ${count} high-quality evidence-based arguments referencing the Wikipedia article. ` +
                `Each 3-6 sentences with verifiable claims. Mix "for" and "against" sides.`,
        },
        average: {
            system:
                "You are a diverse group of citizens contributing arguments to a public debate platform. " +
                "Write arguments from different perspectives — some well-reasoned, some passionate opinions, " +
                "some short and informal, some detailed. Vary quality and length. Some should reference the source article, " +
                "others should be general opinions.",
            user:
                `Topic: "${topicTitle}"\nDescription: ${topicDescription}${wikiContext}\n\n` +
                `Write ${count} different arguments. Mix "for", "against", and "neutral" sides. ` +
                `Vary quality: some excellent, some mediocre, some low-effort. Each 1-5 sentences (20-500 chars).`,
        },
        humanError: {
            system:
                "You are simulating well-meaning contributors who make honest mistakes. Write arguments that contain " +
                "genuine attempts at factual claims but with errors — misremembered statistics, slightly wrong dates, " +
                "confused attributions, or oversimplified conclusions. These should feel like real human errors, " +
                "not deliberate misinformation. Reference the source article but get some details wrong.",
            user:
                `Topic: "${topicTitle}"\nDescription: ${topicDescription}${wikiContext}\n\n` +
                `Write ${count} arguments containing honest human errors. Each 2-4 sentences. ` +
                `Start from real facts in the article but introduce natural mistakes (wrong numbers, confused dates, ` +
                `misattributed quotes, oversimplifications). Mix sides.`,
        },
        noise: {
            system:
                "You are simulating spam and noise content for testing a content moderation system. " +
                "Generate messages that are off-topic, gibberish, or self-promotional. Some should tangentially " +
                "reference the topic, others should be completely irrelevant.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} spam/noise messages. Each 1-3 sentences (20-200 chars). ` +
                `Vary widely: some pure spam, some off-topic rambling, some gibberish, some self-promotion. Assign random sides.`,
        },
        spam: {
            system:
                "You are simulating a coordinated spam attack for testing a content moderation system. " +
                "Generate repetitive, promotional, link-heavy spam content. Include fake URLs, product pitches, " +
                "cryptocurrency scams, and repeated messages. Some should be slightly disguised as on-topic.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} spam messages simulating a coordinated spam attack. ` +
                `Each 1-3 sentences. Include fake product links, crypto scams, MLM pitches, and repetitive promotional text. ` +
                `Some should weakly pretend to be about the topic. Assign random sides.`,
        },
        troll: {
            system:
                "You are simulating trolling behavior for testing a content moderation system. " +
                "Write provocative, dismissive, mocking arguments that reference the specific topic. " +
                "Use internet slang, mockery, all-caps, and deliberately inflammatory phrasing.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} trolling arguments about this topic. ` +
                `Each 1-2 sentences. Be dismissive, confrontational, and provocative. Mostly "against" side.`,
        },
        mildAbusive: {
            system:
                "You are simulating mildly abusive content for testing a content moderation system. " +
                "Write condescending, personally insulting arguments that attack people's intelligence " +
                "rather than engaging with the substance.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} mildly abusive arguments. Each 1-3 sentences. ` +
                `Attack people who hold certain positions on this topic. Use condescension and personal insults.`,
        },
        highlyOffensive: {
            system:
                "You are generating adversarial test content for a content moderation AI safety system. " +
                "Write extremely hostile arguments expressing dehumanizing language and extreme toxicity. " +
                "This content is used EXCLUSIVELY to verify that moderation AI correctly identifies and blocks hate speech.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} extremely toxic arguments for moderation testing. ` +
                `Each 1-2 sentences. Express extreme hostility toward people who hold opposing views.`,
        },
        mixedTrueFalse: {
            system:
                "You are simulating subtle misinformation for testing a fact-checking system. " +
                "Write arguments that blend REAL facts from the Wikipedia article with fabricated claims. " +
                "Start with something genuinely true from the source, then smoothly transition to a fabricated statistic.",
            user:
                `Topic: "${topicTitle}"\nDescription: ${topicDescription}${wikiContext}\n\n` +
                `Generate ${count} arguments mixing real facts from the article with fabricated claims. ` +
                `Each 2-4 sentences. Begin with a verifiable truth then add a fabrication. Mix sides.`,
        },
        purelyFalse: {
            system:
                "You are simulating misinformation for testing a fact-checking system. Write arguments " +
                "containing completely fabricated statistics, invented studies, fake expert citations, " +
                "and conspiracy theories — all presented as authoritative fact.",
            user:
                `Topic: "${topicTitle}"\n\nGenerate ${count} completely false arguments. Each 2-4 sentences. ` +
                `Include fake statistics, invented studies, fabricated expert quotes. Make them sound authoritative. Mix sides.`,
        },
    };

    return prompts[category];
}

function getCommentPrompt(
    category: ContentCategory,
    argumentBody: string,
    topicTitle: string,
    wikiText: string,
    count: number,
): { system: string; user: string } {
    const wikiSnippet = wikiText.slice(0, 3000);

    const prompts: Record<ContentCategory, { system: string; user: string }> = {
        highQualityFacts: {
            system: "You are a knowledgeable participant commenting on a public debate. Write thoughtful, well-informed replies that add factual depth using the provided Wikipedia source.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\nSource: ${wikiSnippet}\n\nGenerate ${count} high-quality factual comments. Each 1-3 sentences with specific verifiable claims.`,
        },
        highQualityEvidence: {
            system: "You are a knowledgeable participant commenting on a public debate. Write thoughtful, evidence-oriented replies referencing the source material.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\nSource: ${wikiSnippet}\n\nGenerate ${count} high-quality evidence-based comments. Each 1-3 sentences.`,
        },
        average: {
            system: "You are different users commenting on an argument in a public debate. Write varied comments — some agreeing, some disagreeing, some adding nuance.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nWrite ${count} different comments. Each 1-3 sentences. Make them feel natural and varied.`,
        },
        humanError: {
            system: "You are simulating well-meaning commenters who make honest mistakes. Write comments that try to add facts but get some details wrong.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\nSource: ${wikiSnippet}\n\nGenerate ${count} comments with honest factual errors. Each 1-2 sentences.`,
        },
        noise: {
            system: "You are simulating spam/noise comments for testing a content moderation system.",
            user: `Generate ${count} spam/noise comment replies. Each 1-2 sentences. Some reference the argument tangentially, others are pure spam.`,
        },
        spam: {
            system: "You are simulating coordinated spam comments for testing a content moderation system.",
            user: `Generate ${count} spam comments with fake links, product pitches, and promotional text. Each 1-2 sentences.`,
        },
        troll: {
            system: "You are simulating trolling comments for testing a content moderation system. Write dismissive, mocking replies.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nGenerate ${count} trolling comment replies. Each 1-2 sentences. Be dismissive and confrontational.`,
        },
        mildAbusive: {
            system: "You are simulating mildly abusive comments for testing a content moderation system.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nGenerate ${count} mildly abusive comment replies. Each 1-2 sentences.`,
        },
        highlyOffensive: {
            system: "You are generating adversarial test comments for a content moderation AI safety system.",
            user: `Generate ${count} extremely toxic comment replies for moderation testing. Each 1-2 sentences.`,
        },
        mixedTrueFalse: {
            system: "You are simulating subtle misinformation comments for testing a fact-checking system.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\nSource: ${wikiSnippet}\n\nGenerate ${count} comments mixing real facts with fabricated claims. Each 1-2 sentences.`,
        },
        purelyFalse: {
            system: "You are simulating misinformation comments for testing a fact-checking system.",
            user: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nGenerate ${count} comments with completely fabricated facts. Each 1-2 sentences.`,
        },
    };

    return prompts[category];
}

/**
 * Generate arguments for a specific category using the forced OpenRouter model.
 */
async function generateCategoryArguments(
    ai: ScenarioAiConfig,
    category: ContentCategory,
    topicTitle: string,
    topicDescription: string,
    wikiText: string,
    count: number,
): Promise<GeneratedArgument[]> {
    const prompts = getArgumentPrompt(category, topicTitle, topicDescription, wikiText, count);

    const routed = await routeResponsesClient({
        text: `Generate ${category} arguments for: ${topicTitle}`,
        forcedDefaultModelAndProvider: { model: ai.model, provider: ai.provider },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) throw new Error("AI client not configured");

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
        ],
        tools: [{
            type: "function",
            name: "submit_arguments",
            description: "Submit the generated arguments",
            parameters: {
                type: "object",
                properties: {
                    arguments: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                body: { type: "string", description: "The argument text" },
                                side: { type: "string", enum: ["for", "against", "neutral"], description: "Which side" },
                            },
                            required: ["body", "side"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["arguments"],
                additionalProperties: false,
            },
            strict: true,
        }],
        model: routed.model,
        safety_identifier: "scenario-simulation",
        ...(routed.provider !== "openrouter" ? { store: true } : {}),
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_arguments") {
            const parsed = parseFunctionCallArgs<{ arguments: GeneratedArgument[] }>(item.arguments);
            return parsed.arguments || [];
        }
    }
    throw new Error(`No ${category} arguments returned by model`);
}

/**
 * Generate comments for a specific category using the forced OpenRouter model.
 */
async function generateCategoryComments(
    ai: ScenarioAiConfig,
    category: ContentCategory,
    argumentBody: string,
    topicTitle: string,
    wikiText: string,
    count: number,
): Promise<GeneratedComment[]> {
    const prompts = getCommentPrompt(category, argumentBody, topicTitle, wikiText, count);

    const routed = await routeResponsesClient({
        text: `Generate ${category} comments about: ${topicTitle}`,
        forcedDefaultModelAndProvider: { model: ai.model, provider: ai.provider },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) throw new Error("AI client not configured");

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: prompts.system },
            { role: "user", content: prompts.user },
        ],
        tools: [{
            type: "function",
            name: "submit_comments",
            description: "Submit the generated comments",
            parameters: {
                type: "object",
                properties: {
                    comments: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                body: { type: "string", description: "The comment text" },
                            },
                            required: ["body"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["comments"],
                additionalProperties: false,
            },
            strict: true,
        }],
        model: routed.model,
        safety_identifier: "scenario-simulation",
        ...(routed.provider !== "openrouter" ? { store: true } : {}),
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_comments") {
            const parsed = parseFunctionCallArgs<{ comments: GeneratedComment[] }>(item.arguments);
            return parsed.comments || [];
        }
    }
    throw new Error(`No ${category} comments returned by model`);
}

// ────────────────────────── AI Evaluation ──────────────────────────

function evaluateAiSystems(
    evaluations: AiEvaluation[],
): AiSystemReport {
    const report: AiSystemReport = {
        moderation: {
            total: 0, visible: 0, needsReview: 0, noise: 0, blocked: 0, hidden: 0,
            byCategory: {},
        },
        factChecking: {
            total: 0, verified: 0, inaccurate: 0, mixed: 0, unverified: 0, notChecked: 0,
            byCategory: {},
        },
        ontology: { totalTagged: 0, totalCategories: 0, avgCategoriesPerItem: 0 },
        aiAnalysis: { total: 0, facts: 0, opinions: 0, withJustification: 0 },
    };

    function trackModeration(status: string | undefined, category: string) {
        report.moderation.total++;
        if (status === "visible") report.moderation.visible++;
        else if (status === "needs_review") report.moderation.needsReview++;
        else if (status === "noise") report.moderation.noise++;
        else if (status === "blocked") report.moderation.blocked++;
        else if (status === "hidden") report.moderation.hidden++;

        if (!report.moderation.byCategory[category]) {
            report.moderation.byCategory[category] = { total: 0, visible: 0, blocked: 0, hidden: 0, needsReview: 0, noise: 0 };
        }
        const catReport = report.moderation.byCategory[category];
        catReport.total++;
        if (status === "visible") catReport.visible++;
        else if (status === "blocked") catReport.blocked++;
        else if (status === "hidden") catReport.hidden++;
        else if (status === "needs_review") catReport.needsReview++;
        else if (status === "noise") catReport.noise++;
    }

    function trackFactCheck(verdict: string | undefined, category: string) {
        report.factChecking.total++;
        if (verdict === "verified") report.factChecking.verified++;
        else if (verdict === "inaccurate") report.factChecking.inaccurate++;
        else if (verdict === "mixed") report.factChecking.mixed++;
        else if (verdict === "unverified") report.factChecking.unverified++;
        else report.factChecking.notChecked++;

        if (!report.factChecking.byCategory[category]) {
            report.factChecking.byCategory[category] = { total: 0, verified: 0, inaccurate: 0, mixed: 0, unverified: 0 };
        }
        const catReport = report.factChecking.byCategory[category];
        catReport.total++;
        if (verdict === "verified") catReport.verified++;
        else if (verdict === "inaccurate") catReport.inaccurate++;
        else if (verdict === "mixed") catReport.mixed++;
        else if (verdict === "unverified") catReport.unverified++;
    }

    for (const evaluation of evaluations) {
        for (const arg of evaluation.arguments) {
            trackModeration(arg.visibility?.status, arg.category);
            trackFactCheck(arg.contentFactCheck?.verdict, arg.category);

            if (arg.ontologyCategories && arg.ontologyCategories.length > 0) {
                report.ontology.totalTagged++;
                report.ontology.totalCategories += arg.ontologyCategories.length;
            }

            if (arg.aiAnalysis) {
                report.aiAnalysis.total++;
                if (arg.aiAnalysis.isFact) report.aiAnalysis.facts++;
                if (arg.aiAnalysis.isOpinion) report.aiAnalysis.opinions++;
                if (arg.aiAnalysis.justification) report.aiAnalysis.withJustification++;
            }

            for (const comment of arg.comments) {
                trackModeration(comment.visibility?.status, comment.category);
                trackFactCheck(comment.contentFactCheck?.verdict, comment.category);

                if (comment.ontologyCategories && comment.ontologyCategories.length > 0) {
                    report.ontology.totalTagged++;
                    report.ontology.totalCategories += comment.ontologyCategories.length;
                }
            }
        }
    }

    const ontologyItems = report.ontology.totalTagged;
    report.ontology.avgCategoriesPerItem = ontologyItems > 0
        ? Math.round((report.ontology.totalCategories / ontologyItems) * 100) / 100
        : 0;

    return report;
}

// ────────────────────────── Single Scenario Runner ──────────────────────────

async function runScenario(
    scenario: ScenarioDefinition,
    cfg: ScenarioSimulationConfig,
    posters: AuthenticatedUser[],
    voters: AuthenticatedUser[],
    allUsers: AuthenticatedUser[],
    userIds: string[],
    wikiArticles: Map<string, WikipediaArticle>,
): Promise<ScenarioResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const topicsCreated: CreatedTopic[] = [];
    const argumentsCreated: CreatedArgument[] = [];
    const commentsCreated: CreatedComment[] = [];
    const votesCast: CastVote[] = [];

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  SCENARIO: ${scenario.name}`);
    console.log(`  ${scenario.description}`);
    console.log(`${"═".repeat(60)}`);

    // ── Step 0: Reset trust & snapshot ──
    console.log(`\n  🔄 Resetting trust scores to baseline...`);
    const resetCount = await resetTrustForUsers(userIds);
    console.log(`    ✓ Reset ${resetCount} users`);

    const trustBefore = await snapshotTrust(userIds);
    console.log(`    ✓ Trust snapshot taken (${trustBefore.length} users)`);

    // ── Step 1: Create topics ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 1: Creating topics                    ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    for (const [i, topicDef] of cfg.topics.entries()) {
        const user = pick(posters);
        console.log(`    [${i + 1}/${cfg.topics.length}] ${user.username} creating: "${snippet(topicDef.title, 60)}"`);
        const created = await createTopic(cfg.appUrl, user, topicDef.title, topicDef.description);
        if (created) {
            topicsCreated.push(created);
            console.log(`      ✓ Created (id: ${created.id})`);
        }
    }

    if (topicsCreated.length === 0) {
        errors.push("No topics were created — aborting scenario");
        const trustAfter = await snapshotTrust(userIds);
        return {
            scenario,
            topicsCreated, argumentsCreated, commentsCreated, votesCast,
            aiEvaluations: [],
            aiSystemReport: evaluateAiSystems([]),
            trustReport: buildTrustReport(scenario.id, trustBefore, trustAfter),
            errors,
            durationMs: Date.now() - startTime,
        };
    }

    // ── Step 2: Generate & post arguments ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 2: Creating arguments (distributed)   ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    // Track category assignments for JSON output
    const argCategoryMap = new Map<string, ContentCategory>();

    for (const topic of topicsCreated) {
        const wikiArticle = wikiArticles.get(
            cfg.topics.find((t) => t.title === topic.title)?.wikipediaUrl ?? "",
        );
        const wikiText = wikiArticle?.text ?? "";

        console.log(`\n    Topic: "${snippet(topic.title, 55)}"`);

        // Determine categories for all argument slots
        const argCategories: ContentCategory[] = [];
        for (let i = 0; i < cfg.argumentsPerTopic; i++) {
            argCategories.push(pickCategory(scenario.distribution));
        }

        // Group by category for batch generation
        const categoryCounts = new Map<ContentCategory, number>();
        for (const cat of argCategories) {
            categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        }
        console.log(`    Distribution: ${[...categoryCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

        // Batch generate
        const generatedByCategory = new Map<ContentCategory, GeneratedArgument[]>();
        for (const [category, count] of categoryCounts) {
            const label = CATEGORY_LABELS[category];
            try {
                console.log(`      Generating ${count}× ${label} arguments...`);
                const genArgs = await generateCategoryArguments(
                    cfg.ai, category, topic.title, topic.description || "", wikiText, count,
                );
                generatedByCategory.set(category, genArgs);
                console.log(`      ✓ Got ${genArgs.length} ${label} arguments`);
            } catch (err) {
                console.error(err);
                const msg = `${label} argument generation failed: ${err instanceof Error ? err.message : err}`;
                console.warn(`      ⚠ ${msg}`);
                errors.push(msg);
                generatedByCategory.set(category, []);
            }
        }

        // Post in randomised order
        const categoryIdx = new Map<ContentCategory, number>();
        for (const [i, category] of argCategories.entries()) {
            const idx = categoryIdx.get(category) || 0;
            const pool = generatedByCategory.get(category) || [];
            categoryIdx.set(category, idx + 1);

            if (pool.length === 0) {
                const label = CATEGORY_LABELS[category];
                console.warn(`      [${i + 1}/${cfg.argumentsPerTopic}] ⚠ Skipping ${label} argument — generation failed, no content available`);
                errors.push(`Skipped argument slot for category ${category} on topic "${topic.title}" — no generated content`);
                continue;
            }

            // Cycle through pool with modulo so all slots use real generated content
            const genArg = pool[idx % pool.length];

            const user = pick(posters);
            const label = CATEGORY_LABELS[category];
            console.log(`      [${i + 1}/${cfg.argumentsPerTopic}] ${label} | ${user.username} (${genArg.side}): "${snippet(genArg.body, 55)}"`);

            try {
                const created = await createArgument(cfg.appUrl, user, topic.id, genArg.body, genArg.side);
                if (created) {
                    argumentsCreated.push({
                        id: created.id,
                        topicId: topic.id,
                        side: genArg.side,
                        body: genArg.body,
                        createdBy: user.username,
                        category,
                    });
                    argCategoryMap.set(created.id, category);
                }
            } catch (err) {
                errors.push(`Argument post failed: ${err instanceof Error ? err.message : err}`);
            }
        }
    }

    // ── Step 3: Generate & post comments ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 3: Creating comments (distributed)    ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    // Track comment category assignments
    const commentCategoryMap = new Map<string, ContentCategory>();

    const argsByTopic = new Map<string, CreatedArgument[]>();
    for (const arg of argumentsCreated) {
        const existing = argsByTopic.get(arg.topicId) || [];
        existing.push(arg);
        argsByTopic.set(arg.topicId, existing);
    }

    for (const topic of topicsCreated) {
        const topicArgs = argsByTopic.get(topic.id) || [];
        if (topicArgs.length === 0) continue;

        const wikiArticle = wikiArticles.get(
            cfg.topics.find((t) => t.title === topic.title)?.wikipediaUrl ?? "",
        );
        const wikiText = wikiArticle?.text ?? "";

        console.log(`\n    Topic: "${snippet(topic.title, 55)}" (${topicArgs.length} arguments)`);

        for (const arg of topicArgs) {
            const commentCategories: ContentCategory[] = [];
            for (let i = 0; i < cfg.commentsPerArgument; i++) {
                commentCategories.push(pickCategory(scenario.distribution));
            }

            // Group by category
            const commentCategoryCounts = new Map<ContentCategory, number>();
            for (const cat of commentCategories) {
                commentCategoryCounts.set(cat, (commentCategoryCounts.get(cat) || 0) + 1);
            }

            // Batch generate
            const generatedCommentsByCategory = new Map<ContentCategory, GeneratedComment[]>();
            for (const [category, count] of commentCategoryCounts) {
                try {
                    const genComments = await generateCategoryComments(
                        cfg.ai, category, arg.body, topic.title, wikiText, count,
                    );
                    generatedCommentsByCategory.set(category, genComments);
                    console.log(`        ✓ Got ${genComments.length} ${CATEGORY_LABELS[category]} comments`);
                } catch (err) {
                    console.error(err);
                    const msg = `${CATEGORY_LABELS[category]} comment generation failed: ${err instanceof Error ? err.message : err}`;
                    console.warn(`        ⚠ ${msg}`);
                    errors.push(msg);
                    generatedCommentsByCategory.set(category, []);
                }
            }

            // Post comments
            const commentCategoryIdx = new Map<ContentCategory, number>();
            const commentTasks = commentCategories.flatMap((category) => {
                const user = pick(posters);
                const idx = commentCategoryIdx.get(category) || 0;
                const pool = generatedCommentsByCategory.get(category) || [];
                commentCategoryIdx.set(category, idx + 1);
                if (pool.length === 0) {
                    const msg = `Skipped comment slot for category ${category} on argument ${arg.id} — no generated content`;
                    console.warn(`        ⚠ ${msg}`);
                    errors.push(msg);
                    return [];
                }
                // Cycle through pool with modulo so all slots use real generated content
                const genComment = pool[idx % pool.length];
                return [async () => {
                    const created = await createComment(cfg.appUrl, user, arg.id, genComment.body);
                    if (created) {
                        commentCategoryMap.set(created.id, category);
                        commentsCreated.push({
                            id: created.id,
                            argumentId: arg.id,
                            body: genComment.body,
                            createdBy: user.username,
                            category,
                        });
                    }
                    return created;
                }];
            });

            await runBatched(commentTasks, cfg.concurrency);
            console.log(`      ✓ ${commentsCreated.filter((c) => c.argumentId === arg.id).length} comments on argument by ${arg.createdBy}`);
        }
    }

    // ── Step 4: Cast votes (voters only) ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 4: Casting votes                      ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    const shuffledVoters = shuffle([...voters, ...posters]); // All users can vote
    const voteTasks: (() => Promise<CastVote | null>)[] = [];

    for (const topic of topicsCreated) {
        for (const user of shuffledVoters) {
            if (Math.random() > cfg.voteProbability) continue;
            const value: 1 | -1 = Math.random() > 0.3 ? 1 : -1;
            voteTasks.push(() => castVote(cfg.appUrl, user, "Topic", topic.id, value));
        }
    }
    for (const arg of argumentsCreated) {
        for (const user of shuffledVoters) {
            if (Math.random() > cfg.voteProbability) continue;
            const value: 1 | -1 = Math.random() > 0.35 ? 1 : -1;
            voteTasks.push(() => castVote(cfg.appUrl, user, "Argument", arg.id, value));
        }
    }
    for (const comment of commentsCreated) {
        for (const user of shuffledVoters) {
            if (Math.random() > cfg.voteProbability) continue;
            const value: 1 | -1 = Math.random() > 0.4 ? 1 : -1;
            voteTasks.push(() => castVote(cfg.appUrl, user, "Comment", comment.id, value));
        }
    }

    console.log(`    Casting ${voteTasks.length} votes (concurrency: ${cfg.concurrency})...`);
    const voteResults = await runBatched(voteTasks, cfg.concurrency);
    for (const vote of voteResults) {
        if (vote) votesCast.push(vote);
    }
    console.log(`    ✓ Cast ${votesCast.length} votes`);

    // ── Step 5: Wait for AI processing ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 5: Waiting for AI processing          ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);
    console.log(`    Waiting ${cfg.aiProcessingWaitMs / 1000}s for background AI tasks...`);
    await sleep(cfg.aiProcessingWaitMs);

    // ── Step 6: Evaluate AI systems ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 6: Evaluating AI systems              ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    const viewerToken = allUsers[0].token;
    const aiEvaluations: AiEvaluation[] = [];

    const detailResults = await Promise.all(
        topicsCreated.map(async (topic) => {
            const details = await fetchTopicDetails(cfg.appUrl, topic.id, viewerToken);
            if (!details) console.warn(`    ⚠ Could not fetch topic ${topic.id}`);
            return { topic, details };
        }),
    );

    for (const { topic, details } of detailResults) {
        if (!details) continue;

        const evaluation: AiEvaluation = {
            topicId: topic.id,
            title: topic.title,
            arguments: (details.arguments || []).map((arg: any) => ({
                id: arg.id,
                side: arg.side,
                bodySnippet: snippet(arg.body, 200),
                category: argCategoryMap.get(arg.id) ?? "average",
                visibility: arg.visibility,
                ontologyCategories: arg.ontologyCategories,
                contentFactCheck: arg.contentFactCheck,
                aiAnalysis: arg.aiAnalysis,
                evidenceFactChecks: (arg.evidence || [])
                    .filter((e: any) => e.factCheck)
                    .map((e: any) => e.factCheck),
                comments: (arg.comments || []).map((c: any) => ({
                    id: c.id,
                    bodySnippet: snippet(c.body, 200),
                    category: commentCategoryMap.get(c.id) ?? "average",
                    visibility: c.visibility,
                    ontologyCategories: c.ontologyCategories,
                    contentFactCheck: c.contentFactCheck,
                })),
            })),
        };
        aiEvaluations.push(evaluation);
    }

    console.log(`    ✓ Evaluated ${aiEvaluations.length} topics`);

    const aiSystemReport = evaluateAiSystems(aiEvaluations);

    // Print scenario report
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  ${scenario.id} — AI Systems Report`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    console.log(`\n    📋 MODERATION (by category)`);
    for (const [cat, stats] of Object.entries(aiSystemReport.moderation.byCategory)) {
        console.log(`      ${CATEGORY_LABELS[cat as ContentCategory] || cat}: total=${stats.total} visible=${stats.visible} blocked=${stats.blocked} hidden=${stats.hidden} review=${stats.needsReview} noise=${stats.noise}`);
    }

    console.log(`\n    🔍 FACT-CHECKING (by category)`);
    for (const [cat, stats] of Object.entries(aiSystemReport.factChecking.byCategory)) {
        console.log(`      ${CATEGORY_LABELS[cat as ContentCategory] || cat}: total=${stats.total} verified=${stats.verified} inaccurate=${stats.inaccurate} mixed=${stats.mixed} unverified=${stats.unverified}`);
    }

    // ── Step 7: Trust delta ──
    console.log(`\n  ╔══════════════════════════════════════════════╗`);
    console.log(`  ║  Phase 7: Recording trust deltas             ║`);
    console.log(`  ╚══════════════════════════════════════════════╝`);

    const trustAfter = await snapshotTrust(userIds);
    const trustReport = buildTrustReport(scenario.id, trustBefore, trustAfter);

    console.log(`    Average trust delta: ${trustReport.stats.avgDelta}`);
    console.log(`    Users improved: ${trustReport.stats.usersImproved} | Degraded: ${trustReport.stats.usersDegraded} | Unchanged: ${trustReport.stats.usersUnchanged}`);
    console.log(`    Max positive: +${trustReport.stats.maxPositiveDelta} | Max negative: ${trustReport.stats.maxNegativeDelta}`);

    const durationMs = Date.now() - startTime;
    console.log(`\n    ⏱ Scenario completed in ${(durationMs / 1000).toFixed(1)}s`);

    return {
        scenario,
        topicsCreated,
        argumentsCreated,
        commentsCreated,
        votesCast,
        aiEvaluations,
        aiSystemReport,
        trustReport,
        errors,
        durationMs,
    };
}

// ────────────────────────── Cross-Scenario AI Summary ──────────────────────────

async function generateCrossScenarioSummary(
    ai: ScenarioAiConfig,
    results: ScenarioResult[],
): Promise<string> {
    const routed = await routeResponsesClient({
        text: "Evaluate cross-scenario AI system performance",
        forcedDefaultModelAndProvider: { model: ai.model, provider: ai.provider },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) return "(Cross-scenario summary unavailable — no client configured)";

    const scenarioSummaries = results.map((r) => {
        const mod = r.aiSystemReport.moderation;
        const fc = r.aiSystemReport.factChecking;
        return `## ${r.scenario.name}
Description: ${r.scenario.description}
Moderation: total=${mod.total} visible=${mod.visible} blocked=${mod.blocked} hidden=${mod.hidden} noise=${mod.noise} review=${mod.needsReview}
By category: ${JSON.stringify(mod.byCategory, null, 1)}
Fact-checking: total=${fc.total} verified=${fc.verified} inaccurate=${fc.inaccurate} mixed=${fc.mixed} unverified=${fc.unverified}
By category: ${JSON.stringify(fc.byCategory, null, 1)}
Trust: avgDelta=${r.trustReport.stats.avgDelta} improved=${r.trustReport.stats.usersImproved} degraded=${r.trustReport.stats.usersDegraded}
Errors: ${r.errors.length}`;
    }).join("\n\n");

    try {
        const response = await routed.client.responses.create({
            input: [
                {
                    role: "system",
                    content:
                        "You are an AI systems evaluator. Analyze cross-scenario performance of AI moderation, " +
                        "fact-checking, and trust scoring systems. Be specific, quantitative, and actionable. " +
                        "Focus on how the systems perform differently across scenarios and what that reveals about " +
                        "their strengths and weaknesses.",
                },
                {
                    role: "user",
                    content: `Evaluate the AI system performance across these 5 evaluation scenarios:\n\n${scenarioSummaries}\n\n` +
                        `Provide a structured cross-scenario analysis covering:\n` +
                        `1. **Moderation Accuracy by Scenario** — How does moderation handle pure factual vs mixed vs spam vs abuse?\n` +
                        `2. **Fact-Checking Performance** — Does it correctly flag false content while passing factual? False positive/negative rates per scenario.\n` +
                        `3. **Trust Score Impact** — How do trust deltas correlate with content quality across scenarios?\n` +
                        `4. **Resilience Under Attack** — How well do systems hold up in Scenarios 4 and 5?\n` +
                        `5. **Key Findings & Recommendations** — What should be improved?\n\nKeep under 1000 words.`,
                },
            ],
            model: routed.model,
            safety_identifier: "scenario-simulation",
            ...(routed.provider !== "openrouter" ? { store: true } : {}),
        });

        const textOutput = response.output?.find((o: any) => o.type === "message");
        if (textOutput && "content" in textOutput) {
            const textParts = (textOutput as any).content;
            if (Array.isArray(textParts)) {
                return textParts.map((p: any) => p.text || "").join("");
            }
        }
        return "(Cross-scenario summary returned empty response)";
    } catch (err) {
        return `(Cross-scenario summary failed: ${err instanceof Error ? err.message : err})`;
    }
}

// ────────────────────────── CLI Argument Parsing ──────────────────────────

function parseCliArgs(): {
    inputFile: string;
    scenarioFilter: number[] | null;
    overrides: Partial<ScenarioSimulationConfig>;
} {
    const args = process.argv.slice(2);
    let inputFile = "";
    let scenarioFilter: number[] | null = null;
    const overrides: Partial<ScenarioSimulationConfig> = {};

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--scenarios" && args[i + 1]) {
            scenarioFilter = args[i + 1].split(",").map(Number).filter((n) => n >= 1 && n <= 5);
            i++;
        } else if (args[i] === "--topics" && args[i + 1]) {
            // Not directly on config; handled in main
            i++;
        } else if (args[i] === "--args" && args[i + 1]) {
            overrides.argumentsPerTopic = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === "--comments" && args[i + 1]) {
            overrides.commentsPerArgument = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === "--posters" && args[i + 1]) {
            overrides.users = { ...DEFAULT_SCENARIO_CONFIG.users, activePosters: parseInt(args[i + 1], 10) };
            i++;
        } else if (args[i] === "--wait" && args[i + 1]) {
            overrides.aiProcessingWaitMs = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === "--model" && args[i + 1]) {
            overrides.ai = { ...DEFAULT_SCENARIO_CONFIG.ai, model: args[i + 1] };
            i++;
        } else if (!args[i].startsWith("--") && !inputFile) {
            inputFile = args[i];
        }
    }

    return { inputFile, scenarioFilter, overrides };
}

// ────────────────────────── Main ──────────────────────────

async function main() {
    const { inputFile, scenarioFilter, overrides } = parseCliArgs();

    if (!inputFile) {
        console.error("Usage: npx tsx src/app/scripts/userSimulation/simulateScenarios.ts <simulation_file.json> [--scenarios 1,2,3] [--args N] [--comments N] [--model model_name]");
        process.exitCode = 1;
        return;
    }

    const cfg: ScenarioSimulationConfig = { ...DEFAULT_SCENARIO_CONFIG, ...overrides };
    const resolvedPath = path.resolve(process.cwd(), inputFile);

    // Determine which scenarios to run
    const selectedScenarios = scenarioFilter
        ? SCENARIOS.filter((_, i) => scenarioFilter.includes(i + 1))
        : SCENARIOS;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Scenario Simulation & AI Evaluation`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Users file:      ${resolvedPath}`);
    console.log(`  App URL:         ${cfg.appUrl}`);
    console.log(`  AI Model:        ${cfg.ai.model} (${cfg.ai.provider})`);
    console.log(`  Topics:          ${cfg.topics.length} (with Wikipedia context)`);
    console.log(`  Args/topic:      ${cfg.argumentsPerTopic}`);
    console.log(`  Comments/arg:    ${cfg.commentsPerArgument}`);
    console.log(`  Active posters:  ${cfg.users.activePosters}`);
    console.log(`  Voter/viewers:   ${cfg.users.totalUsers - cfg.users.activePosters}`);
    console.log(`  Scenarios:       ${selectedScenarios.map((s) => s.id).join(", ")}`);
    console.log(`${"═".repeat(60)}\n`);

    // ── Load users ──
    let rawData: { users: SavedUser[] };
    try {
        const content = await fs.readFile(resolvedPath, "utf-8");
        rawData = JSON.parse(content);
    } catch (err) {
        console.error(`Failed to read users file: ${err instanceof Error ? err.message : err}`);
        process.exitCode = 1;
        return;
    }

    const savedUsers = (rawData.users || []).filter((u) => u.registered);
    console.log(`Loaded ${savedUsers.length} registered users from file`);

    if (savedUsers.length === 0) {
        console.error("No registered users found — aborting");
        process.exitCode = 1;
        return;
    }

    // ── Authenticate users ──
    console.log(`\nAuthenticating users (concurrency: ${cfg.concurrency})...`);
    const authenticatedUsers: AuthenticatedUser[] = [];
    for (let batch = 0; batch < savedUsers.length; batch += cfg.concurrency) {
        const batchUsers = savedUsers.slice(batch, batch + cfg.concurrency);
        const results = await Promise.all(batchUsers.map((u) => loginUser(cfg.appUrl, u)));
        for (const [i, result] of results.entries()) {
            if (result) {
                authenticatedUsers.push(result);
            } else {
                console.warn(`  ✗ ${batchUsers[i].username} login failed`);
            }
        }
    }

    console.log(`Authenticated ${authenticatedUsers.length}/${savedUsers.length} users`);
    if (authenticatedUsers.length === 0) {
        console.error("No users could be authenticated — aborting");
        process.exitCode = 1;
        return;
    }

    // ── Split into posters vs voters ──
    const shuffled = shuffle(authenticatedUsers);
    const posterCount = Math.min(cfg.users.activePosters, shuffled.length);
    const posters = shuffled.slice(0, posterCount);
    const voters = shuffled.slice(posterCount);
    console.log(`Split: ${posters.length} active posters, ${voters.length} voter/viewers`);

    // ── Resolve user IDs for trust tracking ──
    console.log(`\nResolving user IDs for trust tracking...`);
    const emailToId = await getUserIdsByEmails(authenticatedUsers.map((u) => u.email));
    const userIds = [...emailToId.values()];
    console.log(`  ✓ Resolved ${userIds.length} user IDs`);

    // ── Fetch Wikipedia articles ──
    console.log(`\nFetching Wikipedia articles...`);
    const wikiUrls = cfg.topics.map((t) => t.wikipediaUrl);
    const wikiArticles = await fetchAllArticles(wikiUrls);
    console.log(`  ✓ Fetched ${wikiArticles.size}/${wikiUrls.length} articles`);

    // ── Run scenarios sequentially ──
    const scenarioResults: ScenarioResult[] = [];

    for (const [i, scenario] of selectedScenarios.entries()) {
        console.log(`\n\n${"╔" + "═".repeat(58) + "╗"}`);
        console.log(`${"║"}  Running scenario ${i + 1}/${selectedScenarios.length}${" ".repeat(58 - 30 - String(i + 1).length - String(selectedScenarios.length).length)}${"║"}`);
        console.log(`${"╚" + "═".repeat(58) + "╝"}`);

        const result = await runScenario(
            scenario, cfg, posters, voters, authenticatedUsers, userIds, wikiArticles,
        );
        scenarioResults.push(result);
    }

    // ── Cross-scenario summary ──
    console.log(`\n\n${"═".repeat(60)}`);
    console.log(`  Generating cross-scenario AI analysis...`);
    console.log(`${"═".repeat(60)}`);

    const crossScenarioSummary = await generateCrossScenarioSummary(cfg.ai, scenarioResults);
    console.log(`\n${crossScenarioSummary.split("\n").map((l) => `  ${l}`).join("\n")}`);

    // ── Save full report ──
    const fullReport: FullSimulationReport = {
        timestamp: new Date().toISOString(),
        usersFile: resolvedPath,
        config: {
            model: cfg.ai.model,
            provider: cfg.ai.provider,
            activePosters: posters.length,
            voterViewers: voters.length,
            argumentsPerTopic: cfg.argumentsPerTopic,
            commentsPerArgument: cfg.commentsPerArgument,
        },
        scenarioResults,
        crossScenarioSummary,
    };

    const outputFile = path.resolve(process.cwd(), `scenario_simulation_${Date.now()}.json`);
    await fs.writeFile(outputFile, JSON.stringify(fullReport, null, 2), "utf-8");
    console.log(`\n✅ Full scenario report saved to: ${outputFile}`);

    // ── Final summary table ──
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  SCENARIO SUMMARY`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  ${"Scenario".padEnd(45)} ${"Args".padStart(5)} ${"Cmts".padStart(5)} ${"Votes".padStart(6)} ${"Errs".padStart(5)} ${"Time".padStart(7)}`);
    console.log(`  ${"-".repeat(45)} ${"-".repeat(5)} ${"-".repeat(5)} ${"-".repeat(6)} ${"-".repeat(5)} ${"-".repeat(7)}`);
    for (const r of scenarioResults) {
        console.log(
            `  ${r.scenario.name.slice(0, 45).padEnd(45)} ` +
            `${String(r.argumentsCreated.length).padStart(5)} ` +
            `${String(r.commentsCreated.length).padStart(5)} ` +
            `${String(r.votesCast.length).padStart(6)} ` +
            `${String(r.errors.length).padStart(5)} ` +
            `${(r.durationMs / 1000).toFixed(1).padStart(6)}s`,
        );
    }
    console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
    console.error("Scenario simulation failed:", err);
    process.exitCode = 1;
});
