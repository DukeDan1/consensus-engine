/**
 * Script to generate seed data for debate topics, arguments, comments, and ontology classifications.
 * Uses OpenAI's Responses API to create realistic debate data.
 * Saves the generated data to population_data.json.
 * 
 * Usage: npm run generate-data -- number_topics=5
 */
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import dotenv from "dotenv";
dotenv.config();
import { OpenAI } from "openai";
import { classifyTextToOntology, classificationToAssignments } from "../services/ontologyClassificationService";
import { Tool } from "openai/resources/responses/responses.js";


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type SeedOntologyCategory = {
  id: string;
  label: string;
  description?: string;
  confidence?: number;
  similarity?: number;
};

type SeedComment = {
  body: string;
  createdByKey: string;
  upvoteCount?: number;
  downvoteCount?: number;
  score?: number;
  ontologyCategories?: SeedOntologyCategory[];
  key?: string;
};

type SeedArgument = {
  key: string;
  side: "for" | "against" | "neutral";
  body: string;
  createdByKey: string;
  aiAnalysis?: {
    isFact?: boolean;
    justification?: string;
    aiSummary?: string;
  };
  upvoteCount?: number;
  downvoteCount?: number;
  score?: number;
  ontologyCategories?: SeedOntologyCategory[];
  comments?: SeedComment[];
};

type SeedFact = {
  text: string;
  aiJustification?: string;
  sourceArgumentKey: string;
  linkedArgumentKeys?: string[];
};

type SeedTopic = {
  key: string;
  title: string;
  description?: string;
  slug?: string;
  createdByKey: string;
  tags?: string[];
  ontologyCategories?: SeedOntologyCategory[];
  arguments: SeedArgument[];
  facts?: SeedFact[];
};

type SeedUser = {
  key: string;
  name?: string;
  email?: string;
};

type PopulationData = {
  users: SeedUser[];
  topics: SeedTopic[];
  ontologyEmbeddings?: any;
};

const dataTool = {
  type: "function",
  name: "generate_topic_data",
  description: "Generate a debate topic about a random subject, with arguments for and against. Some arguments may have user comments and summaries.",
  parameters: {
    type: "object",
    properties: {
      topicData: {
        type: "object",
        properties: {
          title: { type: "string", description: "Title of the topic." },
          description: { type: "string", description: "Short summary of the topic." },
          tags: { type: "array", items: { type: "string" } },
          arguments: {
            type: "array",
            description: "List of arguments representing perspectives on the topic. Generate 6-10 arguments across 'for', 'against', or 'neutral'.",
            items: {
              type: "object",
              properties: {
                side: { type: "string", enum: ["for", "against", "neutral"] },
                body: { type: "string" },
                aiSummary: { type: "string", description: "Concise AI-authored summary of the argument." },
                aiJustification: { type: "string", description: "Reason the summary captures the argument." },
                comments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      body: { type: "string" },
                      upvoteCount: { type: "integer" },
                      downvoteCount: { type: "integer" },
                    },
                    required: ["body", "upvoteCount", "downvoteCount"],
                    additionalProperties: false
                  },
                },
              },
              required: ["side", "body", "aiSummary", "aiJustification", "comments"],
              additionalProperties: false
            },
          },
          facts: {
            type: "array",
            description: "Facts extracted from arguments; reference arguments by index.",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                aiJustification: { type: "string" },
                sourceArgumentIndex: { type: "integer" },
                linkedArgumentIndexes: { type: "array", items: { type: "integer" } },
              },
              required: ["text", "sourceArgumentIndex", "linkedArgumentIndexes", "aiJustification"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "arguments", "facts", "description", "tags"],
        additionalProperties: false
      },
    },
    required: ["topicData"],
    additionalProperties: false,
  },
  strict: true,
} as Tool;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

async function classify(text: string): Promise<SeedOntologyCategory[]> {
  const results = await classifyTextToOntology(text, { topK: 8, minSimilarity: 0.2, confirmWithLLM: false });
  return classificationToAssignments(results, 5);
}

