import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIAnalysisForArgument(argumentText: string) {
    const response = await openai.responses.create({
        prompt: {
            "id": "pmpt_68f0c016b1448190a6d11717cdd84e7c0142635054d01cbe",
            "version": "5"
        },
        input: [
            { 
                role: "user", 
                content: argumentText 
            }
        ],
        store: true,
        include: []
    });

    const functionCallItem = response.output.find(item => item.type == "function_call");
    if (!functionCallItem) {
        throw new Error('Failed to get AI analysis for argument');
    }
    const answer = JSON.parse(functionCallItem.arguments);

    return {
        isFact: answer.isFact,
        isOpinion: answer.isOpinion,
        justification: answer.justification
    };
}

export async function extractFactualInformationFromComment(argumentText: string) {
    const response = await openai.responses.create({
        prompt: {
            "id": "pmpt_691321c60ba88194bf7aa1ce08718dfe0e634e3c9603cfdc",
            "version": "2"
        },
        input: [
            { 
                role: "user", 
                content: argumentText 
            }
        ],
        store: true,
        include: []
    });

    const functionCallItem = response.output.find(item => item.type == "function_call");
    if (!functionCallItem) {
        throw new Error('Failed to extract factual information from comment');
    }
    const answer = JSON.parse(functionCallItem.arguments);

    return {
        factualPart: answer.factualPart,
        justification: answer.justification
    }
}