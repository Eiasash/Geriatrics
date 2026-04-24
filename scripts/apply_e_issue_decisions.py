#!/usr/bin/env python3
"""Apply e_issue triage decisions to questions.json.

Usage:
    python3 scripts/apply_e_issue_decisions.py <decisions.json> <questions.json>

Decisions JSON format (output of e_issue_second_pass.py):
    {"decisions": {"<idx>": "keep"|"dismiss"}, "real_reasons": {...}}

Actions:
    - "dismiss" → delete qs[idx].e_issue (false positive — clear the badge)
    - "keep"    → leave e_issue=true in place + write real_reason into
                  qs[idx].e_issue_reason for review
"""
import json, sys


def main():
    if len(sys.argv) < 3:
        print("Usage: apply_e_issue_decisions.py <decisions.json> <questions.json>")
        sys.exit(1)
    dec_path, qs_path = sys.argv[1], sys.argv[2]
    dec = json.load(open(dec_path, encoding="utf-8"))
    qs = json.load(open(qs_path, encoding="utf-8"))
    real_reasons = dec.get("real_reasons", {})
    dismissed = kept = 0
    for idx_str, verdict in dec["decisions"].items():
        idx = int(idx_str)
        if idx >= len(qs):
            continue
        if verdict == "dismiss":
            if qs[idx].get("e_issue"):
                del qs[idx]["e_issue"]
                # Also clear stale reason if present
                qs[idx].pop("e_issue_reason", None)
                dismissed += 1
        elif verdict == "keep":
            kept += 1
            reason = real_reasons.get(idx_str)
            if reason:
                qs[idx]["e_issue_reason"] = reason
    json.dump(qs, open(qs_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"Applied: {dismissed} dismissed (e_issue cleared), {kept} kept (reason recorded)")
    print(f"Written: {qs_path}")
    remaining = sum(1 for q in qs if q.get("e_issue"))
    print(f"e_issue remaining in {qs_path}: {remaining}")


if __name__ == "__main__":
    main()
