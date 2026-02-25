/**
 * simulateContent.ts
 *
 * Reads a saved simulation_*.json users file, logs each user in,
 * generates discussion content (topics, arguments, comments, votes)
 * via AI, then evaluates the effectiveness of every AI system on
 * the site (moderation, ontology classification, fact-checking,
 * AI analysis, evidence fact-checking, trust scoring).
 *
 * Usage:
 *   npx tsx src/app/scripts/userSimulation/simulateContent.ts <simulation_file.json>
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";
import config from "./config.json";
import { routeResponsesClient } from "../../services/aiRoutingService";

// ────────────────────────── Types ──────────────────────────

type SavedUser = {
    username: string;
    email: string;
    password: string;
    name: string;
    bio: string;
    registered: boolean;
    loginStatus?: number;
    loginError?: string;
};

type AuthenticatedUser = SavedUser & { token: string };

type CreatedTopic = {
    id: string;
    title: string;
    description?: string;
    createdBy: string; // username
};

type CreatedArgument = {
    id: string;
    topicId: string;
    side: "for" | "against" | "neutral";
    body: string;
    createdBy: string;
};

type CreatedComment = {
    id: string;
    argumentId: string;
    body: string;
    createdBy: string;
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
        visibility?: VisibilityInfo;
        ontologyCategories?: OntologyCategory[];
        contentFactCheck?: ContentFactCheckInfo;
        aiAnalysis?: AiAnalysisInfo;
        evidenceFactChecks?: EvidenceFactCheck[];
        comments: Array<{
            id: string;
            bodySnippet: string;
            visibility?: VisibilityInfo;
            ontologyCategories?: OntologyCategory[];
            contentFactCheck?: ContentFactCheckInfo;
        }>;
    }>;
};

type AiSystemReport = {
    moderation: { total: number; visible: number; needsReview: number; noise: number; blocked: number; hidden: number };
    ontology: { totalTagged: number; totalCategories: number; avgCategoriesPerItem: number };
    factChecking: { total: number; verified: number; inaccurate: number; mixed: number; unverified: number; notChecked: number };
    aiAnalysis: { total: number; facts: number; opinions: number; withJustification: number };
    evidenceFactChecking: { total: number; verified: number; inaccurate: number; mixed: number; unverified: number };
};

type SimulationReport = {
    timestamp: string;
    usersFile: string;
    usersLoaded: number;
    usersAuthenticated: number;
    topicsCreated: CreatedTopic[];
    argumentsCreated: CreatedArgument[];
    commentsCreated: CreatedComment[];
    votesCast: CastVote[];
    aiEvaluations: AiEvaluation[];
    aiSystemReport: AiSystemReport;
    aiSummary?: string;
    errors: string[];
};

// ────────────────────────── Helpers ──────────────────────────

const APP_URL = config.appUrl;
const CONCURRENCY = config.concurrency ?? 5;

function buildAuthHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
    return { ...(extra || {}), Authorization: `Bearer ${token}` };
}

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

// ────────────────────────── Auth ──────────────────────────

async function loginUser(user: SavedUser): Promise<AuthenticatedUser | null> {
    try {
        const res = await fetch(`${APP_URL}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, password: user.password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data?.token !== "string") {
            return null;
        }
        return { ...user, token: data.token };
    } catch {
        return null;
    }
}

// ────────────────────────── AI Content Generation ──────────────────────────

type GeneratedTopic = { title: string; description: string };
type GeneratedArgument = { body: string; side: "for" | "against" | "neutral"; evidence?: Array<{ url: string; kind: "link" }> };
type GeneratedComment = { body: string; evidence?: Array<{ url: string; kind: "link" }> };

function parseFunctionCallArgs<T>(rawArgs: unknown): T {
    if (typeof rawArgs === "string") return JSON.parse(rawArgs) as T;
    if (rawArgs && typeof rawArgs === "object") return rawArgs as T;
    throw new Error("Tool call arguments were empty or invalid");
}

async function generateTopics(count: number): Promise<GeneratedTopic[]> {
    const routed = await routeResponsesClient({
        text: "Generate discussion topics for a public deliberation platform",
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        forcedDefaultModelAndProvider: {
            model: process.env.GROK_RESPONSES_MODEL || "grok-4-1",
            provider: "grok"
        },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) throw new Error("AI client not configured");

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: "You are a creative assistant that generates diverse, thought-provoking discussion topics for a public deliberation platform. Topics should span politics, technology, environment, society, health, economics, ethics, and culture. Each topic should be a clear debate proposition." },
            { role: "user", content: `Generate ${count} unique discussion topics. Each must have a concise title (max 180 chars) and a brief description (1-3 sentences, max 500 chars). Make them varied, some controversial, some straightforward, some niche.` },
        ],
        tools: [{
            type: "function",
            name: "submit_topics",
            description: "Submit the generated discussion topics",
            parameters: {
                type: "object",
                properties: {
                    topics: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                title: { type: "string", description: "Topic title, max 180 characters" },
                                description: { type: "string", description: "Topic description, 1-3 sentences" },
                            },
                            required: ["title", "description"],
                            additionalProperties: false,
                        },
                    },
                },
                required: ["topics"],
                additionalProperties: false,
            },
            strict: true,
        }],
        model: routed.model,
        safety_identifier: "user-simulation",
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
        store: true,
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_topics") {
            const parsed = parseFunctionCallArgs<{ topics: GeneratedTopic[] }>(item.arguments);
            return parsed.topics;
        }
    }
    throw new Error("No topics returned by model");
}

// ────────────────────────── API Actions ──────────────────────────

async function createTopic(user: AuthenticatedUser, topic: GeneratedTopic): Promise<CreatedTopic | null> {
    try {
        const res = await fetch(`${APP_URL}/api/topics`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ title: topic.title, description: topic.description }),
        });
        const data = await res.json().catch(() => {});
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create topic "${snippet(topic.title, 60)}": ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id || data._id, title: topic.title, description: topic.description, createdBy: user.username };
    } catch (err) {
        console.warn(`  ⚠ Topic creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function createArgument(user: AuthenticatedUser, topicId: string, arg: GeneratedArgument): Promise<CreatedArgument | null> {
    try {
        const res = await fetch(`${APP_URL}/api/argument`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({
                topicId,
                body: arg.body,
                side: arg.side,
                ...(arg.evidence && arg.evidence.length > 0 ? { evidence: arg.evidence } : {}),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create argument: ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id, topicId, side: arg.side, body: arg.body, createdBy: user.username };
    } catch (err) {
        console.warn(`  ⚠ Argument creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function createComment(user: AuthenticatedUser, argumentId: string, comment: GeneratedComment): Promise<CreatedComment | null> {
    try {
        const res = await fetch(`${APP_URL}/api/comment`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({
                argumentId,
                body: comment.body,
                ...(comment.evidence && comment.evidence.length > 0 ? { evidence: comment.evidence } : {}),
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            console.warn(`  ⚠ Failed to create comment: ${data?.error || res.status}`);
            return null;
        }
        return { id: data.id, argumentId, body: comment.body, createdBy: user.username };
    } catch (err) {
        console.warn(`  ⚠ Comment creation error: ${err instanceof Error ? err.message : err}`);
        return null;
    }
}

async function castVote(user: AuthenticatedUser, targetType: CastVote["targetType"], targetId: string, value: 1 | -1): Promise<CastVote | null> {
    try {
        const res = await fetch(`${APP_URL}/api/vote`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ targetType, targetId, value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return null;
        }
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

// ────────────────────────── AI Evaluation ──────────────────────────

async function fetchTopicDetails(topicId: string, token: string): Promise<any | null> {
    try {
        const res = await fetch(`${APP_URL}/api/topics/${topicId}?num_arguments=50`, {
            headers: buildAuthHeaders(token),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

function evaluateAiSystems(evaluations: AiEvaluation[]): AiSystemReport {
    const report: AiSystemReport = {
        moderation: { total: 0, visible: 0, needsReview: 0, noise: 0, blocked: 0, hidden: 0 },
        ontology: { totalTagged: 0, totalCategories: 0, avgCategoriesPerItem: 0 },
        factChecking: { total: 0, verified: 0, inaccurate: 0, mixed: 0, unverified: 0, notChecked: 0 },
        aiAnalysis: { total: 0, facts: 0, opinions: 0, withJustification: 0 },
        evidenceFactChecking: { total: 0, verified: 0, inaccurate: 0, mixed: 0, unverified: 0 },
    };

    for (const evaluation of evaluations) {
        for (const arg of evaluation.arguments) {
            // Moderation
            report.moderation.total++;
            const vs = arg.visibility?.status;
            if (vs === "visible") report.moderation.visible++;
            else if (vs === "needs_review") report.moderation.needsReview++;
            else if (vs === "noise") report.moderation.noise++;
            else if (vs === "blocked") report.moderation.blocked++;
            else if (vs === "hidden") report.moderation.hidden++;

            // Ontology
            if (arg.ontologyCategories && arg.ontologyCategories.length > 0) {
                report.ontology.totalTagged++;
                report.ontology.totalCategories += arg.ontologyCategories.length;
            }

            // Content Fact-Checking
            report.factChecking.total++;
            const cfv = arg.contentFactCheck?.verdict;
            if (cfv === "verified") report.factChecking.verified++;
            else if (cfv === "inaccurate") report.factChecking.inaccurate++;
            else if (cfv === "mixed") report.factChecking.mixed++;
            else if (cfv === "unverified") report.factChecking.unverified++;
            else report.factChecking.notChecked++;

            // AI Analysis
            if (arg.aiAnalysis) {
                report.aiAnalysis.total++;
                if (arg.aiAnalysis.isFact) report.aiAnalysis.facts++;
                if (arg.aiAnalysis.isOpinion) report.aiAnalysis.opinions++;
                if (arg.aiAnalysis.justification) report.aiAnalysis.withJustification++;
            }

            // Evidence Fact-Checking
            if (arg.evidenceFactChecks) {
                for (const efc of arg.evidenceFactChecks) {
                    report.evidenceFactChecking.total++;
                    const ev = efc.verdict;
                    if (ev === "verified") report.evidenceFactChecking.verified++;
                    else if (ev === "inaccurate") report.evidenceFactChecking.inaccurate++;
                    else if (ev === "mixed") report.evidenceFactChecking.mixed++;
                    else if (ev === "unverified") report.evidenceFactChecking.unverified++;
                }
            }

            // Comments
            for (const comment of arg.comments) {
                report.moderation.total++;
                const cs = comment.visibility?.status;
                if (cs === "visible") report.moderation.visible++;
                else if (cs === "needs_review") report.moderation.needsReview++;
                else if (cs === "noise") report.moderation.noise++;
                else if (cs === "blocked") report.moderation.blocked++;
                else if (cs === "hidden") report.moderation.hidden++;

                if (comment.ontologyCategories && comment.ontologyCategories.length > 0) {
                    report.ontology.totalTagged++;
                    report.ontology.totalCategories += comment.ontologyCategories.length;
                }

                report.factChecking.total++;
                const ccfv = comment.contentFactCheck?.verdict;
                if (ccfv === "verified") report.factChecking.verified++;
                else if (ccfv === "inaccurate") report.factChecking.inaccurate++;
                else if (ccfv === "mixed") report.factChecking.mixed++;
                else if (ccfv === "unverified") report.factChecking.unverified++;
                else report.factChecking.notChecked++;
            }
        }
    }

    const ontologyItems = report.ontology.totalTagged;
    report.ontology.avgCategoriesPerItem = ontologyItems > 0
        ? Math.round((report.ontology.totalCategories / ontologyItems) * 100) / 100
        : 0;

    return report;
}

async function generateAiSummary(report: AiSystemReport, evaluations: AiEvaluation[]): Promise<string> {
    const routed = await routeResponsesClient({
        text: "Evaluate AI system effectiveness",
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        forcedDefaultModelAndProvider: {
            model: process.env.GROK_RESPONSES_MODEL || "grok-4-1",
            provider: "grok"
        },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) return "(AI summary unavailable — no client configured)";

    const sampleContent: string[] = [];
    for (const evaluation of evaluations.slice(0, 5)) {
        sampleContent.push(`\nTopic: ${evaluation.title}`);
        for (const arg of evaluation.arguments.slice(0, 3)) {
            sampleContent.push(`  Argument (${arg.side}): ${snippet(arg.bodySnippet, 200)}`);
            sampleContent.push(`    Moderation: ${arg.visibility?.status || "unknown"} | Fact-check: ${arg.contentFactCheck?.verdict || "none"} | AI analysis: fact=${arg.aiAnalysis?.isFact}, opinion=${arg.aiAnalysis?.isOpinion}`);
            if (arg.ontologyCategories?.length) {
                sampleContent.push(`    Ontology: ${arg.ontologyCategories.map((c) => c.label).join(", ")}`);
            }
        }
    }

    try {
        const response = await routed.client.responses.create({
            input: [
                {
                    role: "system",
                    content: "You are an AI systems evaluator. Analyze the performance of AI systems on a public deliberation platform. Be specific, quantitative, and actionable.",
                },
                {
                    role: "user",
                    content: `Evaluate the effectiveness of these AI systems based on the following data from a simulated content run.

## Aggregate Statistics
${JSON.stringify(report, null, 2)}

## Sample Content & AI Decisions
${sampleContent.join("\n")}

Provide a structured evaluation covering:
1. **Moderation Accuracy** — Is content being classified correctly? Are false positives/negatives evident?
2. **Ontology Classification** — Are topics/arguments being tagged with relevant categories? Coverage gaps?
3. **Fact-Checking** — How well are factual claims being identified and verified? Any obvious misses?
4. **AI Analysis (Fact vs Opinion)** — Is the system correctly distinguishing facts from opinions?
5. **Overall Assessment** — Strengths, weaknesses, and recommended improvements.

Keep the response under 800 words.`,
                },
            ],
            model: routed.model,
            safety_identifier: "user-simulation",
            ...(routed.provider === "grok" ? {} : { reasoning: { effort: "medium" } }),
            store: true,
        });

        const textOutput = response.output?.find((o: any) => o.type === "message");
        if (textOutput && "content" in textOutput) {
            const textParts = (textOutput as any).content;
            if (Array.isArray(textParts)) {
                return textParts.map((p: any) => p.text || "").join("");
            }
        }
        return "(AI summary returned empty response)";
    } catch (err) {
        return `(AI summary failed: ${err instanceof Error ? err.message : err})`;
    }
}

// ────────────────────────── Content Simulation Pipeline ──────────────────────────

const TOPICS_PER_SIMULATION = (config as any).topicsPerSimulation ?? 3;
const ARGUMENTS_PER_TOPIC = (config as any).argumentsPerTopic ?? 10;
const COMMENTS_PER_ARGUMENT = (config as any).commentsPerArgument ?? 15;
const AI_PROCESSING_WAIT_MS = (config as any).aiProcessingWaitMs ?? 8000;
const VOTE_PROBABILITY = (config as any).voteProbability ?? 0.6;

// Content distribution percentages (from config)
const DIST = {
    noise:              ((config as any).contentDistribution?.noise ?? 0.20),
    highQualityFacts:   ((config as any).contentDistribution?.highQualityFacts ?? 0.20),
    highQualityEvidence:((config as any).contentDistribution?.highQualityEvidence ?? 0.15),
    troll:              ((config as any).contentDistribution?.troll ?? 0.05),
    mildAbusive:        ((config as any).contentDistribution?.mildAbusive ?? 0.02),
    highlyOffensive:    ((config as any).contentDistribution?.highlyOffensive ?? 0.01),
    mixedTrueFalse:     ((config as any).contentDistribution?.mixedTrueFalse ?? 0.05),
    purelyFalse:        ((config as any).contentDistribution?.purelyFalse ?? 0.05),
    average:            ((config as any).contentDistribution?.average ?? 0.27),
};

type ContentCategory = keyof typeof DIST;

function pickContentCategory(): ContentCategory {
    const r = Math.random();
    let cumulative = 0;
    for (const [key, pct] of Object.entries(DIST) as [ContentCategory, number][]) {
        cumulative += pct;
        if (r < cumulative) return key;
    }
    return "average";
}

// Manual topics from config
const MANUAL_TOPICS: GeneratedTopic[] = ((config as any).manualTopics || []).filter(
    (t: any) => t && typeof t.title === "string" && t.title.trim()
).map((t: any) => ({ title: t.title.trim(), description: (t.description || "").trim() }));

// ────────────────────────── Evidence URL Generation ──────────────────────────

async function generateEvidenceUrls(topicTitle: string, argumentBody: string, count: number = 2): Promise<Array<{ url: string; kind: "link" }>> {
    const routed = await routeResponsesClient({
        text: `Find evidence URLs for: ${topicTitle}`,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        forcedDefaultModelAndProvider: {
            model: process.env.GROK_RESPONSES_MODEL || "grok-4-1",
            provider: "grok"
        },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) return [];

    try {
        const response = await routed.client.responses.create({
            input: [
                { role: "system", content: "You are a research assistant. Use the web search tool to find real, credible evidence URLs related to the given argument and topic. Find real news articles, academic papers, or official reports. Return only working URLs from reputable sources like BBC, Reuters, AP News, The Guardian, NYT, WHO, CDC, government sites, or academic journals." },
                { role: "user", content: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nSearch the web and find ${count} real, credible source URLs that relate to this argument. Use the web_search tool first, then submit the URLs.` },
            ],
            tools: [
                { type: "web_search" },
                {
                    type: "function",
                    name: "submit_evidence_urls",
                    description: "Submit found evidence URLs",
                    parameters: {
                        type: "object",
                        properties: {
                            urls: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        url: { type: "string", description: "The full URL of the evidence source" },
                                    },
                                    required: ["url"],
                                    additionalProperties: false,
                                },
                            },
                        },
                        required: ["urls"],
                        additionalProperties: false,
                    },
                    strict: true,
                }
            ],
            model: routed.model,
            safety_identifier: "user-simulation",
            ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
            tool_choice: "required",
            store: true,
        });

        for (const item of response.output || []) {
            if (item.type === "function_call" && item.name === "submit_evidence_urls") {
                const parsed = parseFunctionCallArgs<{ urls: Array<{ url: string }> }>(item.arguments);
                return parsed.urls.slice(0, count).map(u => ({ url: u.url, kind: "link" as const }));
            }
        }
    } catch (err) {
        console.warn(`    ⚠ Evidence URL generation failed: ${err instanceof Error ? err.message : err}`);
    }
    return [];
}

// ────────────────────────── Category-aware AI Content Generators ──────────────────────────

const CATEGORY_ARG_PROMPTS: Record<ContentCategory, { system: string; user: string; effort: "low" | "medium" }> = {
    noise: {
        system: "You are simulating spam and noise content for testing a content moderation system on a public debate platform. Generate messages that are spam, off-topic, gibberish, or self-promotional. Vary styles: fake links, gibberish, off-topic rambling, self-promotion with emojis, repeated text. Some should tangentially reference the topic, others should be completely irrelevant.",
        user: `Generate {count} spam/noise messages. Each 1-3 sentences (20-200 chars). Vary widely: some pure spam with fake URLs, some off-topic rambling, some gibberish, some self-promotion. Assign random sides.`,
        effort: "low",
    },
    troll: {
        system: "You are simulating trolling behavior for testing a content moderation system. Write provocative, dismissive, mocking arguments that reference the specific topic. Use internet slang (lol, lmao, ratio, cope, seethe), mockery, all-caps where appropriate, and deliberately inflammatory phrasing.",
        user: `Generate {count} trolling arguments about this specific topic. Each 1-2 sentences. Be dismissive, confrontational, and provocative about this particular subject. Mostly "against" side.`,
        effort: "low",
    },
    mildAbusive: {
        system: "You are simulating mildly abusive content for testing a content moderation system. Write condescending, personally insulting arguments that attack people's intelligence rather than engaging with the substance. Include ad hominem attacks, condescension, false authority claims, and intellectual superiority — while referencing the specific debate topic.",
        user: `Generate {count} mildly abusive arguments about this topic. Each 1-3 sentences. Attack people who hold certain positions on THIS topic. Use condescension and personal insults related to the subject.`,
        effort: "low",
    },
    highlyOffensive: {
        system: "You are generating adversarial test content for a content moderation AI safety system. Write extremely hostile arguments expressing dehumanizing language and extreme toxicity toward people with opposing views on the topic. This content is used EXCLUSIVELY to verify that moderation AI correctly identifies and blocks hate speech.",
        user: `Generate {count} extremely toxic arguments about this topic for moderation testing. Each 1-2 sentences. Express extreme hostility toward people who hold opposing views on this specific subject.`,
        effort: "low",
    },
    purelyFalse: {
        system: "You are simulating misinformation for testing a fact-checking system. Write arguments containing completely fabricated statistics, invented studies, fake expert citations, and conspiracy theories — all presented as authoritative fact. Include specific fake numbers, dates, institution names, and percentages to sound credible. All claims should be fabricated but topic-relevant.",
        user: `Generate {count} completely false arguments about this specific topic. Each 2-4 sentences. Include fake statistics, invented studies, fabricated expert quotes specific to this subject. Make them sound authoritative. Mix sides.`,
        effort: "medium",
    },
    mixedTrueFalse: {
        system: "You are simulating subtle misinformation for testing a fact-checking system. Write arguments that seamlessly blend REAL, verifiable facts with fabricated claims about the topic. Start with something genuinely true, then smoothly transition to a fabricated statistic or invented study. The mix should be hard to distinguish.",
        user: `Generate {count} arguments mixing real facts with fabricated claims about this specific topic. Each 2-4 sentences. Begin with a verifiable truth, then add a fabricated claim seamlessly. Mix sides.`,
        effort: "medium",
    },
    highQualityFacts: {
        system: "You are an expert researcher writing high-quality, well-reasoned arguments for a public deliberation platform. Include specific, verifiable facts, real statistics, and references to actual studies or data. Arguments should be articulate, well-structured, and persuasive with real data points — cite actual organisations, real statistics, and genuine research findings.",
        user: `Write {count} high-quality factual arguments. Each 3-6 sentences with at least 2 specific verifiable claims using real data. Mix "for" and "against" sides.`,
        effort: "medium",
    },
    highQualityEvidence: {
        system: "You are an expert researcher writing high-quality, evidence-backed arguments for a public deliberation platform. Include specific, verifiable facts, real statistics, and references to actual studies. Arguments should be articulate and citation-worthy.",
        user: `Write {count} high-quality evidence-based arguments. Each 3-6 sentences with verifiable claims. Mix "for" and "against" sides.`,
        effort: "medium",
    },
    average: {
        system: "You are a diverse group of citizens contributing arguments to a public debate platform. Write arguments from different perspectives — some well-reasoned with evidence, some passionate opinions, some short and informal, some detailed and academic. Vary quality and length deliberately. Include a mix of factual claims (some correct, some dubious) and pure opinions.",
        user: `Write {count} different arguments. Mix "for", "against", and "neutral" sides. Vary argument quality: some excellent, some mediocre, some low-effort. Each 1-5 sentences (20-500 chars). Some should contain specific factual claims.`,
        effort: "low",
    },
};

const CATEGORY_COMMENT_PROMPTS: Record<ContentCategory, { system: string; user: string }> = {
    noise: {
        system: "You are simulating spam/noise comments for testing a content moderation system. Generate replies that are spam, off-topic, gibberish, or self-promotional.",
        user: `Generate {count} spam/noise comment replies. Each 1-2 sentences. Some reference the argument tangentially, others are pure spam with fake URLs or gibberish.`,
    },
    troll: {
        system: "You are simulating trolling comments for testing a content moderation system. Write dismissive, mocking, provocative replies that reference the specific argument.",
        user: `Generate {count} trolling comment replies about this argument. Each 1-2 sentences. Be dismissive and confrontational about the specific point being made.`,
    },
    mildAbusive: {
        system: "You are simulating mildly abusive comments for testing a content moderation system. Write condescending replies that insult the commenter's intelligence while referencing the argument.",
        user: `Generate {count} mildly abusive comment replies. Each 1-2 sentences. Attack the poster's intelligence while referencing the specific argument content.`,
    },
    highlyOffensive: {
        system: "You are generating adversarial test comments for a content moderation AI safety system. Write extremely hostile replies for moderation testing purposes only.",
        user: `Generate {count} extremely toxic comment replies for moderation testing. Each 1-2 sentences. Express extreme hostility toward the argument poster.`,
    },
    purelyFalse: {
        system: "You are simulating misinformation comments for testing a fact-checking system. Write replies containing completely fabricated facts presented as corrections or additions to the argument.",
        user: `Generate {count} comments with fabricated facts. Each 1-2 sentences. Present fake statistics or invented studies as if correcting or adding to the argument above.`,
    },
    mixedTrueFalse: {
        system: "You are simulating subtle misinformation comments for testing a fact-checking system. Write replies that blend a real fact with a fabricated claim, referencing the argument.",
        user: `Generate {count} comments mixing real facts with fabricated claims. Each 1-2 sentences. Start with something true then slip in a fabrication.`,
    },
    highQualityFacts: {
        system: "You are a knowledgeable participant commenting on a public debate. Write thoughtful, well-informed replies that add factual depth to the discussion.",
        user: `Generate {count} high-quality factual comments. Each 1-3 sentences with specific verifiable claims that add depth to the argument above.`,
    },
    highQualityEvidence: {
        system: "You are a knowledgeable participant commenting on a public debate. Write thoughtful, evidence-oriented replies referencing the argument.",
        user: `Generate {count} high-quality comments. Each 1-3 sentences adding well-reasoned perspective to the argument above.`,
    },
    average: {
        system: "You are different users commenting on an argument in a public debate. Write varied comments — some agreeing, some disagreeing, some adding nuance, some asking questions, some short reactions. Vary quality and length. Some should add factual claims.",
        user: `Write {count} different comments. Each 1-3 sentences (10-300 chars). Make them feel natural and varied.`,
    },
};

async function generateCategoryArguments(
    category: ContentCategory,
    topicTitle: string,
    topicDescription: string,
    count: number,
): Promise<GeneratedArgument[]> {
    const prompts = CATEGORY_ARG_PROMPTS[category];

    const routed = await routeResponsesClient({
        text: `Generate ${category} arguments for: ${topicTitle}`,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        forcedDefaultModelAndProvider: {
            model: process.env.GROK_RESPONSES_MODEL || "grok-4-1",
            provider: "grok"
        },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) throw new Error("AI client not configured");

    const userContent = `Topic: "${topicTitle}"\nDescription: ${topicDescription}\n\n${prompts.user.replace(/\{count\}/g, String(count))}`;

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: prompts.system },
            { role: "user", content: userContent },
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
        safety_identifier: "user-simulation",
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: prompts.effort } }),
        store: true,
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_arguments") {
            const parsed = parseFunctionCallArgs<{ arguments: GeneratedArgument[] }>(item.arguments);
            let results = parsed.arguments || [];

            // For highQualityEvidence, attach real evidence URLs via web search
            if (category === "highQualityEvidence") {
                for (let i = 0; i < results.length; i++) {
                    try {
                        console.log(`    🔍 Finding evidence for argument ${i + 1}/${results.length}...`);
                        const evidence = await generateEvidenceUrls(topicTitle, results[i].body, 2);
                        if (evidence.length > 0) {
                            results[i] = { ...results[i], evidence };
                            console.log(`    📎 Found ${evidence.length} evidence URLs`);
                        }
                    } catch {
                        // Evidence is optional, continue without it
                    }
                }
            }

            return results;
        }
    }
    throw new Error(`No ${category} arguments returned by model`);
}

async function generateCategoryComments(
    category: ContentCategory,
    argumentBody: string,
    topicTitle: string,
    count: number,
): Promise<GeneratedComment[]> {
    const prompts = CATEGORY_COMMENT_PROMPTS[category];

    const routed = await routeResponsesClient({
        text: `Generate ${category} comments about: ${topicTitle}`,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        forcedDefaultModelAndProvider: {
            model: process.env.GROK_RESPONSES_MODEL || "grok-4-1",
            provider: "grok"
        },
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) throw new Error("AI client not configured");

    const userContent = `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\n${prompts.user.replace(/\{count\}/g, String(count))}`;

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: prompts.system },
            { role: "user", content: userContent },
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
        safety_identifier: "user-simulation",
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
        store: true,
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_comments") {
            const parsed = parseFunctionCallArgs<{ comments: GeneratedComment[] }>(item.arguments);
            return parsed.comments || [];
        }
    }
    throw new Error(`No ${category} comments returned by model`);
}

async function runContentSimulation(users: AuthenticatedUser[]): Promise<{
    topics: CreatedTopic[];
    args: CreatedArgument[];
    comments: CreatedComment[];
    votes: CastVote[];
    errors: string[];
}> {
    const topics: CreatedTopic[] = [];
    const args: CreatedArgument[] = [];
    const comments: CreatedComment[] = [];
    const votes: CastVote[] = [];
    const errors: string[] = [];

    // ── Step 1: Create topics (manual or AI-generated) ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 1: Creating topics                    ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    let generatedTopics: GeneratedTopic[];
    if (MANUAL_TOPICS.length > 0) {
        generatedTopics = MANUAL_TOPICS;
        console.log(`  ✓ Using ${generatedTopics.length} manually configured topics`);
    } else {
        try {
            generatedTopics = await generateTopics(TOPICS_PER_SIMULATION);
            console.log(`  ✓ AI generated ${generatedTopics.length} topics`);
        } catch (err) {
            const msg = `Topic generation failed: ${err instanceof Error ? err.message : err}`;
            console.error(`  ✗ ${msg}`);
            errors.push(msg);
            return { topics, args, comments, votes, errors };
        }
    }

    for (const [i, genTopic] of generatedTopics.entries()) {
        const user = pick(users);
        console.log(`  [${i + 1}/${generatedTopics.length}] ${user.username} creating: "${snippet(genTopic.title, 70)}"`);
        const created = await createTopic(user, genTopic);
        if (created) {
            topics.push(created);
            console.log(`    ✓ Created (id: ${created.id})`);
        }
    }

    if (topics.length === 0) {
        errors.push("No topics were created — aborting simulation");
        return { topics, args, comments, votes, errors };
    }

    // ── Step 2: Generate arguments using content distribution ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 2: Creating arguments (distributed)   ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    const contentCategoryLabels: Record<ContentCategory, string> = {
        noise: "🚨 NOISE",
        highQualityFacts: "⭐ HIGH-QUALITY FACTS",
        highQualityEvidence: "📎 HIGH-QUALITY + EVIDENCE",
        troll: "🤡 TROLL",
        mildAbusive: "😡 MILD ABUSIVE",
        highlyOffensive: "☠️  HIGHLY OFFENSIVE",
        mixedTrueFalse: "⚖️  MIXED TRUE/FALSE",
        purelyFalse: "❌ PURELY FALSE",
        average: "📝 AVERAGE",
    };

    for (const topic of topics) {
        console.log(`\n  Topic: "${snippet(topic.title, 60)}"`);

        // Determine content categories for each argument slot
        const argCategories: ContentCategory[] = [];
        for (let i = 0; i < ARGUMENTS_PER_TOPIC; i++) {
            argCategories.push(pickContentCategory());
        }

        // Group by category for efficient batch AI generation
        const categoryCounts = new Map<ContentCategory, number>();
        for (const cat of argCategories) {
            categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
        }
        console.log(`  Distribution: ${[...categoryCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

        // Batch-generate arguments per category (one AI call per category)
        const generatedByCategory = new Map<ContentCategory, GeneratedArgument[]>();
        for (const [category, count] of categoryCounts) {
            const label = contentCategoryLabels[category];
            try {
                console.log(`    Generating ${count}× ${label} arguments via AI...`);
                const genArgs = await generateCategoryArguments(category, topic.title, topic.description || "", count);
                generatedByCategory.set(category, genArgs);
                console.log(`    ✓ Got ${genArgs.length} ${label} arguments`);
            } catch (err) {
                const msg = `${label} argument generation failed: ${err instanceof Error ? err.message : err}`;
                console.warn(`    ⚠ ${msg}`);
                errors.push(msg);
                generatedByCategory.set(category, []);
            }
        }

        // Post arguments in original randomised order
        const categoryIdx = new Map<ContentCategory, number>();
        for (const [i, category] of argCategories.entries()) {
            const idx = categoryIdx.get(category) || 0;
            const pool = generatedByCategory.get(category) || [];
            const genArg = pool[idx] || { body: "This topic deserves more discussion.", side: "neutral" as const };
            categoryIdx.set(category, idx + 1);

            const user = pick(users);
            const label = contentCategoryLabels[category];
            console.log(`    [${i + 1}/${ARGUMENTS_PER_TOPIC}] ${label} | ${user.username} (${genArg.side}): "${snippet(genArg.body, 60)}"${genArg.evidence?.length ? ` [${genArg.evidence.length} evidence links]` : ""}`);

            try {
                const created = await createArgument(user, topic.id, genArg);
                if (created) args.push(created);
            } catch (err) {
                const msg = `Argument post failed: ${err instanceof Error ? err.message : err}`;
                console.warn(`    ⚠ ${msg}`);
                errors.push(msg);
            }
        }
    }

    // ── Step 3: Generate comments using content distribution ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 3: Creating comments (distributed)    ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    const argsByTopic = new Map<string, CreatedArgument[]>();
    for (const arg of args) {
        const existing = argsByTopic.get(arg.topicId) || [];
        existing.push(arg);
        argsByTopic.set(arg.topicId, existing);
    }

    for (const topic of topics) {
        const topicArgs = argsByTopic.get(topic.id) || [];
        if (topicArgs.length === 0) continue;

        console.log(`\n  Topic: "${snippet(topic.title, 60)}" (${topicArgs.length} arguments)`);

        for (const arg of topicArgs) {
            const commentCategories: ContentCategory[] = [];
            for (let i = 0; i < COMMENTS_PER_ARGUMENT; i++) {
                commentCategories.push(pickContentCategory());
            }

            // Group by category for efficient batch AI generation
            const commentCategoryCounts = new Map<ContentCategory, number>();
            for (const cat of commentCategories) {
                commentCategoryCounts.set(cat, (commentCategoryCounts.get(cat) || 0) + 1);
            }

            // Batch-generate comments per category (one AI call per category)
            const generatedCommentsByCategory = new Map<ContentCategory, GeneratedComment[]>();
            for (const [category, count] of commentCategoryCounts) {
                try {
                    const genComments = await generateCategoryComments(category, arg.body, topic.title, count);
                    generatedCommentsByCategory.set(category, genComments);
                } catch (err) {
                    errors.push(`${category} comment generation failed: ${err instanceof Error ? err.message : err}`);
                    generatedCommentsByCategory.set(category, []);
                }
            }

            // Post comments in original randomised order
            const commentCategoryIdx = new Map<ContentCategory, number>();
            const commentTasks = commentCategories.map((category) => {
                const user = pick(users);
                const idx = commentCategoryIdx.get(category) || 0;
                const pool = generatedCommentsByCategory.get(category) || [];
                const genComment = pool[idx] || { body: "Interesting perspective on this." };
                commentCategoryIdx.set(category, idx + 1);
                return () => createComment(user, arg.id, genComment);
            });

            const createdComments = await runBatched(commentTasks, CONCURRENCY);
            for (const created of createdComments) {
                if (created) comments.push(created);
            }
            console.log(`    ✓ ${createdComments.filter(Boolean).length} comments on argument by ${arg.createdBy}`);
        }
    }

    // ── Step 4: Cast votes ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 4: Casting votes                      ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    const shuffledUsers = shuffle(users);
    const voteTasks: (() => Promise<CastVote | null>)[] = [];

    // Collect vote intents for topics
    for (const topic of topics) {
        for (const user of shuffledUsers) {
            if (Math.random() > VOTE_PROBABILITY) continue;
            const value: 1 | -1 = Math.random() > 0.3 ? 1 : -1;
            voteTasks.push(() => castVote(user, "Topic", topic.id, value));
        }
    }

    // Collect vote intents for arguments
    for (const arg of args) {
        for (const user of shuffledUsers) {
            if (Math.random() > VOTE_PROBABILITY) continue;
            const value: 1 | -1 = Math.random() > 0.35 ? 1 : -1;
            voteTasks.push(() => castVote(user, "Argument", arg.id, value));
        }
    }

    // Collect vote intents for comments
    for (const comment of comments) {
        for (const user of shuffledUsers) {
            if (Math.random() > VOTE_PROBABILITY) continue;
            const value: 1 | -1 = Math.random() > 0.4 ? 1 : -1;
            voteTasks.push(() => castVote(user, "Comment", comment.id, value));
        }
    }

    console.log(`  Casting ${voteTasks.length} votes (concurrency: ${CONCURRENCY})...`);
    const voteResults = await runBatched(voteTasks, CONCURRENCY);
    for (const vote of voteResults) {
        if (vote) votes.push(vote);
    }
    console.log(`  ✓ Cast ${votes.length} votes across topics, arguments, and comments`);

    return { topics, args, comments, votes, errors };
}

// ────────────────────────── Evaluation Pipeline ──────────────────────────

async function runEvaluation(
    topics: CreatedTopic[],
    users: AuthenticatedUser[],
): Promise<{ evaluations: AiEvaluation[]; report: AiSystemReport; summary: string }> {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 5: Waiting for AI processing          ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`  Waiting ${AI_PROCESSING_WAIT_MS / 1000}s for background AI tasks (moderation, ontology, fact-checking)...`);
    await sleep(AI_PROCESSING_WAIT_MS);

    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 6: Evaluating AI systems              ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    const evaluations: AiEvaluation[] = [];
    const viewerToken = users[0].token;

    console.log(`  Fetching details for ${topics.length} topics in parallel...`);
    const detailResults = await Promise.all(
        topics.map(async (topic) => {
            const details = await fetchTopicDetails(topic.id, viewerToken);
            if (!details) {
                console.warn(`  ⚠ Could not fetch topic ${topic.id}`);
            }
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
                    visibility: c.visibility,
                    ontologyCategories: c.ontologyCategories,
                    contentFactCheck: c.contentFactCheck,
                })),
            })),
        };
        evaluations.push(evaluation);
    }

    console.log(`  ✓ Evaluated ${evaluations.length} topics`);

    // Generate aggregate report
    const report = evaluateAiSystems(evaluations);

    // Print report
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  AI Systems Report                           ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    console.log(`\n  📋 MODERATION`);
    console.log(`     Total items: ${report.moderation.total}`);
    console.log(`     Visible: ${report.moderation.visible} | Needs review: ${report.moderation.needsReview} | Noise: ${report.moderation.noise} | Blocked: ${report.moderation.blocked} | Hidden: ${report.moderation.hidden}`);

    console.log(`\n  🏷️  ONTOLOGY CLASSIFICATION`);
    console.log(`     Items tagged: ${report.ontology.totalTagged}/${report.moderation.total}`);
    console.log(`     Total categories assigned: ${report.ontology.totalCategories}`);
    console.log(`     Avg categories per item: ${report.ontology.avgCategoriesPerItem}`);

    console.log(`\n  🔍 CONTENT FACT-CHECKING`);
    console.log(`     Total items: ${report.factChecking.total}`);
    console.log(`     Verified: ${report.factChecking.verified} | Inaccurate: ${report.factChecking.inaccurate} | Mixed: ${report.factChecking.mixed} | Unverified: ${report.factChecking.unverified} | Not checked: ${report.factChecking.notChecked}`);

    console.log(`\n  🧠 AI ANALYSIS (Fact vs Opinion)`);
    console.log(`     Total analysed: ${report.aiAnalysis.total}`);
    console.log(`     Facts: ${report.aiAnalysis.facts} | Opinions: ${report.aiAnalysis.opinions} | With justification: ${report.aiAnalysis.withJustification}`);

    console.log(`\n  📎 EVIDENCE FACT-CHECKING`);
    console.log(`     Total evidence items: ${report.evidenceFactChecking.total}`);
    console.log(`     Verified: ${report.evidenceFactChecking.verified} | Inaccurate: ${report.evidenceFactChecking.inaccurate} | Mixed: ${report.evidenceFactChecking.mixed} | Unverified: ${report.evidenceFactChecking.unverified}`);

    // Generate AI summary
    console.log(`\n  Generating AI effectiveness summary...`);
    const summary = await generateAiSummary(report, evaluations);
    console.log(`\n  📊 AI EFFECTIVENESS SUMMARY\n`);
    console.log(summary.split("\n").map((l) => `  ${l}`).join("\n"));

    return { evaluations, report, summary };
}

// ────────────────────────── Main ──────────────────────────

async function main() {
    const inputFile = process.argv[2];
    if (!inputFile) {
        console.error("Usage: npx tsx src/app/scripts/userSimulation/simulateContent.ts <simulation_file.json>");
        process.exitCode = 1;
        return;
    }

    const resolvedPath = path.resolve(process.cwd(), inputFile);
    console.log(`\n════════════════════════════════════════════════`);
    console.log(` Content Simulation & AI Evaluation`);
    console.log(`════════════════════════════════════════════════`);
    console.log(` Users file: ${resolvedPath}`);
    console.log(` App URL:    ${APP_URL}`);
    console.log(` Topics:     ${MANUAL_TOPICS.length > 0 ? `${MANUAL_TOPICS.length} manual` : `${TOPICS_PER_SIMULATION} AI-generated`}`);
    console.log(` Args/topic: ${ARGUMENTS_PER_TOPIC}  |  Comments/arg: ${COMMENTS_PER_ARGUMENT}`);
    console.log(` Distribution: noise=${DIST.noise*100}% hqFacts=${DIST.highQualityFacts*100}% hqEvidence=${DIST.highQualityEvidence*100}% troll=${DIST.troll*100}% mildAbuse=${DIST.mildAbusive*100}% offensive=${DIST.highlyOffensive*100}% mixedTF=${DIST.mixedTrueFalse*100}% false=${DIST.purelyFalse*100}% avg=${DIST.average*100}%`);
    console.log(`════════════════════════════════════════════════\n`);

    // Load saved users
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
        console.error("No registered users found in file — nothing to simulate");
        process.exitCode = 1;
        return;
    }

    // Authenticate users
    console.log(`\nAuthenticating users (concurrency: ${CONCURRENCY})...`);
    const authenticatedUsers: AuthenticatedUser[] = [];
    for (let batch = 0; batch < savedUsers.length; batch += CONCURRENCY) {
        const batchUsers = savedUsers.slice(batch, batch + CONCURRENCY);
        const results = await Promise.all(batchUsers.map(loginUser));
        for (const [i, result] of results.entries()) {
            const user = batchUsers[i];
            if (result) {
                authenticatedUsers.push(result);
                console.log(`  ✓ ${user.username} authenticated`);
            } else {
                console.warn(`  ✗ ${user.username} login failed`);
            }
        }
    }

    console.log(`\nAuthenticated ${authenticatedUsers.length}/${savedUsers.length} users`);

    if (authenticatedUsers.length === 0) {
        console.error("No users could be authenticated — aborting");
        process.exitCode = 1;
        return;
    }

    // Run content simulation
    const { topics, args, comments, votes, errors } = await runContentSimulation(authenticatedUsers);

    console.log(`\n────────────────────────────────────────────────`);
    console.log(` Content Summary`);
    console.log(`────────────────────────────────────────────────`);
    console.log(` Topics:    ${topics.length}`);
    console.log(` Arguments: ${args.length}`);
    console.log(` Comments:  ${comments.length}`);
    console.log(` Votes:     ${votes.length}`);
    console.log(` Errors:    ${errors.length}`);
    console.log(`────────────────────────────────────────────────`);

    // Run AI evaluation
    const { evaluations, report, summary } = await runEvaluation(topics, authenticatedUsers);

    // Save full report
    const outputReport: SimulationReport = {
        timestamp: new Date().toISOString(),
        usersFile: resolvedPath,
        usersLoaded: savedUsers.length,
        usersAuthenticated: authenticatedUsers.length,
        topicsCreated: topics,
        argumentsCreated: args,
        commentsCreated: comments,
        votesCast: votes,
        aiEvaluations: evaluations,
        aiSystemReport: report,
        aiSummary: summary,
        errors,
    };

    const outputFile = path.resolve(process.cwd(), `content_simulation_${Date.now()}.json`);
    await fs.writeFile(outputFile, JSON.stringify(outputReport, null, 2), "utf-8");
    console.log(`\n✅ Full report saved to: ${outputFile}`);
}

main().catch((err) => {
    console.error("Content simulation failed:", err);
    process.exitCode = 1;
});
