#!/usr/bin/env python3
"""
report_fact_updates.py
======================
Script to evaluate the quality of fact updates from existing
fact_voting_simulation_*.json result files.

Reads the simulation JSON to find which facts were updated/removed,
then queries MongoDB to fetch the reassessment history (before/after text,
AI rationale, model used) and the vote reasons that triggered the change.

Usage
-----
    python3 report_fact_updates.py <file.json> [<file2.json> ...]
    python3 report_fact_updates.py fact_voting_simulation_*.json
    python3 report_fact_updates.py <file.json> --html

Options
-------
    --html          Write an HTML report alongside terminal output
    --no-color      Disable ANSI colours
"""

import json
import sys
import os
from pathlib import Path
from datetime import datetime
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
    pass  # .env loading is optional

# ─── ANSI colours ────────────────────────────────────────────────────────────

USE_COLOR = True

def _c(code: str) -> str:
    return f"\033[{code}m" if USE_COLOR else ""

RESET  = lambda: _c("0")
BOLD   = lambda: _c("1")
DIM    = lambda: _c("2")
RED    = lambda: _c("31")
GREEN  = lambda: _c("32")
YELLOW = lambda: _c("33")
CYAN   = lambda: _c("36")
MAGENTA = lambda: _c("35")

def bold(s: str) -> str: return f"{BOLD()}{s}{RESET()}"
def dim(s: str) -> str: return f"{DIM()}{s}{RESET()}"
def red(s: str) -> str: return f"{RED()}{s}{RESET()}"
def green(s: str) -> str: return f"{GREEN()}{s}{RESET()}"
def yellow(s: str) -> str: return f"{YELLOW()}{s}{RESET()}"
def cyan(s: str) -> str: return f"{CYAN()}{s}{RESET()}"
def magenta(s: str) -> str: return f"{MAGENTA()}{s}{RESET()}"

def hr(width: int = 80, char: str = "─") -> str:
    return dim(char * width)

# ─── MongoDB helpers ─────────────────────────────────────────────────────────

def get_mongo_db():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        print("Error: MONGODB_URI not set. Add it to .env or export it.", file=sys.stderr)
        sys.exit(1)
    client = MongoClient(uri)
    db_name = uri.rsplit("/", 1)[-1].split("?")[0]
    return client[db_name]


def fetch_fact_details(db, fact_ids: list[str]) -> dict[str, dict]:
    """Fetch facts with their reassessmentHistory from MongoDB."""
    from bson import ObjectId
    oids = [ObjectId(fid) for fid in fact_ids]
    facts = db.facts.find(
        {"_id": {"$in": oids}},
        {"text": 1, "reassessmentHistory": 1, "upvoteCount": 1,
         "downvoteCount": 1, "score": 1, "status": 1, "topic": 1}
    )
    return {str(f["_id"]): f for f in facts}


def fetch_vote_reasons(db, fact_ids: list[str]) -> dict[str, list[dict]]:
    """Fetch vote reasons for the given facts from MongoDB."""
    from bson import ObjectId
    oids = [ObjectId(fid) for fid in fact_ids]
    votes = db.factvotes.find(
        {"fact": {"$in": oids}, "reason": {"$exists": True, "$ne": ""}},
        {"fact": 1, "value": 1, "reason": 1}
    ).sort("value", 1)  # downvotes first
    result: dict[str, list[dict]] = {fid: [] for fid in fact_ids}
    for v in votes:
        fid = str(v["fact"])
        if fid in result:
            result[fid].append({
                "value": v["value"],
                "reason": v.get("reason", ""),
            })
    return result


# ─── Data extraction ─────────────────────────────────────────────────────────

