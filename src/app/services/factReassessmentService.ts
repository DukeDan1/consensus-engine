/**
 * Fact Reassessment Service
 *
 * Provides AI-powered reassessment of facts based on user votes, comments,
 * and external evidence. Can be triggered manually by moderators or
 * automatically by the periodic daily check.
 */
import { IFact, IFactReassessment } from "@/app/models/facts";
import FactVote from "@/app/models/factVote";
import Topic from "@/app/models/topic";
import { executeWithFallback } from "@/app/services/aiRoutingService";

export type ReassessmentAction = "kept" | "updated" | "removed";

/**
 * Strips OpenAI web-search citation markers like 【cite】turn0search1】
 * and 【turn5search2】turn5search1】turn5news11】turn5search4】
 */
function stripCitations(text: string): string {
    // Remove patterns like 【...】 (full-width brackets used by Responses API web search)
    return text.replace(/[\u3010\u3011][^\u3010\u3011]*[\u3010\u3011]?/g, "").replace(/\s{2,}/g, " ").trim();
}

export type ReassessmentResult = {
    action: ReassessmentAction;
    updatedText?: string;
    rationale: string;
    model?: string;
};

type AIReassessmentResponse = {
    action: ReassessmentAction;
    updatedText: string;
    rationale: string;
};

/**
 * Gathers vote reasons (comments) for a fact.
 */
async function getVoteReasons(factId: string): Promise<Array<{ value: number; reason: string }>> {
    const votes = await FactVote.find({
        fact: factId,
        reason: { $exists: true, $ne: "" },
    })
        .select({ value: 1, reason: 1 })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    return votes.map((v: any) => ({
        value: v.value as number,
        reason: v.reason as string,
    }));
}

/**
 * Calls the AI to reassess a fact based on current votes and user feedback.
 */
async function callAIReassessment(params: {
    factText: string;
    topicText?: string;
    upvoteCount: number;
    downvoteCount: number;
    voteReasons: Array<{ value: number; reason: string }>;
}): Promise<ReassessmentResult> {
    const { factText, topicText, upvoteCount, downvoteCount, voteReasons } = params;

    const upvoteReasons = voteReasons
        .filter((v) => v.value === 1)
        .map((v) => v.reason);
    const downvoteReasons = voteReasons
        .filter((v) => v.value === -1)
        .map((v) => v.reason);

    const contextSummary = [
        `Fact: "${factText}"`,
        topicText ? `Topic: "${topicText}"` : undefined,

        `Upvotes: ${upvoteCount}, Downvotes: ${downvoteCount}`,
        upvoteReasons.length > 0
            ? `Reasons for upvoting:\n${upvoteReasons.map((r) => `- ${r}`).join("\n")}`
            : "No reasons given for upvotes.",
        downvoteReasons.length > 0
            ? `Reasons for downvoting:\n${downvoteReasons.map((r) => `- ${r}`).join("\n")}`
            : "No reasons given for downvotes.",
    ].join("\n\n");

    const result = await executeWithFallback(
        {
            text: contextSummary,
            openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.5",
            grokModel: process.env.GROK_RESPONSES_MODEL || "grok-4.3",
            ignoreEnvironmentDefaults: false,
        },
        async (routed) => {
            const response = await routed.client.responses.create({
                input: [
                    {
                        role: "developer",
                        content:
                            "You are a fact-checking assistant for a consensus-building platform. " +
                            "You are given a fact that was extracted from discussion, along with user votes and their reasons. " +
                            "Use the web search tool to verify the fact against current reliable sources. " +
                            "Based on the votes, user feedback, and your own research, decide whether to: " +
                            "1) Keep the fact as-is (action: 'kept'), " +
                            "2) Update the fact text to be more accurate (action: 'updated'), or " +
                            "3) Remove the fact if it is inaccurate, irrelevant or misleading (action: 'removed'). " +
                            "Provide a clear rationale that references both user feedback and external evidence. " +
                            "The rationale is shown to users, so be clear and fair. " +
                            "All text you provide MUST be plain text only — no markdown, no bold, no bullet points, no headers, no special formatting. " +
                            "Do not include any citation markers or source references in your output. " +
                            "If the fact is not relevant to the topic, it should be removed. " +
                            "Always use the `reassess_fact` function to respond.",
                    },
                    {
                        role: "user",
                        content: contextSummary,
                    },
                ],
                model: routed.model,
                safety_identifier: "system-fact-reassessment",
                ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
                tool_choice: "required",
                ...(routed.provider !== "openrouter" ? { store: true } : {}),
                tools: [
                    { type: "web_search" },
                    {
                        type: "function",
                        name: "reassess_fact",
                        description:
                            "Submit the reassessment decision for the fact. " +
                            "Choose 'kept' to leave unchanged, 'updated' to revise the text, or 'removed' to flag as inaccurate.",
                        parameters: {
                            type: "object",
                            properties: {
                                action: {
                                    type: "string",
                                    enum: ["kept", "updated", "removed"],
                                    description: "The reassessment action.",
                                },
                                updatedText: {
                                    type: "string",
                                    description:
                                        "The corrected/updated fact text. Required if action is 'updated'. " +
                                        "For 'kept' or 'removed', return the original text.",
                                },
                                rationale: {
                                    type: "string",
                                    description:
                                        "A clear explanation of why this action was taken, referencing user feedback and external evidence. " +
                                        "This is shown to users.",
                                },
                            },
                            required: ["action", "updatedText", "rationale"],
                            additionalProperties: false,
                        },
                        strict: true,
                    },
                ],
            });

            const functionCallItem = response.output.find(
                (item: any) => item.type === "function_call"
            );
            if (!functionCallItem) {
                throw new Error("Failed to get AI reassessment for fact");
            }

            const answer = JSON.parse(
                (functionCallItem as any).arguments
            ) as AIReassessmentResponse;

            return {
                action: answer.action,
                updatedText: answer.action === "updated" ? stripCitations(answer.updatedText) : undefined,
                rationale: stripCitations(answer.rationale),
                model: routed.model,
            } as ReassessmentResult;
        }
    );

    return result;
}

