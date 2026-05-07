#!/usr/bin/env python3
"""
enrich_fact_results.py
======================
Enrich fact_voting_simulation_*.json result files with:
  - Reassessment text data from MongoDB (before/after text, rationale, model)
  - LLM-evaluated "reasonableUpdate" flag for each updated/removed fact
  - Adjusted outcome match that accounts for reasonable updates

Usage
-----
    python3 enrich_fact_results.py fact_voting_simulation_*.json
    python3 enrich_fact_results.py <file.json>                    # single file
    python3 enrich_fact_results.py <file.json> --dry-run          # preview without writing

Options
-------
    --dry-run       Show what would change without writing files
    --no-llm        Skip LLM evaluation, only enrich with MongoDB data
"""

import json
import sys
import os
import time
from pathlib import Path
from typing import Any

try:
    from pymongo import MongoClient
except ImportError:
    print("Error: pymongo is required. Install with: pip install pymongo", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore


# ─── MongoDB helpers ─────────────────────────────────────────────────────────

def get_mongo_db():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("Error: MONGODB_URI not set. Add it to .env or export it.", file=sys.stderr)
        sys.exit(1)
    client = MongoClient(uri)
    db_name = uri.rsplit("/", 1)[-1].split("?")[0]
    return client[db_name]


def fetch_facts(db, fact_ids: list[str]) -> dict[str, dict]:
    from bson import ObjectId
    oids = [ObjectId(fid) for fid in fact_ids]
    facts = db.facts.find(
        {"_id": {"$in": oids}},
        {"text": 1, "reassessmentHistory": 1, "upvoteCount": 1,
         "downvoteCount": 1, "status": 1}
    )
    return {str(f["_id"]): f for f in facts}


def fetch_vote_reasons(db, fact_ids: list[str]) -> dict[str, list[dict]]:
    from bson import ObjectId
    oids = [ObjectId(fid) for fid in fact_ids]
    votes = db.factvotes.find(
        {"fact": {"$in": oids}, "reason": {"$exists": True, "$ne": ""}},
        {"fact": 1, "value": 1, "reason": 1}
    ).sort("value", 1)
    result: dict[str, list[dict]] = {fid: [] for fid in fact_ids}
    for v in votes:
        fid = str(v["fact"])
        if fid in result:
            result[fid].append({"value": v["value"], "reason": v.get("reason", "")})
    return result


# ─── LLM evaluation ─────────────────────────────────────────────────────────

def evaluate_reasonableness(
    client: Any,
    model: str,
    scenario_name: str,
    scenario_description: str,
    expected_outcome: str,
    original_text: str,
    updated_text: str,
    ai_rationale: str,
    action: str,
    vote_reasons: list[dict],
) -> tuple[bool, str]:
    """Use LLM to evaluate whether a fact update/removal was reasonable."""

    # Format vote reasons
    down_reasons = [r["reason"] for r in vote_reasons if r["value"] == -1][:5]
    up_reasons = [r["reason"] for r in vote_reasons if r["value"] == 1][:5]
    vote_context = ""
    if down_reasons:
        vote_context += "Downvote reasons:\n" + "\n".join(f"  - {r}" for r in down_reasons) + "\n"
    if up_reasons:
        vote_context += "Upvote reasons:\n" + "\n".join(f"  - {r}" for r in up_reasons) + "\n"

    prompt = f"""You are evaluating whether an AI fact-checker's decision was reasonable.

SCENARIO CONTEXT:
- Scenario: {scenario_name}
- Description: {scenario_description}
- Expected outcome for this scenario: {expected_outcome}
- Actual AI action: {action}

FACT TEXT (BEFORE):
{original_text}

{"FACT TEXT (AFTER):" if action == "updated" else ""}
{updated_text if action == "updated" else ""}

AI'S RATIONALE FOR THE {action.upper()}:
{ai_rationale}

COMMUNITY VOTE REASONS:
{vote_context if vote_context else "(no reasons provided)"}

EVALUATION CRITERIA:
- The expected outcome is what the simulation *hoped* would happen, but reality is nuanced.
- An update to an accurate fact IS reasonable if: the AI improved clarity, added precision, fixed minor wording issues, or added important context — even if the scenario expected the fact to be "kept" unchanged.
- An update to a fabricated fact IS reasonable if: the AI corrected the misinformation to be accurate, even if the scenario expected "removed" — fixing is arguably better than deleting.
- An update is NOT reasonable if: it introduced inaccuracies, removed correct information, made the fact worse, or was an unjustified change.
- A removal is reasonable if the fact was genuinely fabricated or harmful. Not reasonable if the fact was accurate.

Answer with a JSON object only:
{{"reasonable": true/false, "explanation": "one sentence explanation"}}"""

    try:
        response = client.responses.create(
            model=model,
            input=prompt,
        )
        text = response.output_text.strip()
        # Parse JSON from response
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        result = json.loads(text)
        return bool(result.get("reasonable", False)), result.get("explanation", "")
    except Exception as e:
        print(f"    Warning: LLM evaluation failed: {e}", file=sys.stderr)
        return False, f"LLM evaluation failed: {e}"


# ─── Enrichment logic ────────────────────────────────────────────────────────

def enrich_file(file_path: str, dry_run: bool = False, use_llm: bool = True) -> dict:
    """Enrich a single result file. Returns summary stats."""
    with open(file_path, encoding="utf-8") as f:
        data = json.load(f)

    results = data.get("scenarioResults", [])
    if not results:
        print(f"  Skipping {file_path}: no scenarioResults")
        return {"file": file_path, "enriched": 0, "reasonable": 0, "unreasonable": 0}

    # Collect all fact IDs that were processed (not skipped)
    all_fact_ids: set[str] = set()
    for r in results:
        for ra in r.get("reassessmentResults", []):
            if not ra.get("skipped"):
                all_fact_ids.add(ra["factId"])

    if not all_fact_ids:
        print(f"  Skipping {file_path}: no processed facts")
        return {"file": file_path, "enriched": 0, "reasonable": 0, "unreasonable": 0}

    # Fetch data from MongoDB
    print(f"  Querying MongoDB for {len(all_fact_ids)} facts...")
    db = get_mongo_db()
    facts_db = fetch_facts(db, list(all_fact_ids))
    votes_db = fetch_vote_reasons(db, list(all_fact_ids))
    print(f"  Fetched {len(facts_db)}/{len(all_fact_ids)} facts from DB")

    # Setup LLM client
    llm_client = None
    llm_model = os.environ.get("OPENAI_RESPONSES_MODEL", "gpt-5.5").strip('"')
    if use_llm and OpenAI:
        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            llm_client = OpenAI(api_key=api_key)
            print(f"  Using {llm_model} for reasonableness evaluation")
        else:
            print("  Warning: OPENAI_API_KEY not set, skipping LLM evaluation")
    elif use_llm and not OpenAI:
        print("  Warning: openai package not installed, skipping LLM evaluation")

    stats = {"file": file_path, "enriched": 0, "reasonable": 0, "unreasonable": 0}

    for r in results:
        scenario = r.get("scenario", {})
        expected = scenario.get("expectedOutcome", "")
        scenario_name = scenario.get("name", "")
        scenario_desc = scenario.get("description", "")

        # Build original text lookup from factsTargeted
        originals = {}
        for ft in r.get("factsTargeted", []):
            originals[ft["factId"]] = ft.get("originalText", "")

        for ra in r.get("reassessmentResults", []):
            if ra.get("skipped") or ra.get("error"):
                continue

            fid = ra["factId"]
            fact = facts_db.get(fid, {})
            history = fact.get("reassessmentHistory", [])
            action = ra.get("action", "")

            # Find the matching reassessment history entry
            relevant = [h for h in history if h.get("action") == action]
            latest = relevant[-1] if relevant else (history[-1] if history else {})

            # Enrich with text data from MongoDB
            prev_text = latest.get("previousText", originals.get(fid, ""))
            current_text = fact.get("text", "")
            rationale = latest.get("rationale", "")
            model = latest.get("model", "")

            ra["previousText"] = prev_text
            ra["updatedText"] = current_text if action == "updated" else None
            ra["rationale"] = rationale
            ra["model"] = model

            # Evaluate reasonableness for non-matching actions
            needs_evaluation = (
                (expected == "kept" and action in ("updated", "removed"))
                or (expected == "removed" and action in ("updated", "kept"))
                or (expected == "updated" and action in ("kept", "removed"))
            )

            if needs_evaluation and llm_client:
                print(f"    Evaluating fact {fid[:16]}… ({action} vs expected {expected})")
                reasonable, explanation = evaluate_reasonableness(
                    client=llm_client,
                    model=llm_model,
                    scenario_name=scenario_name,
                    scenario_description=scenario_desc,
                    expected_outcome=expected,
                    original_text=prev_text or originals.get(fid, ""),
                    updated_text=current_text if action == "updated" else "",
                    ai_rationale=rationale,
                    action=action,
                    vote_reasons=votes_db.get(fid, []),
                )
                ra["reasonableUpdate"] = reasonable
                ra["reasonableUpdateExplanation"] = explanation
                if reasonable:
                    stats["reasonable"] += 1
                else:
                    stats["unreasonable"] += 1
                print(f"      → {'✓ Reasonable' if reasonable else '✗ Not reasonable'}: {explanation}")
                time.sleep(0.5)  # Rate limiting
            elif needs_evaluation and not llm_client:
                ra["reasonableUpdate"] = None
                ra["reasonableUpdateExplanation"] = "LLM evaluation not available"
            else:
                # Action matches expected — inherently reasonable
                ra["reasonableUpdate"] = True
                ra["reasonableUpdateExplanation"] = "Action matches expected scenario outcome"
                stats["reasonable"] += 1

            stats["enriched"] += 1

        # Recompute metrics with adjusted match
        _recompute_metrics(r)

    if not dry_run:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"  ✓ Written: {file_path}")
    else:
        print(f"  [dry-run] Would write: {file_path}")

    return stats


