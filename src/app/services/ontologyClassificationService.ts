/*
  Ontology Classification Service
  - Loads categories from ontology_categories.json at project root
  - Loads pre-computed embeddings from ontology_embeddings.json (run `npm run generate-embeddings` to update)
  - Falls back to generating embeddings at runtime if pre-computed file is missing
  - Classifies arbitrary text to the most relevant categories (multi-label)
  - Optional LLM re-rank/confirmation to improve precision

  Server-only: import in API routes or server components. Do not import in client components.
*/

import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { cleanOntologyLabel } from "@/app/lib/ontologyUtils";

// Models (override via env if desired)
const DEFAULT_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";
const DEFAULT_RESPONSES_MODEL = process.env.OPENAI_RESPONSES_MODEL || "gpt-5.1";

// File locations
const ONTOLOGY_PATH = path.resolve(process.cwd(), "ontology_categories.json");
const EMBEDDINGS_PATH = path.resolve(process.cwd(), "ontology_embeddings.json");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type OntologyCategory = {
  id: string;
  label: string;
  description?: string;
  synonyms?: string[];
};

export type ClassificationCandidate = OntologyCategory & {
  similarity: number; // cosine similarity (0..1 is typical for normalized)
};

export type ClassificationResult = Array<{
  id: string;
  label: string;
  description?: string;
  similarity: number;
  // present if LLM confirmation is enabled
  confidence?: number; // 0..1
}>;

export type OntologyAssignment = {
  id: string;
  label: string;
  description?: string;
  similarity?: number;
  confidence?: number;
};

// Global cache to persist across hot reloads in dev and across requests
const g: any = globalThis as any;

if (!g.__ontologyIndexCache) {
  g.__ontologyIndexCache = {
    ready: false as boolean,
    readyPromise: null as Promise<void> | null,
    categories: [] as OntologyCategory[],
    // normalized embeddings matrix: number[][] where each row is unit-length
    vectors: [] as number[][],
    embedModel: DEFAULT_EMBED_MODEL as string,
  };
}

const cache = g.__ontologyIndexCache as {
  ready: boolean;
  readyPromise: Promise<void> | null;
  categories: OntologyCategory[];
  vectors: number[][]; // normalized
  embedModel: string;
};

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function normalizeLabel(raw: string | undefined | null): string | undefined {
  return typeof raw === "string" ? raw.trim() : undefined;
}

function extractMedtopId(label?: string): string | undefined {
  if (!label) return undefined;
  const match = label.match(/\(medtop:(\d+)\)/i);
  return match ? `medtop:${match[1]}` : undefined;
}

function buildSearchText(cat: OntologyCategory): string {
  const pieces = [cat.label, cat.description, ...(cat.synonyms || [])].filter(Boolean);
  return pieces.join(" | ");
}

function l2norm(vec: number[]): number {
  return Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
}

function normalizeVec(vec: number[]): number[] {
  const n = l2norm(vec) + 1e-12;
  return vec.map((v) => v / n);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

async function loadOntologyFromFile(): Promise<OntologyCategory[]> {
  if (!(await fileExists(ONTOLOGY_PATH))) {
    throw new Error(`ontology_categories.json not found at ${ONTOLOGY_PATH}`);
  }
  const raw = await fs.readFile(ONTOLOGY_PATH, "utf-8");
  if (!raw || raw.trim().length === 0) {
    throw new Error("ontology_categories.json is empty");
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error("Failed to parse ontology_categories.json as JSON" + (err instanceof Error ? `: ${err.message}` : ""));
  }

  const categories: OntologyCategory[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      const id = normalizeLabel((item as any).id) || normalizeLabel((item as any).topicId) || extractMedtopId(normalizeLabel((item as any).label));
      const label = cleanOntologyLabel(
        normalizeLabel((item as any).label) || normalizeLabel((item as any).name) || id || undefined
      );
      if (!id || !label) continue;
      categories.push({
        id,
        label,
        description: normalizeLabel((item as any).description) || normalizeLabel((item as any).definition) || undefined,
        synonyms: Array.isArray((item as any).synonyms) ? (item as any).synonyms : undefined,
      });
    }
  } else if (data && typeof data === "object") {
    // try common shapes: { topics: [...] } or { categories: [...] }
    const arr = (data as any).topics || (data as any).categories || [];
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const id = normalizeLabel((item as any).id) || normalizeLabel((item as any).topicId) || extractMedtopId(normalizeLabel((item as any).label));
        const label = cleanOntologyLabel(
          normalizeLabel((item as any).label) || normalizeLabel((item as any).name) || id || undefined
        );
        if (!id || !label) continue;
        categories.push({
          id,
          label,
          description: normalizeLabel((item as any).description) || normalizeLabel((item as any).definition) || undefined,
          synonyms: Array.isArray((item as any).synonyms) ? (item as any).synonyms : undefined,
        });
      }
    }
  }

  if (categories.length === 0) {
    throw new Error("No categories found in ontology_categories.json");
  }

  return categories;
}

