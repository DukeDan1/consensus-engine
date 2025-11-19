// Generate embeddings for ontology categories
// This script should be run manually when ontology_categories.json changes
// Usage: node generate_embeddings.cjs

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY (set in .env or environment).");
  process.exit(1);
}

const ONTOLOGY_PATH = path.resolve(__dirname, "ontology_categories.json");
const EMBEDDINGS_OUTPUT_PATH = path.resolve(__dirname, "ontology_embeddings.json");
const DEFAULT_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";

// Helper functions (same as in ontologyClassificationService.ts)
function normalizeLabel(raw) {
  return typeof raw === "string" ? raw.trim() : undefined;
}

function extractMedtopId(label) {
  if (!label) return undefined;
  const match = label.match(/\(medtop:(\d+)\)/i);
  return match ? `medtop:${match[1]}` : undefined;
}

function cleanOntologyLabel(label) {
  if (!label) return label;
  // Remove medtop IDs like (medtop:20000002)
  return label.replace(/\s*\(medtop:\d+\)\s*$/i, "").trim();
}

function buildSearchText(cat) {
  const pieces = [cat.label, cat.description, ...(cat.synonyms || [])].filter(Boolean);
  return pieces.join(" | ");
}

function l2norm(vec) {
  return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
}

function normalizeVec(vec) {
  const n = l2norm(vec) + 1e-12;
  return vec.map((v) => v / n);
}

async function loadOntologyFromFile() {
  if (!fs.existsSync(ONTOLOGY_PATH)) {
    throw new Error(`ontology_categories.json not found at ${ONTOLOGY_PATH}`);
  }
  const raw = fs.readFileSync(ONTOLOGY_PATH, "utf-8");
  if (!raw || raw.trim().length === 0) {
    throw new Error("ontology_categories.json is empty");
  }
  
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error("Failed to parse ontology_categories.json as JSON: " + err.message);
  }

  const categories = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      const id = normalizeLabel(item.id) || normalizeLabel(item.topicId) || extractMedtopId(normalizeLabel(item.label));
      const label = cleanOntologyLabel(
        normalizeLabel(item.label) || normalizeLabel(item.name) || id || undefined
      );
      if (!id || !label) continue;
      categories.push({
        id,
        label,
        description: normalizeLabel(item.description) || normalizeLabel(item.definition) || undefined,
        synonyms: Array.isArray(item.synonyms) ? item.synonyms : undefined,
      });
    }
  } else if (data && typeof data === "object") {
    const arr = data.topics || data.categories || [];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const id = normalizeLabel(item.id) || normalizeLabel(item.topicId) || extractMedtopId(normalizeLabel(item.label));
        const label = cleanOntologyLabel(
          normalizeLabel(item.label) || normalizeLabel(item.name) || id || undefined
        );
        if (!id || !label) continue;
        categories.push({
          id,
          label,
          description: normalizeLabel(item.description) || normalizeLabel(item.definition) || undefined,
          synonyms: Array.isArray(item.synonyms) ? item.synonyms : undefined,
        });
      }
    }
  }

  if (categories.length === 0) {
    throw new Error("No categories found in ontology_categories.json");
  }

  return categories;
}

async function embedBatch(texts, model) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return result.data.map((r) => r.embedding);
}

async function generateEmbeddings() {
  console.log("🔄 Loading ontology categories...");
  const categories = await loadOntologyFromFile();
  console.log(`✅ Loaded ${categories.length} categories`);

  console.log("🔄 Building search texts...");
  const texts = categories.map((c) => buildSearchText(c));

  console.log(`🔄 Generating embeddings using model: ${DEFAULT_EMBED_MODEL}...`);
  const batchSize = 128;
  const embeddings = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const progress = Math.min(i + batchSize, texts.length);
    console.log(`   Processing ${progress}/${texts.length}...`);
    const vecs = await embedBatch(chunk, DEFAULT_EMBED_MODEL);
    embeddings.push(...vecs);
  }

  console.log("🔄 Normalizing embeddings...");
  const normalized = embeddings.map(normalizeVec);

  console.log("🔄 Preparing output data...");
  const output = {
    model: DEFAULT_EMBED_MODEL,
    generatedAt: new Date().toISOString(),
    categories: categories,
    embeddings: normalized,
  };

  console.log(`🔄 Writing embeddings to ${EMBEDDINGS_OUTPUT_PATH}...`);
  fs.writeFileSync(EMBEDDINGS_OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(`✅ Successfully generated embeddings for ${categories.length} categories`);
  console.log(`✅ Output saved to: ${EMBEDDINGS_OUTPUT_PATH}`);
  console.log(`📊 File size: ${(fs.statSync(EMBEDDINGS_OUTPUT_PATH).size / 1024 / 1024).toFixed(2)} MB`);
}

// Run the script
generateEmbeddings().catch((err) => {
  console.error("❌ Error generating embeddings:", err);
  process.exit(1);
});
