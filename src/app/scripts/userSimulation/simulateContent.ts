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
type GeneratedArgument = { body: string; side: "for" | "against" | "neutral" };
type GeneratedComment = { body: string };

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

async function generateArgumentsForTopic(topicTitle: string, topicDescription: string, count: number): Promise<GeneratedArgument[]> {
    const routed = await routeResponsesClient({
        text: `Generate arguments for topic: ${topicTitle}`,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
    });
    if (!routed) throw new Error("AI client not configured");

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: "You are a diverse group of citizens contributing arguments to a public debate platform. Write arguments from different perspectives — some well-reasoned with evidence, some passionate opinions, some short and informal, some detailed and academic. Vary quality and length deliberately. Include a mix of factual claims (some correct, some dubious) and pure opinions." },
            { role: "user", content: `Topic: "${topicTitle}"\nDescription: ${topicDescription}\n\nWrite ${count} different arguments. Mix "for", "against", and "neutral" sides. Vary argument quality: some should be excellent, some mediocre, some low-effort. Each body should be 1-5 sentences (20-500 chars). Some should contain specific factual claims that can be fact-checked.` },
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
                                side: { type: "string", enum: ["for", "against", "neutral"], description: "Which side of the debate" },
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
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
        store: true,
    });

    for (const item of response.output || []) {
        if (item.type === "function_call" && item.name === "submit_arguments") {
            const parsed = parseFunctionCallArgs<{ arguments: GeneratedArgument[] }>(item.arguments);
            return parsed.arguments;
        }
    }
    throw new Error("No arguments returned by model");
}

