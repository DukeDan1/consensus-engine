/**
 * simulateFactVoting.test.ts
 *
 * Unit tests for the pure utility functions in simulateFactVoting.ts.
 * All side-effectful imports (DB, fetch, dotenv, fs) are mocked so the
 * tests run offline without any network or database access.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// ── Mock all side-effectful imports ──────────────────────────────────────────

vi.mock("dotenv", () => ({ default: { config: vi.fn() } }));

vi.mock("node:fs/promises", () => ({
    default: { readFile: vi.fn(), writeFile: vi.fn() },
}));

vi.mock("@/app/lib/mongoose", () => ({ dbConnect: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/app/models/facts", () => ({
    default: {
        updateMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    },
}));

vi.mock("@/app/models/factVote", () => ({
    default: {
        deleteMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) }),
    },
}));

vi.mock("mongoose", () => ({
    __esModule: true,
    default: {
        Types: {
            ObjectId: class MockObjectId {
                value: string;
                constructor(v: string = "mock-id") { this.value = v; }
                toString() { return this.value; }
            },
        },
    },
    Types: {
        ObjectId: class MockObjectId {
            value: string;
            constructor(v: string = "mock-id") { this.value = v; }
            toString() { return this.value; }
        },
    },
}));

// ── Import functions under test ───────────────────────────────────────────────

import {
    pick,
    shuffle,
    buildAuthHeaders,
    extractReassessmentResults,
    computeMetrics,
    castVotesBatch,
    FACT_VOTING_SCENARIOS,
} from "../simulateFactVoting";

// ─────────────────────────────────────────────────────────────────────────────
// pick()
// ─────────────────────────────────────────────────────────────────────────────

describe("pick", () => {
    it("returns an element from a single-element array", () => {
        expect(pick(["only"])).toBe("only");
    });

    it("returns a value that belongs to the input array", () => {
        const arr = ["a", "b", "c", "d"];
        const result = pick(arr);
        expect(arr).toContain(result);
    });

    it("is consistent when called many times on a valid array", () => {
        const arr = [1, 2, 3];
        for (let i = 0; i < 50; i++) {
            expect(arr).toContain(pick(arr));
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// shuffle()
// ─────────────────────────────────────────────────────────────────────────────

describe("shuffle", () => {
    it("returns an array of the same length", () => {
        const arr = [1, 2, 3, 4, 5];
        expect(shuffle(arr)).toHaveLength(arr.length);
    });

    it("contains all original elements", () => {
        const arr = [1, 2, 3, 4, 5];
        expect(shuffle(arr).sort()).toEqual([...arr].sort());
    });

    it("does not mutate the original array", () => {
        const arr = [1, 2, 3, 4, 5];
        const copy = [...arr];
        shuffle(arr);
        expect(arr).toEqual(copy);
    });

    it("returns an empty array unchanged", () => {
        expect(shuffle([])).toEqual([]);
    });

    it("returns a single-element array unchanged", () => {
        expect(shuffle([42])).toEqual([42]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildAuthHeaders()
// ─────────────────────────────────────────────────────────────────────────────

describe("buildAuthHeaders", () => {
    it("returns an Authorization Bearer header for the given token", () => {
        const headers = buildAuthHeaders("my-token");
        expect(headers).toEqual({ Authorization: "Bearer my-token" });
    });

    it("merges extra headers alongside the Authorization header", () => {
        const headers = buildAuthHeaders("tok", { "Content-Type": "application/json" });
        expect(headers).toEqual({
            Authorization: "Bearer tok",
            "Content-Type": "application/json",
        });
    });

    it("extra headers do not overwrite the Authorization header", () => {
        const headers = buildAuthHeaders("real-token", { Authorization: "Bearer sneaky" });
        // Authorization is set last by the spread, so our token wins
        expect(headers.Authorization).toBe("Bearer real-token");
    });

    it("handles an empty extra object", () => {
        expect(buildAuthHeaders("x", {})).toEqual({ Authorization: "Bearer x" });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractReassessmentResults()
// ─────────────────────────────────────────────────────────────────────────────

describe("extractReassessmentResults", () => {
    const rawResponse = {
        results: [
            { factId: "fact-1", action: "kept", skipped: false, previousText: "old", updatedText: null, rationale: "looks good", error: undefined },
            { factId: "fact-2", action: "updated", skipped: false, previousText: "old2", updatedText: "new2", rationale: "minor fix", error: undefined },
            { factId: "fact-3", action: "removed", skipped: false, previousText: "bad", updatedText: null, rationale: "fabricated", error: undefined },
            { factId: "fact-4", action: "kept", skipped: true, error: undefined },
            { factId: "fact-5", action: "error", skipped: false, error: "HTTP 500" },
        ],
    };

    it("returns all results when no targetFactIds filter is provided", () => {
        const results = extractReassessmentResults(rawResponse);
        expect(results).toHaveLength(5);
    });

    it("filters results to the provided targetFactIds set", () => {
        const target = new Set(["fact-1", "fact-3"]);
        const results = extractReassessmentResults(rawResponse, target);
        expect(results).toHaveLength(2);
        expect(results.map((r) => r.factId)).toEqual(["fact-1", "fact-3"]);
    });

    it("returns an empty array when recheckResponse has no results key", () => {
        expect(extractReassessmentResults({})).toEqual([]);
        expect(extractReassessmentResults(null)).toEqual([]);
        expect(extractReassessmentResults(undefined)).toEqual([]);
    });

    it("maps skipped flag correctly", () => {
        const results = extractReassessmentResults(rawResponse);
        expect(results.find((r) => r.factId === "fact-4")?.skipped).toBe(true);
        expect(results.find((r) => r.factId === "fact-1")?.skipped).toBe(false);
    });

    it("maps error field correctly", () => {
        const results = extractReassessmentResults(rawResponse);
        expect(results.find((r) => r.factId === "fact-5")?.error).toBe("HTTP 500");
        expect(results.find((r) => r.factId === "fact-1")?.error).toBeUndefined();
    });

    it("maps action, previousText, updatedText, and rationale correctly", () => {
        const results = extractReassessmentResults(rawResponse);
        const updated = results.find((r) => r.factId === "fact-2")!;
        expect(updated.action).toBe("updated");
        expect(updated.previousText).toBe("old2");
        expect(updated.updatedText).toBe("new2");
        expect(updated.rationale).toBe("minor fix");
    });

    it("returns empty array when targetFactIds set is empty", () => {
        const results = extractReassessmentResults(rawResponse, new Set());
        expect(results).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeMetrics()
// ─────────────────────────────────────────────────────────────────────────────

type FactVoteCast = {
    factId: string;
    userId: string;
    username: string;
    value: 1 | -1;
    reason: string;
};

type ReassessmentResult = {
    factId: string;
    action: string;
    skipped: boolean;
    error?: string;
};

function makeVote(value: 1 | -1): FactVoteCast {
    return { factId: "f1", userId: "u1", username: "user1", value, reason: "" };
}

function makeResult(action: string, skipped = false, error?: string): ReassessmentResult {
    return { factId: "f1", action, skipped, error };
}

describe("computeMetrics", () => {
    describe("vote ratio", () => {
        it("computes avgVoteRatio as 1.0 when all votes are upvotes", () => {
            const votes = [makeVote(1), makeVote(1), makeVote(1)];
            const { avgVoteRatio } = computeMetrics([], votes, "kept");
            expect(avgVoteRatio).toBe(1);
        });

        it("computes avgVoteRatio as 0.0 when all votes are downvotes", () => {
            const votes = [makeVote(-1), makeVote(-1)];
            const { avgVoteRatio } = computeMetrics([], votes, "kept");
            expect(avgVoteRatio).toBe(0);
        });

        it("computes avgVoteRatio as 0.5 for equal up and down votes", () => {
            const votes = [makeVote(1), makeVote(-1)];
            const { avgVoteRatio } = computeMetrics([], votes, "kept");
            expect(avgVoteRatio).toBe(0.5);
        });

        it("returns avgVoteRatio of 0 when there are no votes", () => {
            const { avgVoteRatio } = computeMetrics([], [], "kept");
            expect(avgVoteRatio).toBe(0);
        });
    });

    describe("fact counts", () => {
        it("counts kept, updated, removed, skipped, and errored correctly", () => {
            const reassessments = [
                makeResult("kept"),
                makeResult("kept"),
                makeResult("updated"),
                makeResult("removed"),
                makeResult("kept", true),  // skipped
                makeResult("error", false, "oops"),
            ];
            const metrics = computeMetrics(reassessments, [], "kept");
            expect(metrics.factsKept).toBe(2);
            expect(metrics.factsUpdated).toBe(1);
            expect(metrics.factsRemoved).toBe(1);
            expect(metrics.factsSkipped).toBe(1);
            expect(metrics.factsErrored).toBe(1);
        });

        it("returns zero counts for an empty reassessment list", () => {
            const metrics = computeMetrics([], [], "kept");
            expect(metrics.factsKept).toBe(0);
            expect(metrics.factsUpdated).toBe(0);
            expect(metrics.factsRemoved).toBe(0);
        });
    });

    describe("reassessmentTriggerRate", () => {
        it("is 1.0 when all reassessments were processed (none skipped)", () => {
            const reassessments = [makeResult("kept"), makeResult("updated")];
            const { reassessmentTriggerRate } = computeMetrics(reassessments, [], "kept");
            expect(reassessmentTriggerRate).toBe(1);
        });

        it("is 0.5 when half the reassessments were skipped", () => {
            const reassessments = [makeResult("kept"), makeResult("kept", true)];
            const { reassessmentTriggerRate } = computeMetrics(reassessments, [], "kept");
            expect(reassessmentTriggerRate).toBe(0.5);
        });

        it("is 0.0 when all reassessments were skipped", () => {
            const reassessments = [makeResult("kept", true), makeResult("kept", true)];
            const { reassessmentTriggerRate } = computeMetrics(reassessments, [], "kept");
            expect(reassessmentTriggerRate).toBe(0);
        });

        it("is 0.0 when reassessment list is empty", () => {
            const { reassessmentTriggerRate } = computeMetrics([], [], "kept");
            expect(reassessmentTriggerRate).toBe(0);
        });
    });

    describe("expectedOutcomeMatch — 'kept'", () => {
        it("is true when there is at least one kept fact and no removals", () => {
            const reassessments = [makeResult("kept"), makeResult("updated")];
            expect(computeMetrics(reassessments, [], "kept").expectedOutcomeMatch).toBe(true);
        });

        it("is false when a fact was removed", () => {
            const reassessments = [makeResult("kept"), makeResult("removed")];
            expect(computeMetrics(reassessments, [], "kept").expectedOutcomeMatch).toBe(false);
        });

        it("is false when there are no kept facts at all", () => {
            const reassessments = [makeResult("updated")];
            expect(computeMetrics(reassessments, [], "kept").expectedOutcomeMatch).toBe(false);
        });
    });

    describe("expectedOutcomeMatch — 'updated'", () => {
        it("is true when at least one fact was updated", () => {
            const reassessments = [makeResult("updated")];
            expect(computeMetrics(reassessments, [], "updated").expectedOutcomeMatch).toBe(true);
        });

        it("is false when no facts were updated", () => {
            const reassessments = [makeResult("kept")];
            expect(computeMetrics(reassessments, [], "updated").expectedOutcomeMatch).toBe(false);
        });
    });

    describe("expectedOutcomeMatch — 'removed'", () => {
        it("is true when at least one fact was removed", () => {
            const reassessments = [makeResult("removed")];
            expect(computeMetrics(reassessments, [], "removed").expectedOutcomeMatch).toBe(true);
        });

        it("is false when no facts were removed", () => {
            const reassessments = [makeResult("kept")];
            expect(computeMetrics(reassessments, [], "removed").expectedOutcomeMatch).toBe(false);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FACT_VOTING_SCENARIOS constant
// ─────────────────────────────────────────────────────────────────────────────

describe("FACT_VOTING_SCENARIOS", () => {
    it("defines exactly 7 scenarios", () => {
        expect(FACT_VOTING_SCENARIOS).toHaveLength(7);
    });

    it("each scenario has a unique id", () => {
        const ids = FACT_VOTING_SCENARIOS.map((s) => s.id);
        expect(new Set(ids).size).toBe(7);
    });

    it("each scenario has a non-empty name and description", () => {
        for (const s of FACT_VOTING_SCENARIOS) {
            expect(s.name.length).toBeGreaterThan(0);
            expect(s.description.length).toBeGreaterThan(0);
        }
    });

    it("each scenario has a valid expectedOutcome", () => {
        const valid = new Set(["kept", "updated", "removed", "mixed"]);
        for (const s of FACT_VOTING_SCENARIOS) {
            expect(valid.has(s.expectedOutcome)).toBe(true);
        }
    });

    it("scenario ids follow the fv_N_ prefix convention", () => {
        for (let i = 0; i < FACT_VOTING_SCENARIOS.length; i++) {
            expect(FACT_VOTING_SCENARIOS[i].id.startsWith(`fv_${i + 1}_`)).toBe(true);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// castVotesBatch()
// ─────────────────────────────────────────────────────────────────────────────

describe("castVotesBatch", () => {
    const mockFact = {
        id: "fact-abc",
        text: "some fact",
        topicId: "topic-1",
        sourceArgument: "",
        sourceComment: "",
        upvoteCount: 0,
        downvoteCount: 0,
        score: 0,
    };

    const mockUser = {
        username: "alice",
        email: "alice@test.com",
        password: "pw",
        name: "Alice",
        bio: "",
        registered: true,
        token: "token-alice",
    };

    beforeEach(() => {
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("returns an empty votes array and no errors when given no tasks", async () => {
        const { votes, errors } = await castVotesBatch("http://localhost:3000", []);
        expect(votes).toEqual([]);
        expect(errors).toEqual([]);
    });

    it("records a successful vote when fetch returns ok", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ upvoteCount: 1, downvoteCount: 0 }),
        });

        const tasks = [{ user: mockUser, fact: mockFact, value: 1 as const, reason: "good fact" }];
        const { votes, errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(votes).toHaveLength(1);
        expect(votes[0]).toMatchObject({
            factId: "fact-abc",
            userId: "alice@test.com",
            username: "alice",
            value: 1,
            reason: "good fact",
        });
        expect(errors).toEqual([]);
    });

    it("does not record a vote when fetch returns not-ok", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            json: async () => ({}),
        });

        const tasks = [{ user: mockUser, fact: mockFact, value: -1 as const, reason: "wrong" }];
        const { votes, errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(votes).toHaveLength(0);
    });

    it("does not record a vote when fetch throws a network error", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

        const tasks = [{ user: mockUser, fact: mockFact, value: 1 as const, reason: "" }];
        const { votes, errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(votes).toHaveLength(0);
    });

    it("includes an error string when a task has errorLabel and fetch fails", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            json: async () => ({}),
        });

        const tasks = [{ user: mockUser, fact: mockFact, value: 1 as const, reason: "", errorLabel: "upvote" }];
        const { errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain("alice");
        expect(errors[0]).toContain("upvote");
    });

    it("does not emit an error string when errorLabel is absent and fetch fails", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            json: async () => ({}),
        });

        const tasks = [{ user: mockUser, fact: mockFact, value: 1 as const, reason: "" }];
        const { errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(errors).toEqual([]);
    });

    it("handles multiple tasks and returns one vote per successful task", async () => {
        (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            json: async () => ({ upvoteCount: 1, downvoteCount: 0 }),
        });

        const secondUser = { ...mockUser, username: "bob", email: "bob@test.com", token: "token-bob" };
        const tasks = [
            { user: mockUser, fact: mockFact, value: 1 as const, reason: "good" },
            { user: secondUser, fact: mockFact, value: -1 as const, reason: "bad" },
        ];
        const { votes, errors } = await castVotesBatch("http://localhost:3000", tasks);

        expect(votes).toHaveLength(2);
        expect(errors).toEqual([]);
    });
});
