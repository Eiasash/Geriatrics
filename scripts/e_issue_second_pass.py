#!/usr/bin/env python3
"""e_issue_second_pass.py — second-pass triage for e_issue-flagged Qs.

Reads questions.json directly (e_issue=true was set by an earlier first-pass).
Re-asks Claude with a STRICT prompt: is this a real explanation/answer mismatch,
or a false positive from the first pass?

Output: data/e_issue_decisions.json
  {
    "decisions": {"<idx>": "keep"|"dismiss"},
    "real_reasons": {"<idx>": "<=12-word reason"},
    "stats": {...}
  }

Then run:
  python3 scripts/apply_e_issue_decisions.py data/e_issue_decisions.json data/questions.json

Why direct Anthropic API and not the Toranot proxy:
  Toranot proxy is a Netlify SYNC function. Hard 10s timeout.
  This script processes 500+ Qs at ~2s each in 12 parallel workers — a
  single batch comfortably exceeds 10s. Use Anthropic directly.
  Cost: ~$0.40 for the full 514-Q sweep.

Usage:
  export ANTHROPIC_API_KEY=sk-ant-...
  python3 scripts/e_issue_second_pass.py
  # Inspect data/e_issue_decisions.json — sanity-check the kept set
  python3 scripts/apply_e_issue_decisions.py data/e_issue_decisions.json data/questions.json
  npm run verify
"""
import json, os, sys, concurrent.futures, time
from urllib import request, error as urlerror

API = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-5"
QS_PATH = "data/questions.json"
OUT_PATH = "data/e_issue_decisions.json"
MAX_WORKERS = 12
TIMEOUT_S = 60
MAX_RETRIES = 3


def verify(idx, q):
    """Re-check a single e_issue Q. Returns (idx, {verdict, why})."""
    options_block = "\n".join(
        f'  {i}{"*" if i == q.get("c") else " "} {(o or "")[:140]}'
        for i, o in enumerate(q.get("o", []))
    )
    prompt = f"""First-pass AI flagged this geriatrics Q as having an explanation/answer mismatch.

STRICT re-check rules — flag REAL only if:
  • Explanation's core diagnosis ≠ marked option's diagnosis, OR
  • Explanation's recommended drug/action ≠ marked option, OR
  • Explanation explicitly endorses a different option

If the explanation supports the marked answer (even with extra caveats,
"also consider X", or stylistic noise), mark FALSE_POSITIVE.

Question: {(q.get("q") or "")[:400]}
Options:
{options_block}
(* = marked correct)

Explanation: {(q.get("e") or "")[:800]}

Return STRICT JSON, no markdown fences, no commentary:
{{"verdict": "real" or "false_positive", "why": "<=12 words"}}"""

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 100,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()

    last_err = ""
    for attempt in range(MAX_RETRIES):
        try:
            req = request.Request(
                API,
                data=body,
                headers={
                    "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
            )
            with request.urlopen(req, timeout=TIMEOUT_S) as r:
                data = json.loads(r.read().decode())
            txt = data["content"][0]["text"].strip()
            if txt.startswith("```"):
                txt = txt.strip("`").lstrip("json").strip()
            return idx, json.loads(txt)
        except urlerror.HTTPError as e:
            last_err = f"HTTP {e.code}"
            # 429/529 → backoff
            if e.code in (429, 529):
                time.sleep(2 ** attempt)
                continue
            break
        except Exception as e:
            last_err = type(e).__name__ + ":" + str(e)[:40]
            time.sleep(1)
    return idx, {"verdict": "error", "why": last_err[:80]}


def main():
    if "ANTHROPIC_API_KEY" not in os.environ:
        print("FATAL: set ANTHROPIC_API_KEY env var (do NOT use the Toranot proxy)", file=sys.stderr)
        sys.exit(2)

    qs = json.load(open(QS_PATH, encoding="utf-8"))
    tasks = [(i, q) for i, q in enumerate(qs) if q.get("e_issue")]
    n = len(tasks)
    if n == 0:
        print("No e_issue Qs found. Nothing to do.")
        return
    print(f"e_issue triage: {n} Qs, {MAX_WORKERS} workers, model={MODEL}")
    print(f"Estimated cost: ${n * 0.0008:.2f}  Estimated time: {n * 2 / MAX_WORKERS:.0f}s")

    results = {}
    done = 0
    t0 = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = {ex.submit(verify, idx, q): idx for idx, q in tasks}
        for fut in concurrent.futures.as_completed(futs):
            idx, res = fut.result()
            results[idx] = res
            done += 1
            if done % 25 == 0 or done == n:
                rate = done / max(time.time() - t0, 0.1)
                eta = (n - done) / max(rate, 0.1)
                print(f"  {done}/{n}  ({rate:.1f} q/s, ETA {eta:.0f}s)")

    decisions, real_reasons, errors = {}, {}, []
    real = fp = err = 0
    for idx, res in results.items():
        v = res.get("verdict")
        if v == "real":
            decisions[str(idx)] = "keep"
            real_reasons[str(idx)] = res.get("why", "")
            real += 1
        elif v == "false_positive":
            decisions[str(idx)] = "dismiss"
            fp += 1
        else:
            errors.append({"idx": idx, "why": res.get("why", "?")})
            err += 1

    out = {
        "model": MODEL,
        "decisions": decisions,
        "real_reasons": real_reasons,
        "stats": {
            "total": n,
            "real": real,
            "false_positive": fp,
            "errors": err,
            "elapsed_s": round(time.time() - t0, 1),
        },
        "errors": errors[:30],
    }
    json.dump(out, open(OUT_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(f"\nDone. real={real}  false_positive={fp}  errors={err}")
    print(f"Wrote {OUT_PATH}")
    print(f"\nNext: python3 scripts/apply_e_issue_decisions.py {OUT_PATH} {QS_PATH}")


if __name__ == "__main__":
    main()
