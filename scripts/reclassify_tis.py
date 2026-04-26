#!/usr/bin/env python3
"""
scripts/reclassify_tis.py — assign tis[] (1-3 ranked topics) to every Q.

Stage A (--sample N): runs N random Qs, prints diff to stdout, no file write.
Stage B (--full):     runs all Qs at 6-worker concurrency via Toranot proxy,
                      writes data/questions_tis_proposal.json with .tis added,
                      writes docs/tis_reclass_diff.md with the change report.

Usage:
  python scripts/reclassify_tis.py --sample 20
  python scripts/reclassify_tis.py --full

Mirrors the proven scripts/eissue_via_proxy.py 6-worker / 1-Q-per-call pattern.
Each call: ~3-8s, well under the 26s Netlify sync ceiling.
"""

import argparse
import json
import random
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-2026"

# 46 IMA syllabus topics (matches data/topics.json indices, which is the
# authoritative ordering). The HTML TOPICS array currently stops at 42 —
# the post-processing patch extends it.
TOPICS_46 = [
    "Biology of Aging", "Demography", "CGA", "Frailty", "Falls", "Delirium",
    "Dementia", "Depression", "Polypharmacy", "Nutrition", "Pressure Injuries",
    "Incontinence", "Constipation", "Sleep", "Pain", "Osteoporosis", "OA",
    "CV Disease", "Heart Failure", "HTN", "Stroke", "COPD", "Diabetes",
    "Thyroid", "CKD", "Anemia", "Cancer", "Infections", "Palliative", "Ethics",
    "Elder Abuse", "Driving", "Guardianship", "Patient Rights",
    "Advance Directives", "Community/LTC", "Rehab", "Vision/Hearing", "Periop",
    "Geri EM", "Parkinson's", "Arrhythmia", "Dysphagia",
    "Andropause", "Prevention", "Interdisciplinary Care",  # 43, 44, 45
]
assert len(TOPICS_46) == 46

TOPIC_LIST_BLOCK = "\n".join(f"  {i}. {t}" for i, t in enumerate(TOPICS_46))

PROMPT_TEMPLATE = """You are tagging a board-exam MCQ for the Israeli Geriatrics Stage A exam (IMA P005-2026 syllabus, 46 topics).

QUESTION:
{q}

OPTIONS:
{opts}

CORRECT ANSWER: option {c}

EXPLANATION (if any):
{e}

THE 46 TOPICS (use these exact indices):
{topics}

TASK: Assign 1-3 topics from the list above, RANKED by relevance:
- Primary topic (most central — what the Q tests).
- Secondary topic (clearly relevant supporting concept). Optional.
- Tertiary topic (mentioned but peripheral). Optional.

DO NOT pick topics that are merely mentioned in passing. The primary MUST be the central concept being tested. If a Q tests delirium-in-anemia-on-warfarin, primary=Delirium, secondary=Anemia, tertiary=Polypharmacy. If a Q just mentions a CBC value while testing dementia management, primary=Dementia, NO Anemia tag.

OUTPUT: a single JSON array of 1-3 integer indices (0-45), no markdown, no preamble, no explanation.
Examples:
  [5]
  [5, 25]
  [5, 25, 8]
"""

CALL_TIMEOUT = 30
MAX_RETRIES = 2


def call_proxy(prompt: str) -> str:
    body = json.dumps({
        "model": "sonnet",
        "max_tokens": 60,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        PROXY,
        data=body,
        headers={"Content-Type": "application/json", "x-api-secret": SECRET},
        method="POST",
    )
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=CALL_TIMEOUT) as r:
                d = json.loads(r.read())
                return d.get("content", [{}])[0].get("text", "")
        except Exception as e:
            last_err = e
            if attempt < MAX_RETRIES:
                time.sleep(1.5 * (attempt + 1))
    raise last_err


def parse_tis(text: str, fallback_ti: int) -> list[int]:
    """Extract 1-3 integers from the model response. Reject out-of-range.
    Always include fallback_ti as last-resort if nothing valid parses."""
    if not text:
        return [fallback_ti]
    m = re.search(r"\[([^\]]+)\]", text)
    if not m:
        # try bare integers
        ints = [int(x) for x in re.findall(r"\b(\d+)\b", text)]
    else:
        ints = []
        for tok in m.group(1).split(","):
            tok = tok.strip()
            if not tok:
                continue
            try:
                ints.append(int(tok))
            except ValueError:
                pass
    # filter out-of-range, dedupe preserving order
    seen = set()
    out = []
    for x in ints:
        if 0 <= x < 46 and x not in seen:
            seen.add(x)
            out.append(x)
        if len(out) >= 3:
            break
    if not out:
        return [fallback_ti]
    return out


def classify_one(idx: int, q: dict) -> tuple[int, list[int], int | None]:
    """Returns (idx, tis_list, original_ti). On hard error, falls back to [original_ti]."""
    options = q.get("o") or []
    opts_block = "\n".join(f"  {i}. {o}" for i, o in enumerate(options))
    prompt = PROMPT_TEMPLATE.format(
        q=(q.get("q") or "").strip()[:1500],
        opts=opts_block[:1200],
        c=q.get("c"),
        e=(q.get("e") or "")[:600],
        topics=TOPIC_LIST_BLOCK,
    )
    fallback = q.get("ti", 0)
    try:
        text = call_proxy(prompt)
        return (idx, parse_tis(text, fallback), fallback)
    except Exception as e:
        # On total failure, preserve current ti
        return (idx, [fallback], fallback)


