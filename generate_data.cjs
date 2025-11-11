require("dotenv").config();
const { OpenAI } = require("openai");
const openai = new OpenAI();
const populationData = require("./population_data.json");
const fs = require("fs");

const dataTool = {
    type: "function",
    name: "generate_topic_data",
    description: "Generate a debate topic about a random subject, with arguments for and against. Some arguments may have user comments.",
    parameters: {
        type: "object",
        properties: {
            topicData: {
                type: "object",
                description: "The generated data for the debate topic, including arguments and user comments.",
                properties: {
                    arguments: {
                        type: "array",
                        description: "List of arguments for and against the topic. Generate at least 10 arguments, with a mix of 'for' and 'against' sides.",
                        items: {
                            type: "object",
                            properties: {
                                side: { type: "string", description: "Either 'for' or 'against'." },
                                body: { type: "string", description: "The content of the argument." },
                                aiAnalysis: {
                                    type: "object",
                                    properties: {
                                        isFact: { type: "boolean", description: "Whether the argument is a fact." },
                                        isOpinion: { type: "boolean", description: "Whether the argument is an opinion." },
                                        justification: { type: "string", description: "Justification for the AI's analysis." },
                                    },
                                },
                                factualExtraction: {
                                    type: "object",
                                    properties: {
                                        factualPart: { type: "string", description: "Any parts of the argument that are factual. You can rephrase them or use information from different parts of the argument if needed." },
                                        justification: { type: "string", description: "Justification for the factual extraction." },
                                    },
                                },
                                comments: {
                                    type: "array",
                                    description: "List of user comments on the argument.",
                                    items: {
                                        type: "object",
                                        properties: {
                                            body: { type: "string", description: "The content of the comment." }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        },
    },
};

// Generates topic name without data
const topicTool = {
    type: "function",
    name: "generate_topic_data",
    description: "Generate a debate topic about a random subject.",
    parameters: {
        type: "object",
        properties: {
            topicName: {
                type: "string",
                description: "The name of the debate topic to generate data for.",
            },
        },
    },
};

const generate_topic_name = async () => {
    const input = [
        { role: "developer", content: "You are an AI assistant that can generate debate topic names. Use the generate_topic_data tool to generate a random debate topic name. The topic will be debated by people with diverse opinions. An example topic name might be 'Should we implement a universal basic income?'." },
        { role: "user", content: "Generate a debate topic name." }
    ];
    let response = await openai.responses.create({
        model: "gpt-4.1",
        tools: [topicTool],
        input,
    });

    for (const item of response.output) {
        if (item.type === "function_call") {
            const data = JSON.parse(item.arguments);
            return data.topicName;
        }
    }
    return null;
};

const generate_topic = async () => {
    let isDuplicate = true;
    let topicName = "";
    let topicNameKey = "";
    while (isDuplicate) {
        topicName = await generate_topic_name();
        topicNameKey = topicName.toLowerCase().replace(/\s+/g, "_");
        if (topicNameKey === "" || populationData.topics.find((t) => t.key === topicNameKey)) {
            console.log(`Skipping duplicate or empty topic name: "${topicName}"`);
        } else {
            isDuplicate = false;
        }
    }

    const input = [
        { role: "developer", content: "You are an AI assistant that can generate debate topic data. Use the generate_topic_data tool to generate data about a random subject." },
        { role: "user", content: `Generate debate topic data for the topic: "${topicName}". Include at least 10 arguments with a mix of 'for' and 'against' sides. Some arguments should have user comments.` }
    ];

    let response = await openai.responses.create({
        model: "gpt-5",
        tools: [dataTool],
        input,
    });

    response.output.forEach((item) => {
        if (item.type === "function_call") {
            const data = JSON.parse(item.arguments);
            const topicData = data.topicData;
            console.log(`Generated data for topic: ${topicName}`);
            // Append to population data
            populationData.topics.push({
                key: topicNameKey,
                title: topicName,
                description: `A debate about ${topicName}.`,
                createdByKey: populationData.users[Math.floor(Math.random() * populationData.users.length)].key,
                tags: ["generated", "ai"],
                arguments: topicData.arguments.map((arg) => ({
                    side: arg.side,
                    body: arg.body,
                    createdByKey: populationData.users[Math.floor(Math.random() * populationData.users.length)].key,
                    aiAnalysis: arg.aiAnalysis,
                    comments: arg.comments.map((c) => ({
                        body: c.body,
                        createdByKey: populationData.users[Math.floor(Math.random() * populationData.users.length)].key,
                    }))
                })),
                facts: topicData.arguments
                    .filter((arg) => arg.factualExtraction && arg.factualExtraction.factualPart && arg.factualExtraction.factualPart.trim() !== "")
                    .map((arg) => ({
                        text: arg.factualExtraction.factualPart,
                        sourceArgumentBody: arg.body,
                        aiJustification: arg.factualExtraction.justification || "",
                    })),
            });
        }
    });
};

const NUMBER_OF_TOPICS_TO_GENERATE = 5;

(async () => {
    await Promise.all(Array.from({ length: NUMBER_OF_TOPICS_TO_GENERATE }).map(() => generate_topic()));
    fs.writeFileSync("./population_data.json", JSON.stringify(populationData, null, 2) );
})();
