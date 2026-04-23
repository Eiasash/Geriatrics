#!/usr/bin/env python3
"""
AI-assisted image sourcing helper.
For each flagged question, asks Claude Sonnet for:
  1. Ideal image description (what should be shown)
  2. 3 specific search terms for Radiopaedia / Wikimedia / LearningRadiology
  3. An SVG if the image is schematic (ECG rhythm, mechanism diagram)

Writes back to sourcing_queue CSV with added columns.

Uses direct Anthropic API (not Netlify proxy — avoids 20s timeout).
Parallel 8 workers. Sonnet 4.5.

Env: ANTHROPIC_API_KEY
"""
import json
import os
import sys
import csv
import argparse
import time
import concurrent.futures
from urllib import request, error

MODEL = "claude-sonnet-4-5"

def call_claude(stem, modality, topic):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    
    prompt = f"""You are helping source a clinical image for a board exam question.

Topic: {topic}
Imaging modality suggested: {modality}
Question stem (first 200 chars): {stem[:200]}

Return STRICTLY JSON (no markdown fences):
{{
  "description": "One-sentence description of what the ideal image should show",
  "search_terms": ["term1", "term2", "term3"],
  "svg_feasible": true|false,
  "svg": "<svg>...</svg> or null — only if modality is ECG rhythm strip, waveform, or simple schematic diagram that can be drawn from scratch without copying anything"
}}

Rules:
- search_terms should be specific (e.g. "anterior STEMI ECG tombstone" not "ECG")
- svg_feasible=true only for: ECG rhythm strips, flow-volume loops, pressure-volume loops, simple anatomy schematics
- svg_feasible=false for: CXR, CT, MRI, ultrasound, peripheral smear, histopath, fundus photos, skin photos
- If svg_feasible=true, produce a clean minimal SVG (viewBox 0 0 600 200 for tracings) with labeled axes
"""
    
    body = json.dumps({
        "model": MODEL,
        "max_tokens": 1500,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    
    req = request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    with request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode())
    text = data["content"][0]["text"].strip()
    # strip fences if present
    if text.startswith("```"):
        text = text.strip("`").lstrip("json").strip()
    return json.loads(text)


def process_row(row):
    try:
        result = call_claude(row["stem"], row["modality"], row["topic"])
        row["description"] = result.get("description", "")
        row["search_terms"] = " | ".join(result.get("search_terms", []))
        row["svg_feasible"] = result.get("svg_feasible", False)
        row["svg"] = result.get("svg") or ""
    except Exception as e:
        row["description"] = ""
        row["search_terms"] = ""
        row["svg_feasible"] = False
        row["svg"] = ""
        row["error"] = str(e)[:120]
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_csv", help="sourcing queue CSV from image_gap_detector.py")
    ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--limit", type=int, default=0, help="process only first N rows (0=all)")
    ap.add_argument("--priority", type=int, default=1, help="only process priority <= N")
    args = ap.parse_args()
    
    with open(args.input_csv, encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    rows = [r for r in rows if int(r["priority"]) <= args.priority]
    if args.limit:
        rows = rows[:args.limit]
    
    print(f"Processing {len(rows)} rows with {args.workers} workers...")
    done = 0
    out_rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex:
        futures = {ex.submit(process_row, dict(r)): r for r in rows}
        for fut in concurrent.futures.as_completed(futures):
            out_rows.append(fut.result())
            done += 1
            if done % 10 == 0:
                print(f"  {done}/{len(rows)}")
    
    fieldnames = list(rows[0].keys()) + ["description","search_terms","svg_feasible","svg","error"]
    fieldnames = list(dict.fromkeys(fieldnames))  # dedup preserve order
    with open(args.out, "w", encoding="utf-8", newline="", encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(out_rows)
    
    svg_count = sum(1 for r in out_rows if r.get("svg"))
    err_count = sum(1 for r in out_rows if r.get("error"))
    print(f"\nDone. {len(out_rows)} rows. SVGs produced: {svg_count}. Errors: {err_count}")
    print(f"Written to {args.out}")


if __name__ == "__main__":
    main()
