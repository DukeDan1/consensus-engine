#!/usr/bin/env python3
"""
report_fact_voting.py
=====================
Analyse a fact_voting_simulation_<timestamp>.json report produced by
simulateFactVoting.ts and print a human-readable evaluation of how
effectively the fact voting and reassessment pipeline performed.

Supports single or multiple JSON files — when given multiple files, combines
all scenario results into a unified report.

Usage
-----
    python3 report_fact_voting.py <file.json>                              # single file
    python3 report_fact_voting.py <file1.json> <file2.json> ...            # multiple files
    python3 report_fact_voting.py <file.json> --html                       # save HTML
    python3 report_fact_voting.py <file.json> --csv                        # save CSV
    python3 report_fact_voting.py <file1.json> <file2.json> --all          # combine + export

Options
-------
    --html          Write HTML report alongside the JSON file (or as .combined.html)
    --csv           Write CSV report alongside the JSON file (or as .combined.csv)
    --all           Enable --html and --csv
    --no-color      Disable ANSI colours in terminal output
"""

import json
import sys
import os
import csv
from pathlib import Path
from datetime import datetime
from typing import Any

# ─── ANSI colours ────────────────────────────────────────────────────────────

USE_COLOR = True


def _c(code: str) -> str:
    return f"\033[{code}m" if USE_COLOR else ""


RESET = lambda: _c("0")
BOLD = lambda: _c("1")
DIM = lambda: _c("2")
RED = lambda: _c("31")
GREEN = lambda: _c("32")
YELLOW = lambda: _c("33")
CYAN = lambda: _c("36")


def bold(s: str) -> str:
    return f"{BOLD()}{s}{RESET()}"


def dim(s: str) -> str:
    return f"{DIM()}{s}{RESET()}"


def red(s: str) -> str:
    return f"{RED()}{s}{RESET()}"


def green(s: str) -> str:
    return f"{GREEN()}{s}{RESET()}"


def yellow(s: str) -> str:
    return f"{YELLOW()}{s}{RESET()}"


def cyan(s: str) -> str:
    return f"{CYAN()}{s}{RESET()}"


# ─── Helpers ─────────────────────────────────────────────────────────────────


def pct(num: int, denom: int, decimals: int = 1) -> str:
    if denom == 0:
        return "  —  "
    v = num / denom * 100
    return f"{v:.{decimals}f}%"


def bar(ratio: float, width: int = 20, fill: str = "█", empty: str = "░") -> str:
    filled = round(ratio * width)
    filled = max(0, min(width, filled))
    return fill * filled + empty * (width - filled)


def grade(ratio: float) -> str:
    if ratio >= 0.90:
        return green("A")
    if ratio >= 0.75:
        return green("B")
    if ratio >= 0.60:
        return yellow("C")
    if ratio >= 0.40:
        return yellow("D")
    return red("F")


def sign(v: float) -> str:
    if v > 0:
        return green(f"+{v:.2f}")
    if v < 0:
        return red(f"{v:.2f}")
    return dim(f"{v:.2f}")


def hr(width: int = 80, char: str = "─") -> str:
    return dim(char * width)


def section(title: str, width: int = 80) -> str:
    gap = width - len(title) - 4
    left = gap // 2
    right = gap - left
    return f"{bold('┌' + '─' * left + '  ')}{bold(cyan(title))}{bold('  ' + '─' * right + '┐')}"


def section_end(width: int = 80) -> str:
    return bold("└" + "─" * (width - 2) + "┘")


# ─── Terminal report sections ─────────────────────────────────────────────────


def print_header(data: dict) -> None:
    ts = data.get("timestamp", "")
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        ts_fmt = dt.strftime("%Y-%m-%d %H:%M UTC")
    except Exception:
        ts_fmt = ts

    cfg = data.get("config", {})
    print()
    print(
        bold(
            "╔══════════════════════════════════════════════════════════════════════════════╗"
        )
    )
    print(
        bold("║")
        + cyan(bold("  FACT VOTING SIMULATION — EVALUATION REPORT".center(76)))
        + bold("║")
    )
    print(
        bold(
            "╚══════════════════════════════════════════════════════════════════════════════╝"
        )
    )
    print()
    print(f"  {bold('Timestamp:')}    {ts_fmt}")
    print(f"  {bold('App URL:')}      {cfg.get('appUrl', '?')}")
    print(f"  {bold('Topics:')}       {len(cfg.get('topicIds', []))}")
    print(f"  {bold('Wait time:')}    {cfg.get('aiProcessingWaitMs', '?')}ms")
    print(f"  {bold('Users file:')}   {os.path.basename(data.get('usersFile', ''))}")
    print(
        f"  {bold('Scenarios:')}    {', '.join(cfg.get('scenariosRun', []))}"
    )
    file_count = data.get("_fileCount")
    if file_count:
        print(f"  {bold('Input files:')}  {file_count} files merged")
    print()


