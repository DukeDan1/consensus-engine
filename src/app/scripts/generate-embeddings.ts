import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { generateOntologyEmbeddingsSnapshot } from "../services/ontologyClassificationService";

dotenv.config();

type PopulationData = {
  users?: Array<Record<string, unknown>>;
  topics?: Array<Record<string, unknown>>;
  ontologyEmbeddings?: unknown;
};

async function main() {
  const snapshot = await generateOntologyEmbeddingsSnapshot();
  const embeddingsPath = path.resolve(process.cwd(), "ontology_embeddings.json");
  await fs.writeFile(embeddingsPath, JSON.stringify(snapshot, null, 2), "utf-8");
  console.log(`✅ Wrote ontology embeddings to ${embeddingsPath}`);

  const populationPath = path.resolve(process.cwd(), "population_data.json");
  try {
    const raw = await fs.readFile(populationPath, "utf-8");
    const data: PopulationData = raw?.trim() ? JSON.parse(raw) : {};
    data.ontologyEmbeddings = snapshot;
    await fs.writeFile(populationPath, JSON.stringify(data, null, 2), "utf-8");
    console.log(`✅ Updated ${populationPath} with latest embeddings snapshot.`);
  } catch (err) {
    console.warn(`⚠️ Could not update population_data.json: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => {
  console.error("❌ Failed to generate embeddings", err);
  process.exit(1);
});