/**
 * Reassess a single fact. Updates the fact document in the database.
 *
 * @param fact - The Mongoose fact document (not lean)
 * @param triggeredBy - "system" for daily cron, "moderator" for manual trigger
 * @param triggeredByUserId - The user ID of the moderator (if manual)
 */
export async function reassessFact(
    fact: IFact,
    triggeredBy: "system" | "moderator",
    triggeredByUserId?: string
): Promise<ReassessmentResult> {
    const voteReasons = await getVoteReasons(fact._id.toString());

    // Fetch topic for better context
    let topicTitle: string | undefined;
    if (fact.topic) {
        const topic = await Topic.findById(fact.topic).select("title").lean();
        topicTitle = topic?.title;
    }

    const result = await callAIReassessment({
        factText: fact.text,
        upvoteCount: fact.upvoteCount ?? 0,
        downvoteCount: fact.downvoteCount ?? 0,
        voteReasons,
        topicText: topicTitle,
    });

    // Build reassessment history entry
    const historyEntry: any = {
        reassessedAt: new Date(),
        action: result.action,
        rationale: result.rationale,
        upvotesConsidered: fact.upvoteCount ?? 0,
        downvotesConsidered: fact.downvoteCount ?? 0,
        commentsConsidered: voteReasons.length,
        model: result.model,
        triggeredBy,
    };

    if (triggeredByUserId) {
        // Imported dynamically to avoid circular reference issues
        const mongoose = await import("mongoose");
        historyEntry.triggeredByUser = new mongoose.Types.ObjectId(triggeredByUserId);
    }

    if (result.action === "updated" && result.updatedText) {
        historyEntry.previousText = fact.text;
        fact.text = result.updatedText;
    }

    if (result.action === "removed") {
        historyEntry.previousText = fact.text;
        fact.status = "removed";
        fact.removedAt = new Date();
        fact.removalReason = `AI reassessment: ${result.rationale}`;
    }

    fact.reassessmentHistory.push(historyEntry);
    fact.lastCheckedAt = new Date();
    fact.lastCheckedUpvoteCount = fact.upvoteCount ?? 0;
    fact.lastCheckedDownvoteCount = fact.downvoteCount ?? 0;
    fact.lastCheckedCommentCount = voteReasons.length;

    await fact.save();

    return result;
}

/**
 * Determines whether a fact has changed enough since its last check
 * to warrant a reassessment based on vote deltas only.
 *
 * A fact needs reassessment if:
 * - At least 10 new votes (up + down) since last check
 *
 * Note: This function does not evaluate new rationale comments.
 * Use factNeedsReassessmentWithComments(...) when comment growth
 * should also trigger reassessment.
 */
export function factNeedsReassessment(fact: IFact): boolean {
    const currentTotalVotes = (fact.upvoteCount ?? 0) + (fact.downvoteCount ?? 0);
    const lastCheckedTotalVotes = (fact.lastCheckedUpvoteCount ?? 0) + (fact.lastCheckedDownvoteCount ?? 0);
    const newVotes = currentTotalVotes - lastCheckedTotalVotes;

    if (newVotes >= 10) return true;

    return false;
}

/**
 * Determines if a fact needs reassessment, including checking for new rationale comments.
 *
 * @param fact - The fact document
 * @param currentCommentCount - Current count of vote reasons for this fact
 */
export function factNeedsReassessmentWithComments(
    fact: IFact,
    currentCommentCount: number
): boolean {
    const currentTotalVotes = (fact.upvoteCount ?? 0) + (fact.downvoteCount ?? 0);
    const lastCheckedTotalVotes = (fact.lastCheckedUpvoteCount ?? 0) + (fact.lastCheckedDownvoteCount ?? 0);
    const newVotes = currentTotalVotes - lastCheckedTotalVotes;

    if (newVotes >= 10) return true;

    const lastCommentCount = fact.lastCheckedCommentCount ?? 0;
    if (currentCommentCount > lastCommentCount) return true;

    return false;
}
