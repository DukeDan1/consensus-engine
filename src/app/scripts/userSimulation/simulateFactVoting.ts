/**
 * simulateFactVoting.ts
 *
 * Simulates community voting on extracted facts across 7 scenarios
 * defined in FACT_VOTING_SCENARIOS.md. Tests the fact reassessment
 * pipeline by casting votes with rationales and triggering AI
 * reassessment, then recording outcomes.
 *
 * Usage:
 *   npx tsx src/app/scripts/userSimulation/simulateFactVoting.ts <simulation_file.json> [options]
 *
 * Options:
 *   --scenarios <ids>   Comma-separated scenario numbers (1-7). Default: all.
 *   --wait <ms>         Override AI processing wait time (default: 15000).
 *   --topic <id>        Restrict to a single topic ID.
 *   --app-url <url>     Override the app URL (default: http://localhost:3000).
 *   --admin-email <e>   Admin email used for /api/admin/facts-recheck.
 *   --admin-password <p> Admin password used for /api/admin/facts-recheck.
 */

import dotenv from "dotenv";
dotenv.config();

import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { dbConnect } from "@/app/lib/mongoose";
import Fact from "@/app/models/facts";
import FactVote from "@/app/models/factVote";

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

type FactInfo = {
    id: string;
    text: string;
    topicId: string;
    sourceArgument: string;
    sourceComment: string;
    upvoteCount: number;
    downvoteCount: number;
    score: number;
};

type FactVoteCast = {
    factId: string;
    userId: string;
    username: string;
    value: 1 | -1;
    reason: string;
};

type VotingRound = {
    round: number;
    votesCast: FactVoteCast[];
    totalUpvotes: number;
    totalDownvotes: number;
};

type ReassessmentResult = {
    factId: string;
    action: string;
    previousText?: string;
    updatedText?: string;
    rationale?: string;
    skipped: boolean;
    error?: string;
};

type FactTarget = {
    factId: string;
    originalText: string;
    isInjected: boolean;
    category: string;
};

type ScenarioMetrics = {
    factsKept: number;
    factsUpdated: number;
    factsRemoved: number;
    factsSkipped: number;
    factsErrored: number;
    avgVoteRatio: number;
    reassessmentTriggerRate: number;
    expectedOutcomeMatch: boolean;
};

type FactVotingScenario = {
    id: string;
    name: string;
    description: string;
    expectedOutcome: "kept" | "updated" | "removed" | "mixed";
};

type ScenarioResult = {
    scenario: FactVotingScenario;
    factsTargeted: FactTarget[];
    votingRounds: VotingRound[];
    reassessmentResults: ReassessmentResult[];
    factsAfter: FactInfo[];
    metrics: ScenarioMetrics;
    errors: string[];
    durationMs: number;
};

type FullReport = {
    timestamp: string;
    usersFile: string;
    config: {
        appUrl: string;
        topicIds: string[];
        scenariosRun: string[];
        aiProcessingWaitMs: number;
    };
    scenarioResults: ScenarioResult[];
};

// ────────────────────────── Scenario Definitions ──────────────────────────

const FACT_VOTING_SCENARIOS: FactVotingScenario[] = [
    {
        id: "fv_1_validate_accurate",
        name: "Scenario 1: Community Validates Accurate Facts",
        description: "Tests that accurate, well-sourced facts survive community scrutiny.",
        expectedOutcome: "kept",
    },
    {
        id: "fv_2_correct_inaccurate",
        name: "Scenario 2: Community Corrects Inaccurate Details",
        description: "Tests that facts with minor inaccuracies are updated when community provides corrections.",
        expectedOutcome: "updated",
    },
    {
        id: "fv_3_reject_fabricated",
        name: "Scenario 3: Community Rejects Fabricated Facts",
        description: "Tests that completely false facts are removed with strong community debunking.",
        expectedOutcome: "removed",
    },
    {
        id: "fv_4_split_controversial",
        name: "Scenario 4: Split Community — Controversial Facts",
        description: "Tests behaviour when community is divided on technically accurate but charged facts.",
        expectedOutcome: "kept",
    },
    {
        id: "fv_5_coordinated_attack",
        name: "Scenario 5: Coordinated Downvote Attack",
        description: "Tests resilience against coordinated mass downvoting of accurate facts.",
        expectedOutcome: "kept",
    },
    {
        id: "fv_6_gradual_evidence",
        name: "Scenario 6: Gradual Evidence Accumulation",
        description: "Tests multi-round voting where evidence builds over time to trigger updates.",
        expectedOutcome: "updated",
    },
    {
        id: "fv_7_reason_quality",
        name: "Scenario 7: Reason Quality Impact",
        description: "Tests whether rationale quality matters more than vote quantity.",
        expectedOutcome: "kept",
    },
];

