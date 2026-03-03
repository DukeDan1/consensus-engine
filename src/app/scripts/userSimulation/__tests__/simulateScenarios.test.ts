/**
 * simulateScenarios.test.ts
 *
 * Unit tests for the pure utility functions and evaluateAiSystems in simulateScenarios.ts.
 * External dependencies (AI routing, DB, Wikipedia fetcher) are mocked so tests
 * run offline without any API calls.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";

// ── Mock all side-effectful imports consumed by simulateScenarios.ts ──────

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

vi.mock("node:fs/promises", () => ({
    default: {
        readFile: vi.fn(),
        writeFile: vi.fn(),
    },
}));

vi.mock("@/app/services/aiRoutingService", () => ({
    routeResponsesClient: vi.fn(),
}));

vi.mock("../wikipediaFetcher", () => ({
    fetchAllArticles: vi.fn(),
}));

vi.mock("../trustTracker", () => ({
    snapshotTrust: vi.fn(),
    buildTrustReport: vi.fn(),
    resetTrustForUsers: vi.fn(),
    getUserIdsByEmails: vi.fn(),
}));

// ── Import the functions under test (mocks are hoisted before this) ───────

import {
    snippet,
    pick,
    shuffle,
    runBatched,
    parseFunctionCallArgs,
    buildAuthHeaders,
    evaluateAiSystems,
    type AiEvaluation,
} from "../simulateScenarios";

import { pickCategory } from "../scenarioConfig";

// ─────────────────────────────────────────────────────────────────────────────
// snippet()
// ─────────────────────────────────────────────────────────────────────────────

describe("snippet", () => {
    it("returns text unchanged when it is shorter than maxLen", () => {
        expect(snippet("hello", 10)).toBe("hello");
    });

    it("returns text unchanged when it is exactly maxLen", () => {
        const text = "a".repeat(120);
        expect(snippet(text)).toBe(text);
    });

    it("truncates and appends ellipsis when text exceeds default maxLen (120)", () => {
        const text = "a".repeat(121);
        const result = snippet(text);
        expect(result).toHaveLength(121); // 120 chars + "…" (1 char)
        expect(result.endsWith("…")).toBe(true);
        expect(result.startsWith("a".repeat(120))).toBe(true);
    });

    it("respects a custom maxLen", () => {
        const result = snippet("hello world", 5);
        expect(result).toBe("hello…");
        expect(result).toHaveLength(6);
    });

    it("handles empty string", () => {
        expect(snippet("")).toBe("");
    });

    it("handles text that is exactly one character over the limit", () => {
        const result = snippet("abcde", 4);
        expect(result).toBe("abcd…");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pick()
// ─────────────────────────────────────────────────────────────────────────────

describe("pick", () => {
    it("returns the only element when the array has one item", () => {
        expect(pick([42])).toBe(42);
    });

    it("always returns an element that exists in the array", () => {
        const arr = ["a", "b", "c", "d"];
        for (let i = 0; i < 50; i++) {
            expect(arr).toContain(pick(arr));
        }
    });

    it("works with objects", () => {
        const obj = { id: 1 };
        expect(pick([obj])).toBe(obj);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// shuffle()
// ─────────────────────────────────────────────────────────────────────────────

describe("shuffle", () => {
    it("returns an array with the same length", () => {
        const arr = [1, 2, 3, 4, 5];
        expect(shuffle(arr)).toHaveLength(arr.length);
    });

    it("contains all the same elements", () => {
        const arr = [1, 2, 3, 4, 5];
        expect(shuffle(arr).sort()).toEqual([...arr].sort());
    });

    it("does not mutate the original array", () => {
        const arr = [1, 2, 3, 4, 5];
        const copy = [...arr];
        shuffle(arr);
        expect(arr).toEqual(copy);
    });

    it("returns a new array reference", () => {
        const arr = [1, 2, 3];
        expect(shuffle(arr)).not.toBe(arr);
    });

    it("handles a single-element array", () => {
        expect(shuffle([99])).toEqual([99]);
    });

    it("handles an empty array", () => {
        expect(shuffle([])).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// runBatched()
// ─────────────────────────────────────────────────────────────────────────────

describe("runBatched", () => {
    it("executes all tasks and returns their results", async () => {
        const tasks = [1, 2, 3, 4, 5].map((n) => async () => n * 10);
        const results = await runBatched(tasks, 2);
        expect(results).toEqual([10, 20, 30, 40, 50]);
    });

    it("works with batchSize of 1 (serial execution)", async () => {
        const order: number[] = [];
        const tasks = [1, 2, 3].map((n) => async () => {
            order.push(n);
            return n;
        });
        const results = await runBatched(tasks, 1);
        expect(results).toEqual([1, 2, 3]);
        expect(order).toEqual([1, 2, 3]);
    });

    it("works with batchSize larger than task count", async () => {
        const tasks = [1, 2].map((n) => async () => n);
        const results = await runBatched(tasks, 100);
        expect(results).toEqual([1, 2]);
    });

    it("returns empty array for empty task list", async () => {
        expect(await runBatched([], 5)).toEqual([]);
    });

    it("processes tasks in batches — tasks in later batches start after earlier batches finish", async () => {
        const starts: number[] = [];
        let counter = 0;
        const tasks = [0, 1, 2, 3].map((i) => async () => {
            starts.push(counter++);
            return i;
        });
        // batchSize=2: first two start simultaneously (both get counter 0 and 1),
        // then next two start after (get counter 2 and 3)
        const results = await runBatched(tasks, 2);
        expect(results).toEqual([0, 1, 2, 3]);
        // After batch 1, all 4 tasks recorded incrementing counter
        expect(starts).toHaveLength(4);
    });

    it("propagates rejection from a failing task", async () => {
        const tasks = [
            async () => 1,
            async () => { throw new Error("boom"); },
        ];
        await expect(runBatched(tasks, 5)).rejects.toThrow("boom");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseFunctionCallArgs()
// ─────────────────────────────────────────────────────────────────────────────

describe("parseFunctionCallArgs", () => {
    it("parses a JSON string into an object", () => {
        const result = parseFunctionCallArgs<{ value: number }>('{"value": 42}');
        expect(result).toEqual({ value: 42 });
    });

    it("returns an existing object without modification", () => {
        const obj = { foo: "bar", nested: { x: 1 } };
        expect(parseFunctionCallArgs(obj)).toBe(obj);
    });

    it("parses array JSON strings", () => {
        const result = parseFunctionCallArgs<string[]>('["a","b","c"]');
        expect(result).toEqual(["a", "b", "c"]);
    });

    it("throws when rawArgs is null", () => {
        expect(() => parseFunctionCallArgs(null)).toThrow("Tool call arguments were empty or invalid");
    });

    it("throws when rawArgs is undefined", () => {
        expect(() => parseFunctionCallArgs(undefined)).toThrow("Tool call arguments were empty or invalid");
    });

    it("throws when rawArgs is an invalid JSON string", () => {
        expect(() => parseFunctionCallArgs("{not valid json}")).toThrow();
    });

    it("returns a number-valued object when passed one", () => {
        const input = { count: 5 };
        expect(parseFunctionCallArgs<{ count: number }>(input)).toEqual({ count: 5 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAuthHeaders()
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAuthHeaders", () => {
    it("includes Authorization: Bearer <token>", () => {
        const headers = buildAuthHeaders("my-token");
        expect(headers.Authorization).toBe("Bearer my-token");
    });

    it("merges extra headers with authorization", () => {
        const headers = buildAuthHeaders("tok", { "Content-Type": "application/json" });
        expect(headers["Content-Type"]).toBe("application/json");
        expect(headers.Authorization).toBe("Bearer tok");
    });

    it("extra headers can override Authorization if explicitly provided", () => {
        const headers = buildAuthHeaders("tok", { Authorization: "Basic abc" });
        // spread order: extra first, then Authorization — extra gets overwritten
        expect(headers.Authorization).toBe("Bearer tok");
    });

    it("works without extra headers", () => {
        const headers = buildAuthHeaders("abc123");
        expect(Object.keys(headers)).toEqual(["Authorization"]);
    });

    it("handles empty extra headers object", () => {
        const headers = buildAuthHeaders("tok", {});
        expect(headers).toEqual({ Authorization: "Bearer tok" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAiSystems()
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAiSystems", () => {
    it("returns a zeroed report for empty evaluations", () => {
        const report = evaluateAiSystems([]);
        expect(report.moderation.total).toBe(0);
        expect(report.factChecking.total).toBe(0);
        expect(report.ontology.totalTagged).toBe(0);
        expect(report.ontology.avgCategoriesPerItem).toBe(0);
        expect(report.aiAnalysis.total).toBe(0);
    });

    it("counts a single visible argument correctly", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "Test Topic",
            arguments: [{
                id: "a1",
                side: "for",
                bodySnippet: "Some argument",
                category: "highQualityFacts",
                visibility: { status: "visible" },
                comments: [],
            }],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.moderation.total).toBe(1);
        expect(report.moderation.visible).toBe(1);
        expect(report.moderation.blocked).toBe(0);
        expect(report.moderation.byCategory["highQualityFacts"].visible).toBe(1);
    });

    it("counts blocked arguments correctly", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "Test Topic",
            arguments: [{
                id: "a1",
                side: "against",
                bodySnippet: "Bad content",
                category: "spam",
                visibility: { status: "blocked" },
                comments: [],
            }],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.moderation.blocked).toBe(1);
        expect(report.moderation.visible).toBe(0);
        expect(report.moderation.byCategory["spam"].blocked).toBe(1);
    });

    it("accumulates moderation across all statuses", () => {
        const makeArg = (id: string, status: string, category: string) => ({
            id,
            side: "for" as const,
            bodySnippet: "x",
            category: category as AiEvaluation["arguments"][number]["category"],
            visibility: { status },
            comments: [] as AiEvaluation["arguments"][number]["comments"],
        });
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [
                makeArg("a1", "visible", "average"),
                makeArg("a2", "blocked", "spam"),
                makeArg("a3", "hidden", "troll"),
                makeArg("a4", "needs_review", "mildAbusive"),
                makeArg("a5", "noise", "noise"),
            ],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.moderation.total).toBe(5);
        expect(report.moderation.visible).toBe(1);
        expect(report.moderation.blocked).toBe(1);
        expect(report.moderation.hidden).toBe(1);
        expect(report.moderation.needsReview).toBe(1);
        expect(report.moderation.noise).toBe(1);
    });

    it("counts fact-check verdicts correctly", () => {
        const makeArg = (id: string, verdict: string) => ({
            id,
            side: "for" as const,
            bodySnippet: "x",
            category: "highQualityFacts" as const,
            contentFactCheck: { verdict },
            comments: [] as AiEvaluation["arguments"][number]["comments"],
        });
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [
                makeArg("a1", "verified"),
                makeArg("a2", "inaccurate"),
                makeArg("a3", "mixed"),
                makeArg("a4", "unverified"),
            ],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.factChecking.verified).toBe(1);
        expect(report.factChecking.inaccurate).toBe(1);
        expect(report.factChecking.mixed).toBe(1);
        expect(report.factChecking.unverified).toBe(1);
        expect(report.factChecking.notChecked).toBe(0);
    });

    it("counts notChecked when verdict is absent", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [{
                id: "a1",
                side: "for",
                bodySnippet: "x",
                category: "average",
                comments: [],
            }],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.factChecking.notChecked).toBe(1);
    });

    it("tracks comments in moderation and fact-check counts", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [{
                id: "a1",
                side: "for",
                bodySnippet: "arg",
                category: "highQualityFacts",
                visibility: { status: "visible" },
                comments: [
                    { id: "c1", bodySnippet: "c", category: "spam", visibility: { status: "blocked" } },
                    { id: "c2", bodySnippet: "d", category: "average", visibility: { status: "visible" } },
                ],
            }],
        }];
        const report = evaluateAiSystems(evals);
        // 1 arg + 2 comments = 3 total moderation items
        expect(report.moderation.total).toBe(3);
        expect(report.moderation.visible).toBe(2);  // arg + 1 comment
        expect(report.moderation.blocked).toBe(1);  // 1 comment
    });

    it("computes ontology averages correctly", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [
                {
                    id: "a1",
                    side: "for",
                    bodySnippet: "x",
                    category: "average",
                    ontologyCategories: [{ id: "o1", label: "Foo" }, { id: "o2", label: "Bar" }],
                    comments: [],
                },
                {
                    id: "a2",
                    side: "against",
                    bodySnippet: "y",
                    category: "average",
                    ontologyCategories: [{ id: "o3", label: "Baz" }],
                    comments: [],
                },
            ],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.ontology.totalTagged).toBe(2);
        expect(report.ontology.totalCategories).toBe(3);
        expect(report.ontology.avgCategoriesPerItem).toBe(1.5);
    });

    it("sets avgCategoriesPerItem to 0 when nothing is tagged", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [{ id: "a1", side: "for", bodySnippet: "x", category: "average", comments: [] }],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.ontology.avgCategoriesPerItem).toBe(0);
    });

    it("tracks aiAnalysis stats correctly", () => {
        const evals: AiEvaluation[] = [{
            topicId: "t1",
            title: "T",
            arguments: [
                {
                    id: "a1",
                    side: "for",
                    bodySnippet: "fact-based",
                    category: "highQualityFacts",
                    aiAnalysis: { isFact: true, isOpinion: false, justification: "Because science" },
                    comments: [],
                },
                {
                    id: "a2",
                    side: "against",
                    bodySnippet: "opinion",
                    category: "average",
                    aiAnalysis: { isFact: false, isOpinion: true },
                    comments: [],
                },
            ],
        }];
        const report = evaluateAiSystems(evals);
        expect(report.aiAnalysis.total).toBe(2);
        expect(report.aiAnalysis.facts).toBe(1);
        expect(report.aiAnalysis.opinions).toBe(1);
        expect(report.aiAnalysis.withJustification).toBe(1);
    });

    it("accumulates across multiple topics", () => {
        const evals: AiEvaluation[] = [
            {
                topicId: "t1",
                title: "Topic 1",
                arguments: [
                    { id: "a1", side: "for", bodySnippet: "x", category: "average", visibility: { status: "visible" }, comments: [] },
                ],
            },
            {
                topicId: "t2",
                title: "Topic 2",
                arguments: [
                    { id: "a2", side: "against", bodySnippet: "y", category: "spam", visibility: { status: "blocked" }, comments: [] },
                    { id: "a3", side: "neutral", bodySnippet: "z", category: "troll", visibility: { status: "hidden" }, comments: [] },
                ],
            },
        ];
        const report = evaluateAiSystems(evals);
        expect(report.moderation.total).toBe(3);
        expect(report.moderation.visible).toBe(1);
        expect(report.moderation.blocked).toBe(1);
        expect(report.moderation.hidden).toBe(1);
        expect(Object.keys(report.moderation.byCategory)).toContain("average");
        expect(Object.keys(report.moderation.byCategory)).toContain("spam");
        expect(Object.keys(report.moderation.byCategory)).toContain("troll");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// pickCategory() (from scenarioConfig — already exported)
// ─────────────────────────────────────────────────────────────────────────────

describe("pickCategory", () => {
    it("always returns the sole category when its weight is 1.0", () => {
        for (let i = 0; i < 20; i++) {
            expect(pickCategory({ highQualityFacts: 1.0 })).toBe("highQualityFacts");
        }
    });

    it("returns a category that exists in the distribution", () => {
        const dist = { spam: 0.5, troll: 0.3, noise: 0.2 };
        for (let i = 0; i < 50; i++) {
            const cat = pickCategory(dist);
            expect(["spam", "troll", "noise"]).toContain(cat);
        }
    });

    it("falls back to the last entry when Math.random returns 1.0", () => {
        vi.spyOn(Math, "random").mockReturnValueOnce(0.9999999);
        const cat = pickCategory({ highQualityFacts: 0.5, spam: 0.5 });
        expect(["highQualityFacts", "spam"]).toContain(cat);
        vi.restoreAllMocks();
    });

    it("respects weighted distribution over many samples (chi-square approximation)", () => {
        const dist = { highQualityFacts: 0.8, spam: 0.2 };
        const counts: Record<string, number> = { highQualityFacts: 0, spam: 0 };
        const N = 1000;
        for (let i = 0; i < N; i++) {
            counts[pickCategory(dist)]++;
        }
        // With 80/20 split over 1000 samples, expect roughly 800 ± 60 and 200 ± 60
        expect(counts.highQualityFacts).toBeGreaterThan(700);
        expect(counts.highQualityFacts).toBeLessThan(900);
        expect(counts.spam).toBeGreaterThan(140);
        expect(counts.spam).toBeLessThan(260);
    });
});
