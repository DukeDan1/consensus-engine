#!/usr/bin/env python3
"""
report_simulation.py
====================
Analyse a scenario_simulation_<timestamp>.json report produced by
simulateScenarios.ts and print a human-readable evaluation of how
effectively the AI systems (moderation, fact-checking, trust scoring)
performed across each scenario.

Supports single or multiple JSON files — when given multiple files, combines
all scenario results into a unified report.

Usage
-----
    python3 report_simulation.py <file.json>                              # single file
    python3 report_simulation.py <file1.json> <file2.json> ...            # multiple files
    python3 report_simulation.py <file.json> --html                       # save HTML
    python3 report_simulation.py <file.json> --csv                        # save CSV
    python3 report_simulation.py <file1.json> <file2.json> --all          # combine + export

Options
-------
    --html          Write report.html alongside the JSON file (or as .combined.html)
    --csv           Write report.csv alongside the JSON file (or as .combined.csv)
    --all           Enable --html and --csv
    --no-color      Disable ANSI colours in terminal output
    --no-summary    Skip the cross-scenario AI narrative at the end
"""

import json
import sys
import os
import math
import csv
import io
import textwrap
from pathlib import Path
from datetime import datetime, timezone
from typing import Any

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
WHITE  = lambda: _c("37")
BG_DARK = lambda: _c("40")

def bold(s: str) -> str:   return f"{BOLD()}{s}{RESET()}"
def dim(s: str) -> str:    return f"{DIM()}{s}{RESET()}"
def red(s: str) -> str:    return f"{RED()}{s}{RESET()}"
def green(s: str) -> str:  return f"{GREEN()}{s}{RESET()}"
def yellow(s: str) -> str: return f"{YELLOW()}{s}{RESET()}"
def cyan(s: str) -> str:   return f"{CYAN()}{s}{RESET()}"

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
    """Return a coloured letter grade."""
    if ratio >= 0.90: return green("A")
    if ratio >= 0.75: return green("B")
    if ratio >= 0.60: return yellow("C")
    if ratio >= 0.40: return yellow("D")
    return red("F")

def sign(v: float) -> str:
    if v > 0:  return green(f"+{v:.2f}")
    if v < 0:  return red(f"{v:.2f}")
    return dim(f"{v:.2f}")

def hr(width: int = 80, char: str = "─") -> str:
    return dim(char * width)

def section(title: str, width: int = 80) -> str:
    gap = width - len(title) - 4
    left = gap // 2
    right = gap - left
    return f"{bold('┌' + '─'*left + '  ')}{bold(cyan(title))}{bold('  ' + '─'*right + '┐')}"

def section_end(width: int = 80) -> str:
    return bold("└" + "─" * (width - 2) + "┘")

# ─── Category metadata ───────────────────────────────────────────────────────

CATEGORY_SHORT = {
    "highQualityFacts":     "HQ-Facts",
    "highQualityEvidence":  "HQ-Evid",
    "average":              "Average",
    "humanError":           "HumanErr",
    "mixedTrueFalse":       "Mixed",
    "purelyFalse":          "PurelyFalse",
    "spam":                 "Spam",
    "noise":                "Noise",
    "troll":                "Troll",
    "mildAbusive":          "MildAbuse",
    "highlyOffensive":      "HighOffens",
}

# Content categories the system *should* pass through vs. catch
SHOULD_PASS  = {"highQualityFacts", "highQualityEvidence", "average"}
SHOULD_CATCH = {"spam", "noise", "troll", "mildAbusive", "highlyOffensive", "purelyFalse", "mixedTrueFalse"}

def cat_short(cat: str) -> str:
    return CATEGORY_SHORT.get(cat, cat[:10])

# ─── Core analysis helpers ────────────────────────────────────────────────────

def moderation_precision_recall(by_category: dict) -> tuple[float, float]:
    """
    Precision: of items that *should* be caught, what fraction was caught
                (not visible)?
    Recall:    of items that *should* pass, what fraction actually passed?
    """
    should_catch_total = should_catch_caught = 0
    should_pass_total  = should_pass_passed  = 0

    for cat, stats in by_category.items():
        total = stats.get("total", 0)
        visible = stats.get("visible", 0)
        caught = total - visible
        if cat in SHOULD_CATCH:
            should_catch_total += total
            should_catch_caught += caught
        else:
            should_pass_total += total
            should_pass_passed += visible

    precision  = should_catch_caught / should_catch_total if should_catch_total else None
    true_pass  = should_pass_passed  / should_pass_total  if should_pass_total  else None
    return precision, true_pass

