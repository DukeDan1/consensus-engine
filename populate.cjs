// Populate the database with initial data

const mongoose = require("mongoose");
const dotenv = require("dotenv");

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
    side: { type: String, enum: ["pro", "con"], required: true, index: true },
    body: { type: String, required: true, trim: true, maxlength: 10000 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    upvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
    downvotes: [{ type: Schema.Types.ObjectId, ref: "User", default: [] }],
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
  },
  { timestamps: true }
);
const Comment = mongoose.model("Comment", CommentSchema);

// ---------- Hard-coded Data ----------

const USERS = [
  { key: "alice",   name: "Alice Johnson",  email: "alice@example.com" },
  { key: "bob",     name: "Bob Smith",      email: "bob@example.com" },
  { key: "charlie", name: "Charlie Patel",  email: "charlie@example.com" },
  { key: "diana",   name: "Diana Evans",    email: "diana@example.com" },
  { key: "evan",    name: "Evan Li",        email: "evan@example.com" },
  { key: "farah",   name: "Farah Khan",     email: "farah@example.com" },
];

// Topics with brief, neutral descriptions; votes filled later
const TOPICS = [
  {
    key: "brexit2ndref",
    title: "Should the UK hold a second referendum on Brexit?",
    description: "Evaluate whether public opinion and economic outcomes justify revisiting the 2016 decision.",
    tags: ["UK", "Brexit", "Referendum", "Politics"],
    createdByKey: "alice",
  },
  {
    key: "israel-gaza-ceasefire",
    title: "Should there be an immediate, unconditional ceasefire in the Israel–Gaza conflict?",
    description: "Weigh humanitarian concerns against security and political conditions for a durable ceasefire.",
    tags: ["Middle East", "Ceasefire", "Humanitarian", "Security"],
    createdByKey: "bob",
  },
  {
    key: "ai-licensing",
    title: "Should governments require licenses to train large AI models?",
    description: "Consider innovation, safety, and competition implications of licensing regimes.",
    tags: ["AI", "Regulation", "Technology Policy"],
    createdByKey: "charlie",
  },
  {
    key: "ubi",
    title: "Would a Universal Basic Income be beneficial overall?",
    description: "Assess macroeconomic effects, incentives, poverty reduction, and fiscal trade-offs.",
    tags: ["Economics", "Welfare", "Policy"],
    createdByKey: "diana",
  },
  {
    key: "nuclear-expansion",
    title: "Should nuclear power be expanded to meet climate goals?",
    description: "Balance reliability and emissions reductions against cost, timeline, and waste risks.",
    tags: ["Energy", "Climate", "Nuclear"],
    createdByKey: "farah",
  },
];

// Arguments per topic (pro/con)
const ARGUMENTS = {
  brexit2ndref: [
    {
      side: "pro",
      body:
        "Public opinion and economic data have shifted since 2016. A second vote would provide democratic legitimacy given new information and post-Brexit realities.",
      createdByKey: "diana",
    },
    {
      side: "con",
      body:
        "Re-running a national vote undermines democratic finality and risks deepening polarisation. Focus should be on making existing arrangements work better.",
      createdByKey: "bob",
    },
  ],
  "israel-gaza-ceasefire": [
    {
      side: "pro",
      body:
        "An immediate ceasefire would reduce civilian casualties, enable humanitarian aid, and create space for negotiations, including the release of hostages.",
      createdByKey: "alice",
    },
    {
      side: "con",
      body:
        "A durable ceasefire requires conditions—such as verifiable security guarantees and hostage releases—otherwise violence may simply resume.",
      createdByKey: "evan",
    },
  ],
  "ai-licensing": [
    {
      side: "pro",
      body:
        "Licensing large-scale training can set safety baselines, ensure compute disclosures, and mitigate catastrophic misuse while preserving research carve-outs.",
      createdByKey: "farah",
    },
    {
      side: "con",
      body:
        "Licensing risks regulatory capture, burdens startups, and pushes development offshore. Better to enforce targeted, outcome-based rules.",
      createdByKey: "charlie",
    },
  ],
  ubi: [
    {
      side: "pro",
      body:
        "A UBI reduces poverty, simplifies welfare, and strengthens bargaining power for low-income workers without bureaucracy-heavy means testing.",
      createdByKey: "alice",
    },
    {
      side: "con",
      body:
        "It’s fiscally heavy and may dampen labour participation. Targeted transfers and earned income supports are more cost-effective.",
      createdByKey: "evan",
    },
  ],
  "nuclear-expansion": [
    {
      side: "pro",
      body:
        "Nuclear provides firm, low-carbon power at scale, complementing renewables and enhancing grid reliability during the transition.",
      createdByKey: "bob",
    },
    {
      side: "con",
      body:
        "High capital costs, long build times, and waste risks argue for faster-to-deploy options like wind, solar, storage, and efficiency.",
      createdByKey: "diana",
    },
  ],
};

// Comments on arguments
const COMMENTS = [
  {
    topicKey: "brexit2ndref",
    argIndex: 0, // pro
    body: "Agree that circumstances changed—supply chains and trade frictions are clearer now.",
    createdByKey: "charlie",
  },
  {
    topicKey: "brexit2ndref",
    argIndex: 1, // con
    body: "Democratic trust matters; moving on could help restore stability.",
    createdByKey: "farah",
  },
  {
    topicKey: "israel-gaza-ceasefire",
    argIndex: 0, // pro
    body: "Humanitarian access should be the priority while talks continue.",
    createdByKey: "diana",
  },
  {
    topicKey: "israel-gaza-ceasefire",
    argIndex: 1, // con
    body: "Without clear enforcement, ceasefires can be fragile.",
    createdByKey: "alice",
  },
  {
    topicKey: "ai-licensing",
    argIndex: 0,
    body: "Could small labs be exempted below a compute threshold?",
    createdByKey: "evan",
  },
  {
    topicKey: "ubi",
    argIndex: 1,
    body: "Curious what tax changes would fund it sustainably.",
    createdByKey: "bob",
  },
];

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

  // 3) Arguments per topic
  const argumentPayload = [];
  for (const t of topicsIndexed) {
    const args = ARGUMENTS[t.key] || [];
    for (const arg of args) {
      const author = usersByKey.get(arg.createdByKey);
      argumentPayload.push({
        topic: t._id,
        side: arg.side,
        body: arg.body,
        createdBy: author?._id,
        // small, realistic vote patterns
        upvotes: pickIds(usersIndexed, ["alice", "bob", "charlie", "diana", "evan"].sort(() => 0.5 - Math.random()).slice(0, 3)),
        downvotes: pickIds(usersIndexed, ["farah", "evan", "bob", "alice"].sort(() => 0.5 - Math.random()).slice(0, 2)),
      });
    }
  }
  const argumentDocs = await Argument.insertMany(argumentPayload);

  // 4) Comments
  const commentsPayload = COMMENTS.map((c) => {
    const topic = topicsByKey.get(c.topicKey);
    const argList = argumentDocs.filter((a) => a.topic.toString() === topic._id.toString());
    const targetArg = argList[c.argIndex];
    const author = usersByKey.get(c.createdByKey);
    if (!targetArg) throw new Error(`No argument at index ${c.argIndex} for topic ${c.topicKey}`);
    return {
      argument: targetArg._id,
      body: c.body,
      createdBy: author?._id,
    };
  });
  await Comment.insertMany(commentsPayload);

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