async function embedBatch(texts: string[], model = DEFAULT_EMBED_MODEL): Promise<number[][]> {
  const res = await openai.embeddings.create({ model, input: texts });
  return res.data.map((r) => r.embedding as unknown as number[]);
}

async function loadPrecomputedEmbeddings(): Promise<{ categories: OntologyCategory[]; vectors: number[][] } | null> {
  try {
    if (!(await fileExists(EMBEDDINGS_PATH))) {
      console.warn("⚠️ Pre-computed embeddings file not found. Will generate embeddings at runtime.");
      return null;
    }

    const raw = await fs.readFile(EMBEDDINGS_PATH, "utf-8");
    const data = JSON.parse(raw);

    if (!data.categories || !Array.isArray(data.categories) || !data.embeddings || !Array.isArray(data.embeddings)) {
      console.warn("⚠️ Invalid embeddings file format. Will generate embeddings at runtime.");
      return null;
    }

    if (data.categories.length !== data.embeddings.length) {
      console.warn("⚠️ Mismatch between categories and embeddings count. Will generate embeddings at runtime.");
      return null;
    }

    // Check if model matches (optional warning)
    if (data.model && data.model !== cache.embedModel) {
      console.warn(`⚠️ Embeddings were generated with model ${data.model}, but current model is ${cache.embedModel}. Consider regenerating embeddings.`);
    }

    console.log(`✅ Loaded pre-computed embeddings for ${data.categories.length} categories from ${EMBEDDINGS_PATH}`);
    return {
      categories: data.categories,
      vectors: data.embeddings,
    };
  } catch (err) {
    console.warn("⚠️ Error loading pre-computed embeddings:", err);
    return null;
  }
}

async function buildIndex(): Promise<void> {
  // Try to load pre-computed embeddings first
  const precomputed = await loadPrecomputedEmbeddings();

  if (precomputed) {
    cache.categories = precomputed.categories;
    cache.vectors = precomputed.vectors;
    cache.ready = true;
    return;
  }

  // Fallback: generate embeddings at runtime (for development/testing)
  console.warn("WARNING: 🔄 Generating embeddings at runtime...");
  const categories = await loadOntologyFromFile();

  // Create searchable texts
  const texts = categories.map((c) => buildSearchText(c));

  // Batch embedding to avoid large payloads (OpenAI supports large batches, but keep modest)
  const batchSize = 128;
  const embeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const vecs = await embedBatch(chunk, cache.embedModel);
    embeddings.push(...vecs);
  }

  // Normalize for cosine similarity via dot product
  const normalized = embeddings.map(normalizeVec);

  cache.categories = categories;
  cache.vectors = normalized;
  cache.ready = true;
}

async function ensureReady(): Promise<void> {
  if (cache.ready) return;
  if (!cache.readyPromise) {
    cache.readyPromise = buildIndex().catch((err) => {
      cache.ready = false;
      cache.readyPromise = null;
      throw err;
    });
  }
  await cache.readyPromise;
}

async function embedQuery(text: string, model = DEFAULT_EMBED_MODEL): Promise<number[]> {
  const res = await openai.embeddings.create({ model, input: [text] });
  const vec = res.data[0].embedding as unknown as number[];
  return normalizeVec(vec);
}

function topKSimilar(queryVec: number[], k: number): { idx: number; sim: number }[] {
  const sims: { idx: number; sim: number }[] = cache.vectors.map((vec, idx) => ({ idx, sim: dot(queryVec, vec) }));
  sims.sort((a, b) => b.sim - a.sim);
  return sims.slice(0, Math.min(k, sims.length));
}