def fact_check_accuracy(by_category: dict) -> tuple[float, float]:
    """
    True-positive rate: fraction of SHOULD_CATCH content flagged as inaccurate.
    False-positive rate: fraction of SHOULD_PASS content flagged as inaccurate.
    """
    catch_total = catch_inaccurate = 0
    pass_total  = pass_inaccurate  = 0

    for cat, stats in by_category.items():
        total = stats.get("total", 0)
        inaccurate = stats.get("inaccurate", 0)
        if cat in SHOULD_CATCH:
            catch_total += total
            catch_inaccurate += inaccurate
        else:
            pass_total += total
            pass_inaccurate += inaccurate

    tpr = catch_inaccurate / catch_total if catch_total else None
    fpr = pass_inaccurate  / pass_total  if pass_total  else None
    return tpr, fpr

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
    print(bold("╔══════════════════════════════════════════════════════════════════════════════╗"))
    print(bold("║") + cyan(bold("  SCENARIO SIMULATION — EVALUATION REPORT".center(76))) + bold("║"))
    print(bold("╚══════════════════════════════════════════════════════════════════════════════╝"))
    print()
    print(f"  {bold('Timestamp:')}  {ts_fmt}")
    print(f"  {bold('Model:')}       {cfg.get('model', '?')} ({cfg.get('provider', '?')})")
    print(f"  {bold('Config:')}      {cfg.get('activePosters', '?')} posters · "
          f"{cfg.get('voterViewers', '?')} viewers · "
          f"{cfg.get('argumentsPerTopic', '?')} args/topic · "
          f"{cfg.get('commentsPerArgument', '?')} comments/arg")
    print(f"  {bold('Users file:')} {os.path.basename(data.get('usersFile', ''))}")
    print()


def print_overview_table(results: list[dict]) -> None:
    print(section("SCENARIO OVERVIEW"))
    print()
    header = (
        f"  {'#':<2}  {'Scenario':<42}  "
        f"{'Args':>5}  {'Cmts':>5}  {'Votes':>6}  "
        f"{'Errs':>5}  {'Time':>7}"
    )
    print(bold(header))
    print(hr())
    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")[:42]
        args = len(r.get("argumentsCreated", []))
        cmts = len(r.get("commentsCreated", []))
        vts  = len(r.get("votesCast", []))
        errs = len(r.get("errors", []))
        dur  = r.get("durationMs", 0) / 1000
        errs_str = red(str(errs)) if errs else green("  0")
        print(
            f"  {i:<2}  {name:<42}  "
            f"{args:>5}  {cmts:>5}  {vts:>6}  "
            f"{errs_str:>5}  {dur:>6.0f}s"
        )
    print(section_end())
    print()


def print_moderation_section(results: list[dict]) -> None:
    print(section("MODERATION SYSTEM EFFECTIVENESS"))
    print()
    print(dim("  By scenario — what fraction of each category was treated correctly?"))
    print(dim("  'Pass' = should stay visible | 'Catch' = spam/abuse/troll/false content"))
    print()

    for i, r in enumerate(results, 1):
        mod = r.get("aiSystemReport", {}).get("moderation", {})
        by_cat = mod.get("byCategory", {})
        total  = mod.get("total", 0)
        visible = mod.get("visible", 0)
        noise  = mod.get("noise", 0)
        blocked = mod.get("blocked", 0)
        hidden = mod.get("hidden", 0)
        nr = mod.get("needsReview", 0)

        precision, true_pass = moderation_precision_recall(by_cat)

        name = r["scenario"].get("name", f"Scenario {i}")
        print(f"  {bold(cyan(name))}")
        print(
            f"    Total items: {total}  |  "
            f"Visible: {green(str(visible))} ({pct(visible, total)})  "
            f"Noise: {yellow(str(noise))} ({pct(noise, total)})  "
            f"Blocked: {red(str(blocked))} ({pct(blocked, total)})  "
            f"Hidden: {red(str(hidden))} ({pct(hidden, total)})  "
            f"Review: {yellow(str(nr))} ({pct(nr, total)})"
        )

        if true_pass is not None:
            flag = green if true_pass >= 0.90 else yellow if true_pass >= 0.70 else red
            print(f"    {bold('Pass-rate for good content:')}  {flag(f'{true_pass*100:.1f}%')}  "
                  f"{bar(true_pass, 20)}  {grade(true_pass)}")
        if precision is not None:
            flag = green if precision >= 0.70 else yellow if precision >= 0.40 else red
            print(f"    {bold('Catch-rate for bad content:')}  {flag(f'{precision*100:.1f}%')}  "
                  f"{bar(precision, 20)}  {grade(precision)}")

        # Per-category breakdown
        if by_cat:
            col_w = 12
            cats = sorted(by_cat.keys())
            header_row = "    " + "".join(f"{cat_short(c):<{col_w}}" for c in cats)
            print(dim(header_row))
            vis_row   = "    " + "".join(
                f"{pct(by_cat[c].get('visible',0), by_cat[c].get('total',0), 0):<{col_w}}"
                for c in cats
            )
            catch_row = "    " + "".join(
                f"{pct(by_cat[c].get('total',0)-by_cat[c].get('visible',0), by_cat[c].get('total',0), 0):<{col_w}}"
                for c in cats
            )
            print(f"    {dim('vis%:')}  " + "  ".join(
                f"{pct(by_cat[c].get('visible',0), by_cat[c].get('total',0), 0):>7}"
                for c in cats
            ))
            noise_row = "  ".join(
                f"{pct(by_cat[c].get('noise',0), by_cat[c].get('total',0), 0):>7}"
                for c in cats
            )
            print(f"    {dim('nse%:')}  " + noise_row)
        print()

    print(section_end())
    print()


