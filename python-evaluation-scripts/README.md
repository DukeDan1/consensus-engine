# Python Evaluation Scripts

Post-processing and reporting scripts for analysing simulation output from the Consensus Engine evaluation pipeline. Each script reads the JSON reports produced by the TypeScript simulation runners (`simulateScenarios.ts`, `simulateFactVoting.ts`) and produces human-readable terminal output and/or exported CSV/HTML reports.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install openai pymongo python-dotenv numpy pandas nltk rouge-score scikit-learn
```

A `.env` file (or exported environment variables) is required for scripts that connect to MongoDB or call the OpenAI API:

```
MONGODB_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...
```

---

## Scripts

### `report_simulation.py`

Analyses `scenario_simulation_*.json` reports produced by `simulateScenarios.ts`. Prints a per-scenario breakdown of moderation, fact-checking, and trust-scoring performance, then a cross-scenario summary.

```bash
python3 report_simulation.py <file.json>
python3 report_simulation.py <file1.json> <file2.json> ...   # combine multiple runs
python3 report_simulation.py <file.json> --html --csv        # export reports
```

**Options:** `--html`, `--csv`, `--all` (both), `--no-color`, `--no-summary`

---

### `report_fact_generation.py`

Evaluates the fidelity of AI-generated facts against the source arguments that produced them. For each argument where `aiAnalysis.isFact == true`, it computes BLEU-1/2/4, ROUGE-1/2/L, and cosine semantic similarity (via OpenAI `text-embedding-3-large` embeddings, with a TF-IDF fallback). Also reports compression ratio, novel token rate, and the distribution of fact-check verdicts for fact-bearing arguments.

Outputs summary CSV and JSON files prefixed with `fact_generation_evaluation`.

```bash
python3 report_fact_generation.py                            # all non-unused simulation JSONs
python3 report_fact_generation.py <file.json>
python3 report_fact_generation.py <file.json> --no-embeddings
```

**Options:** `--output-prefix PREFIX`, `--embedding-model NAME`, `--no-embeddings`, `--include-breakdowns`

**Requires:** `OPENAI_API_KEY` (unless `--no-embeddings` is set)

---

### `report_fact_voting.py`

Analyses `fact_voting_simulation_*.json` reports produced by `simulateFactVoting.ts`. Prints a per-scenario breakdown of voting outcomes (kept / updated / removed / skipped), vote distributions, and whether outcomes matched the expected result for each scenario. Supports combining multiple runs.

```bash
python3 report_fact_voting.py <file.json>
python3 report_fact_voting.py <file1.json> <file2.json> --all
```

**Options:** `--html`, `--csv`, `--all`, `--no-color`

---

### `report_fact_updates.py`

Connects to MongoDB to retrieve the full reassessment history for facts that were updated or removed in a fact-voting simulation run. Shows the before/after text, AI rationale, model used, and the vote reasons that triggered the change. Useful for qualitatively inspecting whether reassessment decisions were reasonable.

```bash
python3 report_fact_updates.py <file.json>
python3 report_fact_updates.py fact_voting_simulation_*.json --html
```

**Options:** `--html`, `--no-color`

**Requires:** `MONGODB_URI`

---

### `enrich_fact_results.py`

Enriches `fact_voting_simulation_*.json` files in-place with additional data fetched from MongoDB and optionally evaluated by an LLM. Adds:
- Before/after fact text and AI rationale from the database reassessment history
- A `reasonableUpdate` flag for each updated/removed fact, determined by an LLM judge
- An adjusted outcome-match field that accepts reasonable updates as correct

Run this before `report_fact_updates.py` or `report_fact_voting.py` to get richer output.

```bash
python3 enrich_fact_results.py fact_voting_simulation_*.json
python3 enrich_fact_results.py <file.json> --dry-run    # preview without writing
python3 enrich_fact_results.py <file.json> --no-llm     # MongoDB only, skip LLM
```

**Options:** `--dry-run`, `--no-llm`

**Requires:** `MONGODB_URI`, `OPENAI_API_KEY` (unless `--no-llm` is set)
