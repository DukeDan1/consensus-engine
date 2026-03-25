#!/usr/bin/env python3
"""
report_fact_generation.py
=========================
Evaluate how closely the AI-generated fact text matches the source argument
text in scenario simulation reports.

How fact generation works in the Consensus Engine:
1. A user posts an argument (the source text).
2. The AI analyses the argument and decides whether it contains a factual
   claim (aiAnalysis.isFact = true).
3. If isFact is true, the AI extracts a factualPart and creates a Fact
   document in the database.  The simulation JSON does not store the raw
   factualPart, but it does store aiAnalysis.aiSummary — the AI's
   compressed restatement of the argument — which is the closest available
   proxy for the generated fact text.

This script therefore:
- Filters to ONLY arguments where aiAnalysis.isFact == true (i.e. arguments
  that actually produced a fact).
- Compares each source argument body against the corresponding aiSummary.

Metrics computed per fact-producing argument:
- BLEU-1, BLEU-2, and BLEU-4
- ROUGE-1, ROUGE-2, and ROUGE-L (precision, recall, F1)
- Semantic similarity via OpenAI embeddings (with a deterministic TF-IDF
  cosine fallback)
- Compression ratio and token counts

Auxiliary context for dissertation evaluation:
- The distribution of contentFactCheck verdicts for fact-producing arguments
- A "supported" rate: proportion of generated facts whose fact-check verdict
  is "verified" or "mixed"

Why embeddings are included:
BLEU and ROUGE are lexical-overlap metrics, so they penalise paraphrasing.
Because the generated fact text is a compressed restatement of the argument,
embedding cosine similarity is usually a better semantic fidelity measure.
This makes it a stronger supplementary metric than an LLM judge for a
reproducible dissertation experiment.

Important caveat:
The reference text here is the argument body stored in the simulation JSON,
not the raw Wikipedia article.  In the simulation pipeline, those arguments
are the concrete inputs that the fact-generation step actually sees, so this
is the correct evaluation target for the generated text in the report.

Usage
-----
    .venv/bin/python report_fact_generation.py
    .venv/bin/python report_fact_generation.py scenario_simulation_1772559387529_0.json
    .venv/bin/python report_fact_generation.py scenario_simulation_*.json

Options
-------
    --output-prefix PREFIX   Prefix for generated CSV/JSON outputs.
                             Default: fact_generation_evaluation
    --include-breakdowns     Include scenario_simulation_*_0.json style files.
                             These are excluded by default because they are
                             per-scenario duplicates of combined runs.
    --embedding-model NAME   OpenAI embedding model name.
                             Default: text-embedding-3-large
    --no-embeddings          Skip OpenAI embeddings and use TF-IDF only.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from nltk.translate.bleu_score import SmoothingFunction, sentence_bleu
from openai import OpenAI
from dotenv import load_dotenv
from rouge_score import rouge_scorer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


DEFAULT_OUTPUT_PREFIX = "fact_generation_evaluation"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large"
SUPPORTED_VERDICTS = {"verified", "mixed"}

load_dotenv()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate generated fact text in scenario simulation reports."
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="scenario_simulation JSON files to process. Defaults to all main scenario_simulation*.json files.",
    )
    parser.add_argument(
        "--output-prefix",
        default=DEFAULT_OUTPUT_PREFIX,
        help=f"Prefix for generated outputs. Default: {DEFAULT_OUTPUT_PREFIX}",
    )
    parser.add_argument(
        "--include-breakdowns",
        action="store_true",
        help="Include scenario_simulation_*_0.json style per-scenario breakdown files.",
    )
    parser.add_argument(
        "--embedding-model",
        default=DEFAULT_EMBEDDING_MODEL,
        help=f"OpenAI embedding model. Default: {DEFAULT_EMBEDDING_MODEL}",
    )
    parser.add_argument(
        "--no-embeddings",
        action="store_true",
        help="Skip OpenAI embeddings and use TF-IDF cosine only.",
    )
    return parser.parse_args()


def is_breakdown_file(path: Path) -> bool:
    return bool(re.search(r"_\d+_\d+\.json$", path.name))


def discover_input_files(user_files: list[str], include_breakdowns: bool) -> list[Path]:
    if user_files:
        candidates = [Path(item) for item in user_files]
    else:
        candidates = sorted(Path.cwd().glob("scenario_simulation*.json"))

    files: list[Path] = []
    for path in candidates:
        if not path.exists() or path.suffix.lower() != ".json":
            continue
        if not include_breakdowns and is_breakdown_file(path):
            continue
        files.append(path)
    return sorted(files)


def normalize_text(text: Any) -> str:
    if text is None:
        return ""
    cleaned = str(text).replace("\u2011", "-")
    return re.sub(r"\s+", " ", cleaned).strip()


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9']+", text.lower())


def safe_div(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def compute_bleu_scores(reference: str, candidate: str) -> dict[str, float]:
    ref_tokens = tokenize(reference)
    cand_tokens = tokenize(candidate)
    if not ref_tokens or not cand_tokens:
        return {"bleu1": 0.0, "bleu2": 0.0, "bleu4": 0.0}

    smoothing = SmoothingFunction().method1
    return {
        "bleu1": float(
            sentence_bleu([ref_tokens], cand_tokens, weights=(1.0, 0, 0, 0), smoothing_function=smoothing)
        ),
        "bleu2": float(
            sentence_bleu([ref_tokens], cand_tokens, weights=(0.5, 0.5, 0, 0), smoothing_function=smoothing)
        ),
        "bleu4": float(
            sentence_bleu(
                [ref_tokens],
                cand_tokens,
                weights=(0.25, 0.25, 0.25, 0.25),
                smoothing_function=smoothing,
            )
        ),
    }


def load_rows(files: list[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        config = data.get("config", {})
        for scenario_index, scenario_result in enumerate(data.get("scenarioResults", [])):
            scenario = scenario_result.get("scenario", {})
            original_arguments = {
                item.get("id"): item for item in scenario_result.get("argumentsCreated", []) if item.get("id")
            }

            for topic_eval in scenario_result.get("aiEvaluations", []):
                topic_id = topic_eval.get("topicId", "")
                topic_title = topic_eval.get("title", "")

                for argument_eval in topic_eval.get("arguments", []):
                    ai_analysis = argument_eval.get("aiAnalysis", {})

                    # ── Only include arguments that actually produced a fact ──
                    # In the Consensus Engine pipeline, a Fact document is
                    # created only when aiAnalysis.isFact == true.  Arguments
                    # where isFact is false never generate a fact, so
                    # comparing their aiSummary to the source body would be
                    # meaningless for evaluating fact generation quality.
                    if not ai_analysis.get("isFact"):
                        continue

                    argument_id = argument_eval.get("id", "")
                    original = original_arguments.get(argument_id, {})

                    source_text = normalize_text(original.get("body", ""))
                    generated_text = normalize_text(ai_analysis.get("aiSummary", ""))

                    if not source_text or not generated_text:
                        continue

                    fact_check = argument_eval.get("contentFactCheck", {})
                    verdict = normalize_text(fact_check.get("verdict", "")).lower() or None
                    source_tokens = tokenize(source_text)
                    generated_tokens = tokenize(generated_text)
                    source_vocab = set(source_tokens)
                    novel_tokens = [token for token in generated_tokens if token not in source_vocab]

                    rows.append(
                        {
                            "file": file_path.name,
                            "file_stem": file_path.stem,
                            "scenario_index": scenario_index,
                            "scenario_id": scenario.get("id", "unknown"),
                            "scenario_name": scenario.get("name", "Unknown Scenario"),
                            "scenario_description": scenario.get("description", ""),
                            "run_key": f"{file_path.stem}:{scenario.get('id', scenario_index)}",
                            "model": config.get("model", ""),
                            "provider": config.get("provider", ""),
                            "topic_id": topic_id,
                            "topic_title": topic_title,
                            "argument_id": argument_id,
                            "side": original.get("side", argument_eval.get("side", "")),
                            "category": original.get("category", argument_eval.get("category", "unknown")),
                            "created_by": original.get("createdBy", ""),
                            "source_text": source_text,
                            "generated_text": generated_text,
                            "source_token_count": len(source_tokens),
                            "generated_token_count": len(generated_tokens),
                            "compression_ratio": safe_div(len(generated_tokens), len(source_tokens)),
                            "novel_token_ratio": safe_div(len(novel_tokens), len(generated_tokens)),
                            "ai_justification": normalize_text(
                                ai_analysis.get("justification", "")
                            ),
                            "fact_check_verdict": verdict,
                            "fact_check_confidence": fact_check.get("confidence"),
                            "fact_check_summary": normalize_text(fact_check.get("summary", "")),
                            "has_fact_check": bool(verdict),
                            "supported_verdict": verdict in SUPPORTED_VERDICTS if verdict else False,
                        }
                    )
    return rows


def add_overlap_metrics(df: pd.DataFrame) -> pd.DataFrame:
    scorer = rouge_scorer.RougeScorer(["rouge1", "rouge2", "rougeL"], use_stemmer=True)

    bleu_columns = {"bleu1": [], "bleu2": [], "bleu4": []}
    rouge_columns = {
        "rouge1_precision": [],
        "rouge1_recall": [],
        "rouge1_f1": [],
        "rouge2_precision": [],
        "rouge2_recall": [],
        "rouge2_f1": [],
        "rougeL_precision": [],
        "rougeL_recall": [],
        "rougeL_f1": [],
    }

    for row in df.itertuples(index=False):
        bleu = compute_bleu_scores(row.source_text, row.generated_text)
        for key, value in bleu.items():
            bleu_columns[key].append(value)

        if row.source_text and row.generated_text:
            rouge = scorer.score(row.source_text, row.generated_text)
        else:
            rouge = {
                "rouge1": type("Score", (), {"precision": 0.0, "recall": 0.0, "fmeasure": 0.0})(),
                "rouge2": type("Score", (), {"precision": 0.0, "recall": 0.0, "fmeasure": 0.0})(),
                "rougeL": type("Score", (), {"precision": 0.0, "recall": 0.0, "fmeasure": 0.0})(),
            }

        for metric in ("rouge1", "rouge2", "rougeL"):
            rouge_columns[f"{metric}_precision"].append(float(rouge[metric].precision))
            rouge_columns[f"{metric}_recall"].append(float(rouge[metric].recall))
            rouge_columns[f"{metric}_f1"].append(float(rouge[metric].fmeasure))

    for key, values in bleu_columns.items():
        df[key] = values
    for key, values in rouge_columns.items():
        df[key] = values
    return df


def compute_tfidf_similarity(df: pd.DataFrame) -> list[float]:
    scores: list[float] = []
    for row in df.itertuples(index=False):
        if not row.source_text or not row.generated_text:
            scores.append(0.0)
            continue
        matrix = TfidfVectorizer().fit_transform([row.source_text, row.generated_text])
        sim = cosine_similarity(matrix[0:1], matrix[1:2])[0][0]
        scores.append(float(sim))
    return scores


def add_semantic_similarity(
    df: pd.DataFrame,
    use_embeddings: bool,
    embedding_model_name: str,
) -> tuple[pd.DataFrame, str]:
    tfidf_scores = compute_tfidf_similarity(df)
    df["semantic_similarity_tfidf"] = tfidf_scores

    if not use_embeddings:
        df["semantic_similarity"] = tfidf_scores
        return df, "tfidf"

    try:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")

        client = OpenAI(api_key=api_key)
        sources = df["source_text"].tolist()
        generated = df["generated_text"].tolist()
        source_embeddings = get_openai_embeddings(client, embedding_model_name, sources)
        generated_embeddings = get_openai_embeddings(client, embedding_model_name, generated)

        dot_products = (source_embeddings * generated_embeddings).sum(axis=1)
        source_norms = (source_embeddings * source_embeddings).sum(axis=1) ** 0.5
        generated_norms = (generated_embeddings * generated_embeddings).sum(axis=1) ** 0.5
        similarities = []
        for dot, left_norm, right_norm in zip(dot_products, source_norms, generated_norms):
            denom = float(left_norm * right_norm)
            similarities.append(0.0 if denom == 0 else float(dot / denom))

        df["semantic_similarity"] = similarities
        return df, f"openai:{embedding_model_name}"
    except Exception as exc:
        print(
            f"Warning: embedding model '{embedding_model_name}' could not be loaded ({exc}). Falling back to TF-IDF cosine.",
            file=sys.stderr,
        )
        df["semantic_similarity"] = tfidf_scores
        return df, "tfidf"


def get_openai_embeddings(
    client: OpenAI, model_name: str, texts: list[str], batch_size: int = 128
) -> np.ndarray:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        response = client.embeddings.create(model=model_name, input=batch)
        vectors.extend(item.embedding for item in response.data)
    return np.asarray(vectors, dtype=float)


def supported_rate(group: pd.DataFrame) -> float:
    """Proportion of fact-checked items with a 'verified' or 'mixed' verdict."""
    checked = group[group["has_fact_check"]]
    if checked.empty:
        return math.nan
    return float(checked["supported_verdict"].mean())


def overall_row(df: pd.DataFrame) -> dict[str, Any]:
    return build_summary_record(df, "overall", "all", "All fact-producing arguments across selected files")


def build_summary_record(group: pd.DataFrame, group_type: str, group_key: str, group_label: str) -> dict[str, Any]:
    fact_checked = group[group["has_fact_check"]]

    return {
        "group_type": group_type,
        "group_key": group_key,
        "group_label": group_label,
        "facts_evaluated": int(len(group)),
        "files": int(group["file"].nunique()),
        "runs": int(group["run_key"].nunique()),
        "topics": int(group["topic_id"].nunique()),
        "avg_source_tokens": float(group["source_token_count"].mean()),
        "avg_generated_tokens": float(group["generated_token_count"].mean()),
        "avg_compression_ratio": float(group["compression_ratio"].mean()),
        "avg_novel_token_ratio": float(group["novel_token_ratio"].mean()),
        "avg_bleu1": float(group["bleu1"].mean()),
        "avg_bleu2": float(group["bleu2"].mean()),
        "avg_bleu4": float(group["bleu4"].mean()),
        "avg_rouge1_precision": float(group["rouge1_precision"].mean()),
        "avg_rouge1_recall": float(group["rouge1_recall"].mean()),
        "avg_rouge1_f1": float(group["rouge1_f1"].mean()),
        "avg_rouge2_precision": float(group["rouge2_precision"].mean()),
        "avg_rouge2_recall": float(group["rouge2_recall"].mean()),
        "avg_rouge2_f1": float(group["rouge2_f1"].mean()),
        "avg_rougeL_precision": float(group["rougeL_precision"].mean()),
        "avg_rougeL_recall": float(group["rougeL_recall"].mean()),
        "avg_rougeL_f1": float(group["rougeL_f1"].mean()),
        "avg_semantic_similarity": float(group["semantic_similarity"].mean()),
        "avg_semantic_similarity_tfidf": float(group["semantic_similarity_tfidf"].mean()),
        "fact_checked_count": int(len(fact_checked)),
        "fact_checked_rate": float(group["has_fact_check"].mean()),
        "verified_rate": float((group["fact_check_verdict"] == "verified").mean()),
        "mixed_rate": float((group["fact_check_verdict"] == "mixed").mean()),
        "inaccurate_rate": float((group["fact_check_verdict"] == "inaccurate").mean()),
        "unverified_rate": float((group["fact_check_verdict"] == "unverified").mean()),
        "supported_rate": supported_rate(group),
    }


def build_summary_tables(df: pd.DataFrame) -> pd.DataFrame:
    summary_rows: list[dict[str, Any]] = [overall_row(df)]

    for file_name, group in df.groupby("file", sort=True):
        summary_rows.append(build_summary_record(group, "file", file_name, file_name))

    for scenario_id, group in df.groupby("scenario_id", sort=True):
        label = str(group["scenario_name"].iloc[0])
        summary_rows.append(build_summary_record(group, "scenario", scenario_id, label))

    for run_key, group in df.groupby("run_key", sort=True):
        label = f"{group['file'].iloc[0]} | {group['scenario_name'].iloc[0]}"
        summary_rows.append(build_summary_record(group, "run", run_key, label))

    for category, group in df.groupby("category", sort=True):
        summary_rows.append(build_summary_record(group, "category", category, category))

    return pd.DataFrame(summary_rows)


def write_outputs(df: pd.DataFrame, summary_df: pd.DataFrame, prefix: str, metadata: dict[str, Any]) -> dict[str, Path]:
    row_csv = Path(f"{prefix}_rows.csv")
    summary_csv = Path(f"{prefix}_summary.csv")
    summary_json = Path(f"{prefix}_summary.json")

    df.to_csv(row_csv, index=False)
    summary_df.to_csv(summary_csv, index=False)
    summary_json.write_text(
        json.dumps(
            {
                "metadata": metadata,
                "summary": summary_df.to_dict(orient="records"),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return {
        "rows_csv": row_csv,
        "summary_csv": summary_csv,
        "summary_json": summary_json,
    }


def print_terminal_summary(summary_df: pd.DataFrame, metadata: dict[str, Any]) -> None:
    overall = summary_df[summary_df["group_type"] == "overall"].iloc[0]
    scenario_rows = summary_df[summary_df["group_type"] == "scenario"].copy()

    print("\nFact generation evaluation")
    print("=" * 28)
    print(f"Files processed:      {metadata['file_count']}")
    print(f"Facts evaluated:      {int(overall['facts_evaluated'])}")
    print(f"  (only isFact=true arguments that actually produced a fact)")
    print(f"Embedding method:     {metadata['semantic_method']}")
    print()
    print("Overall metrics")
    print(f"  BLEU-1:             {overall['avg_bleu1']:.4f}")
    print(f"  BLEU-2:             {overall['avg_bleu2']:.4f}")
    print(f"  BLEU-4:             {overall['avg_bleu4']:.4f}")
    print(f"  ROUGE-1 F1:         {overall['avg_rouge1_f1']:.4f}")
    print(f"  ROUGE-2 F1:         {overall['avg_rouge2_f1']:.4f}")
    print(f"  ROUGE-L F1:         {overall['avg_rougeL_f1']:.4f}")
    print(f"  Semantic similarity:{overall['avg_semantic_similarity']:.4f}")
    print(f"  Compression ratio:  {overall['avg_compression_ratio']:.4f}")
    print(f"  Novel token ratio:  {overall['avg_novel_token_ratio']:.4f}")
    if not math.isnan(overall['supported_rate']):
        print(f"  Supported rate:     {overall['supported_rate']:.4f}")
        print(f"    (of fact-checked items, proportion with 'verified' or 'mixed' verdict)")

    print()
    print("Scenario summary")
    for row in scenario_rows.sort_values("group_key").itertuples(index=False):
        supported = f", Supported={row.supported_rate:.4f}" if not math.isnan(row.supported_rate) else ""
        print(
            f"  {row.group_key}: BLEU-4={row.avg_bleu4:.4f}, "
            f"ROUGE-L F1={row.avg_rougeL_f1:.4f}, "
            f"Semantic={row.avg_semantic_similarity:.4f}"
            f"{supported}, n={int(row.facts_evaluated)}"
        )


def main() -> int:
    args = parse_args()
    files = discover_input_files(args.files, args.include_breakdowns)
    if not files:
        print("No scenario simulation JSON files found.", file=sys.stderr)
        return 1

    rows = load_rows(files)
    if not rows:
        print("No fact-producing arguments (isFact=true) found in the selected files.", file=sys.stderr)
        return 1

    df = pd.DataFrame(rows)
    df = add_overlap_metrics(df)
    df, semantic_method = add_semantic_similarity(
        df,
        use_embeddings=not args.no_embeddings,
        embedding_model_name=args.embedding_model,
    )
    summary_df = build_summary_tables(df)

    metadata = {
        "file_count": len(files),
        "files": [path.name for path in files],
        "row_count": int(len(df)),
        "semantic_method": semantic_method,
        "output_prefix": args.output_prefix,
    }
    outputs = write_outputs(df, summary_df, args.output_prefix, metadata)
    print_terminal_summary(summary_df, metadata)

    print()
    print("Output files")
    print(f"  Rows CSV:    {outputs['rows_csv']}")
    print(f"  Summary CSV: {outputs['summary_csv']}")
    print(f"  Summary JSON:{outputs['summary_json']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