def print_factcheck_section(results: list[dict]) -> None:
    print(section("FACT-CHECKING SYSTEM EFFECTIVENESS"))
    print()
    print(dim("  Measures: verified ✓  |  inaccurate ✗  |  mixed ≈  |  unverified ?  |  unchecked –"))
    print()

    for i, r in enumerate(results, 1):
        fc = r.get("aiSystemReport", {}).get("factChecking", {})
        by_cat = fc.get("byCategory", {})
        total = fc.get("total", 0)
        if total == 0:
            continue

        verified   = fc.get("verified", 0)
        inaccurate = fc.get("inaccurate", 0)
        mixed      = fc.get("mixed", 0)
        unverified = fc.get("unverified", 0)
        not_checked = fc.get("notChecked", 0)

        tpr, fpr = fact_check_accuracy(by_cat)

        name = r["scenario"].get("name", f"Scenario {i}")
        print(f"  {bold(cyan(name))}")
        print(
            f"    Total: {total}  |  "
            f"✓ Verified: {green(str(verified))} ({pct(verified, total)})  "
            f"✗ Inaccurate: {red(str(inaccurate))} ({pct(inaccurate, total)})  "
            f"≈ Mixed: {yellow(str(mixed))} ({pct(mixed, total)})  "
            f"? Unverified: {yellow(str(unverified))} ({pct(unverified, total)})  "
            f"– Unchecked: {dim(str(not_checked))}"
        )

        if tpr is not None:
            flag = green if tpr >= 0.70 else yellow if tpr >= 0.40 else red
            print(f"    {bold('True-positive (bad caught as inaccurate):')}  {flag(f'{tpr*100:.1f}%')}  {bar(tpr, 20)}")
        if fpr is not None:
            flag = green if fpr <= 0.05 else yellow if fpr <= 0.15 else red
            fp_label = f"{fpr*100:.1f}%"
            print(f"    {bold('False-positive (good flagged inaccurate):')}"
                  f"  {flag(fp_label)}  {bar(fpr, 20)}  "
                  f"{'✓ Low' if fpr <= 0.05 else '⚠ Moderate' if fpr <= 0.15 else '✗ High'}")

        # Per-category breakdown
        if by_cat:
            cats = sorted(by_cat.keys())
            print(dim("    " + "  ".join(f"{cat_short(c):>11}" for c in cats)))
            print("    " + "  ".join(
                f"{pct(by_cat[c].get('verified',0), by_cat[c].get('total',0), 0):>11}"
                for c in cats
            ) + dim("  ← verified%"))
            print("    " + "  ".join(
                f"{pct(by_cat[c].get('inaccurate',0), by_cat[c].get('total',0), 0):>11}"
                for c in cats
            ) + dim("  ← inaccurate%"))
            print("    " + "  ".join(
                f"{pct(by_cat[c].get('mixed',0), by_cat[c].get('total',0), 0):>11}"
                for c in cats
            ) + dim("  ← mixed%"))
        print()

    print(section_end())
    print()


