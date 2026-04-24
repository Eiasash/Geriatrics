#!/usr/bin/env python3
"""e_issue triage via Toranot Claude proxy.

Reads data/questions.json, sends each e_issue=true Q to
toranot.netlify.app/api/claude for strict re-verification,
writes geri_eissue_decisions.json.

Checkpoints every 50 Qs so interrupted runs can resume.
"""
import json, os, sys, time, concurrent.futures, urllib.request, urllib.error

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-2026"
QS_PATH = "data/questions.json"
OUT_PATH = "geri_eissue_decisions.json"
CHECKPOINT = "geri_eissue_checkpoint.json"

PROMPT = """You are re-verifying a geriatrics MCQ that was flagged by a first-pass AI as having an explanation that contradicts the marked correct answer.

STRICT re-check rules — mark REAL only if:
- The explanation's core diagnosis differs from the marked option's diagnosis, OR
- The explanation's recommended drug/action differs from the marked option, OR
- The explanation explicitly endorses a different option number.

Hedging, nuance, caveats, or mentioning other options = FALSE_POSITIVE.
If the explanation supports the marked answer even with qualifications = FALSE_POSITIVE.

Question: {q}

Options:
{options}
(marked correct: option index {c})

Explanation: {e}

Return strict JSON on one line: {{"verdict": "real" OR "false_positive", "why": "<12 words>"}}"""


def verify(idx, q):
    try:
        opts_str = "\n".join(
            f"  [{i}]{'*' if i == q.get('c') else ' '} {(o or '')[:140]}"
            for i, o in enumerate(q.get('o', []))
        )
        prompt = PROMPT.format(
            q=(q.get('q') or '')[:400],
            options=opts_str,
            c=q.get('c'),
            e=(q.get('e') or '')[:800],
        )
        body = json.dumps({
            "model": "sonnet",
            "max_tokens": 100,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            PROXY, data=body,
            headers={
                "x-api-secret": SECRET,
                "content-type": "application/json",
            })
        with urllib.request.urlopen(req, timeout=25) as r:
            data = json.loads(r.read().decode())
        # Proxy passes Anthropic response shape through
        txt = ''
        for blk in data.get('content', []):
            if blk.get('type') == 'text':
                txt = blk.get('text', '').strip()
                break
        if txt.startswith('```'):
            txt = txt.strip('`').lstrip('json').strip()
        # Some responses may wrap in ```json ... ```
        if '{' in txt and '}' in txt:
            txt = txt[txt.index('{'):txt.rindex('}')+1]
        return idx, json.loads(txt)
    except json.JSONDecodeError as e:
        return idx, {"verdict": "error", "why": "json_parse: " + str(e)[:30]}
    except urllib.error.HTTPError as e:
        return idx, {"verdict": "error", "why": f"http_{e.code}"}
    except Exception as e:
        return idx, {"verdict": "error", "why": str(e)[:40]}


def main():
    qs = json.load(open(QS_PATH, encoding='utf-8'))
    flagged = [(i, q) for i, q in enumerate(qs) if q.get('e_issue')]
    print(f"Found {len(flagged)} e_issue Qs")

    # Resume from checkpoint if present
    results = {}
    if os.path.exists(CHECKPOINT):
        results = json.load(open(CHECKPOINT, encoding='utf-8'))
        results = {int(k): v for k, v in results.items()}
        print(f"Resuming from checkpoint: {len(results)} already done")

    pending = [(i, q) for i, q in flagged if i not in results]
    print(f"Pending: {len(pending)}")

    start = time.time()
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(verify, i, q): i for i, q in pending}
        for fut in concurrent.futures.as_completed(futs):
            idx, res = fut.result()
            results[idx] = res
            done += 1
            if done % 25 == 0:
                elapsed = time.time() - start
                rate = done / elapsed if elapsed > 0 else 0
                eta = (len(pending) - done) / rate if rate > 0 else 0
                print(f"  {done}/{len(pending)}  ({rate:.1f} Q/s, ETA {eta:.0f}s)")
                # Checkpoint every 50
                if done % 50 == 0:
                    json.dump({str(k): v for k, v in results.items()},
                              open(CHECKPOINT, 'w', encoding='utf-8'),
                              ensure_ascii=False, indent=2)

    # Tally
    decisions = {}
    real_reasons = {}
    errors = []
    real = fp = 0
    for idx, res in results.items():
        v = res.get('verdict')
        if v == 'real':
            decisions[str(idx)] = 'keep'
            real_reasons[str(idx)] = res.get('why', '')
            real += 1
        elif v == 'false_positive':
            decisions[str(idx)] = 'dismiss'
            fp += 1
        else:
            errors.append((idx, res.get('why', '?')))

    out = {
        "decisions": decisions,
        "real_reasons": real_reasons,
        "stats": {
            "total_flagged": len(flagged),
            "processed": len(results),
            "real_issue_confirmed": real,
            "false_positive_to_dismiss": fp,
            "errors": len(errors),
        },
        "errors_sample": errors[:20],
    }
    json.dump(out, open(OUT_PATH, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    # Clean up checkpoint on full success
    if len(errors) < 10:
        try:
            os.remove(CHECKPOINT)
        except OSError:
            pass
    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s. real={real} false_positive={fp} errors={len(errors)}")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
