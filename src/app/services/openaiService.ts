import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getAIAnalysisForArgument(argumentText: string) {
    const response = await openai.responses.create({
        prompt: {
            "id": "pmpt_68f0c016b1448190a6d11717cdd84e7c0142635054d01cbe",
            "version": "4"
        },
        input: [
            { 
                role: "user", 
                content: argumentText 
            }
        ],
        reasoning: {
            "summary": "auto"
        },
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
