// Populate the database with initial data

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const populationData = require("./population_data.json");

dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ Missing MONGODB_URI (set in .env or environment).");
  process.exit(1);
}

// ---------- In-script Models (minimal) ----------

const { Schema, Types } = mongoose;

// Very simple User model
const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
  },
  { timestamps: true }
);
const User = mongoose.model("User", UserSchema);

// Topic matches your current approach: upvotes/downvotes are arrays of user ObjectIds
const TopicSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isActive: { type: Boolean, default: true },
    tags: { type: [String], default: [] },
    upvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    downvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  { timestamps: true }
);
const Topic = mongoose.model("Topic", TopicSchema);

// Arguments are separate docs (recommended). Using arrays for votes to match your current pattern.
const ArgumentSchema = new Schema(
  {
    topic: { type: Schema.Types.ObjectId, ref: "Topic", required: true, index: true },
  side: { type: String, enum: ["for", "against"], required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    upvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    downvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    isRemoved: { type: Boolean, default: false },
    aiAnalysis: {
      isFact: { type: Boolean, default: false },
      isOpinion: { type: Boolean, default: true },
      justification: { type: String, default: "" },
    },
  },
  { timestamps: true }
);
const Argument = mongoose.model("Argument", ArgumentSchema);

// Comments are tied to an argument
const CommentSchema = new Schema(
  {
    argument: { type: Schema.Types.ObjectId, ref: "Argument", required: true, index: true },
    body: { type: String, required: true, maxlength: 5000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isRemoved: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const Comment = mongoose.model("Comment", CommentSchema);

// ---------- Hard-coded Data ----------

const USERS = populationData.users;
const TOPICS = populationData.topics;

// ---------- Helpers ----------

function byKey(arr) {
  const map = new Map();
  for (const x of arr) map.set(x.key, x);
  return map;
}

function pickIds(list, keys = []) {
  // Return unique ObjectIds by user keys
  const ids = [];
  const seen = new Set();
  keys.forEach((k) => {
    const u = list.find((x) => x.key === k);
    if (u && !seen.has(u._id.toString())) {
      seen.add(u._id.toString());
      ids.push(u._id);
    }
  });
  return ids;
}


// ---------- Main Seed ----------

(async function main() {
  console.log("🌱 Connecting:", MONGODB_URI);
  await mongoose.connect(MONGODB_URI);

  // Wipe previous (safe for dev)
  await Promise.all([Topic.deleteMany({}), Argument.deleteMany({}), Comment.deleteMany({})]);

  const existingUsers = await User.find({ email: { $in: USERS.map((u) => u.email) } });
  if (existingUsers.length > 0) {
    await User.deleteMany({ email: { $in: USERS.map((u) => u.email) } });
  }

  // 1) Users
  const userDocs = await User.insertMany(USERS.map(({ name, email }) => ({ name, email })));
  const usersIndexed = USERS.map((u, i) => ({ ...u, _id: userDocs[i]._id }));
  const usersByKey = byKey(usersIndexed);

  // 2) Topics (with simple votes arrays using user IDs to match your schema)
  // craft some vote mixes to make "top debates" meaningful
  const topicCreatePayload = TOPICS.map((t) => {
    const creator = usersByKey.get(t.createdByKey);
    if (!creator) throw new Error(`No user for key ${t.createdByKey}`);
    return {
      title: t.title,
      description: t.description,
      createdBy: creator._id,
      isActive: true,
      tags: t.tags,
      // Example votes: you can tweak these sets
      upvotes: pickIds(usersIndexed, ["alice", "bob", "charlie", "diana"].sort(() => 0.5 - Math.random()).slice(0, 3)),
      downvotes: pickIds(usersIndexed, ["evan", "farah", "alice", "bob"].sort(() => 0.5 - Math.random()).slice(0, 2)),
    };
  });

  const topicDocs = await Topic.insertMany(topicCreatePayload);
  const topicsIndexed = TOPICS.map((t, i) => ({ ...t, _id: topicDocs[i]._id }));
  const topicsByKey = byKey(topicsIndexed);

  // 3) Arguments per topic and comments
  for (const t of TOPICS) {
    if (!t.arguments) t.arguments = [];
    const argsForTopic = t.arguments;

    for (const arg of argsForTopic) {
      if (!arg.createdByKey) {
        throw new Error(`Argument for topic ${t.key} is missing createdByKey`);
      }

      // Use Mongoose model create so middleware and validation run and we can await reliably
      const createdArg = await Argument.create({
        topic: topicsByKey.get(t.key)._id,
        side: arg.side,
        body: arg.body,
        createdBy: usersByKey.get(arg.createdByKey)._id,
        isRemoved: arg.isRemoved || false,
        upvotes: [],
        downvotes: [],
        aiAnalysis: arg.aiAnalysis || { isFact: false, isOpinion: true, justification: "" },
      });

      arg.comments = arg.comments || [];
      for (const c of arg.comments) {
        if (!c.createdByKey) {
          throw new Error(`Comment for argument in topic ${t.key} is missing createdByKey`);
        }

        await Comment.create({
          argument: createdArg._id,
          body: c.body,
          createdBy: usersByKey.get(c.createdByKey)._id,
          isRemoved: c.isRemoved || false,
        });
      }
    }
  }

  // Summary
  const withTotals = topicDocs.map((t) => ({
    id: t._id.toString(),
    title: t.title,
    up: t.upvotes.length,
    down: t.downvotes.length,
    total: t.upvotes.length + t.downvotes.length,
  }));
  withTotals.sort((a, b) => b.total - a.total);

  console.log("✅ Seed complete.");
  console.table(withTotals);

  await mongoose.disconnect();
  console.log("🔌 Disconnected.");
})().catch((err) => {
  console.error("❌ Seed error:", err);
  mongoose.disconnect();
  process.exit(1);
});
