#!/usr/bin/env python3
"""
Subtopics Bootstrap — generates a topic → subtopics taxonomy using Sonnet 4.5,
then classifies every question into one subtopic.

Workflow:
    1. PASS A (taxonomy): For each topic, ask Sonnet to propose 3–5 subtopics
       based on the topic's display name and a random sample of 10 stems.
       Output: taxonomy.json  (ti → [{key, name, desc}, ...])
    2. HUMAN REVIEW: User edits taxonomy.json before PASS B. This is mandatory.
       Run with --pass=b to continue.
    3. PASS B (classify): For each question, assigns subtopic `st` (a short key
       from the topic's subtopic list) using a short Sonnet call. Batched 10/call.
       Writes back questions.json with `st` field on every question.

Usage:
    # Pass A — generate taxonomy
    python3 bootstrap_subtopics.py --app geri --pass=a --out=geri_taxonomy.json

    # (human review of geri_taxonomy.json)

    # Pass B — classify, write back
    python3 bootstrap_subtopics.py --app geri --pass=b --taxonomy=geri_taxonomy.json

Env: ANTHROPIC_API_KEY
"""
import json
import os
import sys
import argparse
import random
import concurrent.futures
from urllib import request

MODEL = "claude-sonnet-4-5"
API_URL = "https://api.anthropic.com/v1/messages"


def call_claude(prompt, max_tokens=1500):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    body = json.dumps({
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = request.Request(API_URL, data=body, headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    })
    with request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    text = data["content"][0]["text"].strip()
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    return text


def pass_a_taxonomy(app, qs_path, notes_path, out):
    qs = json.load(open(qs_path, encoding="utf-8"))
    notes = json.load(open(notes_path, encoding="utf-8"))
    topics = {n["id"]: n["topic"] for n in notes}

    # Group question stems per topic
    by_topic = {}
    for q in qs:
        by_topic.setdefault(q["ti"], []).append(q.get("q", ""))

    taxonomy = {}
    random.seed(42)

    def _one(ti):
        name = topics.get(ti, f"topic_{ti}")
        stems = by_topic.get(ti, [])
        if not stems:
            return ti, {"name": name, "subtopics": []}
        sample = random.sample(stems, min(10, len(stems)))
        sample_blob = "\n".join(f"- {s[:180]}" for s in sample)
        prompt = f"""Propose 3-5 subtopics for a board exam topic. Return STRICT JSON only.

Topic: {name} ({len(stems)} questions in bank)

Random sample of question stems:
{sample_blob}

Return exactly this JSON shape:
{{
  "subtopics": [
    {{"key": "short_lowercase_key", "name": "Display Name", "desc": "one-line scope description"}},
    ...
  ]
}}

Rules:
- 3-5 subtopics (prefer 4)
- keys must be lowercase, underscore-separated, <=20 chars, unique within topic
- names are 2-4 words, title case
- subtopics must be mutually exclusive and collectively exhaustive
- avoid redundancy with other topics (e.g. don't re-create 'Delirium' subtopic inside 'Dementia')
- for Hebrew-only topics, keep keys in English but names can be Hebrew
"""
        try:
            out_text = call_claude(prompt, max_tokens=800)
            parsed = json.loads(out_text)
            return ti, {"name": name, "subtopics": parsed.get("subtopics", [])}
        except Exception as e:
            return ti, {"name": name, "subtopics": [], "error": str(e)[:120]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_one, ti): ti for ti in by_topic}
        for fut in concurrent.futures.as_completed(futures):
            ti, result = fut.result()
            taxonomy[ti] = result
            sts = ", ".join(s.get("key", "?") for s in result.get("subtopics", []))
            print(f"  ti={ti:2d} {result['name'][:40]:40s} → {sts}")

    with open(out, "w", encoding="utf-8") as fh:
        json.dump(taxonomy, fh, ensure_ascii=False, indent=2)
    print(f"\nTaxonomy written to {out}")
    print("REVIEW THIS FILE, then run pass B with --pass=b --taxonomy=" + out)