def print_trust_section(results: list[dict]) -> None:
    print(section("TRUST SCORING SYSTEM EFFECTIVENESS"))
    print()
    print(dim("  Trust delta measures whether the platform correctly rewarded/penalised users"))
    print()

    rows = []
    for i, r in enumerate(results, 1):
        trust = r.get("trustReport", {})
        stats = trust.get("stats", {})
        if not stats:
            continue
        name = r["scenario"].get("name", f"Scenario {i}")[:50]
        avg  = stats.get("avgDelta", 0)
        maxp = stats.get("maxPositiveDelta", 0)
        maxn = stats.get("maxNegativeDelta", 0)
        imp  = stats.get("usersImproved", 0)
        deg  = stats.get("usersDegraded", 0)
        unch = stats.get("usersUnchanged", 0)
        total_users = imp + deg + unch

        print(f"  {bold(cyan(name))}")
        print(f"    Avg Δ: {sign(avg):>8}    Max +: {green(f'+{maxp}'):>8}    Max −: {red(str(maxn)):>8}")
        print(f"    Users:  "
              f"↑ Improved {green(str(imp))} ({pct(imp, total_users)})  "
              f"↓ Degraded {red(str(deg))} ({pct(deg, total_users)})  "
              f"= Unchanged {dim(str(unch))} ({pct(unch, total_users)})")

        if total_users > 0:
            imp_ratio = imp / total_users
            bar_str = bar(imp_ratio, 20,
                          fill="▲" if imp_ratio > 0.5 else "▼",
                          empty="·")
            net_str = green("NET POSITIVE") if avg > 0 else (red("NET NEGATIVE") if avg < 0 else dim("NEUTRAL"))
            print(f"    {bar_str}  {net_str}")

        rows.append({"scenario": i, "name": name, "avgDelta": avg})
        print()

    # Trend line
    if len(rows) > 1:
        deltas = [r["avgDelta"] for r in rows]
        print(f"  {bold('Trust delta trend across scenarios:')}")
        min_d = min(deltas)
        max_d = max(deltas)
        span  = max_d - min_d or 1
        print("  " + "  ".join(
            f"S{i+1}:{sign(d)}" for i, d in enumerate(deltas)
        ))
        print()

    print(section_end())
    print()


def print_ontology_ai_section(results: list[dict]) -> None:
    print(section("ONTOLOGY TAGGING & AI ANALYSIS"))
    print()

    for i, r in enumerate(results, 1):
        ai_sys = r.get("aiSystemReport", {})
        ont = ai_sys.get("ontology", {})
        ana = ai_sys.get("aiAnalysis", {})

        tagged = ont.get("totalTagged", 0)
        cats   = ont.get("totalCategories", 0)
        avg_c  = ont.get("avgCategoriesPerItem", 0)
        mod_total = ai_sys.get("moderation", {}).get("total", 0)

        name = r["scenario"].get("name", f"Scenario {i}")[:50]
        print(f"  {bold(cyan(name))}")

        ont_coverage = tagged / mod_total if mod_total else 0
        print(f"    Ontology:  {tagged}/{mod_total} items tagged ({pct(tagged, mod_total)})  "
              f"avg {avg_c:.2f} categories/item")

        ana_total = ana.get("total", 0)
        facts = ana.get("facts", 0)
        opinions = ana.get("opinions", 0)
        justified = ana.get("withJustification", 0)
        print(f"    AI Lens:   {ana_total} items analysed  "
              f"→  Facts: {facts}  Opinions: {opinions}  "
              f"Justified: {justified}/{ana_total} ({pct(justified, ana_total)})")
        print()

    print(section_end())
    print()


def print_errors_section(results: list[dict]) -> None:
    has_errors = any(r.get("errors") for r in results)
    if not has_errors:
        print(f"  {green('✓ No errors recorded in any scenario.')}")
        print()
        return

    print(section("ERRORS & GENERATION FAILURES"))
    print()
    for i, r in enumerate(results, 1):
        errs = r.get("errors", [])
        if not errs:
            continue
        name = r["scenario"].get("name", f"Scenario {i}")
        print(f"  {bold(red(f'Scenario {i}: {name}'))}  ({len(errs)} errors)")
        for e in errs:
            # Strip emoji for cleaner output
            msg = e.strip()
            print(f"    {red('✗')} {msg[:120]}")
        print()
    print(section_end())
    print()