def _recompute_metrics(scenario_result: dict) -> None:
    """Recompute metrics including adjustedOutcomeMatch."""
    expected = scenario_result.get("scenario", {}).get("expectedOutcome", "")
    reassessments = scenario_result.get("reassessmentResults", [])
    processed = [r for r in reassessments if not r.get("skipped") and not r.get("error")]

    kept = sum(1 for r in processed if r.get("action") == "kept")
    updated = sum(1 for r in processed if r.get("action") == "updated")
    removed = sum(1 for r in processed if r.get("action") == "removed")

    # Count reasonable updates that don't match expected outcome
    reasonable_mismatches = sum(
        1 for r in processed
        if r.get("reasonableUpdate") is True
        and not _action_matches_expected(r.get("action", ""), expected)
    )

    # Original match logic
    if expected == "kept":
        original_match = kept > 0 and removed == 0
    elif expected == "updated":
        original_match = updated > 0
    elif expected == "removed":
        original_match = removed > 0
    else:
        original_match = True

    # Adjusted match: also true if all mismatching actions were reasonable
    if original_match:
        adjusted_match = True
    else:
        # Count non-matching, non-reasonable processed facts
        unreasonable_mismatches = sum(
            1 for r in processed
            if not _action_matches_expected(r.get("action", ""), expected)
            and r.get("reasonableUpdate") is not True
        )
        # If there are processed facts and all mismatches are reasonable, it's an adjusted match
        if len(processed) > 0 and unreasonable_mismatches == 0:
            adjusted_match = True
        else:
            adjusted_match = original_match

    metrics = scenario_result.get("metrics", {})
    metrics["adjustedOutcomeMatch"] = adjusted_match
    metrics["reasonableUpdates"] = reasonable_mismatches
    scenario_result["metrics"] = metrics