def print_overview_table(results: list[dict]) -> None:
    print(section("SCENARIO OVERVIEW"))
    print()
    header = (
        f"  {'#':<2}  {'Scenario':<50}  "
        f"{'Facts':>5}  {'Votes':>6}  {'Rounds':>6}  "
        f"{'Errs':>5}  {'Time':>7}"
    )
    print(bold(header))
    print(hr())
    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")[:50]
        facts = len(r.get("factsTargeted", []))
        total_votes = sum(
            rd.get("totalUpvotes", 0) + rd.get("totalDownvotes", 0)
            for rd in r.get("votingRounds", [])
        )
        rounds = len(r.get("votingRounds", []))
        errs = len(r.get("errors", []))
        dur = r.get("durationMs", 0) / 1000
        errs_str = red(str(errs)) if errs else green("  0")
        print(
            f"  {i:<2}  {name:<50}  "
            f"{facts:>5}  {total_votes:>6}  {rounds:>6}  "
            f"{errs_str:>5}  {dur:>6.0f}s"
        )
    print(section_end())
    print()


def print_voting_analysis(results: list[dict]) -> None:
    print(section("VOTING PATTERNS BY SCENARIO"))
    print()

    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")
        expected = r["scenario"].get("expectedOutcome", "?")

        total_up = 0
        total_down = 0
        total_with_reason = 0
        total_votes = 0

        for rd in r.get("votingRounds", []):
            total_up += rd.get("totalUpvotes", 0)
            total_down += rd.get("totalDownvotes", 0)
            for v in rd.get("votesCast", []):
                total_votes += 1
                if v.get("reason"):
                    total_with_reason += 1

        total = total_up + total_down
        up_ratio = total_up / total if total > 0 else 0

        print(f"  {bold(cyan(name))}")
        print(f"    Expected outcome: {bold(expected)}")
        print(
            f"    Votes: {green(str(total_up))} upvotes / {red(str(total_down))} downvotes"
            f"  (ratio: {up_ratio * 100:.1f}% upvote)"
        )
        print(
            f"    Rationales provided: {total_with_reason}/{total_votes}"
            f" ({pct(total_with_reason, total_votes)})"
        )

        # Vote ratio bar
        if total > 0:
            up_bar = bar(up_ratio, 30, fill="▲", empty="▼")
            print(f"    {green('UP')} {up_bar} {red('DN')}")

        # Per-round breakdown
        rounds = r.get("votingRounds", [])
        if len(rounds) > 1:
            print(f"    {dim('Round breakdown:')}")
            for rd in rounds:
                rn = rd.get("round", "?")
                ru = rd.get("totalUpvotes", 0)
                rdn = rd.get("totalDownvotes", 0)
                print(f"      Round {rn}: ↑{ru} ↓{rdn}")

        print()

    print(section_end())
    print()


