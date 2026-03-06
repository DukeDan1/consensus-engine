import { ArgumentSide } from "@/app/models/argument";
import { routeResponsesClient } from "@/app/services/aiRoutingService";

export type AIAnalysisResult = {
    isFact: boolean;
    factualPart: string;
    side: ArgumentSide;
    aiSummary: string;
    justification: string;
};

export async function getAIAnalysisForArgument(argumentText: string, topicName: String, userId?: string): Promise<AIAnalysisResult> {
    const routed = await routeResponsesClient({
        text: argumentText,
        openAiModel: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.4",
        grokModel: process.env.GROK_RESPONSES_MODEL,
        userId,
        ignoreEnvironmentDefaults: false,
    });
    if (!routed) {
        throw new Error("OpenAI client not configured");
    }
    const response = await routed.client.responses.create({
        input: [
            {
                role: "developer",
                content:
                    `The argument is made in the context of the topic: "${topicName}".` +
                    " If the argument appears factual or makes specific verifiable claims, use the web search tool to verify." +
                    " Only mark something as factual when it can be supported by reliable sources. Always use the `analyse_argument` function to analyse the argument, whether or not you choose to use web search."
            },
            {
                role: "user",
                content: argumentText 
            }
        ],
        model: routed.model,
        safety_identifier: userId ? String(userId) : "system",
        ...(routed.provider === "grok" ? {} : { reasoning: { effort: "low" } }),
        tool_choice: "required",
        ...(routed.provider !== "openrouter" ? { store: true } : {}),
        tools: [
            { type: "web_search" },
            {
                type: "function",
                name: "analyse_argument",
                description: "Analyse the argument to determine if it is factual, what side it supports and provide a summarised version if the comment contains unncessary detail or verbiage. If the argument does not contain excessive detail, return the original argument as the summary. If the argument is factual but contains opinions in addition to facts, separate out the factual part and return that as well.",
                parameters: {
                    type: "object",
                    properties: {
                        isFact: {
                            type: "boolean",
                            description: "Whether the argument is primarily factual in nature."
                        },
                        factualPart: {
                            type: "string",
                            description: "The factual part of the argument, if applicable. Empty string if not applicable. Reword the argument to be purely factual. If there are no facts in the argument, return an empty string."
                        },
                        side: {
                            type: "string",
                            description: "The side the argument supports: 'for', 'against' or 'neutral'.",
                            enum: ["for", "against", "neutral"]
                        },
                        aiSummary: {
                            type: "string",
                            description: "A concise summary of the argument, removing any unnecessary detail or verbiage. Return the original argument if no summarisation is needed."
                        },
                        justification: {
                            type: "string",
                            description: "The reasoning behind the determinations made. This is user-facing and should be clear, concise and not technical."
                        }
                    },
                    required: ["isFact", "side", "aiSummary", "factualPart", "justification"],
                    additionalProperties: false,
                },
                strict: true
            }
        ],
    });

    const functionCallItem = response.output.find(item => item.type == "function_call");
    if (!functionCallItem) {
        throw new Error('Failed to get AI analysis for argument');
    }

    const answer = JSON.parse(functionCallItem.arguments) as AIAnalysisResult;
    return answer;
}