def _action_matches_expected(action: str, expected: str) -> bool:
    if expected == "kept":
        return action == "kept"
    elif expected == "updated":
        return action == "updated"
    elif expected == "removed":
        return action == "removed"
    return True


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    json_paths = []
    dry_run = False
    use_llm = True

    for arg in args:
        if arg == "--dry-run":
            dry_run = True
        elif arg == "--no-llm":
            use_llm = False
        elif not arg.startswith("-"):
            json_paths.append(arg)

    if not json_paths:
        print("Error: no JSON file(s) specified.", file=sys.stderr)
        sys.exit(1)

    print(f"\n{'='*60}")
    print(f"  Enriching {len(json_paths)} result file(s)")
    if dry_run:
        print(f"  Mode: DRY RUN (no files will be modified)")
    if not use_llm:
        print(f"  Mode: NO LLM (text data only, no reasonableness evaluation)")
    print(f"{'='*60}\n")

    all_stats = []
    for path in json_paths:
        print(f"\n📄 {Path(path).name}")
        try:
            stats = enrich_file(path, dry_run=dry_run, use_llm=use_llm)
            all_stats.append(stats)
        except Exception as e:
            print(f"  Error: {e}", file=sys.stderr)
            all_stats.append({"file": path, "enriched": 0, "reasonable": 0, "unreasonable": 0})

    # Summary
    total_enriched = sum(s["enriched"] for s in all_stats)
    total_reasonable = sum(s["reasonable"] for s in all_stats)
    total_unreasonable = sum(s["unreasonable"] for s in all_stats)

    print(f"\n{'='*60}")
    print(f"  SUMMARY")
    print(f"  Facts enriched:   {total_enriched}")
    print(f"  Reasonable:       {total_reasonable}")
    print(f"  Not reasonable:   {total_unreasonable}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