def run(questions: list[dict], indices: list[int], workers: int = 6, label: str = "") -> dict[int, list[int]]:
    out = {}
    t0 = time.time()
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futs = {pool.submit(classify_one, i, questions[i]): i for i in indices}
        for fut in as_completed(futs):
            idx, tis, orig = fut.result()
            out[idx] = tis
            done += 1
            if done % 50 == 0 or done == len(indices):
                el = time.time() - t0
                rate = done / el if el > 0 else 0
                eta = (len(indices) - done) / rate if rate > 0 else 0
                print(f"  [{label}] {done}/{len(indices)} ({rate:.1f}/s, ETA {eta:.0f}s)", flush=True)
    return out


def diff_report(questions: list[dict], tis_map: dict[int, list[int]]) -> str:
    primary_changed = 0
    gained_secondary = 0
    gained_tertiary = 0
    no_change = 0
    by_old_topic_drift = {}  # ti -> count of primary changes
    examples = []
    for idx, tis in tis_map.items():
        q = questions[idx]
        orig = q.get("ti", 0)
        new_primary = tis[0]
        if new_primary != orig:
            primary_changed += 1
            by_old_topic_drift[orig] = by_old_topic_drift.get(orig, 0) + 1
            if len(examples) < 30:
                examples.append((idx, orig, tis, q.get("q", "")[:140]))
        else:
            no_change += 1
        if len(tis) >= 2:
            gained_secondary += 1
        if len(tis) >= 3:
            gained_tertiary += 1
    total = len(tis_map)
    lines = []
    lines.append(f"# tis[] reclassification diff report")
    lines.append("")
    lines.append(f"- Total Qs analyzed: **{total}**")
    lines.append(f"- Primary unchanged: **{no_change}** ({100*no_change/total:.1f}%)")
    lines.append(f"- Primary CHANGED: **{primary_changed}** ({100*primary_changed/total:.1f}%)")
    lines.append(f"- Gained ≥1 secondary tag: **{gained_secondary}** ({100*gained_secondary/total:.1f}%)")
    lines.append(f"- Gained tertiary tag: **{gained_tertiary}** ({100*gained_tertiary/total:.1f}%)")
    lines.append("")
    lines.append("## Topics losing the most Qs to reclassification")
    lines.append("")
    for ti in sorted(by_old_topic_drift, key=by_old_topic_drift.get, reverse=True)[:15]:
        old_name = TOPICS_46[ti] if ti < len(TOPICS_46) else f"ti={ti}"
        count = by_old_topic_drift[ti]
        lines.append(f"- **{old_name}** (ti={ti}): {count} Qs reclassified")
    lines.append("")
    lines.append("## Sample of primary-changed Qs")
    lines.append("")
    for idx, orig, tis, qtxt in examples:
        old = TOPICS_46[orig] if orig < len(TOPICS_46) else f"ti={orig}"
        new = " → ".join(TOPICS_46[t] if t < len(TOPICS_46) else f"ti={t}" for t in tis)
        lines.append(f"- **idx {idx}**: {old} → {new}")
        lines.append(f"  > {qtxt}")
        lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--sample", type=int, help="Run on N random Qs (Stage A)")
    g.add_argument("--full", action="store_true", help="Run on all Qs (Stage B)")
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    qpath = ROOT / "data" / "questions.json"
    questions = json.loads(qpath.read_text())
    print(f"Loaded {len(questions)} questions", flush=True)

    if args.sample:
        random.seed(args.seed)
        indices = random.sample(range(len(questions)), args.sample)
        print(f"Stage A: sampling {args.sample} Qs (seed={args.seed})", flush=True)
        tis_map = run(questions, indices, workers=args.workers, label="sample")
        report = diff_report(questions, tis_map)
        print()
        print(report)
        return

    # Full run
    indices = list(range(len(questions)))
    print(f"Stage B: full run on {len(indices)} Qs at {args.workers} workers", flush=True)
    tis_map = run(questions, indices, workers=args.workers, label="full")

    # Write proposal: same questions array but with `tis` added
    out_questions = []
    for i, q in enumerate(questions):
        new_q = dict(q)
        new_q["tis"] = tis_map.get(i, [q.get("ti", 0)])
        out_questions.append(new_q)

    proposal_path = ROOT / "data" / "questions_tis_proposal.json"
    # Match canonical write format (line-broken indent=0, NOT minified)
    with open(proposal_path, "w", encoding="utf-8") as f:
        json.dump(out_questions, f, ensure_ascii=False, indent=0)
    print(f"Wrote {proposal_path} ({proposal_path.stat().st_size:,} bytes)")

    report = diff_report(questions, tis_map)
    diff_path = ROOT / "docs" / "tis_reclass_diff.md"
    diff_path.parent.mkdir(exist_ok=True)
    diff_path.write_text(report, encoding="utf-8")
    print(f"Wrote {diff_path}")
    print()
    print(report[:2000])


if __name__ == "__main__":
    main()