// ────────────────────────── Helpers ──────────────────────────

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

function buildAuthHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
    return { ...(extra || {}), Authorization: `Bearer ${token}` };
}

/**
 * Resets vote state for the given facts so the simulation starts from a clean slate.
 * Deletes all FactVote documents for these facts and zeroes the cached counters.
 */
async function resetFactVoteState(factIds: string[]): Promise<void> {
    await dbConnect();
    const objectIds = factIds.map((id) => new mongoose.Types.ObjectId(id));
    await FactVote.deleteMany({ fact: { $in: objectIds } }).exec();
    await Fact.updateMany(
        { _id: { $in: objectIds } },
        {
            $set: {
                upvoteCount: 0,
                downvoteCount: 0,
                score: 0,
                lastCheckedUpvoteCount: 0,
                lastCheckedDownvoteCount: 0,
                lastCheckedCommentCount: 0,
            },
        },
    ).exec();
}

// ────────────────────────── API Helpers ──────────────────────────

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

async function loginAdmin(appUrl: string, email: string, password: string): Promise<string | null> {
    try {
        const res = await fetch(`${appUrl}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data?.token !== "string") return null;
        return data.token;
    } catch {
        return null;
    }
}

async function fetchTopicFacts(appUrl: string, topicId: string, token: string): Promise<FactInfo[]> {
    try {
        const res = await fetch(`${appUrl}/api/topics/${topicId}/facts`, {
            headers: buildAuthHeaders(token),
        });
        if (!res.ok) return [];
        const data = await res.json();
        return (data.facts || []).map((f: any) => ({
            id: f.id,
            text: f.text,
            topicId,
            sourceArgument: f.sourceArgument || "",
            sourceComment: f.sourceComment || "",
            upvoteCount: f.upvoteCount ?? 0,
            downvoteCount: f.downvoteCount ?? 0,
            score: f.score ?? 0,
        }));
    } catch {
        return [];
    }
}

async function castFactVote(
    appUrl: string,
    user: AuthenticatedUser,
    factId: string,
    value: 1 | -1,
    reason?: string,
): Promise<{ upvoteCount: number; downvoteCount: number } | null> {
    try {
        const body: Record<string, unknown> = { factId, value };
        if (reason) body.reason = reason;
        const res = await fetch(`${appUrl}/api/fact-vote`, {
            method: "POST",
            headers: buildAuthHeaders(user.token, { "Content-Type": "application/json" }),
            body: JSON.stringify(body),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

/**
 * Force-rechecks each fact by calling the per-fact moderator endpoint
 * (POST /api/topics/:topicId/facts/:factId), which bypasses the vote-threshold
 * gate and always runs the AI reassessment — equivalent to pressing "AI Recheck"
 * in the UI for each fact.
 */
async function triggerFactRecheck(appUrl: string, adminToken: string, facts: FactInfo[]): Promise<any> {
    if (!facts || facts.length === 0) return { results: [] };
    const results: any[] = [];
    for (const fact of facts) {
        try {
            const res = await fetch(
                `${appUrl}/api/topics/${encodeURIComponent(fact.topicId)}/facts/${encodeURIComponent(fact.id)}`,
                { method: "POST", headers: buildAuthHeaders(adminToken) },
            );
            if (!res.ok) {
                results.push({ factId: fact.id, action: "error", skipped: false, error: `HTTP ${res.status}` });
                continue;
            }
            const data = await res.json().catch(() => ({}));
            const r = data.result ?? {};
            results.push({
                factId: fact.id,
                action: r.action ?? "error",
                skipped: false,
                previousText: fact.text,
                updatedText: r.updatedText ?? null,
                rationale: r.rationale ?? null,
                model: r.model ?? null,
            });
        } catch (err: any) {
            results.push({ factId: fact.id, action: "error", skipped: false, error: err?.message ?? "Unknown error" });
        }
    }
    return { results };
}

type VoteTask = {
    user: AuthenticatedUser;
    fact: FactInfo;
    value: 1 | -1;
    reason: string;
    errorLabel?: string;
};

async function castVotesBatch(
    appUrl: string,
    tasks: VoteTask[],
): Promise<{ votes: FactVoteCast[]; errors: string[] }> {
    const parsed = Number(process.env.FACT_VOTE_CONCURRENCY ?? "25");
    const maxConcurrent = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 25;
    const results: Array<{ vote: FactVoteCast | null; error: string | null }> = [];

    for (let i = 0; i < tasks.length; i += maxConcurrent) {
        const batch = tasks.slice(i, i + maxConcurrent);
        const batchResults = await Promise.all(
            batch.map(async ({ user, fact, value, reason, errorLabel }) => {
                const result = await castFactVote(appUrl, user, fact.id, value, reason || undefined);
                if (result) {
                    return {
                        vote: { factId: fact.id, userId: user.email, username: user.username, value, reason } as FactVoteCast,
                        error: null,
                    };
                }
                return { vote: null, error: errorLabel ? `Vote failed: ${user.username} ${errorLabel} on ${fact.id}` : null };
            })
        );
        results.push(...batchResults);
    }

    return {
        votes: results.flatMap((r) => r.vote ? [r.vote] : []),
        errors: results.flatMap((r) => r.error ? [r.error] : []),
    };
}

async function fetchTopicIds(appUrl: string, token: string): Promise<string[]> {
    try {
        const res = await fetch(`${appUrl}/api/topics?limit=50`, {
            headers: buildAuthHeaders(token),
        });
        if (!res.ok) return [];
        const data = await res.json();
        const topics = data.topics || data || [];
        return topics.map((t: any) => t.id || t._id).filter(Boolean);
    } catch {
        return [];
    }
}

// ────────────────────────── Rationale Templates ──────────────────────────

const UPVOTE_RATIONALES_STRONG = [
    "This is a verifiable factual claim that can be confirmed through the original source material.",
    "I've verified this against the Wikipedia source article and it accurately reflects the content.",
    "This fact is well-sourced and provides important context for the debate.",
    "The specific details mentioned here (dates, names, legal references) are accurate and verifiable.",
    "This represents a key factual claim that is supported by multiple reliable sources.",
];

const UPVOTE_RATIONALES_WEAK = [
    "Seems right to me.",
    "I agree with this.",
    "Good point.",
    "This is correct.",
];

const DOWNVOTE_RATIONALES_CORRECTION = [
    "The year mentioned is incorrect — the actual date was different according to the source.",
    "The statistic cited here is slightly off; the correct figure is different based on the original data.",
    "This misattributes the quote — it was said by a different person in a different context.",
    "The percentage stated is wrong. The actual number from the study was different.",
    "Minor factual error: the legal precedent referenced here applies to a different jurisdiction.",
];

const DOWNVOTE_RATIONALES_DEBUNKING = [
    "This study does not exist. I've searched academic databases and found no matching publication.",
    "The statistic cited here is completely fabricated — no such data exists in any government report.",
    "This quote is falsely attributed. The person named never made this statement.",
    "The organisation referenced in this fact does not exist and cannot be found in any registry.",
    "This is a well-known fabricated claim that has been debunked by multiple fact-checking organisations.",
];

const DOWNVOTE_RATIONALES_VAGUE = [
    "I don't think this is right.",
    "This seems wrong.",
    "Disagree.",
    "Not accurate.",
    "Misleading.",
];

const DOWNVOTE_RATIONALES_COOKIE_CUTTER = [
    "This is misinformation.",
    "This is misinformation.",
    "This is misinformation.",
    "Flagging as false.",
    "This is misinformation.",
];

const UPVOTE_RATIONALES_CONTEXT = [
    "This is a direct quote from the Constitution / original legal text and is factually accurate regardless of interpretation.",
    "The claim here is a matter of public record and can be verified through official documents.",
    "While opinions differ on the implications, the underlying factual claim is verifiable and accurate.",
    "This fact accurately represents the historical record, even though the topic is politically sensitive.",
    "The factual content is separate from policy implications — the claim itself is well-documented.",
];

const DOWNVOTE_RATIONALES_CONTEXT = [
    "This fact is misleading without proper context about how courts have interpreted this provision.",
    "While technically accurate in isolation, presenting this without context is deceptive.",
    "This cherry-picks one aspect and ignores the broader context, making it misleading.",
    "The fact is stated in a way that implies a conclusion not supported by the full evidence.",
    "Needs more context — this is an oversimplification that could lead to wrong conclusions.",
];

// ────────────────────────── Scenario Execution ──────────────────────────

async function executeScenario1(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "accurate",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const upvoters = shuffledUsers.slice(0, Math.floor(users.length * 0.6));
    const downvoters = shuffledUsers.slice(upvoters.length, upvoters.length + Math.floor(users.length * 0.1));

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => upvoters.map((user) => ({ user, fact, value: 1 as const, reason: pick(UPVOTE_RATIONALES_STRONG), errorLabel: "upvote" }))),
        ...facts.flatMap((fact) => downvoters.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_VAGUE), errorLabel: "downvote" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "kept");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario2(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "slightly_inaccurate",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const downvoters = shuffledUsers.slice(0, Math.floor(users.length * 0.6));
    const upvoters = shuffledUsers.slice(downvoters.length, downvoters.length + Math.floor(users.length * 0.25));

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => downvoters.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_CORRECTION), errorLabel: "downvote" }))),
        ...facts.flatMap((fact) => upvoters.map((user) => ({ user, fact, value: 1 as const, reason: "" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "updated");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario3(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "fabricated",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const downvoters = shuffledUsers.slice(0, Math.floor(users.length * 0.8));
    const upvoters = shuffledUsers.slice(downvoters.length, downvoters.length + Math.floor(users.length * 0.1));

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => downvoters.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_DEBUNKING), errorLabel: "downvote" }))),
        ...facts.flatMap((fact) => upvoters.map((user) => ({ user, fact, value: 1 as const, reason: "" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "removed");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario4(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "controversial_accurate",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const half = Math.floor(users.length * 0.45);
    const upvoters = shuffledUsers.slice(0, half);
    const downvoters = shuffledUsers.slice(half, half * 2);

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => upvoters.map((user) => ({ user, fact, value: 1 as const, reason: pick(UPVOTE_RATIONALES_CONTEXT), errorLabel: "upvote" }))),
        ...facts.flatMap((fact) => downvoters.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_CONTEXT), errorLabel: "downvote" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "kept");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario5(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "attack_target",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    // 20 users form the attack gang, 40 upvote legitimately
    const gangSize = Math.min(20, Math.floor(users.length * 0.33));
    const supporterSize = Math.min(40, Math.floor(users.length * 0.66));
    const gang = shuffledUsers.slice(0, gangSize);
    const supporters = shuffledUsers.slice(gangSize, gangSize + supporterSize);

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => gang.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_COOKIE_CUTTER), errorLabel: "gang downvote" }))),
        ...facts.flatMap((fact) => supporters.map((user) => ({ user, fact, value: 1 as const, reason: pick(UPVOTE_RATIONALES_STRONG), errorLabel: "support upvote" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes (gang: ${gangSize}, supporters: ${supporterSize})`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "kept");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario6(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "outdated",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const allRoundVotes: FactVoteCast[] = [];
    const rounds: VotingRound[] = [];

    // Round 1: 5 downvotes — below threshold
    console.log("    Round 1: 5 downvotes (below reassessment threshold)...");
    const round1Users = shuffledUsers.slice(0, 5);
    const { votes: round1Votes } = await castVotesBatch(appUrl,
        facts.flatMap((fact) => round1Users.map((user) => ({ user, fact, value: -1 as const, reason: "This number appears to be outdated based on more recent data." }))),
    );
    allRoundVotes.push(...round1Votes);
    rounds.push({
        round: 1,
        votesCast: round1Votes,
        totalUpvotes: 0,
        totalDownvotes: round1Votes.length,
    });
    console.log(`    ✓ Round 1: ${round1Votes.length} votes`);

    // Attempt recheck — should skip (below threshold)
    const recheck1 = await triggerFactRecheck(appUrl, adminToken, facts);
    const recheck1Filtered = extractReassessmentResults(recheck1, targetIds);
    const recheck1Processed = recheck1Filtered.filter((r) => !r.skipped).length;
    console.log(`    Round 1 recheck: ${recheck1Processed} processed, ${recheck1Filtered.length - recheck1Processed} skipped (target facts only)`);

    // Round 2: 5 more downvotes with updated info — reaches threshold
    console.log("    Round 2: 5 more downvotes (reaches threshold)...");
    const round2Users = shuffledUsers.slice(5, 10);
    const { votes: round2Votes } = await castVotesBatch(appUrl,
        facts.flatMap((fact) => round2Users.map((user) => ({ user, fact, value: -1 as const, reason: "The correct updated figure is different from what's stated here." }))),
    );
    allRoundVotes.push(...round2Votes);
    rounds.push({
        round: 2,
        votesCast: round2Votes,
        totalUpvotes: 0,
        totalDownvotes: round2Votes.length,
    });
    console.log(`    ✓ Round 2: ${round2Votes.length} votes`);

    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheck2 = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Round 2 recheck: ${JSON.stringify(recheck2).slice(0, 200)}`);

    // Round 3: Upvotes to confirm updated fact
    console.log("    Round 3: Upvotes confirming update...");
    const round3Users = shuffledUsers.slice(10, 20);
    const { votes: round3Votes } = await castVotesBatch(appUrl,
        facts.flatMap((fact) => round3Users.map((user) => ({ user, fact, value: 1 as const, reason: "The updated fact looks correct now." }))),
    );
    allRoundVotes.push(...round3Votes);
    rounds.push({
        round: 3,
        votesCast: round3Votes,
        totalUpvotes: round3Votes.length,
        totalDownvotes: 0,
    });
    console.log(`    ✓ Round 3: ${round3Votes.length} votes`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheck2, targetIds);
    const metrics = computeMetrics(reassessmentResults, allRoundVotes, "updated");

    return {
        factsTargeted: targets,
        votingRounds: rounds,
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

async function executeScenario7(
    appUrl: string,
    facts: FactInfo[],
    users: AuthenticatedUser[],
    adminToken: string,
    waitMs: number,
): Promise<Omit<ScenarioResult, "scenario">> {
    const errors: string[] = [];
    const targetIds = new Set(facts.map((f) => f.id));
    const targets: FactTarget[] = facts.map((f) => ({
        factId: f.id, originalText: f.text, isInjected: false, category: "quality_test",
    }));

    console.log(`    Resetting vote state for ${facts.length} facts...`);
    await resetFactVoteState(facts.map((f) => f.id));

    const shuffledUsers = shuffle(users);
    const vagueDownvoters = shuffledUsers.slice(0, 15);
    const qualityUpvoters = shuffledUsers.slice(15, 20);

    const { votes, errors: batchErrors } = await castVotesBatch(appUrl, [
        ...facts.flatMap((fact) => vagueDownvoters.map((user) => ({ user, fact, value: -1 as const, reason: pick(DOWNVOTE_RATIONALES_VAGUE), errorLabel: "vague downvote" }))),
        ...facts.flatMap((fact) => qualityUpvoters.map((user) => ({ user, fact, value: 1 as const, reason: pick(UPVOTE_RATIONALES_STRONG), errorLabel: "quality upvote" }))),
    ]);
    errors.push(...batchErrors);

    console.log(`    ✓ Cast ${votes.length} votes (15 vague downvotes, 5 quality upvotes per fact)`);
    console.log(`    Waiting ${waitMs / 1000}s for AI processing...`);
    await sleep(waitMs);

    const recheckResult = await triggerFactRecheck(appUrl, adminToken, facts);
    console.log(`    Recheck: ${JSON.stringify(recheckResult).slice(0, 200)}`);

    const factsAfter = await fetchAllFactsForTopics(appUrl, facts, users[0].token);
    const reassessmentResults = extractReassessmentResults(recheckResult, targetIds);
    const metrics = computeMetrics(reassessmentResults, votes, "kept");

    return {
        factsTargeted: targets,
        votingRounds: [{ round: 1, votesCast: votes, totalUpvotes: votes.filter((v) => v.value === 1).length, totalDownvotes: votes.filter((v) => v.value === -1).length }],
        reassessmentResults,
        factsAfter,
        metrics,
        errors,
        durationMs: 0,
    };
}

// ────────────────────────── Result Helpers ──────────────────────────

async function fetchAllFactsForTopics(appUrl: string, facts: FactInfo[], token: string): Promise<FactInfo[]> {
    const topicIds = [...new Set(facts.map((f) => f.topicId))];
    const allFacts: FactInfo[] = [];
    for (const tid of topicIds) {
        const fetched = await fetchTopicFacts(appUrl, tid, token);
        allFacts.push(...fetched);
    }
    return allFacts;
}

function extractReassessmentResults(recheckResponse: any, targetFactIds?: Set<string>): ReassessmentResult[] {
    if (!recheckResponse?.results) return [];
    const all = recheckResponse.results.map((r: any) => ({
        factId: r.factId,
        action: r.action,
        previousText: r.previousText,
        updatedText: r.updatedText,
        rationale: r.rationale,
        skipped: r.skipped ?? false,
        error: r.error,
    }));
    if (targetFactIds) return all.filter((r: ReassessmentResult) => targetFactIds.has(r.factId));
    return all;
}

function computeMetrics(
    reassessments: ReassessmentResult[],
    votes: FactVoteCast[],
    expectedAction: string,
): ScenarioMetrics {
    const processed = reassessments.filter((r) => !r.skipped && !r.error);
    const kept = processed.filter((r) => r.action === "kept").length;
    const updated = processed.filter((r) => r.action === "updated").length;
    const removed = processed.filter((r) => r.action === "removed").length;
    const skipped = reassessments.filter((r) => r.skipped).length;
    const errored = reassessments.filter((r) => r.error).length;

    const upvotes = votes.filter((v) => v.value === 1).length;
    const downvotes = votes.filter((v) => v.value === -1).length;
    const totalVotes = upvotes + downvotes;
    const avgVoteRatio = totalVotes > 0 ? upvotes / totalVotes : 0;

    const triggered = reassessments.filter((r) => !r.skipped).length;
    const triggerRate = reassessments.length > 0 ? triggered / reassessments.length : 0;

    let outcomeMatch = false;
    if (expectedAction === "kept") outcomeMatch = kept > 0 && removed === 0;
    else if (expectedAction === "updated") outcomeMatch = updated > 0;
    else if (expectedAction === "removed") outcomeMatch = removed > 0;
    else outcomeMatch = true;

    return {
        factsKept: kept,
        factsUpdated: updated,
        factsRemoved: removed,
        factsSkipped: skipped,
        factsErrored: errored,
        avgVoteRatio,
        reassessmentTriggerRate: triggerRate,
        expectedOutcomeMatch: outcomeMatch,
    };
}

// ────────────────────────── CLI & Main ──────────────────────────

function parseArgs(): {
    inputFile: string;
    scenarioFilter: number[] | null;
    waitMs: number;
    topicFilter: string | null;
    appUrl: string;
    adminEmail: string;
    adminPassword: string;
} {
    const args = process.argv.slice(2);
    let inputFile = "";
    let scenarioFilter: number[] | null = null;
    let waitMs = 15000;
    let topicFilter: string | null = null;
    let appUrl = "http://localhost:3000";
    let adminEmail = process.env.FACT_RECHECK_ADMIN_EMAIL ?? process.env.ADMIN_EMAIL ?? "";
    let adminPassword = process.env.FACT_RECHECK_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--scenarios" && args[i + 1]) {
            scenarioFilter = args[i + 1].split(",").map(Number).filter((n) => n >= 1 && n <= 7);
            i++;
        } else if (args[i] === "--wait" && args[i + 1]) {
            waitMs = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === "--topic" && args[i + 1]) {
            topicFilter = args[i + 1];
            i++;
        } else if (args[i] === "--app-url" && args[i + 1]) {
            appUrl = args[i + 1];
            i++;
        } else if (args[i] === "--admin-email" && args[i + 1]) {
            adminEmail = args[i + 1];
            i++;
        } else if (args[i] === "--admin-password" && args[i + 1]) {
            adminPassword = args[i + 1];
            i++;
        } else if (!args[i].startsWith("--") && !inputFile) {
            inputFile = args[i];
        }
    }

    return { inputFile, scenarioFilter, waitMs, topicFilter, appUrl, adminEmail, adminPassword };
}

async function main() {
    const { inputFile, scenarioFilter, waitMs, topicFilter, appUrl, adminEmail, adminPassword } = parseArgs();

    if (!inputFile) {
        console.error(
            "Usage: npx tsx src/app/scripts/userSimulation/simulateFactVoting.ts <users_file.json> [options]\n" +
            "Options:\n" +
            "  --scenarios <1,2,3>  Scenario numbers to run (1-7)\n" +
            "  --wait <ms>          AI processing wait time (default: 15000)\n" +
            "  --topic <id>         Restrict to a single topic ID\n" +
            "  --app-url <url>      App URL (default: http://localhost:3000)\n" +
            "  --admin-email <e>    Admin email for /api/admin/facts-recheck\n" +
            "  --admin-password <p> Admin password for /api/admin/facts-recheck"
        );
        process.exitCode = 1;
        return;
    }

    const resolvedPath = path.resolve(process.cwd(), inputFile);
    const selectedScenarios = scenarioFilter
        ? FACT_VOTING_SCENARIOS.filter((_, i) => scenarioFilter!.includes(i + 1))
        : FACT_VOTING_SCENARIOS;

    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Fact Voting Simulation`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Users file:    ${resolvedPath}`);
    console.log(`  App URL:       ${appUrl}`);
    console.log(`  Wait time:     ${waitMs}ms`);
    console.log(`  Scenarios:     ${selectedScenarios.map((s) => s.id).join(", ")}`);
    console.log(`${"═".repeat(60)}\n`);

    // Load users
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
    console.log(`Loaded ${savedUsers.length} registered users`);

    if (savedUsers.length === 0) {
        console.error("No registered users found — aborting");
        process.exitCode = 1;
        return;
    }

    // Authenticate
    console.log("Authenticating users...");
    const authenticated: AuthenticatedUser[] = [];
    const batchSize = 50;
    for (let i = 0; i < savedUsers.length; i += batchSize) {
        const batch = savedUsers.slice(i, i + batchSize);
        const results = await Promise.all(batch.map((u) => loginUser(appUrl, u)));
        for (const r of results) {
            if (r) authenticated.push(r);
        }
    }
    console.log(`Authenticated ${authenticated.length}/${savedUsers.length} users`);

    if (authenticated.length < 5) {
        console.error("Not enough authenticated users (need at least 5) — aborting");
        process.exitCode = 1;
        return;
    }

    // /api/admin/facts-recheck requires a real admin account
    if (!adminEmail || !adminPassword) {
        console.error(
            "Missing admin credentials for fact recheck. Provide --admin-email/--admin-password " +
            "or set FACT_RECHECK_ADMIN_EMAIL / FACT_RECHECK_ADMIN_PASSWORD."
        );
        process.exitCode = 1;
        return;
    }

    console.log("Authenticating admin user for recheck endpoint...");
    const adminToken = await loginAdmin(appUrl, adminEmail, adminPassword);
    if (!adminToken) {
        console.error("Failed to authenticate admin credentials — aborting");
        process.exitCode = 1;
        return;
    }

    // Discover topics & facts
    console.log("\nDiscovering topics and facts...");
    let topicIds: string[];
    if (topicFilter) {
        topicIds = [topicFilter];
    } else {
        topicIds = await fetchTopicIds(appUrl, authenticated[0].token);
    }

    if (topicIds.length === 0) {
        console.error("No topics found — aborting");
        process.exitCode = 1;
        return;
    }

    console.log(`  Found ${topicIds.length} topics`);

    let allFacts: FactInfo[] = [];
    for (const tid of topicIds) {
        const facts = await fetchTopicFacts(appUrl, tid, authenticated[0].token);
        allFacts.push(...facts);
    }
    console.log(`  Found ${allFacts.length} active facts across all topics`);

    if (allFacts.length === 0) {
        console.error("No facts found — the system may not have extracted any facts yet. Aborting.");
        process.exitCode = 1;
        return;
    }

    // Run scenarios
    const scenarioResults: ScenarioResult[] = [];

    const scenarioFns = [
        executeScenario1, executeScenario2, executeScenario3,
        executeScenario4, executeScenario5, executeScenario6,
        executeScenario7,
    ];

    for (const scenario of selectedScenarios) {
        const idx = FACT_VOTING_SCENARIOS.findIndex((s) => s.id === scenario.id);
        const fn = scenarioFns[idx];
        if (!fn) continue;

        console.log(`\n${"╔" + "═".repeat(58) + "╗"}`);
        console.log(`║  ${scenario.name.padEnd(56)}║`);
        console.log(`${"╚" + "═".repeat(58) + "╝"}`);
        console.log(`  ${scenario.description}`);
        console.log(`  Expected outcome: ${scenario.expectedOutcome}`);

        const startTime = Date.now();
        const result = await fn(appUrl, allFacts, authenticated, adminToken, waitMs);
        const durationMs = Date.now() - startTime;

        scenarioResults.push({
            scenario,
            ...result,
            durationMs,
        });

        console.log(`\n  Results:`);
        console.log(`    Kept: ${result.metrics.factsKept}`);
        console.log(`    Updated: ${result.metrics.factsUpdated}`);
        console.log(`    Removed: ${result.metrics.factsRemoved}`);
        console.log(`    Skipped: ${result.metrics.factsSkipped}`);
        console.log(`    Vote ratio (up/total): ${(result.metrics.avgVoteRatio * 100).toFixed(1)}%`);
        console.log(`    Expected outcome match: ${result.metrics.expectedOutcomeMatch ? "✓ YES" : "✗ NO"}`);
        console.log(`    Duration: ${(durationMs / 1000).toFixed(1)}s`);

        // Re-fetch facts for next scenario (they may have changed)
        allFacts = [];
        for (const tid of topicIds) {
            const facts = await fetchTopicFacts(appUrl, tid, authenticated[0].token);
            allFacts.push(...facts);
        }
    }

    // Save report
    const report: FullReport = {
        timestamp: new Date().toISOString(),
        usersFile: resolvedPath,
        config: {
            appUrl,
            topicIds,
            scenariosRun: selectedScenarios.map((s) => s.id),
            aiProcessingWaitMs: waitMs,
        },
        scenarioResults,
    };

    const outputFile = path.resolve(process.cwd(), `fact_voting_simulation_${Date.now()}.json`);
    await fs.writeFile(outputFile, JSON.stringify(report, null, 2), "utf-8");
    console.log(`\n✅ Report saved to: ${outputFile}`);

    // Summary
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  FACT VOTING SIMULATION SUMMARY`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  ${"Scenario".padEnd(50)} ${"Kept".padStart(5)} ${"Upd".padStart(5)} ${"Rem".padStart(5)} ${"Match".padStart(6)}`);
    console.log(`  ${"─".repeat(71)}`);
    for (const r of scenarioResults) {
        const m = r.metrics;
        const match = m.expectedOutcomeMatch ? "  ✓" : "  ✗";
        console.log(
            `  ${r.scenario.name.padEnd(50)} ${String(m.factsKept).padStart(5)} ${String(m.factsUpdated).padStart(5)} ${String(m.factsRemoved).padStart(5)} ${match.padStart(6)}`
        );
    }
    console.log(`${"═".repeat(60)}`);
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
});