def extract_updated_facts(data: dict) -> list[dict]:
    """Extract fact IDs that were updated or removed from simulation results."""
    updated = []
    for r in data.get("scenarioResults", []):
        scenario = r.get("scenario", {})

        # Build a lookup of original text from factsTargeted
        originals = {}
        for ft in r.get("factsTargeted", []):
            originals[ft["factId"]] = ft.get("originalText", "")

        for ra in r.get("reassessmentResults", []):
            if ra.get("skipped") or ra.get("action") not in ("updated", "removed", "kept"):
                continue
            updated.append({
                "factId": ra["factId"],
                "action": ra["action"],
                "scenarioName": scenario.get("name", "?"),
                "scenarioExpected": scenario.get("expectedOutcome", "?"),
                "originalTextFromSim": originals.get(ra["factId"], ""),
            })
    return updated


# ─── Terminal report ─────────────────────────────────────────────────────────

def wrap_text(text: str, indent: int = 6, width: int = 100) -> str:
    """Wrap long text with indentation."""
    lines = []
    prefix = " " * indent
    while text:
        if len(text) <= width:
            lines.append(text)
            break
        # Find last space before width
        idx = text.rfind(" ", 0, width)
        if idx == -1:
            idx = width
        lines.append(text[:idx])
        text = text[idx:].lstrip()
    return ("\n" + prefix).join(lines)


def print_report(entries: list[dict], facts_db: dict, votes_db: dict) -> None:
    total_updated = sum(1 for e in entries if e["action"] == "updated")
    total_removed = sum(1 for e in entries if e["action"] == "removed")
    total_kept = sum(1 for e in entries if e["action"] == "kept")

    print()
    print(bold("╔══════════════════════════════════════════════════════════════════════════════╗"))
    print(bold("║") + cyan(bold("  FACT UPDATE QUALITY EVALUATION".center(76))) + bold("║"))
    print(bold("╚══════════════════════════════════════════════════════════════════════════════╝"))
    print()
    print(f"  Facts processed: {bold(str(len(entries)))}"
          f"  (updated: {yellow(str(total_updated))}"
          f", removed: {red(str(total_removed))}"
          f", kept: {green(str(total_kept))})")
    print()

    # Group by scenario
    by_scenario: dict[str, list[dict]] = {}
    for e in entries:
        key = e["scenarioName"]
        by_scenario.setdefault(key, []).append(e)

    for scenario_name, scenario_entries in by_scenario.items():
        expected = scenario_entries[0]["scenarioExpected"]
        print(hr())
        print(f"  {bold(cyan(scenario_name))}")
        print(f"  Expected outcome: {bold(expected)}")
        print()

        for i, entry in enumerate(scenario_entries, 1):
            fid = entry["factId"]
            action = entry["action"]
            fact = facts_db.get(fid, {})
            reasons = votes_db.get(fid, [])
            history = fact.get("reassessmentHistory", [])

            action_str = (
                yellow("UPDATED") if action == "updated"
                else red("REMOVED") if action == "removed"
                else green("KEPT")
            )

            print(f"  {bold(f'[{i}]')} Fact {dim(fid[:16]+'…')}  →  {action_str}")

            if not history:
                print(f"      {dim('(no reassessment history found in DB)')}")
                print()
                continue

            # Find the most recent reassessment matching this action
            relevant = [h for h in history if h.get("action") == action]
            latest = relevant[-1] if relevant else history[-1]

            # Original text
            prev_text = latest.get("previousText", entry.get("originalTextFromSim", ""))
            current_text = fact.get("text", "")

            if action == "updated":
                print(f"      {red('BEFORE:')} {wrap_text(prev_text, 14)}")
                print(f"      {green('AFTER:')}  {wrap_text(current_text, 14)}")
            elif action == "removed":
                print(f"      {red('TEXT:')}   {wrap_text(prev_text or current_text, 14)}")
            elif action == "kept":
                print(f"      {green('TEXT:')}   {wrap_text(current_text, 14)}")

            # AI rationale
            rationale = latest.get("rationale", "")
            model = latest.get("model", "")
            if rationale:
                print(f"      {magenta('REASON:')} {wrap_text(rationale, 14)}")
            if model:
                print(f"      {dim(f'Model: {model}')}")

            # Vote context
            up_with_reason = [r for r in reasons if r["value"] == 1 and r["reason"]]
            down_with_reason = [r for r in reasons if r["value"] == -1 and r["reason"]]
            votes_up = fact.get("upvoteCount", 0)
            votes_down = fact.get("downvoteCount", 0)

            print(f"      {dim(f'Votes: ↑{votes_up} ↓{votes_down}  |  Reasons: ↑{len(up_with_reason)} ↓{len(down_with_reason)}')}")

            # Show top vote reasons
            if down_with_reason:
                print(f"      {dim('Top downvote reasons:')}")
                seen = set()
                shown = 0
                for r in down_with_reason:
                    if r["reason"] not in seen and shown < 3:
                        seen.add(r["reason"])
                        shown += 1
                        print(f"        {red('↓')} {wrap_text(r['reason'][:200], 10)}")

            if up_with_reason:
                print(f"      {dim('Top upvote reasons:')}")
                seen = set()
                shown = 0
                for r in up_with_reason:
                    if r["reason"] not in seen and shown < 3:
                        seen.add(r["reason"])
                        shown += 1
                        print(f"        {green('↑')} {wrap_text(r['reason'][:200], 10)}")

            print()

    print(hr())
    print()