def print_reassessment_section(results: list[dict]) -> None:
    print(section("FACT REASSESSMENT OUTCOMES"))
    print()
    print(dim("  Actions: kept ✓  |  updated ↻  |  removed ✗  |  skipped ⊘  |  error ⚠"))
    print()

    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")
        expected = r["scenario"].get("expectedOutcome", "?")
        metrics = r.get("metrics", {})

        kept = metrics.get("factsKept", 0)
        updated = metrics.get("factsUpdated", 0)
        removed = metrics.get("factsRemoved", 0)
        skipped = metrics.get("factsSkipped", 0)
        errored = metrics.get("factsErrored", 0)
        total = kept + updated + removed

        match = metrics.get("expectedOutcomeMatch", False)
        adj_match = metrics.get("adjustedOutcomeMatch")

        print(f"  {bold(cyan(name))}")
        match_label = green('✓ YES') if match else red('✗ NO')
        print(f"    Expected: {bold(expected)}  |  Match: {match_label}", end="")
        if adj_match is not None and adj_match != match:
            print(f"  →  Adjusted: {green('✓ YES') if adj_match else red('✗ NO')}", end="")
            reasonable_count = metrics.get("reasonableUpdates", 0)
            if reasonable_count:
                print(f"  ({yellow(str(reasonable_count))} reasonable update{'s' if reasonable_count != 1 else ''})", end="")
        print()
        print(
            f"    ✓ Kept: {green(str(kept))}  "
            f"↻ Updated: {yellow(str(updated))}  "
            f"✗ Removed: {red(str(removed))}  "
            f"⊘ Skipped: {dim(str(skipped))}  "
            f"⚠ Errors: {red(str(errored)) if errored else dim(str(errored))}"
        )

        # Outcome distribution bar
        if total > 0:
            kept_ratio = kept / total
            updated_ratio = updated / total
            removed_ratio = removed / total
            kept_bar = "●" * round(kept_ratio * 20)
            updated_bar = "◉" * round(updated_ratio * 20)
            removed_bar = "○" * round(removed_ratio * 20)
            print(
                f"    {green(kept_bar)}{yellow(updated_bar)}{red(removed_bar)}"
                f"  ({pct(kept, total)} kept / {pct(updated, total)} updated / {pct(removed, total)} removed)"
            )

        # Trigger rate
        trigger_rate = metrics.get("reassessmentTriggerRate", 0)
        print(
            f"    Reassessment trigger rate: {trigger_rate * 100:.1f}%"
            f"  {bar(trigger_rate, 15)}"
        )

        print()

    print(section_end())
    print()


def print_scorecard(results: list[dict]) -> None:
    print(section("OVERALL SCORECARD"))
    print()

    # Check if any scenario has adjusted match data
    has_adjusted = any(
        r.get("metrics", {}).get("adjustedOutcomeMatch") is not None
        for r in results
    )

    if has_adjusted:
        print(
            bold(
                f"  {'#':<2}  {'Scenario':<40}  "
                f"{'Expected':>8}  {'Kept':>5}  {'Upd':>5}  {'Rem':>5}  "
                f"{'Vote%':>6}  {'Match':>6}  {'Adj':>6}  {'R.Upd':>5}  {'Grade':>6}"
            )
        )
    else:
        print(
            bold(
                f"  {'#':<2}  {'Scenario':<45}  "
                f"{'Expected':>8}  {'Kept':>5}  {'Upd':>5}  {'Rem':>5}  "
                f"{'Vote%':>6}  {'Match':>6}  {'Grade':>6}"
            )
        )
    print(hr())

    total_match = 0
    total_adjusted = 0
    total_scenarios = len(results)

    for i, r in enumerate(results, 1):
        name_len = 40 if has_adjusted else 45
        name = r["scenario"].get("name", f"Scenario {i}")[:name_len]
        expected = r["scenario"].get("expectedOutcome", "?")
        m = r.get("metrics", {})

        kept = m.get("factsKept", 0)
        updated = m.get("factsUpdated", 0)
        removed = m.get("factsRemoved", 0)
        vote_ratio = m.get("avgVoteRatio", 0) * 100
        match = m.get("expectedOutcomeMatch", False)
        adj_match = m.get("adjustedOutcomeMatch")
        reasonable_count = m.get("reasonableUpdates", 0)

        if match:
            total_match += 1
        # For adjusted, fall back to original match if not set
        effective_adj = adj_match if adj_match is not None else match
        if effective_adj:
            total_adjusted += 1

        match_str = green("  ✓") if match else red("  ✗")

        # Grade based on adjusted match (if available) + trigger rate + error rate
        trigger = m.get("reassessmentTriggerRate", 0)
        error_count = m.get("factsErrored", 0)
        grade_match = effective_adj if has_adjusted else match
        score = 0.6 * (1.0 if grade_match else 0.0) + 0.3 * trigger + 0.1 * (1.0 if error_count == 0 else 0.0)

        if has_adjusted:
            if adj_match is not None:
                adj_str = green("  ✓") if adj_match else red("  ✗")
            else:
                adj_str = dim("  —")
            rup_str = yellow(str(reasonable_count)) if reasonable_count > 0 else dim("0")
            print(
                f"  {i:<2}  {name:<40}  "
                f"{expected:>8}  {kept:>5}  {updated:>5}  {removed:>5}  "
                f"{vote_ratio:>5.1f}%  {match_str:>6}  {adj_str:>6}  {rup_str:>5}  {grade(score):>6}"
            )
        else:
            print(
                f"  {i:<2}  {name:<45}  "
                f"{expected:>8}  {kept:>5}  {updated:>5}  {removed:>5}  "
                f"{vote_ratio:>5.1f}%  {match_str:>6}  {grade(score):>6}"
            )

    print(hr())
    overall = total_match / total_scenarios if total_scenarios > 0 else 0
    print(
        f"  {bold('Overall outcome match rate:')} "
        f"{green(f'{overall*100:.0f}%') if overall >= 0.7 else yellow(f'{overall*100:.0f}%') if overall >= 0.4 else red(f'{overall*100:.0f}%')}"
        f"  ({total_match}/{total_scenarios} scenarios matched expected outcome)"
    )
    if has_adjusted and total_adjusted != total_match:
        adj_overall = total_adjusted / total_scenarios if total_scenarios > 0 else 0
        print(
            f"  {bold('Adjusted match rate:')}        "
            f"{green(f'{adj_overall*100:.0f}%') if adj_overall >= 0.7 else yellow(f'{adj_overall*100:.0f}%') if adj_overall >= 0.4 else red(f'{adj_overall*100:.0f}%')}"
            f"  ({total_adjusted}/{total_scenarios} including reasonable updates)"
        )
    print(section_end())
    print()