def pass_b_classify(qs_path, taxonomy_path, batch=10, workers=8):
    qs = json.load(open(qs_path, encoding="utf-8"))
    taxonomy = json.load(open(taxonomy_path, encoding="utf-8"))
    # Note: taxonomy keys come back as strings from JSON
    tax_by_ti = {int(k): v for k, v in taxonomy.items()}

    todo = [(i, q) for i, q in enumerate(qs) if not q.get("st")]
    print(f"To classify: {len(todo)} questions (out of {len(qs)})")

    # Group by ti so each batch shares a subtopic list
    by_ti = {}
    for i, q in todo:
        by_ti.setdefault(q["ti"], []).append((i, q))

    def _classify_batch(ti, chunk):
        tax = tax_by_ti.get(ti)
        if not tax or not tax.get("subtopics"):
            return [(i, None) for i, _ in chunk]
        sts = tax["subtopics"]
        key_list = [s["key"] for s in sts]
        menu = "\n".join(f"- {s['key']}: {s['name']} — {s.get('desc','')}" for s in sts)
        items = "\n".join(f"{n}: {q.get('q','')[:200]}" for n, (_, q) in enumerate(chunk))
        prompt = f"""Classify each question into ONE subtopic key from the list below.

Topic: {tax['name']}
Allowed subtopic keys: {key_list}
{menu}

Questions:
{items}

Return STRICT JSON array of {{"n": <index>, "st": "<key>"}}. One entry per question. No extra keys, no prose."""
        try:
            raw = call_claude(prompt, max_tokens=500 + 80 * len(chunk))
            parsed = json.loads(raw)
            keyset = set(key_list)
            out = []
            for entry in parsed:
                n = entry.get("n")
                st = entry.get("st")
                if st not in keyset:
                    st = None
                if 0 <= n < len(chunk):
                    out.append((chunk[n][0], st))
            # fill any missing (length mismatch) with None
            seen = {i for i, _ in out}
            for i, _ in chunk:
                if i not in seen:
                    out.append((i, None))
            return out
        except Exception as e:
            print(f"  ERR ti={ti}: {e}")
            return [(i, None) for i, _ in chunk]

    assignments = []
    tasks = []
    for ti, items in by_ti.items():
        for i in range(0, len(items), batch):
            tasks.append((ti, items[i:i+batch]))

    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_classify_batch, ti, chunk): (ti, chunk) for ti, chunk in tasks}
        for fut in concurrent.futures.as_completed(futures):
            out = fut.result()
            assignments.extend(out)
            done += 1
            if done % 10 == 0:
                print(f"  batches done: {done}/{len(tasks)}")

    # Apply
    applied = 0
    for i, st in assignments:
        if st:
            qs[i]["st"] = st
            applied += 1

    out_path = qs_path + ".with_st.json"
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(qs, fh, ensure_ascii=False, indent=2)
    print(f"\nApplied {applied}/{len(todo)} ({100*applied/max(1,len(todo)):.1f}%)")
    print(f"Wrote {out_path}")
    print(f"To activate: mv {out_path} {qs_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", choices=["geri", "pnimit"], required=True)
    ap.add_argument("--pass", dest="phase", choices=["a", "b"], required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--taxonomy", default=None)
    ap.add_argument("--qs", default=None, help="override path to questions.json")
    ap.add_argument("--notes", default=None)
    args = ap.parse_args()

    base = {"geri": "Geriatrics", "pnimit": "InternalMedicine"}[args.app]
    qs_path = args.qs or f"{base}/data/questions.json"
    notes_path = args.notes or f"{base}/data/notes.json"

    if args.phase == "a":
        out = args.out or f"{args.app}_taxonomy.json"
        pass_a_taxonomy(args.app, qs_path, notes_path, out)
    else:
        if not args.taxonomy:
            print("--taxonomy required for pass b")
            sys.exit(1)
        pass_b_classify(qs_path, args.taxonomy)


if __name__ == "__main__":
    main()