async function generateTopicNames(numberOfTopics: number): Promise<Array<string>> {
  const response = await openai.responses.create({
    model: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.1",
    reasoning: { effort: "none" },
    tools: [{
      type: "function",
      name: "generate_topic_names",
      description: "Generate unique debate topics about a subject. The topic will be debated by people with diverse opinions. It should be a realistic topic that people might actually debate.",
      parameters: {
        type: "object",
        properties: {
          topicNames: {
            type: "array",
            items: {
              type: "object",
              properties: {
                topicName: {
                  type: "string",
                  description: "The unique name of the debate topic. This should be posed as a question that invites debate.",
                },
              },
              required: ["topicName"],
              additionalProperties: false,
            },
          },
        },
        required: ["topicNames"],
        additionalProperties: false,
      },
      strict: true,
    }],
    input: [
      { role: "developer", content: "You are an AI assistant that can generate debate topic questions. Use the generate_topic_names tool to generate unique debate topic questions. The topic will be debated by people with diverse opinions. An example topic question might be 'Should we implement a universal basic income?'." },
      { role: "user", content: "Generate " + numberOfTopics + " debate topic questions." },
    ],
    tool_choice: {
      type: "function",
      name: "generate_topic_names",
    },
    store: true,
    temperature: 0.9,
    top_p: 0.9,
  });

  for (const item of response.output) {
    if (item.type === "function_call") {
      const data = JSON.parse(item.arguments);
      return data.topicNames?.map((t: any) => t.topicName) || [];
    }
  }
  return [];
}

async function generateTopic(users: SeedUser[], existingKeys: Set<string>, topicName: string): Promise<SeedTopic | null> {
  let topicKey = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    topicKey = topicName.toLowerCase().replace(/\s+/g, "_");
    if (!existingKeys.has(topicKey)) break;
  }

  if (!topicKey) return null;

  const response = await openai.responses.create({
    model: process.env.OPENAI_RESPONSES_MODEL || "gpt-5.1",
    reasoning: { effort: "low" },
    tools: [dataTool],
    input: [
      { role: "developer", content: "You are an AI assistant that can generate debate topic data. Use the generate_topic_data tool to generate data about a random subject." },
      { role: "user", content: `Generate debate topic data for the topic: "${topicName}". Include concise AI summaries for each argument.` },
    ],
    tool_choice: {
      type: "function",
      name: "generate_topic_data",
    },
    store: true,
  });

  for (const item of response.output) {
    if (item.type === "function_call") {
      const payload = JSON.parse(item.arguments);
      const topicData = payload.topicData;
      const creator = users[Math.floor(Math.random() * users.length)];

      const argumentsWithKeys: SeedArgument[] = (topicData.arguments || []).map((arg: any, idx: number) => ({
        key: `${topicKey}-arg-${idx + 1}`,
        side: arg.side || "neutral",
        body: arg.body,
        createdByKey: users[Math.floor(Math.random() * users.length)].key,
        aiAnalysis: {
          aiSummary: arg.aiSummary || arg.body,
          justification: arg.aiJustification || "AI provided summary for seed data.",
          isFact: false,
        },
        comments: (arg.comments || []).map((c: any, cIdx: number) => ({
          body: c.body,
          createdByKey: users[Math.floor(Math.random() * users.length)].key,
          upvoteCount: typeof c.upvoteCount === "number" ? c.upvoteCount : 0,
          downvoteCount: typeof c.downvoteCount === "number" ? c.downvoteCount : 0,
          score: (c.upvoteCount || 0) - (c.downvoteCount || 0),
          key: `${topicKey}-arg-${idx + 1}-c-${cIdx + 1}`,
        })),
      }));

      const facts: SeedFact[] = (topicData.facts || []).map((fact: any) => ({
        text: fact.text,
        aiJustification: fact.aiJustification,
        sourceArgumentKey: argumentsWithKeys[fact.sourceArgumentIndex || 0]?.key,
        linkedArgumentKeys: (fact.linkedArgumentIndexes || [])
          .map((i: number) => argumentsWithKeys[i]?.key)
          .filter(Boolean),
      }));

      const topic: SeedTopic = {
        key: topicKey,
        title: topicData.title || topicName,
        description: topicData.description || `A debate about ${topicName}.`,
        slug: slugify(topicData.title || topicName),
        createdByKey: creator.key,
        tags: topicData.tags || ["generated", "ai"],
        arguments: argumentsWithKeys,
        facts,
      };

      return topic;
    }
  }

  return null;
}

