#!/usr/bin/env python3
"""Second-pass: re-verify every eFlag with stricter prompt. Auto-decide.
Output: {idx: "keep"|"dismiss"} decisions JSON ready for apply script."""
import json, os, sys, concurrent.futures
from urllib import request

API="https://api.anthropic.com/v1/messages"; MODEL="claude-sonnet-4-5"

def verify(q_idx, q, first_reason):
    prompt = f"""First-pass AI flagged this question for explanation-answer mismatch.
First-pass reason: {first_reason}

STRICT re-check — ignore nuance, caveats, "also mention X". Only flag as REAL if:
- Explanation's core diagnosis ≠ marked option's diagnosis, OR
- Explanation's recommended drug/action ≠ marked option, OR  
- Explanation explicitly endorses a different option from the marked one

If the explanation supports the marked answer (even with caveats), mark FALSE_POSITIVE.

Question: {q['q'][:350]}
Options:
{chr(10).join(f'  {i}{"*" if i==q["c"] else " "} {o[:120]}' for i,o in enumerate(q['o']))}
(* = marked correct)

Explanation: {q.get('e','')[:700]}

Return STRICT JSON: {{"verdict": "real" or "false_positive", "why": "<=12 words"}}"""
    try:
        api_key = os.environ['ANTHROPIC_API_KEY']
        body = json.dumps({"model":MODEL,"max_tokens":100,"messages":[{"role":"user","content":prompt}]}).encode()
        req = request.Request(API, data=body, headers={"x-api-key":api_key,"anthropic-version":"2023-06-01","content-type":"application/json"})
        with request.urlopen(req, timeout=45) as r: data = json.loads(r.read().decode())
        txt = data['content'][0]['text'].strip()
        if txt.startswith('```'): txt = txt.strip('`').lstrip('json').strip()
        return q_idx, json.loads(txt)
    except Exception as e:
        return q_idx, {"verdict":"error","why":str(e)[:40]}

def main():
    app = sys.argv[1]
    mis_path = f"{app}_e_mismatches.json"
    qs_path = ("geri" if app=="geri" else "pnimit") + "/data/questions.json"
    mis = json.load(open(mis_path))
    qs = json.load(open(qs_path))
    tasks = [(f['idx'], qs[f['idx']], f['reason']) for f in mis['flagged']]
    print(f"{app}: re-checking {len(tasks)}")
    
    results = {}
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(verify, *t): t[0] for t in tasks}
        for fut in concurrent.futures.as_completed(futs):
            qi, res = fut.result()
            results[qi] = res
            done += 1
            if done % 50 == 0: print(f"  {done}/{len(tasks)}")
    
    # Build decisions
    decisions = {}
    errors = []
    real = 0; fp = 0
    for qi, res in results.items():
        v = res.get('verdict')
        if v == 'real': decisions[str(qi)] = 'keep'; real += 1
        elif v == 'false_positive': decisions[str(qi)] = 'dismiss'; fp += 1
        else: errors.append((qi, res.get('why','?')))
    
    # Include reasons for kept questions
    out = {
        "app": app,
        "decisions": decisions,
        "real_reasons": {str(qi): results[qi].get('why','') for qi,r in results.items() if r.get('verdict')=='real'},
        "stats": {"total": len(tasks), "real": real, "false_positive": fp, "errors": len(errors)},
        "errors": errors[:20],
    }
    out_path = f"{app}_decisions.json"
    json.dump(out, open(out_path,'w'), ensure_ascii=False, indent=2)
    print(f"\n{app}: real={real} false_positive={fp} errors={len(errors)} → {out_path}")

if __name__ == "__main__": main()