def print_scorecard(results: list[dict]) -> None:
    """Overall scorecard — one row per scenario, composite grade."""
    print(section("OVERALL SCORECARD"))
    print()
    print(bold(
        f"  {'#':<2}  {'Scenario':<35}  "
        f"{'Mod-Pass':>9}  {'Mod-Catch':>10}  "
        f"{'FC-TPR':>7}  {'FC-FPR':>7}  "
        f"{'Trust Δ':>8}  {'Errors':>7}  {'Grade':>6}"
    ))
    print(hr())

    for i, r in enumerate(results, 1):
        name = r["scenario"].get("name", f"Scenario {i}")[:35]
        mod  = r.get("aiSystemReport", {}).get("moderation", {})
        fc   = r.get("aiSystemReport", {}).get("factChecking", {})
        trust = r.get("trustReport", {}).get("stats", {})

        by_cat_mod = mod.get("byCategory", {})
        by_cat_fc  = fc.get("byCategory", {})

        precision, true_pass = moderation_precision_recall(by_cat_mod)
        tpr, fpr   = fact_check_accuracy(by_cat_fc)
        avg_delta  = trust.get("avgDelta", 0)
        errs       = len(r.get("errors", []))

        # Composite grade: average of available sub-scores
        subscores = []
        if true_pass is not None:  subscores.append(true_pass)
        if precision  is not None: subscores.append(precision)
        if tpr        is not None: subscores.append(tpr)
        if fpr        is not None: subscores.append(1 - fpr)
        trust_score = min(1.0, max(0.0, (avg_delta + 20) / 40))
        subscores.append(trust_score)
        if errs > 0:
            subscores.append(max(0, 1 - errs / 10))

        composite = sum(subscores) / len(subscores) if subscores else 0

        def fmt_pct_cell(v):
            if v is None: return dim("     —")
            flag = green if v >= 0.75 else yellow if v >= 0.50 else red
            return flag(f"{v*100:5.1f}%")

        def fmt_fpr(v):
            if v is None: return dim("     —")
            flag = green if v <= 0.05 else yellow if v <= 0.15 else red
            return flag(f"{v*100:5.1f}%")

        errs_str = red(f"{errs:>7}") if errs else green(f"{'0':>7}")

        print(
            f"  {i:<2}  {name:<35}  "
            f"{fmt_pct_cell(true_pass):>9}  {fmt_pct_cell(precision):>10}  "
            f"{fmt_pct_cell(tpr):>7}  {fmt_fpr(fpr):>7}  "
            f"{sign(avg_delta):>8}  {errs_str}  {grade(composite)}"
        )

    print(hr())
    print(dim("  Columns: Mod-Pass=good content passed | Mod-Catch=bad content caught |"))
    print(dim("           FC-TPR=bad flagged inaccurate | FC-FPR=good wrongly inaccurate |"))
    print(dim("           Trust Δ=avg user trust delta | Grade=composite score"))
    print(section_end())
    print()


def print_cross_summary(data: dict, show: bool) -> None:
    summary = data.get("crossScenarioSummary", "")
    if not summary or not show:
        return
    print(section("CROSS-SCENARIO AI NARRATIVE SUMMARY"))
    print()
    # Strip markdown-ish headers since we're in terminal
    for line in summary.split("\n"):
        stripped = line.strip()
        if stripped.startswith("###"):
            print(f"  {bold(cyan(stripped.lstrip('#').strip()))}")
        elif stripped.startswith("##"):
            print(f"  {bold(stripped.lstrip('#').strip())}")
        elif stripped.startswith("*   ") or stripped.startswith("-   "):
            print(f"     •{stripped[3:]}")
        elif stripped.startswith("**") and stripped.endswith("**"):
            print(f"  {bold(stripped.strip('*'))}")
        elif stripped:
            for wrapped_line in textwrap.wrap(stripped, width=76):
                print(f"  {wrapped_line}")
        else:
            print()
    print()
    print(section_end())
    print()


# ─── CSV export ──────────────────────────────────────────────────────────────