export type ClassifyOptions = {
  topK?: number; // candidates to return (pre-LLM)
  minSimilarity?: number; // drop weak matches before LLM
  confirmWithLLM?: boolean; // re-rank/confirm with an LLM
  responsesModel?: string; // override model for LLM step
};

export async function classifyTextToOntology(
  text: string,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  await ensureReady();

  const topK = options.topK ?? 15;
  const minSim = options.minSimilarity ?? 0.22;
  const useLLM = options.confirmWithLLM ?? true;
  const responsesModel = options.responsesModel || DEFAULT_RESPONSES_MODEL;

  const qvec = await embedQuery(text, cache.embedModel);
  const idxs = topKSimilar(qvec, topK);

  const candidates: ClassificationCandidate[] = [];
  for (const { idx, sim } of idxs) {
    if (sim < minSim) continue;
    const c = cache.categories[idx];
    candidates.push({ ...c, similarity: sim });
  }

  if (!useLLM) {
    return candidates.map((c) => ({ id: c.id, label: c.label, description: c.description, similarity: c.similarity }));
  }

  if (candidates.length === 0) {
    return [];
  }

  // LLM confirmation step for precision
  const payload = {
    input_text: text,
    candidate_topics: candidates.map((c) => ({
      id: c.id,
      label: c.label,
      description: c.description || "",
      similarity: Number(c.similarity.toFixed(4)),
    })),
    instructions:
      "Select 0..N topics that best describe input_text. Prefer specific over general. If none apply, return []. Return JSON: { selections: [{ id, confidence (0..1) }] }.",
  } as const;

  const resp = await openai.responses.create({
    model: responsesModel,
    input: [
      { role: "system", content: "You are a precise classifier for an ontology of debate/discussion topics. Return strict JSON only with no preamble or commentary." },
      { role: "user", content: JSON.stringify(payload) },
    ],
    reasoning: {
      effort: "none"
    },
    tool_choice: {
      type: "function",
      name: "classify_ontology",
    },
    store: true,
    tools: [
      {
        type: "function",
        name: "classify_ontology",
        description: "Classify the input text to the most relevant ontology categories from the provided candidates.",
        parameters: {
          type: "object",
          properties: {
            selections: {
              type: "array",
              description: "The selected ontology categories with confidence scores.",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", description: "The ontology category ID." },
                  confidence: { type: "number", description: "Confidence score between 0 and 1." },
                },
                required: ["id", "confidence"],
              },
            },
          },
          required: ["selections"],
        },
        strict: true,
      }
    ],
  });

  let selections: Array<{ id: string; confidence: number; }> = [];
  try {
    const functionCallItem = resp.output.find(item => item.type == "function_call");
    if (!functionCallItem) {
        throw new Error('Failed to get AI analysis for argument');
    }
    const answer = JSON.parse(functionCallItem.arguments);
    if (answer && Array.isArray(answer.selections)) selections = answer.selections;
  } catch {
    selections = [];
  }

  // Join LLM output back to candidate similarities
  const byId = new Map(candidates.map((c) => [c.id, c] as const));
  const results: ClassificationResult = [];
  for (const sel of selections) {
    const c = byId.get(sel.id);
    if (!c) continue;
    results.push({ id: c.id, label: c.label, description: c.description, similarity: c.similarity, confidence: sel.confidence, });
  }

  // If LLM returns nothing, fall back to top 3 candidates (optional safety)
  if (results.length === 0 && candidates.length > 0) {
    for (const c of candidates.slice(0, 3)) {
      results.push({ id: c.id, label: c.label, description: c.description, similarity: c.similarity });
    }
  }

  return results;
}

export async function getOntologyCategories(): Promise<OntologyCategory[]> {
  await ensureReady();
  return cache.categories.slice();
}

export function classificationToAssignments(results: ClassificationResult, limit = 5): OntologyAssignment[] {
  return results
    .filter((item) => !!item?.id && !!item?.label)
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      label: cleanOntologyLabel(item.label) || item.label,
      description: item.description,
      similarity: item.similarity,
      confidence: item.confidence,
    }));
}

export function clearOntologyCacheForTests() {
  cache.ready = false;
  cache.readyPromise = null;
  cache.categories = [];
  cache.vectors = [];
}
