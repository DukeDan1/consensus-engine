import OpenAI from "openai";
import { ArgumentSide } from "@/app/models/argument";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type AIAnalysisResult = {
    isFact: boolean;
    factualPart: string;
    side: ArgumentSide;
    aiSummary: string;
    justification: string;
};

export async function getAIAnalysisForArgument(argumentText: string, topicName: String): Promise<AIAnalysisResult> {
    const response = await openai.responses.create({
        input: [
            {
                role: "developer",
                content: `The argument is made in the context of the topic: "${topicName}".`
            },
            {
                role: "user",
                content: argumentText 
            }
        ],
        model: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.1",
        reasoning: {
            effort: "low"
        },
        tool_choice: {
            type: "function",
            name: "analyse_argument"
        },
        store: true,
        tools: [
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
                            description: "The factual part of the argument, if applicable. Empty string if not applicable. Reword the argument to be purely factual."
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
                            description: "The reasoning behind the determinations made."
                        }
                    },
                    required: ["isFact", "side", "aiSummary", "factualPart", "justification"]
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