def print_fact_changes(results: list[dict]) -> None:
    has_changes = False
    for r in results:
        for ra in r.get("reassessmentResults", []):
            if ra.get("action") in ("updated", "removed") and not ra.get("skipped"):
                has_changes = True
                break
        if has_changes:
            break

    if not has_changes:
        return

    print(section("FACT TEXT CHANGES"))
    print()

    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")
        changes = []
        for ra in r.get("reassessmentResults", []):
            if ra.get("action") in ("updated", "removed") and not ra.get("skipped"):
                changes.append(ra)

        if not changes:
            continue

        print(f"  {bold(cyan(name))}")
        for c in changes:
            action = c.get("action", "?")
            fid = c.get("factId", "?")[:20]
            reasonable = c.get("reasonableUpdate")
            if action == "updated":
                print(f"    {yellow('↻')} Fact {fid}...")
                if c.get("previousText"):
                    print(f"      {red('Before:')} {c['previousText'][:100]}...")
                if c.get("updatedText"):
                    print(f"      {green('After:')}  {c['updatedText'][:100]}...")
            elif action == "removed":
                print(f"    {red('✗')} Fact {fid}... {red('REMOVED')}")
            if c.get("rationale"):
                print(f"      {dim('Rationale:')} {c['rationale'][:120]}")
            if reasonable is not None:
                r_str = green('✓ Reasonable') if reasonable else red('✗ Not reasonable')
                print(f"      {r_str}")
                if c.get("reasonableUpdateExplanation"):
                    print(f"      {dim(c['reasonableUpdateExplanation'][:150])}")
        print()

    print(section_end())
    print()


def print_errors_section(results: list[dict]) -> None:
    has_errors = any(r.get("errors") for r in results)
    if not has_errors:
        print(f"  {green('✓ No errors recorded in any scenario.')}")
        print()
        return

    print(section("ERRORS"))
    print()
    for i, r in enumerate(results, 1):
        errs = r.get("errors", [])
        if not errs:
            continue
        name = r["scenario"].get("name", f"Scenario {i}")
        print(f"  {bold(red(f'{name}'))}  ({len(errs)} errors)")
        for e in errs[:10]:
            print(f"    {red('✗')} {e[:120]}")
        if len(errs) > 10:
            print(f"    {dim(f'... and {len(errs) - 10} more')}")
        print()
    print(section_end())
    print()


# ─── CSV export ──────────────────────────────────────────────────────────────


