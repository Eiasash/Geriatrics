#!/usr/bin/env python3
"""
Detect and fix RTL/punctuation bugs introduced when Hebrew text is concatenated
with Latin drug names or with no whitespace between Hebrew terms.

Patterns handled (auto-fixable — all are textually safe):
  1. HEBREW_LATIN_GLUE   — Hebrew char directly followed by a Latin letter (or vice versa)
                           with no space/punctuation between. Insert a space.
                           Example: "לבHFpEF" → "לב HFpEF"
  2. HEB_COMMA_GLUE      — Hebrew comma (ASCII "," used inside Hebrew text) with no
                           space after. Insert a space.
                           Example: "דמנציה,דיכאון" → "דמנציה, דיכאון"
  3. HEB_SEMICOLON_GLUE  — Same pattern for semicolons in Hebrew text.

Ambiguous patterns we REFUSE to touch (left for manual review):
  * Unicode bidi control characters (RLM/LRM) — user may have added them on purpose
  * English abbreviations inside parentheses — parens already disambiguate

Usage:
  python3 scripts/fix_rtl_punctuation.py --dry-run   # show what would change
  python3 scripts/fix_rtl_punctuation.py             # apply fixes
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUESTIONS_PATH = ROOT / "data" / "questions.json"

# Hebrew Unicode range (main block; excludes presentation forms which shouldn't
# appear in clean data). Covers א-ת plus niqqud/cantillation in U+0591-U+05C7.
HEB = r"֐-׿"
LAT = r"A-Za-z"

PATTERNS = [
    # Hebrew → Latin with no whitespace between (e.g. "לבHFpEF")
    (re.compile(rf"([{HEB}])([{LAT}])"), r"\1 \2", "HEB_LAT_GLUE"),
    # Latin → Hebrew with no whitespace between (e.g. "metforminטיפול")
    (re.compile(rf"([{LAT}])([{HEB}])"), r"\1 \2", "LAT_HEB_GLUE"),
    # Hebrew char, ASCII comma, Hebrew char with no space after comma.
    # Anchored on Hebrew both sides so we don't touch "a,b" in English text.
    (re.compile(rf"([{HEB}]),([{HEB}])"), r"\1, \2", "HEB_COMMA_GLUE"),
    # Same for semicolons
    (re.compile(rf"([{HEB}]);([{HEB}])"), r"\1; \2", "HEB_SEMICOLON_GLUE"),
]

SCAN_FIELDS = ("q", "e")  # stem + explanation; options handled per-entry

def fix_text(text: str) -> tuple[str, list[str]]:
    """Apply all patterns in order; return (fixed_text, list_of_pattern_names_triggered)."""
    if not isinstance(text, str):
        return text, []
    triggered: list[str] = []
    out = text
    for regex, repl, name in PATTERNS:
        new, n = regex.subn(repl, out)
        if n > 0:
            triggered.append(f"{name} x{n}")
            out = new
    return out, triggered


def scan_question(q: dict, idx: int) -> tuple[dict, list[str]]:
    """Return (maybe-modified copy, per-field reports)."""
    reports: list[str] = []
    new_q = dict(q)
    for field in SCAN_FIELDS:
        if field in new_q and isinstance(new_q[field], str):
            fixed, hits = fix_text(new_q[field])
            if hits:
                reports.append(f"  Q{idx}.{field}: {', '.join(hits)}")
                new_q[field] = fixed
    # Options are an array; fix each element
    if "o" in new_q and isinstance(new_q["o"], list):
        new_opts = list(new_q["o"])
        for i, opt in enumerate(new_opts):
            fixed, hits = fix_text(opt)
            if hits:
                reports.append(f"  Q{idx}.o[{i}]: {', '.join(hits)}")
                new_opts[i] = fixed
        new_q["o"] = new_opts
    return new_q, reports


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="print diffs, do not write")
    ap.add_argument("--limit", type=int, default=0, help="only report first N changed questions")
    args = ap.parse_args()

    if not QUESTIONS_PATH.exists():
        print(f"FAIL: {QUESTIONS_PATH} not found", file=sys.stderr)
        return 2

    with QUESTIONS_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("FAIL: questions.json is not a top-level array", file=sys.stderr)
        return 2

    total_changed = 0
    total_hits = 0
    changed_indices: list[int] = []

    for i, q in enumerate(data):
        new_q, reports = scan_question(q, i)
        if reports:
            total_changed += 1
            total_hits += len(reports)
            changed_indices.append(i)
            if args.limit == 0 or total_changed <= args.limit:
                print(f"Q{i} [{q.get('t', '?')}, topic {q.get('ti', '?')}]:")
                for r in reports:
                    print(r)
            data[i] = new_q

    print(f"\n{'='*60}")
    print(f"Questions changed: {total_changed}")
    print(f"Total fix points:  {total_hits}")

    if args.dry_run:
        print("(dry-run — no file written)")
        return 0

    if total_changed == 0:
        print("No changes needed.")
        return 0

    # Preserve original formatting style as closely as possible: compact JSON
    # with one record per line keeps git diffs readable. Detect indent from file.
    with QUESTIONS_PATH.open("r", encoding="utf-8") as f:
        raw = f.read()
    # Heuristic: data files in this repo are typically emitted with
    # `json.dumps(..., ensure_ascii=False)` and no indent. Match that.
    indent = None if "\n  " not in raw[:2000] else 2

    with QUESTIONS_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
        if indent is None:
            f.write("")  # no trailing newline for compact form
        else:
            f.write("\n")

    print(f"Wrote {QUESTIONS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
