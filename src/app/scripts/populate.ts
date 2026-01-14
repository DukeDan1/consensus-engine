import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs/promises";
import mongoose from "mongoose";
import { dbConnect } from "../lib/mongoose";
import User from "../models/user";
import { Topic } from "../models/topic";
import { Argument, ArgumentSide } from "../models/argument";
import { Comment } from "../models/comment";
import { Fact } from "../models/facts";

dotenv.config();

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
};

type SeedArgument = {
  key: string;
  side: ArgumentSide;
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
  nickname?: string;
  avatarUrl?: string;
};

type PopulationData = {
  users: SeedUser[];
  topics: SeedTopic[];
  ontologyEmbeddings?: any;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
}

async function loadPopulationData(): Promise<PopulationData> {
  const populationPath = path.resolve(process.cwd(), "population_data.json");
  const raw = await fs.readFile(populationPath, "utf-8");
  const parsed = JSON.parse(raw) as PopulationData;
  parsed.topics ||= [];
  parsed.users ||= [];
  return parsed;
}

async function writeEmbeddingsSnapshot(snapshot: any) {
  if (!snapshot) return;
  const embeddingsPath = path.resolve(process.cwd(), "ontology_embeddings.json");
  await fs.writeFile(embeddingsPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`✅ Ensured embeddings file at ${embeddingsPath}`);
}

async function upsertUsers(users: SeedUser[]): Promise<Map<string, mongoose.Types.ObjectId>> {
  const map = new Map<string, mongoose.Types.ObjectId>();
  for (const user of users) {
    const doc = await User.findOneAndUpdate(
      { email: user.email },
      { $setOnInsert: { name: user.name, nickname: user.nickname, email: user.email, avatarUrl: user.avatarUrl } },
      { upsert: true, new: true }
    ).exec();
    map.set(user.key, doc._id);
  }
  return map;
}

async function clearExistingTopics(slugs: string[]) {
  if (!slugs.length) return;
  const existing = await Topic.find({ slug: { $in: slugs } }, { _id: 1 }).lean();
  const topicIds = existing.map((t) => t._id);
  if (!topicIds.length) return;

  const argIds = await Argument.find({ topic: { $in: topicIds } }, { _id: 1 }).lean();
  const argumentIds = argIds.map((a) => a._id);

  await Promise.all([
    Comment.deleteMany({ argument: { $in: argumentIds } }),
    Fact.deleteMany({ topic: { $in: topicIds } }),
    Argument.deleteMany({ _id: { $in: argumentIds } }),
    Topic.deleteMany({ _id: { $in: topicIds } }),
  ]);

  console.log(`🧹 Cleared existing topics for slugs: ${slugs.join(", ")}`);
}

async function seedTopic(topic: SeedTopic, userMap: Map<string, mongoose.Types.ObjectId>) {
  const creatorId = userMap.get(topic.createdByKey);
  if (!creatorId) {
    throw new Error(`No user found for topic creator key: ${topic.createdByKey}`);
  }

  const slug = topic.slug || slugify(topic.title || topic.key);

  const topicDoc = await Topic.create({
    title: topic.title,
    description: topic.description,
    slug,
    createdBy: creatorId,
    ontologyCategories: topic.ontologyCategories || [],
  });

  const argKeyToId = new Map<string, mongoose.Types.ObjectId>();
  const argumentPayloads = topic.arguments.map((arg) => {
    const argCreator = userMap.get(arg.createdByKey);
    if (!argCreator) {
      throw new Error(`No user found for argument creator key: ${arg.createdByKey}`);
    }
    const upvotes = arg.upvoteCount || 0;
    const downvotes = arg.downvoteCount || 0;
    return {
      topic: topicDoc._id,
      side: arg.side,
      body: arg.body,
      createdBy: argCreator,
      aiAnalysis: arg.aiAnalysis,
      ontologyCategories: arg.ontologyCategories || [],
      upvoteCount: upvotes,
      downvoteCount: downvotes,
      score: typeof arg.score === "number" ? arg.score : upvotes - downvotes,
    };
  });

  const createdArgs = await Argument.insertMany(argumentPayloads);
  createdArgs.forEach((doc, idx) => {
    const key = topic.arguments[idx]?.key;
    if (key) argKeyToId.set(key, doc._id);
  });

  // Comments
  const commentPayloads: Array<Record<string, any>> = [];
  topic.arguments.forEach((arg, idx) => {
    if (!arg.comments?.length) return;
    const argumentId = createdArgs[idx]._id;
    arg.comments.forEach((comment) => {
      const author = userMap.get(comment.createdByKey);
      if (!author) {
        throw new Error(`No user found for comment creator key: ${comment.createdByKey}`);
      }
      const upvotes = comment.upvoteCount || 0;
      const downvotes = comment.downvoteCount || 0;
      commentPayloads.push({
        argument: argumentId,
        body: comment.body,
        createdBy: author,
        upvoteCount: upvotes,
        downvoteCount: downvotes,
        score: typeof comment.score === "number" ? comment.score : upvotes - downvotes,
        ontologyCategories: comment.ontologyCategories || [],
      });
    });
  });

  if (commentPayloads.length) {
    await Comment.insertMany(commentPayloads);
  }

  // Facts
  if (topic.facts?.length) {
    const factPayloads = topic.facts.map((fact) => {
      const sourceId = argKeyToId.get(fact.sourceArgumentKey);
      if (!sourceId) {
        throw new Error(`No argument found for fact source key: ${fact.sourceArgumentKey}`);
      }
      const linked = fact.linkedArgumentKeys?.map((k) => argKeyToId.get(k)).filter(Boolean) as mongoose.Types.ObjectId[];
      return {
        linkedArguments: linked,
        topic: topicDoc._id,
        text: fact.text,
        sourceArgument: sourceId,
      };
    });
    if (factPayloads.length) {
      await Fact.insertMany(factPayloads);
    }
  }

  // Update topic counts and score
  const pro = createdArgs.filter((a) => a.side === "for").length;
  const con = createdArgs.filter((a) => a.side === "against").length;
  const total = createdArgs.length;
  const score = createdArgs.reduce((sum, a) => sum + (a.score || 0), 0);

  await Topic.findByIdAndUpdate(topicDoc._id, {
    argumentCounts: { pro, con, total },
    score,
  }).exec();

  console.log(`✅ Seeded topic "${topic.title}" with ${createdArgs.length} arguments and ${commentPayloads.length} comments.`);
}

async function main() {
  const data = await loadPopulationData();
  if (data.ontologyEmbeddings) {
    await writeEmbeddingsSnapshot(data.ontologyEmbeddings);
  }

  await dbConnect();

  const userMap = await upsertUsers(data.users);
  const slugs = data.topics.map((t) => t.slug || slugify(t.title));
  await clearExistingTopics(slugs);

  for (const topic of data.topics) {
    await seedTopic(topic, userMap);
  }

  await mongoose.connection.close();
  console.log("🎉 Population complete.");
}

main().catch((err) => {
  console.error("❌ Population script failed", err);
  process.exit(1);
});
