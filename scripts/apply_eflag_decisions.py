#!/usr/bin/env python3
"""Apply eFlag reviewer decisions to questions.json.

Usage:
    python3 scripts/apply_eflag_decisions.py <decisions.json> <questions.json>

Decisions JSON format (exported from eflag_reviewer.html):
    {"app": "geri|pnimit", "decisions": {"<idx>": "keep"|"dismiss"|"skip"}, ...}

Actions:
    - "dismiss" → delete qs[idx].eFlag (false positive, clear the badge)
    - "keep"    → leave eFlag in place (real bug, user will fix later)
    - "skip"    → leave eFlag in place (not reviewed yet)
"""
import json, sys

def main():
    if len(sys.argv) < 3:
        print("Usage: apply_eflag_decisions.py <decisions.json> <questions.json>")
        sys.exit(1)
    dec_path, qs_path = sys.argv[1], sys.argv[2]
    dec = json.load(open(dec_path))
    qs = json.load(open(qs_path))
    dismissed, kept, skipped = 0, 0, 0
    for idx_str, verdict in dec['decisions'].items():
        idx = int(idx_str)
        if idx >= len(qs): continue
        if verdict == 'dismiss':
            if qs[idx].get('eFlag'):
                del qs[idx]['eFlag']
                dismissed += 1
        elif verdict == 'keep':
            kept += 1
        elif verdict == 'skip':
            skipped += 1
    json.dump(qs, open(qs_path, 'w'), ensure_ascii=False, indent=2)
    print(f"Applied: {dismissed} dismissed (eFlag removed), {kept} kept (flagged), {skipped} skipped")
    print(f"Written: {qs_path}")

if __name__ == '__main__':
    main()
