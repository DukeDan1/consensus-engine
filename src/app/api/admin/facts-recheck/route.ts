/**
 * Daily Fact Reassessment Endpoint
 *
 * POST /api/admin/facts-recheck
 *
 * Intended to be called by a cron job (e.g. daily). Requires admin auth.
 * Only processes facts that have changed since their last check:
 * - At least 10 new votes (upvotes + downvotes), OR
 * - At least 1 new rationale comment (vote with a reason)
 *
 * Controlled by the FACT_RECHECK_ENABLED feature flag environment variable.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbConnect } from "@/app/lib/mongoose";
import { getAuthSession } from "@/app/services/authSessionService";
import Fact from "@/app/models/facts";
import FactVote from "@/app/models/factVote";
import User from "@/app/models/user";
import { reassessFact, factNeedsReassessmentWithComments } from "@/app/services/factReassessmentService";

const FACT_RECHECK_ENABLED =
    (process.env.FACT_RECHECK_ENABLED ?? "false").toLowerCase() === "true";

export async function POST(req: NextRequest) {
    await dbConnect();

    // Check feature flag
    if (!FACT_RECHECK_ENABLED) {
        return NextResponse.json({
            error: "Fact recheck is disabled. Set FACT_RECHECK_ENABLED=true to enable.",
        }, { status: 403 });
    }

    // Require admin auth
    const authSession = await getAuthSession(req);
    if (!authSession?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await User.findOne({ email: authSession.email }).select({ isAdmin: 1 }).lean();
    if (!user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        // Get all active facts (including those without status field for backward compatibility)
        const facts = await Fact.find({
            $or: [{ status: "active" }, { status: { $exists: false } }]
        }).exec();

        const results: Array<{
            factId: string;
            action: string;
            skipped: boolean;
            error?: string;
        }> = [];

        for (const fact of facts) {
            try {
                // Count current vote reasons for this fact
                const currentCommentCount = await FactVote.countDocuments({
                    fact: fact._id,
                    reason: { $exists: true, $ne: "" },
                }).exec();

                // Check if this fact needs reassessment
                if (!factNeedsReassessmentWithComments(fact, currentCommentCount)) {
                    results.push({
                        factId: fact._id.toString(),
                        action: "skipped",
                        skipped: true,
                    });
                    continue;
                }

                const result = await reassessFact(fact, "system");
                results.push({
                    factId: fact._id.toString(),
                    action: result.action,
                    skipped: false,
                });
            } catch (err: any) {
                console.error(`Failed to reassess fact ${fact._id}`, err);
                results.push({
                    factId: fact._id.toString(),
                    action: "error",
                    skipped: false,
                    error: err?.message ?? "Unknown error",
                });
            }
        }

        const processed = results.filter((r) => !r.skipped);
        return NextResponse.json({
            total: facts.length,
            processed: processed.length,
            skipped: results.filter((r) => r.skipped).length,
            results,
        });
    } catch (err: any) {
        console.error("Fact recheck error", err);
        return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
}