# ─── HTML export ─────────────────────────────────────────────────────────────

def export_html(entries: list[dict], facts_db: dict, votes_db: dict, path_obj: Path) -> None:
    rows_html = ""
    for entry in entries:
        fid = entry["factId"]
        action = entry["action"]
        fact = facts_db.get(fid, {})
        reasons = votes_db.get(fid, [])
        history = fact.get("reassessmentHistory", [])

        relevant = [h for h in history if h.get("action") == action]
        latest = relevant[-1] if relevant else (history[-1] if history else {})

        prev_text = latest.get("previousText", entry.get("originalTextFromSim", ""))
        current_text = fact.get("text", "")
        rationale = latest.get("rationale", "")
        model = latest.get("model", "")

        action_color = "#facc15" if action == "updated" else "#f87171" if action == "removed" else "#4ade80"

        down_reasons = [r for r in reasons if r["value"] == -1 and r["reason"]]
        up_reasons = [r for r in reasons if r["value"] == 1 and r["reason"]]

        # Deduplicate reasons
        seen_down, unique_down = set(), []
        for r in down_reasons:
            if r["reason"] not in seen_down:
                seen_down.add(r["reason"])
                unique_down.append(r["reason"])
        seen_up, unique_up = set(), []
        for r in up_reasons:
            if r["reason"] not in seen_up:
                seen_up.add(r["reason"])
                unique_up.append(r["reason"])

        reasons_html = ""
        for r in unique_down[:5]:
            reasons_html += f'<div style="color:#f87171">↓ {_html_escape(r[:200])}</div>'
        for r in unique_up[:5]:
            reasons_html += f'<div style="color:#4ade80">↑ {_html_escape(r[:200])}</div>'

        rows_html += f"""
        <tr>
          <td>{_html_escape(entry['scenarioName'][:40])}</td>
          <td style="font-family:monospace;font-size:0.75rem">{fid[:16]}…</td>
          <td style="color:{action_color};font-weight:bold">{action}</td>
          <td>{_html_escape(prev_text[:300])}</td>
          <td>{_html_escape(current_text[:300]) if action == 'updated' else '—'}</td>
          <td>{_html_escape(rationale[:300])}</td>
          <td style="font-size:0.75rem">{model}</td>
          <td>↑{fact.get('upvoteCount',0)} ↓{fact.get('downvoteCount',0)}</td>
          <td style="font-size:0.75rem">{reasons_html}</td>
        </tr>"""

    total_updated = sum(1 for e in entries if e["action"] == "updated")
    total_removed = sum(1 for e in entries if e["action"] == "removed")
    total_kept = sum(1 for e in entries if e["action"] == "kept")

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fact Update Quality Evaluation</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 2rem; }}
    h1 {{ font-size: 1.8rem; color: #38bdf8; margin-bottom: 0.3rem; }}
    h2 {{ font-size: 1.3rem; color: #7dd3fc; margin: 2rem 0 0.8rem; border-bottom: 1px solid #1e3a5f; padding-bottom: 0.4rem; }}
    .meta {{ color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }}
    .summary {{ background: #0d1f3c; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem 0; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-bottom: 1.5rem; }}
    th {{ background: #1e293b; color: #94a3b8; text-align: left; padding: 0.5rem 0.6rem; border-bottom: 2px solid #334155; font-weight: 600; position: sticky; top: 0; }}
    td {{ padding: 0.5rem 0.6rem; border-bottom: 1px solid #1e293b; vertical-align: top; }}
    tr:hover td {{ background: #1e293b; }}
    .updated {{ color: #facc15; }}
    .removed {{ color: #f87171; }}
    .kept {{ color: #4ade80; }}
  </style>
</head>
<body>
  <h1>Fact Update Quality Evaluation</h1>
  <div class="summary">
    <p>Facts processed: {len(entries)} &nbsp;|&nbsp;
       <span class="updated">Updated: {total_updated}</span> &nbsp;|&nbsp;
       <span class="removed">Removed: {total_removed}</span> &nbsp;|&nbsp;
       <span class="kept">Kept: {total_kept}</span></p>
  </div>

  <h2>Reassessment Details</h2>
  <table>
    <thead><tr>
      <th>Scenario</th><th>Fact ID</th><th>Action</th>
      <th>Before</th><th>After</th><th>AI Rationale</th>
      <th>Model</th><th>Votes</th><th>User Reasons</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
</body>
</html>"""

    with open(path_obj, "w", encoding="utf-8") as f:
        f.write(html)
    print(green(f"  ✓ HTML saved → {path_obj}"))


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    global USE_COLOR

    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    json_paths = []
    do_html = False

    for arg in args:
        if arg == "--html":
            do_html = True
        elif arg == "--no-color":
            USE_COLOR = False
        elif not arg.startswith("-"):
            json_paths.append(arg)

    if not json_paths:
        print("Error: no JSON file(s) specified.", file=sys.stderr)
        sys.exit(1)

    # Load simulation results and extract updated facts
    all_entries: list[dict] = []
    for json_path in json_paths:
        try:
            with open(json_path, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            print(f"Error: file not found: {json_path}", file=sys.stderr)
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: invalid JSON in {json_path} — {e}", file=sys.stderr)
            sys.exit(1)

        entries = extract_updated_facts(data)
        if not entries:
            print(f"  {json_path}: no processed facts found", file=sys.stderr)
        all_entries.extend(entries)

    if not all_entries:
        print("No updated/removed/kept facts found in any file.")
        sys.exit(0)

    fact_ids = list({e["factId"] for e in all_entries})
    print(f"  Found {len(all_entries)} processed facts across {len(json_paths)} file(s)")
    print(f"  Connecting to MongoDB...")

    db = get_mongo_db()
    facts_db = fetch_fact_details(db, fact_ids)
    votes_db = fetch_vote_reasons(db, fact_ids)

    found = len([fid for fid in fact_ids if fid in facts_db])
    print(f"  Fetched {found}/{len(fact_ids)} facts from DB")

    print_report(all_entries, facts_db, votes_db)

    if do_html:
        if len(json_paths) == 1:
            base = Path(json_paths[0]).with_suffix("")
        else:
            base = Path(json_paths[0]).parent / "fact_update_evaluation"
        export_html(all_entries, facts_db, votes_db, base.with_suffix(".evaluation.html"))

    print()


if __name__ == "__main__":
    main()