async function generateCommentsForArgument(argumentBody: string, topicTitle: string, count: number): Promise<GeneratedComment[]> {
    const routed = await routeResponsesClient({
        text: `Generate comments for argument about: ${topicTitle}`,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.2",
        grokModel: process.env.GROK_RESPONSES_MODEL,
    });
    if (!routed) throw new Error("AI client not configured");

    const response = await routed.client.responses.create({
        input: [
            { role: "system", content: "You are different users commenting on an argument in a public debate. Write varied comments — some agreeing, some disagreeing, some adding nuance, some asking questions, some short reactions. Vary quality and length. Some should add factual claims." },
            { role: "user", content: `Topic: "${topicTitle}"\nArgument: "${argumentBody}"\n\nWrite ${count} different comments. Each should be 1-3 sentences (10-300 chars). Make them feel natural and varied.` },
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
            return parsed.comments;
        }
    }
    throw new Error("No comments returned by model");
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
            body: JSON.stringify({ topicId, body: arg.body, side: arg.side }),
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
            body: JSON.stringify({ argumentId, body: comment.body }),
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

const TOPICS_PER_SIMULATION = 3;
const ARGUMENTS_PER_TOPIC = 10;
const COMMENTS_PER_ARGUMENT = 15;
const NOISE_ARGUMENTS_PER_TOPIC = 2;
const NOISE_COMMENTS_PER_TOPIC = 4;
const AI_PROCESSING_WAIT_MS = 8000;
const VOTE_PROBABILITY = 0.6;

// ────────────────────────── Noise / Spam Templates ──────────────────────────
// Hard-coded adversarial content — bypasses AI generation so the moderation
// system sees truly low-quality / spammy / toxic text it was never primed for.

const NOISE_ARGUMENTS: GeneratedArgument[] = [
    // Spam / advertising
    { body: "💰💰💰 I made $5,000 in one week working from home! Click here to learn how ➡️ bit.ly/totallynotascam 💰💰💰", side: "for" },
    { body: "Buy cheap Rolexes at www.fakewatches.biz — FREE SHIPPING!! Use code DEBATE2025 for 20% off!!!", side: "against" },
    // Trolling / nonsense
    { body: "lol u r all so dumb none of this matters go touch grass 🤡🤡🤡", side: "against" },
    { body: "FIRST!!!! haha beat you all to it. anyway this topic is boring who cares", side: "neutral" },
    // All-caps shouting
    { body: "THIS IS THE WORST TAKE I HAVE EVER SEEN AND ANYONE WHO AGREES IS AN ABSOLUTE MORON WITH ZERO CRITICAL THINKING SKILLS", side: "against" },
    // Gibberish / keyboard spam
    { body: "asdfghjkl;qwertyuiop zxcvbnm,./asdf jkl; qwer tyui opzx cvbn", side: "for" },
    // Conspiracy / misinformation
    { body: "The government is putting microchips in the water supply to control our thoughts. I have PROOF from my cousin who works at the water plant. Wake up sheeple!", side: "against" },
    // Completely off-topic
    { body: "Does anyone know a good recipe for banana bread? My grandma used to make it but I lost the recipe. Thanks!", side: "neutral" },
    // Repetitive / low-effort
    { body: "I agree. I agree. I agree. I agree. I agree. I agree. I agree. I agree. I agree. I agree.", side: "for" },
    // Self-promotion
    { body: "Great topic! BTW check out my YouTube channel @DebateKing2025 where I break down all these issues. Like and subscribe!!! 🔔🔔🔔", side: "for" },
    // False authority claim
    { body: "As a Harvard professor with 30 years of experience (trust me), this is absolutely incorrect. I have published 500 papers on this exact topic. You're all wrong.", side: "against" },
    // Hateful / toxic
    { body: "Everyone on the other side of this debate is a complete waste of oxygen. This country would be better off without their so-called 'opinions'.", side: "against" },
];

const NOISE_COMMENTS: GeneratedComment[] = [
    { body: "💰 Make $3000/day from home! DM me for details! 💰" },
    { body: "lmaooo this argument is trash 🗑️🗑️🗑️ delete ur account" },
    { body: "Visit my website www.best-deals-online.biz for amazing discounts!!!" },
    { body: "aaaaaaaaaaaaaaaaaaa bbbbbbb ccccc ddddddd eeeee ffffff gggggg" },
    { body: "Copy paste this comment 10 times for good luck 🍀🍀🍀" },
    { body: "WHO EVEN READS THESE COMMENTS ANYMORE JUST CLOSE THE INTERNET" },
    { body: "ur wrong ur wrong ur wrong ur wrong ur wrong ur wrong" },
    { body: "Check out my SoundCloud 🎵🎵🎵 link in bio" },
    { body: "Nobody asked. Nobody cares. Ratio. L + cope + seethe." },
    { body: "I heard from a very reliable source that this entire platform is run by lizard people." },
];

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

    // ── Step 1: Generate & create topics ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 1: Creating ${TOPICS_PER_SIMULATION} topics                    ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    let generatedTopics: GeneratedTopic[];
    try {
        generatedTopics = await generateTopics(TOPICS_PER_SIMULATION);
        console.log(`  ✓ AI generated ${generatedTopics.length} topics`);
    } catch (err) {
        const msg = `Topic generation failed: ${err instanceof Error ? err.message : err}`;
        console.error(`  ✗ ${msg}`);
        errors.push(msg);
        return { topics, args, comments, votes, errors };
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

    // ── Step 2: Generate & create arguments ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 2: Creating arguments                 ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    for (const topic of topics) {
        console.log(`\n  Topic: "${snippet(topic.title, 60)}"`);
        let generatedArgs: GeneratedArgument[];
        try {
            generatedArgs = await generateArgumentsForTopic(topic.title, topic.description || "", ARGUMENTS_PER_TOPIC);
            console.log(`  ✓ AI generated ${generatedArgs.length} arguments`);
        } catch (err) {
            const msg = `Argument generation failed for "${topic.title}": ${err instanceof Error ? err.message : err}`;
            console.warn(`  ⚠ ${msg}`);
            errors.push(msg);
            continue;
        }

        const argTasks = generatedArgs.map((genArg, i) => {
            const user = pick(users);
            console.log(`    [${i + 1}/${generatedArgs.length}] ${user.username} (${genArg.side}): "${snippet(genArg.body, 60)}"`);
            return () => createArgument(user, topic.id, genArg);
        });
        const createdArgs = await runBatched(argTasks, CONCURRENCY);
        for (const created of createdArgs) {
            if (created) args.push(created);
        }
    }

    // ── Step 3: Inject noise / spam arguments ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 3: Injecting noise & spam content     ║`);
    console.log(`╚══════════════════════════════════════════════╝`);

    let noiseArgCount = 0;
    let noiseCommentCount = 0;
    const shuffledNoiseArgs = shuffle(NOISE_ARGUMENTS);
    const shuffledNoiseComments = shuffle(NOISE_COMMENTS);

    for (const topic of topics) {
        // Pick N random noise arguments for this topic
        const noiseForTopic = shuffledNoiseArgs.splice(0, NOISE_ARGUMENTS_PER_TOPIC);
        if (noiseForTopic.length === 0) break; // ran out of templates

        console.log(`\n  Topic: "${snippet(topic.title, 60)}"`);
        const noiseArgTasks = noiseForTopic.map((noiseArg) => {
            const user = pick(users);
            console.log(`    🚨 ${user.username} posting noise (${noiseArg.side}): "${snippet(noiseArg.body, 60)}"`);
            return () => createArgument(user, topic.id, noiseArg);
        });
        const noiseResults = await runBatched(noiseArgTasks, CONCURRENCY);
        for (const created of noiseResults) {
            if (created) { args.push(created); noiseArgCount++; }
        }

        // Attach noise comments to random arguments on this topic
        const topicArgs = args.filter((a) => a.topicId === topic.id);
        const noiseCommentsForTopic = shuffledNoiseComments.splice(0, NOISE_COMMENTS_PER_TOPIC);
        const noiseCommentTasks = noiseCommentsForTopic
            .filter(() => topicArgs.length > 0)
            .map((noiseComment) => {
                const targetArg = pick(topicArgs);
                const user = pick(users);
                console.log(`    🚨 ${user.username} posting noise comment: "${snippet(noiseComment.body, 60)}"`);
                return () => createComment(user, targetArg.id, noiseComment);
            });
        const noiseCommentResults = await runBatched(noiseCommentTasks, CONCURRENCY);
        for (const created of noiseCommentResults) {
            if (created) { comments.push(created); noiseCommentCount++; }
        }
    }

    console.log(`\n  ✓ Injected ${noiseArgCount} noise arguments and ${noiseCommentCount} noise comments`);

    // ── Step 4: Generate & create comments ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 4: Creating comments                  ║`);
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
            let generatedComments: GeneratedComment[];
            try {
                generatedComments = await generateCommentsForArgument(arg.body, topic.title, COMMENTS_PER_ARGUMENT);
            } catch (err) {
                errors.push(`Comment generation failed: ${err instanceof Error ? err.message : err}`);
                continue;
            }

            const commentTasks = generatedComments.map((genComment) => {
                const user = pick(users);
                return () => createComment(user, arg.id, genComment);
            });
            const createdComments = await runBatched(commentTasks, CONCURRENCY);
            for (const created of createdComments) {
                if (created) comments.push(created);
            }
            console.log(`    ✓ ${createdComments.filter(Boolean).length} comments on argument by ${arg.createdBy}`);
        }
    }

    // ── Step 5: Cast votes ──
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 5: Casting votes                      ║`);
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
    console.log(`║  Phase 6: Waiting for AI processing          ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`  Waiting ${AI_PROCESSING_WAIT_MS / 1000}s for background AI tasks (moderation, ontology, fact-checking)...`);
    await sleep(AI_PROCESSING_WAIT_MS);

    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  Phase 7: Evaluating AI systems              ║`);
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