def export_csv(data: dict, path: Path) -> None:
    results = data.get("scenarioResults", [])
    rows = []

    for i, r in enumerate(results, 1):
        mod   = r.get("aiSystemReport", {}).get("moderation", {})
        fc    = r.get("aiSystemReport", {}).get("factChecking", {})
        ont   = r.get("aiSystemReport", {}).get("ontology", {})
        trust = r.get("trustReport", {}).get("stats", {})
        by_cat_mod = mod.get("byCategory", {})
        by_cat_fc  = fc.get("byCategory", {})
        precision, true_pass = moderation_precision_recall(by_cat_mod)
        tpr, fpr = fact_check_accuracy(by_cat_fc)

        row = {
            "scenario_num":       i,
            "scenario_id":        r["scenario"].get("id", ""),
            "scenario_name":      r["scenario"].get("name", ""),
            "topics_created":     len(r.get("topicsCreated", [])),
            "arguments_created":  len(r.get("argumentsCreated", [])),
            "comments_created":   len(r.get("commentsCreated", [])),
            "votes_cast":         len(r.get("votesCast", [])),
            "errors":             len(r.get("errors", [])),
            "duration_s":         round(r.get("durationMs", 0) / 1000, 1),

            "mod_total":          mod.get("total", 0),
            "mod_visible":        mod.get("visible", 0),
            "mod_noise":          mod.get("noise", 0),
            "mod_blocked":        mod.get("blocked", 0),
            "mod_hidden":         mod.get("hidden", 0),
            "mod_needs_review":   mod.get("needsReview", 0),
            "mod_pass_rate":      round(true_pass * 100, 2) if true_pass is not None else "",
            "mod_catch_rate":     round(precision * 100, 2) if precision is not None else "",

            "fc_total":           fc.get("total", 0),
            "fc_verified":        fc.get("verified", 0),
            "fc_inaccurate":      fc.get("inaccurate", 0),
            "fc_mixed":           fc.get("mixed", 0),
            "fc_unverified":      fc.get("unverified", 0),
            "fc_not_checked":     fc.get("notChecked", 0),
            "fc_tpr":             round(tpr * 100, 2) if tpr is not None else "",
            "fc_fpr":             round(fpr * 100, 2) if fpr is not None else "",

            "ont_total_tagged":   ont.get("totalTagged", 0),
            "ont_avg_categories": ont.get("avgCategoriesPerItem", 0),

            "trust_avg_delta":    trust.get("avgDelta", 0),
            "trust_max_positive": trust.get("maxPositiveDelta", 0),
            "trust_max_negative": trust.get("maxNegativeDelta", 0),
            "trust_improved":     trust.get("usersImproved", 0),
            "trust_degraded":     trust.get("usersDegraded", 0),
            "trust_unchanged":    trust.get("usersUnchanged", 0),
        }

        # Per-category columns
        for cat in CATEGORY_SHORT:
            m = by_cat_mod.get(cat, {})
            row[f"mod_{cat}_total"]   = m.get("total", 0)
            row[f"mod_{cat}_visible"] = m.get("visible", 0)
            row[f"mod_{cat}_noise"]   = m.get("noise", 0)
            row[f"mod_{cat}_blocked"] = m.get("blocked", 0)
            f = by_cat_fc.get(cat, {})
            row[f"fc_{cat}_verified"]   = f.get("verified", 0)
            row[f"fc_{cat}_inaccurate"] = f.get("inaccurate", 0)
            row[f"fc_{cat}_mixed"]      = f.get("mixed", 0)

        rows.append(row)

    if rows:
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)
        print(green(f"  ✓ CSV saved → {path}"))


# ─── HTML export ─────────────────────────────────────────────────────────────

def _html_pct(num: int, denom: int) -> str:
    if not denom: return "—"
    v = num / denom * 100
    color = "#4ade80" if v >= 75 else "#facc15" if v >= 50 else "#f87171"
    return f'<span style="color:{color}">{v:.1f}%</span>'

def _html_sign(v: float) -> str:
    color = "#4ade80" if v > 0 else "#f87171" if v < 0 else "#94a3b8"
    prefix = "+" if v > 0 else ""
    return f'<span style="color:{color}">{prefix}{v:.2f}</span>'

