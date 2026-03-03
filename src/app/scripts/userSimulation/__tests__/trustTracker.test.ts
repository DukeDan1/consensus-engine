/**
 * trustTracker.test.ts
 *
 * Unit tests for the pure functions in trustTracker.ts:
 *   - computeDeltas
 *   - computeDeltaStats
 *   - buildTrustReport
 *
 * The DB-dependent functions (snapshotTrust, resetTrustForUsers,
 * resetAllTrust, getUserIdsByEmails) are mocked so no real database
 * connection is needed.
 */

import { vi, describe, it, expect } from "vitest";

vi.mock("../../lib/mongoose", () => ({ dbConnect: vi.fn() }));
vi.mock("../../models/user", () => ({
    default: {
        find: vi.fn(),
        updateMany: vi.fn(),
    },
}));

import {
    computeDeltas,
    computeDeltaStats,
    buildTrustReport,
    type TrustSnapshot,
    type TrustDelta,
} from "../trustTracker";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<TrustSnapshot> = {}): TrustSnapshot {
    return {
        userId: "user-1",
        username: "alice",
        trustScore: 50,
        trustTier: "new",
        trustEventsCount: 0,
        ...overrides,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// computeDeltas()
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDeltas", () => {
    it("returns an empty array for empty inputs", () => {
        expect(computeDeltas([], [])).toEqual([]);
    });

    it("returns an empty array when after is empty", () => {
        expect(computeDeltas([makeSnapshot()], [])).toEqual([]);
    });

    it("computes a positive delta when trust increased", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 55 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.delta).toBe(5);
        expect(delta.scoreBefore).toBe(50);
        expect(delta.scoreAfter).toBe(55);
    });

    it("computes a negative delta when trust decreased", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 60 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 45 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.delta).toBe(-15);
    });

    it("computes zero delta when trust is unchanged", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.delta).toBe(0);
    });

    it("rounds delta to 2 decimal places", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 50.123456 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.delta).toBe(0.12);
    });

    it("uses baseline score of 50 when user is not found in before snapshot", () => {
        const after = [makeSnapshot({ userId: "new-user", trustScore: 60 })];
        const [delta] = computeDeltas([], after);
        expect(delta.scoreBefore).toBe(50);
        expect(delta.delta).toBe(10);
    });

    it("uses baseline tier of 'new' when user is not found in before snapshot", () => {
        const after = [makeSnapshot({ userId: "new-user", trustTier: "verified" })];
        const [delta] = computeDeltas([], after);
        expect(delta.tierBefore).toBe("new");
    });

    it("computes newEventsCount as the difference in event counts", () => {
        const before = [makeSnapshot({ userId: "u1", trustEventsCount: 3 })];
        const after  = [makeSnapshot({ userId: "u1", trustEventsCount: 7 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.newEventsCount).toBe(4);
    });

    it("preserves tier information correctly", () => {
        const before = [makeSnapshot({ userId: "u1", trustTier: "new" })];
        const after  = [makeSnapshot({ userId: "u1", trustTier: "trusted" })];
        const [delta] = computeDeltas(before, after);
        expect(delta.tierBefore).toBe("new");
        expect(delta.tierAfter).toBe("trusted");
    });

    it("handles multiple users independently", () => {
        const before = [
            makeSnapshot({ userId: "u1", trustScore: 40, username: "alice" }),
            makeSnapshot({ userId: "u2", trustScore: 60, username: "bob" }),
        ];
        const after = [
            makeSnapshot({ userId: "u1", trustScore: 50, username: "alice" }),
            makeSnapshot({ userId: "u2", trustScore: 55, username: "bob" }),
        ];
        const deltas = computeDeltas(before, after);
        expect(deltas).toHaveLength(2);
        const alice = deltas.find((d) => d.username === "alice")!;
        const bob   = deltas.find((d) => d.username === "bob")!;
        expect(alice.delta).toBe(10);
        expect(bob.delta).toBe(-5);
    });

    it("preserves userId and username in output", () => {
        const before = [makeSnapshot({ userId: "u42", username: "charlie", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u42", username: "charlie", trustScore: 55 })];
        const [delta] = computeDeltas(before, after);
        expect(delta.userId).toBe("u42");
        expect(delta.username).toBe("charlie");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeDeltaStats()
// ─────────────────────────────────────────────────────────────────────────────

describe("computeDeltaStats", () => {
    it("returns all-zero stats for an empty delta list", () => {
        const stats = computeDeltaStats([]);
        expect(stats).toEqual({
            avgDelta: 0,
            maxPositiveDelta: 0,
            maxNegativeDelta: 0,
            usersImproved: 0,
            usersDegraded: 0,
            usersUnchanged: 0,
        });
    });

    it("classifies a positive delta as improved", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 50, scoreAfter: 60, delta: 10, tierBefore: "new", tierAfter: "new", newEventsCount: 1 },
        ];
        const stats = computeDeltaStats(deltas);
        expect(stats.usersImproved).toBe(1);
        expect(stats.usersDegraded).toBe(0);
        expect(stats.usersUnchanged).toBe(0);
        expect(stats.avgDelta).toBe(10);
        expect(stats.maxPositiveDelta).toBe(10);
        expect(stats.maxNegativeDelta).toBe(0);
    });

    it("classifies a negative delta as degraded", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 60, scoreAfter: 45, delta: -15, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        const stats = computeDeltaStats(deltas);
        expect(stats.usersDegraded).toBe(1);
        expect(stats.usersImproved).toBe(0);
        expect(stats.usersUnchanged).toBe(0);
        expect(stats.maxNegativeDelta).toBe(-15);
    });

    it("classifies a zero delta as unchanged", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 50, scoreAfter: 50, delta: 0, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        const stats = computeDeltaStats(deltas);
        expect(stats.usersUnchanged).toBe(1);
        expect(stats.usersImproved).toBe(0);
        expect(stats.usersDegraded).toBe(0);
    });

    it("correctly computes average delta across mixed deltas", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 50, scoreAfter: 60, delta: 10, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u2", username: "b", scoreBefore: 60, scoreAfter: 50, delta: -10, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u3", username: "c", scoreBefore: 50, scoreAfter: 55, delta: 5, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        const stats = computeDeltaStats(deltas);
        // avg = (10 + -10 + 5) / 3 = 1.67
        expect(stats.avgDelta).toBe(1.67);
        expect(stats.usersImproved).toBe(2);
        expect(stats.usersDegraded).toBe(1);
        expect(stats.usersUnchanged).toBe(0);
    });

    it("rounds avgDelta to 2 decimal places", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 0, scoreAfter: 1, delta: 1, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u2", username: "b", scoreBefore: 0, scoreAfter: 1, delta: 1, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u3", username: "c", scoreBefore: 0, scoreAfter: 1, delta: 1, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        // avg = 1.000 — exact, just checking it doesn't become a float string artifact
        expect(computeDeltaStats(deltas).avgDelta).toBe(1);
    });

    it("tracks maxPositiveDelta across multiple users", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 50, scoreAfter: 55, delta: 5,  tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u2", username: "b", scoreBefore: 50, scoreAfter: 75, delta: 25, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u3", username: "c", scoreBefore: 50, scoreAfter: 60, delta: 10, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        expect(computeDeltaStats(deltas).maxPositiveDelta).toBe(25);
    });

    it("tracks maxNegativeDelta across multiple users", () => {
        const deltas: TrustDelta[] = [
            { userId: "u1", username: "a", scoreBefore: 50, scoreAfter: 45, delta: -5,  tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u2", username: "b", scoreBefore: 50, scoreAfter: 20, delta: -30, tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
            { userId: "u3", username: "c", scoreBefore: 50, scoreAfter: 48, delta: -2,  tierBefore: "new", tierAfter: "new", newEventsCount: 0 },
        ];
        expect(computeDeltaStats(deltas).maxNegativeDelta).toBe(-30);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildTrustReport()
// ─────────────────────────────────────────────────────────────────────────────

describe("buildTrustReport", () => {
    it("sets scenarioId correctly", () => {
        const report = buildTrustReport("scenario_2_control", [], []);
        expect(report.scenarioId).toBe("scenario_2_control");
    });

    it("stores the before and after snapshots verbatim", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 60 })];
        const report = buildTrustReport("s1", before, after);
        expect(report.snapshotBefore).toBe(before);
        expect(report.snapshotAfter).toBe(after);
    });

    it("computes deltas from before and after snapshots", () => {
        const before = [makeSnapshot({ userId: "u1", trustScore: 50 })];
        const after  = [makeSnapshot({ userId: "u1", trustScore: 65 })];
        const report = buildTrustReport("s1", before, after);
        expect(report.deltas).toHaveLength(1);
        expect(report.deltas[0].delta).toBe(15);
    });

    it("computes stats from deltas", () => {
        const before = [
            makeSnapshot({ userId: "u1", trustScore: 50 }),
            makeSnapshot({ userId: "u2", trustScore: 50, username: "bob" }),
        ];
        const after = [
            makeSnapshot({ userId: "u1", trustScore: 55 }),
            makeSnapshot({ userId: "u2", trustScore: 45, username: "bob" }),
        ];
        const report = buildTrustReport("s1", before, after);
        expect(report.stats.usersImproved).toBe(1);
        expect(report.stats.usersDegraded).toBe(1);
        expect(report.stats.avgDelta).toBe(0);
    });

    it("returns zeroed stats when before and after are both empty", () => {
        const report = buildTrustReport("s1", [], []);
        expect(report.stats.avgDelta).toBe(0);
        expect(report.stats.usersImproved).toBe(0);
        expect(report.deltas).toHaveLength(0);
    });

    it("handles user in after but not in before (new user)", () => {
        const after = [makeSnapshot({ userId: "new-u", trustScore: 70 })];
        const report = buildTrustReport("s1", [], after);
        expect(report.deltas[0].scoreBefore).toBe(50); // baseline
        expect(report.deltas[0].delta).toBe(20);
    });
});
