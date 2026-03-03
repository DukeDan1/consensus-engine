/**
 * trustTracker.ts
 *
 * Provides direct-DB utilities for:
 *  - Snapshotting user trust scores before a scenario
 *  - Computing trust deltas after a scenario
 *  - Resetting trust to baseline between scenarios
 *
 * Uses Mongoose directly (no REST API exists for trust reads/resets).
 */

import { dbConnect } from "../../lib/mongoose";
import User from "../../models/user";

// ────────────────────────── Types ──────────────────────────

export type TrustSnapshot = {
    userId: string;
    username: string;
    trustScore: number;
    trustTier: string;
    trustEventsCount: number;
};

export type TrustDelta = {
    userId: string;
    username: string;
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    tierBefore: string;
    tierAfter: string;
    newEventsCount: number;
};

export type TrustReport = {
    scenarioId: string;
    snapshotBefore: TrustSnapshot[];
    snapshotAfter: TrustSnapshot[];
    deltas: TrustDelta[];
    stats: {
        avgDelta: number;
        maxPositiveDelta: number;
        maxNegativeDelta: number;
        usersImproved: number;
        usersDegraded: number;
        usersUnchanged: number;
    };
};

// ────────────────────────── Constants ──────────────────────────

const TRUST_BASELINE = 50;
const TRUST_DEFAULT_TIER = "new";

// ────────────────────────── Operations ──────────────────────────

/**
 * Take a snapshot of trust scores for a list of user IDs.
 * Returns one TrustSnapshot per found user.
 */
export async function snapshotTrust(userIds: string[]): Promise<TrustSnapshot[]> {
    await dbConnect();

    const users = await User.find(
        { _id: { $in: userIds } },
        { _id: 1, username: 1, trustScore: 1, trustTier: 1, trustEvents: 1 },
    ).lean().exec();

    return users.map((u: any) => ({
        userId: u._id.toString(),
        username: u.username ?? "unknown",
        trustScore: typeof u.trustScore === "number" ? u.trustScore : TRUST_BASELINE,
        trustTier: u.trustTier ?? TRUST_DEFAULT_TIER,
        trustEventsCount: Array.isArray(u.trustEvents) ? u.trustEvents.length : 0,
    }));
}

/**
 * Compute deltas between two snapshots (before vs after).
 */
export function computeDeltas(
    before: TrustSnapshot[],
    after: TrustSnapshot[],
): TrustDelta[] {
    const beforeMap = new Map(before.map((s) => [s.userId, s]));

    return after.map((afterSnap) => {
        const beforeSnap = beforeMap.get(afterSnap.userId);
        const scoreBefore = beforeSnap?.trustScore ?? TRUST_BASELINE;
        const tierBefore = beforeSnap?.trustTier ?? TRUST_DEFAULT_TIER;
        const eventsBefore = beforeSnap?.trustEventsCount ?? 0;

        return {
            userId: afterSnap.userId,
            username: afterSnap.username,
            scoreBefore,
            scoreAfter: afterSnap.trustScore,
            delta: Math.round((afterSnap.trustScore - scoreBefore) * 100) / 100,
            tierBefore,
            tierAfter: afterSnap.trustTier,
            newEventsCount: afterSnap.trustEventsCount - eventsBefore,
        };
    });
}

/**
 * Compute aggregate stats from a list of deltas.
 */
export function computeDeltaStats(deltas: TrustDelta[]): TrustReport["stats"] {
    if (deltas.length === 0) {
        return {
            avgDelta: 0,
            maxPositiveDelta: 0,
            maxNegativeDelta: 0,
            usersImproved: 0,
            usersDegraded: 0,
            usersUnchanged: 0,
        };
    }

    let sumDelta = 0;
    let maxPos = 0;
    let maxNeg = 0;
    let improved = 0;
    let degraded = 0;
    let unchanged = 0;

    for (const d of deltas) {
        sumDelta += d.delta;
        if (d.delta > 0) {
            improved++;
            if (d.delta > maxPos) maxPos = d.delta;
        } else if (d.delta < 0) {
            degraded++;
            if (d.delta < maxNeg) maxNeg = d.delta;
        } else {
            unchanged++;
        }
    }

    return {
        avgDelta: Math.round((sumDelta / deltas.length) * 100) / 100,
        maxPositiveDelta: maxPos,
        maxNegativeDelta: maxNeg,
        usersImproved: improved,
        usersDegraded: degraded,
        usersUnchanged: unchanged,
    };
}

/**
 * Build a full TrustReport for a scenario.
 */
export function buildTrustReport(
    scenarioId: string,
    before: TrustSnapshot[],
    after: TrustSnapshot[],
): TrustReport {
    const deltas = computeDeltas(before, after);
    const stats = computeDeltaStats(deltas);
    return { scenarioId, snapshotBefore: before, snapshotAfter: after, deltas, stats };
}

/**
 * Reset ALL users' trust to baseline.
 * Called between scenarios to ensure each starts from a clean slate.
 *
 * Resets:
 *  - trustScore → 50
 *  - trustTier → "new"
 *  - trustEvents → []
 *  - trustUpdatedAt → null
 */
export async function resetAllTrust(): Promise<number> {
    await dbConnect();

    const result = await User.updateMany(
        {},
        {
            $set: {
                trustScore: TRUST_BASELINE,
                trustTier: TRUST_DEFAULT_TIER,
                trustEvents: [],
                trustUpdatedAt: null,
            },
        },
    ).exec();

    return result.modifiedCount ?? 0;
}

/**
 * Reset trust only for specific user IDs.
 */
export async function resetTrustForUsers(userIds: string[]): Promise<number> {
    await dbConnect();

    const result = await User.updateMany(
        { _id: { $in: userIds } },
        {
            $set: {
                trustScore: TRUST_BASELINE,
                trustTier: TRUST_DEFAULT_TIER,
                trustEvents: [],
                trustUpdatedAt: null,
            },
        },
    ).exec();

    return result.modifiedCount ?? 0;
}

/**
 * Fetch user IDs for an array of emails (used to find simulation users in the DB).
 */
export async function getUserIdsByEmails(emails: string[]): Promise<Map<string, string>> {
    await dbConnect();

    const users = await User.find(
        { email: { $in: emails } },
        { _id: 1, email: 1 },
    ).lean().exec();

    const map = new Map<string, string>();
    for (const u of users as any[]) {
        map.set(u.email, u._id.toString());
    }
    return map;
}