def export_html(data: dict, path: Path) -> None:
    cfg     = data.get("config", {})
    ts      = data.get("timestamp", "")
    results = data.get("scenarioResults", [])
    summary = data.get("crossScenarioSummary", "")

    scenario_rows_html = ""
    for i, r in enumerate(results, 1):
        mod   = r.get("aiSystemReport", {}).get("moderation", {})
        fc    = r.get("aiSystemReport", {}).get("factChecking", {})
        trust = r.get("trustReport", {}).get("stats", {})
        errs  = len(r.get("errors", []))
        by_cat_mod = mod.get("byCategory", {})
        by_cat_fc  = fc.get("byCategory", {})
        precision, true_pass = moderation_precision_recall(by_cat_mod)
        tpr, fpr = fact_check_accuracy(by_cat_fc)
        avg_delta = trust.get("avgDelta", 0)

        def tp(v): return f"{v*100:.1f}%" if v is not None else "—"
        delta_color = "#4ade80" if avg_delta > 0 else "#f87171" if avg_delta < 0 else "#94a3b8"
        err_color   = "#f87171" if errs > 0 else "#4ade80"
        scenario_rows_html += f"""
        <tr>
          <td>{i}</td>
          <td>{r["scenario"].get("name","")}</td>
          <td>{len(r.get("argumentsCreated",[]))}</td>
          <td>{len(r.get("commentsCreated",[]))}</td>
          <td>{_html_pct(mod.get("visible",0), mod.get("total",0))}</td>
          <td>{tp(true_pass)}</td>
          <td>{tp(precision)}</td>
          <td>{tp(tpr)}</td>
          <td>{tp(fpr)}</td>
          <td style="color:{delta_color}">{'+' if avg_delta > 0 else ''}{avg_delta:.2f}</td>
          <td style="color:{err_color}">{errs}</td>
        </tr>"""

    # Category breakdown tables per scenario
    cat_tables_html = ""
    for i, r in enumerate(results, 1):
        mod_bc = r.get("aiSystemReport", {}).get("moderation", {}).get("byCategory", {})
        fc_bc  = r.get("aiSystemReport", {}).get("factChecking", {}).get("byCategory", {})
        cats = sorted(set(list(mod_bc.keys()) + list(fc_bc.keys())))
        if not cats:
            continue

        rows_html = ""
        for cat in cats:
            m = mod_bc.get(cat, {})
            f = fc_bc.get(cat, {})
            mt = m.get("total", 0)
            ft = f.get("total", 0)
            rows_html += f"""
            <tr>
              <td>{cat_short(cat)}</td>
              <td>{mt}</td>
              <td>{_html_pct(m.get("visible",0), mt)}</td>
              <td>{_html_pct(m.get("noise",0), mt)}</td>
              <td>{_html_pct(m.get("blocked",0)+m.get("hidden",0), mt)}</td>
              <td>{ft}</td>
              <td>{_html_pct(f.get("verified",0), ft)}</td>
              <td>{_html_pct(f.get("inaccurate",0), ft)}</td>
              <td>{_html_pct(f.get("mixed",0), ft)}</td>
            </tr>"""

        cat_tables_html += f"""
        <h3>Scenario {i}: {r["scenario"].get("name","")}</h3>
        <table>
          <thead><tr>
            <th>Category</th>
            <th>Mod Total</th><th>Visible%</th><th>Noise%</th><th>Blocked/Hidden%</th>
            <th>FC Total</th><th>Verified%</th><th>Inaccurate%</th><th>Mixed%</th>
          </tr></thead>
          <tbody>{rows_html}</tbody>
        </table>"""

    summary_html = ""
    if summary:
        import html as _html
        escaped = _html.escape(summary)
        # Very basic markdown → HTML for the narrative
        lines_out = []
        for line in escaped.split("\n"):
            s = line.strip()
            if s.startswith("###"):
                lines_out.append(f"<h4>{s[3:].strip()}</h4>")
            elif s.startswith("##"):
                lines_out.append(f"<h3>{s[2:].strip()}</h3>")
            elif s.startswith("*   ") or s.startswith("-   "):
                lines_out.append(f"<li>{s[4:]}</li>")
            elif s:
                lines_out.append(f"<p>{s}</p>")
        summary_html = "\n".join(lines_out)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Scenario Simulation Report</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ background: #0f172a; color: #e2e8f0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 2rem; }}
    h1 {{ font-size: 1.8rem; color: #38bdf8; margin-bottom: 0.3rem; }}
    h2 {{ font-size: 1.3rem; color: #7dd3fc; margin: 2rem 0 0.8rem; border-bottom: 1px solid #1e3a5f; padding-bottom: 0.4rem; }}
    h3 {{ font-size: 1.1rem; color: #94a3b8; margin: 1.2rem 0 0.5rem; }}
    h4 {{ font-size: 1rem; color: #7dd3fc; margin: 0.8rem 0 0.3rem; }}
    p {{ margin: 0.4rem 0; line-height: 1.6; color: #cbd5e1; }}
    li {{ margin: 0.25rem 0 0.25rem 1.5rem; line-height: 1.6; color: #cbd5e1; }}
    .meta {{ color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 1.5rem; }}
    th {{ background: #1e293b; color: #94a3b8; text-align: left; padding: 0.5rem 0.75rem; border-bottom: 2px solid #334155; font-weight: 600; }}
    td {{ padding: 0.45rem 0.75rem; border-bottom: 1px solid #1e293b; }}
    tr:hover td {{ background: #1e293b; }}
    .summary-box {{ background: #0d1f3c; border: 1px solid #1e3a5f; border-radius: 8px; padding: 1.5rem; margin-top: 1rem; }}
  </style>
</head>
<body>
  <h1>Scenario Simulation — Evaluation Report</h1>
  <div class="meta">
    Generated: {ts} &nbsp;|&nbsp;
    Model: {cfg.get("model","?")} ({cfg.get("provider","?")}) &nbsp;|&nbsp;
    Posters: {cfg.get("activePosters","?")} &nbsp;|&nbsp;
    Args/topic: {cfg.get("argumentsPerTopic","?")} &nbsp;|&nbsp;
    Comments/arg: {cfg.get("commentsPerArgument","?")}
  </div>

  <h2>Scenario Scorecard</h2>
  <table>
    <thead><tr>
      <th>#</th><th>Scenario</th><th>Args</th><th>Comments</th>
      <th>Mod Visibility</th><th>Mod Pass-rate</th><th>Mod Catch-rate</th>
      <th>FC True-Positive</th><th>FC False-Positive</th>
      <th>Trust Δ</th><th>Errors</th>
    </tr></thead>
    <tbody>{scenario_rows_html}</tbody>
  </table>

  <h2>Category Breakdown by Scenario</h2>
  {cat_tables_html}

  {'<h2>Cross-Scenario AI Summary</h2><div class="summary-box">' + summary_html + '</div>' if summary_html else ''}
</body>
</html>"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(green(f"  ✓ HTML saved → {path}"))


# ─── Entry point ─────────────────────────────────────────────────────────────

def main() -> None:
    global USE_COLOR

    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    json_paths = []
    do_html    = False
    do_csv     = False
    show_summary = True

    for arg in args:
        if arg == "--html":          do_html = True
        elif arg == "--csv":         do_csv  = True
        elif arg == "--all":         do_html = do_csv = True
        elif arg == "--no-color":    USE_COLOR = False
        elif arg == "--no-summary":  show_summary = False
        elif not arg.startswith("-"):
            json_paths.append(arg)

    if not json_paths:
        print("Error: no JSON file(s) specified.", file=sys.stderr)
        sys.exit(1)

    # Load all data files
    all_data = []
    for json_path in json_paths:
        try:
            with open(json_path, encoding="utf-8") as f:
                data = json.load(f)
                all_data.append((json_path, data))
        except FileNotFoundError:
            print(f"Error: file not found: {json_path}", file=sys.stderr)
            sys.exit(1)
        except json.JSONDecodeError as e:
            print(f"Error: invalid JSON in {json_path} — {e}", file=sys.stderr)
            sys.exit(1)

    # Merge data from all files
    merged_data = {
        "timestamp": all_data[0][1].get("timestamp", ""),
        "usersFile": all_data[0][1].get("usersFile", ""),
        "config": all_data[0][1].get("config", {}),
        "scenarioResults": [],
        "crossScenarioSummary": ""
    }

    # Combine all scenario results
    for json_path, data in all_data:
        results = data.get("scenarioResults", [])
        if not results:
            print(f"Warning: no scenarioResults found in {json_path}", file=sys.stderr)
            continue
        merged_data["scenarioResults"].extend(results)

    if not merged_data["scenarioResults"]:
        print("Error: no scenarioResults found in any file.", file=sys.stderr)
        sys.exit(1)

    # Use the cross-scenario summary from the first file that has one
    for _, data in all_data:
        summary = data.get("crossScenarioSummary", "")
        if summary:
            merged_data["crossScenarioSummary"] = summary
            break

    data = merged_data
    results = data.get("scenarioResults", [])

    # ── Terminal report ──
    print_header(data)
    print_overview_table(results)
    print_scorecard(results)
    print_moderation_section(results)
    print_factcheck_section(results)
    print_trust_section(results)
    print_ontology_ai_section(results)
    print_errors_section(results)
    print_cross_summary(data, show_summary)

    # ── File exports ──
    if len(json_paths) == 1:
        # Single file: use its basename
        base = Path(json_paths[0]).with_suffix("")
    else:
        # Multiple files: use a combined name based on the first file's directory
        base_dir = Path(json_paths[0]).parent
        combined_name = "scenario_simulation_combined"
        base = base_dir / combined_name

    if do_csv:
        export_csv(data, base.with_suffix(".csv"))
    if do_html:
        export_html(data, base.with_suffix(".html"))

    if do_csv or do_html:
        print()


if __name__ == "__main__":
    main()