def export_csv(data: dict, path_obj: Path) -> None:
    results = data.get("scenarioResults", [])
    rows = []

    for i, r in enumerate(results, 1):
        m = r.get("metrics", {})
        total_up = sum(
            rd.get("totalUpvotes", 0) for rd in r.get("votingRounds", [])
        )
        total_down = sum(
            rd.get("totalDownvotes", 0) for rd in r.get("votingRounds", [])
        )
        total_votes_with_reason = 0
        total_vote_count = 0
        for rd in r.get("votingRounds", []):
            for v in rd.get("votesCast", []):
                total_vote_count += 1
                if v.get("reason"):
                    total_votes_with_reason += 1

        row = {
            "scenario_num": i,
            "scenario_id": r["scenario"].get("id", ""),
            "scenario_name": r["scenario"].get("name", ""),
            "expected_outcome": r["scenario"].get("expectedOutcome", ""),
            "facts_targeted": len(r.get("factsTargeted", [])),
            "voting_rounds": len(r.get("votingRounds", [])),
            "total_upvotes": total_up,
            "total_downvotes": total_down,
            "total_votes": total_vote_count,
            "votes_with_reason": total_votes_with_reason,
            "vote_ratio_pct": round(m.get("avgVoteRatio", 0) * 100, 2),
            "facts_kept": m.get("factsKept", 0),
            "facts_updated": m.get("factsUpdated", 0),
            "facts_removed": m.get("factsRemoved", 0),
            "facts_skipped": m.get("factsSkipped", 0),
            "facts_errored": m.get("factsErrored", 0),
            "reassessment_trigger_rate": round(
                m.get("reassessmentTriggerRate", 0) * 100, 2
            ),
            "expected_outcome_match": m.get("expectedOutcomeMatch", False),
            "adjusted_outcome_match": m.get("adjustedOutcomeMatch"),
            "reasonable_updates": m.get("reasonableUpdates", 0),
            "errors": len(r.get("errors", [])),
            "duration_s": round(r.get("durationMs", 0) / 1000, 1),
        }
        rows.append(row)

    if rows:
        with open(path_obj, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        print(green(f"  ✓ CSV saved → {path_obj}"))


# ─── HTML export ─────────────────────────────────────────────────────────────


def _html_escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _html_pct(num: int, denom: int) -> str:
    if not denom:
        return "—"
    v = num / denom * 100
    color = "#4ade80" if v >= 75 else "#facc15" if v >= 50 else "#f87171"
    return f'<span style="color:{color}">{v:.1f}%</span>'


def export_html(data: dict, path_obj: Path) -> None:
    cfg = data.get("config", {})
    ts = data.get("timestamp", "")
    results = data.get("scenarioResults", [])

    scenario_rows_html = ""
    for i, r in enumerate(results, 1):
        m = r.get("metrics", {})
        name = r["scenario"].get("name", "")
        expected = r["scenario"].get("expectedOutcome", "")
        kept = m.get("factsKept", 0)
        updated = m.get("factsUpdated", 0)
        removed = m.get("factsRemoved", 0)
        skipped = m.get("factsSkipped", 0)
        match = m.get("expectedOutcomeMatch", False)
        vote_ratio = m.get("avgVoteRatio", 0) * 100
        trigger_rate = m.get("reassessmentTriggerRate", 0) * 100
        errs = len(r.get("errors", []))
        dur = r.get("durationMs", 0) / 1000

        total_up = sum(
            rd.get("totalUpvotes", 0) for rd in r.get("votingRounds", [])
        )
        total_down = sum(
            rd.get("totalDownvotes", 0) for rd in r.get("votingRounds", [])
        )

        match_color = "#4ade80" if match else "#f87171"
        match_text = "✓" if match else "✗"
        err_color = "#f87171" if errs > 0 else "#4ade80"

        adj_match = m.get("adjustedOutcomeMatch")
        reasonable_count = m.get("reasonableUpdates", 0)
        effective_adj = adj_match if adj_match is not None else match
        adj_color = "#4ade80" if effective_adj else "#f87171"
        adj_text = "✓" if effective_adj else ("✗" if adj_match is not None else "—")
        rup_text = str(reasonable_count) if reasonable_count > 0 else "0"
        rup_color = "#facc15" if reasonable_count > 0 else "#64748b"

        scenario_rows_html += f"""
        <tr>
          <td>{i}</td>
          <td>{name}</td>
          <td>{expected}</td>
          <td>{total_up}</td>
          <td>{total_down}</td>
          <td>{vote_ratio:.1f}%</td>
          <td style="color:#4ade80">{kept}</td>
          <td style="color:#facc15">{updated}</td>
          <td style="color:#f87171">{removed}</td>
          <td>{skipped}</td>
          <td>{trigger_rate:.1f}%</td>
          <td style="color:{match_color}">{match_text}</td>
          <td style="color:{adj_color}">{adj_text}</td>
          <td style="color:{rup_color}">{rup_text}</td>
          <td style="color:{err_color}">{errs}</td>
          <td>{dur:.0f}s</td>
        </tr>"""

    # Fact changes table
    changes_html = ""
    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")
        for ra in r.get("reassessmentResults", []):
            if ra.get("action") in ("updated", "removed") and not ra.get("skipped"):
                action = ra.get("action", "")
                fid = ra.get("factId", "")[:24]
                prev = _html_escape((ra.get("previousText") or "")[:250])
                upd = _html_escape((ra.get("updatedText") or "")[:250])
                rat = _html_escape((ra.get("rationale") or "")[:300])
                reasonable = ra.get("reasonableUpdate")
                rup_explanation = _html_escape((ra.get("reasonableUpdateExplanation") or "")[:200])
                action_color = "#facc15" if action == "updated" else "#f87171"

                if reasonable is True:
                    rup_html = '<span style="color:#4ade80">✓ Reasonable</span>'
                elif reasonable is False:
                    rup_html = '<span style="color:#f87171">✗ Not reasonable</span>'
                else:
                    rup_html = '<span style="color:#64748b">—</span>'
                if rup_explanation:
                    rup_html += f'<div style="font-size:0.75rem;color:#94a3b8;margin-top:2px">{rup_explanation}</div>'

                changes_html += f"""
                <tr>
                  <td>{_html_escape(name[:40])}</td>
                  <td>{fid}</td>
                  <td style="color:{action_color}">{action}</td>
                  <td>{prev}</td>
                  <td>{upd if action == 'updated' else '—'}</td>
                  <td>{rat}</td>
                  <td>{rup_html}</td>
                </tr>"""

    changes_section = ""
    if changes_html:
        changes_section = f"""
        <h2>Fact Text Changes</h2>
        <table>
          <thead><tr>
            <th>Scenario</th><th>Fact ID</th><th>Action</th>
            <th>Before</th><th>After</th><th>Rationale</th>
            <th>Reasonable?</th>
          </tr></thead>
          <tbody>{changes_html}</tbody>
        </table>"""

    # Summary stats
    total_match = sum(
        1 for r in results if r.get("metrics", {}).get("expectedOutcomeMatch")
    )
    total_adjusted = sum(
        1 for r in results
        if (r.get("metrics", {}).get("adjustedOutcomeMatch")
            if r.get("metrics", {}).get("adjustedOutcomeMatch") is not None
            else r.get("metrics", {}).get("expectedOutcomeMatch", False))
    )
    overall_rate = (
        total_match / len(results) * 100 if results else 0
    )
    adj_rate = (
        total_adjusted / len(results) * 100 if results else 0
    )
    rate_color = (
        "#4ade80" if overall_rate >= 70 else "#facc15" if overall_rate >= 40 else "#f87171"
    )
    adj_rate_color = (
        "#4ade80" if adj_rate >= 70 else "#facc15" if adj_rate >= 40 else "#f87171"
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fact Voting Simulation Report</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 2rem; }}
    h1 {{ font-size: 1.8rem; color: #38bdf8; margin-bottom: 0.3rem; }}
    h2 {{ font-size: 1.3rem; color: #7dd3fc; margin: 2rem 0 0.8rem; border-bottom: 1px solid #1e3a5f; padding-bottom: 0.4rem; }}
    p {{ margin: 0.4rem 0; line-height: 1.6; color: #cbd5e1; }}
    .meta {{ color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }}
    .summary {{ background: #0d1f3c; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1rem 1.5rem; margin: 1rem 0; }}
    .summary .big {{ font-size: 2rem; font-weight: bold; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 1.5rem; }}
    th {{ background: #1e293b; color: #94a3b8; text-align: left; padding: 0.5rem 0.6rem; border-bottom: 2px solid #334155; font-weight: 600; }}
    td {{ padding: 0.4rem 0.6rem; border-bottom: 1px solid #1e293b; }}
    tr:hover td {{ background: #1e293b; }}
  </style>
</head>
<body>
  <h1>Fact Voting Simulation — Evaluation Report</h1>
  <div class="meta">
    Generated: {ts} &nbsp;|&nbsp;
    Topics: {len(cfg.get('topicIds', []))} &nbsp;|&nbsp;
    AI Wait: {cfg.get('aiProcessingWaitMs', '?')}ms &nbsp;|&nbsp;
    Users file: {os.path.basename(data.get('usersFile', ''))}
  </div>

  <div class="summary">
    <p>Overall outcome match rate:</p>
    <p class="big" style="color:{rate_color}">{overall_rate:.0f}% ({total_match}/{len(results)} scenarios)</p>
    {"<p>Adjusted match rate (accounting for reasonable updates):</p>" if adj_rate != overall_rate else ""}
    {"<p class='big' style='color:" + adj_rate_color + "'>" + f"{adj_rate:.0f}% ({total_adjusted}/{len(results)} scenarios)</p>" if adj_rate != overall_rate else ""}
  </div>

  <h2>Scenario Scorecard</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Scenario</th><th>Expected</th>
      <th>↑</th><th>↓</th><th>Vote%</th>
      <th>Kept</th><th>Updated</th><th>Removed</th><th>Skipped</th>
      <th>Trigger%</th><th>Match</th><th>Adj. Match</th><th>R. Updates</th><th>Errors</th><th>Time</th>
    </tr></thead>
    <tbody>{scenario_rows_html}</tbody>
  </table>

  {changes_section}
</body>
</html>"""

    with open(path_obj, "w", encoding="utf-8") as f:
        f.write(html)
    print(green(f"  ✓ HTML saved → {path_obj}"))


# ─── Entry point ─────────────────────────────────────────────────────────────


def main() -> None:
    global USE_COLOR

    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    json_paths = []
    do_html = False
    do_csv = False

    for arg in args:
        if arg == "--html":
            do_html = True
        elif arg == "--csv":
            do_csv = True
        elif arg == "--all":
            do_html = do_csv = True
        elif arg == "--no-color":
            USE_COLOR = False
        elif not arg.startswith("-"):
            json_paths.append(arg)

    if not json_paths:
        print("Error: no JSON file(s) specified.", file=sys.stderr)
        sys.exit(1)

    # Load all data files
    all_data: list[tuple[str, dict]] = []

    for json_path in json_paths:
        try:
            with open(json_path, encoding="utf-8") as f:
                file_data = json.load(f)
                all_data.append((json_path, file_data))
        except FileNotFoundError:
            print(f"Error: file not found: {json_path}", file=sys.stderr)
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: invalid JSON in {json_path} — {e}", file=sys.stderr)
            sys.exit(1)

    # Merge data from all files
    merged_data: dict[str, Any] = {
        "timestamp": all_data[0][1].get("timestamp", ""),
        "usersFile": all_data[0][1].get("usersFile", ""),
        "config": all_data[0][1].get("config", {}),
        "scenarioResults": [],
    }

    for json_path, file_data in all_data:
        results = file_data.get("scenarioResults", [])
        if not results:
            print(f"Warning: no scenarioResults found in {json_path}", file=sys.stderr)
            continue
        merged_data["scenarioResults"].extend(results)

    if not merged_data["scenarioResults"]:
        print("Error: no scenarioResults found in any file.", file=sys.stderr)
        sys.exit(1)

    if len(all_data) > 1:
        merged_data["_fileCount"] = len(all_data)

    data = merged_data
    results = data["scenarioResults"]

    # Terminal report
    print_header(data)
    print_overview_table(results)
    print_scorecard(results)
    print_voting_analysis(results)
    print_reassessment_section(results)
    print_fact_changes(results)
    print_errors_section(results)

    # File exports
    if len(json_paths) == 1:
        base = Path(json_paths[0]).with_suffix("")
    else:
        base_dir = Path(json_paths[0]).parent
        base = base_dir / "fact_voting_combined"

    if do_csv:
        export_csv(data, base.with_suffix(".csv"))
    if do_html:
        export_html(data, base.with_suffix(".html"))

    if do_csv or do_html:
        print()


if __name__ == "__main__":
    main()