async function enrichWithOntology(topics: SeedTopic[]): Promise<SeedTopic[]> {
  for (const topic of topics) {
    topic.ontologyCategories = await classify(`${topic.title}. ${topic.description || ""}`);
    for (const arg of topic.arguments) {
      arg.ontologyCategories = await classify(arg.body);
      if (arg.comments) {
        for (const comment of arg.comments) {
          comment.ontologyCategories = await classify(comment.body);
        }
      }
    }
  }
  return topics;
}

async function loadPopulation(): Promise<PopulationData> {
  const populationPath = path.resolve(process.cwd(), "population_data.json");
  const raw = await fs.readFile(populationPath, "utf-8").catch(() => "");
  if (!raw.trim()) {
    return { users: [], topics: [] };
  }
  return JSON.parse(raw) as PopulationData;
}

async function savePopulation(data: PopulationData) {
  const populationPath = path.resolve(process.cwd(), "population_data.json");
  await fs.writeFile(populationPath, JSON.stringify(data, null, 2), "utf-8");
  console.log(`✅ Saved updated seed data to ${populationPath}`);
}

async function generateTopicEntry(
  topicName: string,
  users: SeedUser[],
  existingKeys: Set<string>
): Promise<SeedTopic | null> {
  if (!users.length) {
    throw new Error("population_data.json is missing users; add users before generating topics.");
  }

  const topic = await generateTopic(users, existingKeys, topicName);
  if (!topic) {
    console.warn("⚠️ No topics generated for", topicName);
    return null;
  }

  existingKeys.add(topic.key);
  const [enrichedTopic] = await enrichWithOntology([topic]);
  return enrichedTopic;
}

export async function main() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (const arg of args) {
    const [key, value] = arg.split("=");
    argMap[key] = value;
  }
  const numberOfTopics = parseInt(argMap["number_topics"] || "3", 10);
  const topics = await generateTopicNames(numberOfTopics);
  console.log("Generated Topic Names:");
  topics.forEach((t, i) => {
    console.log(`${i + 1}. ${t}`);
  });
  console.log("\nAre these acceptable? Y/N");

  const userResponse: string = await new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (userResponse.toLowerCase() !== "y") {
    console.log("Aborting topic data generation.");
    process.exit(0);
  }

  const population = await loadPopulation();
  const users = population.users;
  if (!users.length) {
    throw new Error("population_data.json is missing users; add users before generating topics.");
  }

  const existingKeys = new Set(population.topics.map((t) => t.key));
  const newTopics: SeedTopic[] = [];

  // Run generation tasks concurrently with a small worker pool to avoid overwhelming APIs/IO.
  const concurrency = Math.min(5, Math.max(1, numberOfTopics));
  const queue = Array.from({ length: numberOfTopics }, (_, i) => i);
  const workers = Array.from({ length: concurrency }, () =>
    (async () => {
      while (true) {
        const idx = queue.shift();
        if (idx === undefined) return;
        const attempt = idx + 1;
        console.log(`🌀 Generating topic ${attempt} of ${numberOfTopics}...`);
        try {
          console.log(`🔍 Topic: ${topics[idx]}`);
          const generated = await generateTopicEntry(topics[idx], users, existingKeys);
          if (generated) {
            newTopics.push(generated);
          }
          console.log(`✅ Finished topic task ${attempt}`);
        } catch (err) {
          console.error(`❌ Topic task ${attempt} failed:`, err);
        }
      }
    })()
  );

  await Promise.all(workers);

  if (!newTopics.length) {
    console.warn("⚠️ No new topics generated.");
    return;
  }

  population.topics = [...population.topics, ...newTopics];
  await savePopulation(population);
}

main().catch((err) => {
  console.error("❌ Failed to generate seed data", err);
  process.exit(1);
});
