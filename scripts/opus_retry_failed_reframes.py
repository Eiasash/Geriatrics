#!/usr/bin/env python3
"""Retry the 39 v105 reframes that failed Opus validation, this time using Opus.

For each FAILed index from .audit_logs/reframe_validation.json:
1. Regenerate the reframe (stem + explanation) using Opus (stronger model
   than the Sonnet that failed v105).
2. Re-validate with Opus cold (same validator as v106).
3. If validation passes (HIGH confidence, no other defensible options), apply
   the new stem + explanation + remove c_accept.
4. If still fails, leave the revert in place.

Updates .audit_logs/reframe_decisions.json + .audit_logs/reframe_validation.json
with the new Opus verdicts. Final commit writes to data/questions.json and
data/explanations.json.
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, argparse, os, re

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-1f97f311d307-2026"
Q_BACKUP = "/tmp/questions.backup.json"
E_BACKUP = "/tmp/explanations.backup2.json"
AUDIT_PATH = ".audit_logs/reframe_decisions.json"
VALIDATION_PATH = ".audit_logs/reframe_validation.json"

# Focused reframe prompt — no REFRAME/KEEP classification, just "make it work"
REFRAME_PROMPT = """You are a senior geriatrics physician rewriting a Hebrew MCQ that was previously flagged as structurally broken (multiple options literally satisfy the abstract stem).

Your task: rewrite the question as a Hebrew clinical vignette where exactly ONE option — the IMA-key answer — fits unambiguously. Add specific clinical/lab discriminators that rule out the other options without changing medical facts.

ORIGINAL QUESTION (broken):
{q}

OPTIONS (index : text):
{opts}

IMA-published correct answer: index {c} = "{correct}"
Reference textbook chapter: {ref}

PREVIOUS ATTEMPT (this one failed cross-model validation — Opus picked a different option or flagged residual ambiguity):
PREVIOUS NEW STEM: {prev_stem}
WHY IT FAILED: {fail_reason}

Your reframe MUST:
1. Be a Hebrew clinical vignette (patient age, presentation, labs/imaging, ~250-450 chars).
2. Make "{correct}" the SINGLE unambiguously best answer.
3. Add EXPLICIT discriminators that rule out each of the other 3 options. Example: if Sepsis is wrong, say "afebrile, WBC normal, no signs of infection". If Pre-Renal is wrong, say "euvolemic, no signs of dehydration".
4. Preserve the original teaching point — don't change the medical concept being tested.
5. NOT invent findings unrelated to the teaching point.

Output STRICT JSON on one line, no markdown, no code fences, no preamble:
{{"new_stem":"<full Hebrew vignette>","new_explanation":"<Hebrew explanation 4-6 sentences, plain prose with **bold** for key terms, NO markdown headers, NO tables, NO bullets. Lead with the diagnosis, then walk through why each other option is ruled out by the new clinical details.>"}}"""

VALIDATOR_PROMPT = """You are a board-certified internal medicine physician answering a Hebrew geriatrics MCQ cold. You have NO information about which option is the "official" answer.

Question:
{q}

Options:
{opts}

Reference textbook chapter: {ref}

Answer with STRICT JSON on one line, no markdown, no preamble:
{{"best_option_idx": <0-3>, "confidence": "HIGH"|"MEDIUM"|"LOW", "also_defensible_idxs": [<0-3>...], "reasoning": "<1-2 sentences>"}}

DEFINITIONS:
- best_option_idx: the single best answer given ONLY the stem's clinical/factual details.
- confidence: HIGH = stem unambiguously points to one option; MEDIUM = one is best but another could be argued; LOW = multiple roughly equally defensible.
- also_defensible_idxs: ALL other options (excluding best_option_idx) that a reasonable physician could defend given the stem's details. Empty list [] if the stem rules out all others cleanly.

CRITICAL: judge based ONLY on the stem's clinical/factual details. If the stem says "afebrile" then "sepsis" is NOT defensible; if the stem says "normal CK" then "rhabdomyolysis" is NOT defensible."""


def call_opus(prompt, max_tokens=2500, timeout=120):
    body = json.dumps({
        "model": "opus",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        PROXY, data=body,
        headers={"x-api-secret": SECRET, "content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode())
    for blk in data.get('content', []):
        if blk.get('type') == 'text':
            return blk.get('text', '').strip()
    return ''


def extract_json(txt):
    txt = txt.strip()
    if txt.startswith('```'):
        lines = txt.split('\n')
        txt = '\n'.join(l for l in lines if not l.strip().startswith('```'))
    if '{' in txt:
        start = txt.index('{')
        depth = 0
        for i, ch in enumerate(txt[start:]):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return txt[start:start+i+1]
    return txt


def reframe_and_validate(args_tuple):
    """Returns (idx, new_stem, new_explanation, validation_result, error)."""
    idx, q_original, prev_audit, prev_validation = args_tuple
    correct = q_original['o'][q_original['c']]
    opts_str = '\n'.join(f'  [{i}] {o}' for i, o in enumerate(q_original['o']))

    # Build fail reason from previous validation
    pv = prev_validation or {}
    picked = pv.get('best_option_idx')
    conf = pv.get('confidence')
    also = pv.get('also_defensible_idxs', [])
    fail_reason = f"picked={picked}, ima={q_original['c']}, conf={conf}, also_defensible={also}. {pv.get('reasoning','')[:200]}"

    # Step 1: reframe with Opus
    reframe_prompt = REFRAME_PROMPT.format(
        q=q_original['q'],
        opts=opts_str,
        c=q_original['c'],
        correct=correct,
        ref=q_original.get('ref', '—'),
        prev_stem=(prev_audit or {}).get('new_stem', '—')[:400],
        fail_reason=fail_reason,
    )
    try:
        reframe_txt = call_opus(reframe_prompt, max_tokens=2500, timeout=120)
        reframe_parsed = json.loads(extract_json(reframe_txt))
        new_stem = reframe_parsed.get('new_stem', '').strip()
        new_explanation = reframe_parsed.get('new_explanation', '').strip()
        if not new_stem or not new_explanation:
            return idx, None, None, None, 'reframe_empty'
        # Quality checks
        if re.search(r'^#{1,6} ', new_stem, re.MULTILINE) or re.search(r'^#{1,6} ', new_explanation, re.MULTILINE):
            return idx, None, None, None, 'markdown_header'
        if new_stem.count('|') >= 4 and '| ' in new_stem:
            return idx, None, None, None, 'markdown_table'
    except json.JSONDecodeError as e:
        return idx, None, None, None, f'reframe_json_parse: {str(e)[:50]}'
    except urllib.error.HTTPError as e:
        return idx, None, None, None, f'reframe_http_{e.code}'
    except Exception as e:
        return idx, None, None, None, f'reframe_{type(e).__name__}: {str(e)[:60]}'

    # Step 2: validate with Opus cold
    validate_prompt = VALIDATOR_PROMPT.format(q=new_stem, opts=opts_str, ref=q_original.get('ref', '—'))
    try:
        validate_txt = call_opus(validate_prompt, max_tokens=600, timeout=60)
        validate_parsed = json.loads(extract_json(validate_txt))
    except Exception as e:
        return idx, new_stem, new_explanation, None, f'validate_{type(e).__name__}: {str(e)[:60]}'

    return idx, new_stem, new_explanation, validate_parsed, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='Show plan, no API calls')
    ap.add_argument('--dry', action='store_true', help='Run with API calls but no writes')
    ap.add_argument('--commit', action='store_true', help='Run + write')
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()
    if not (args.preview or args.dry or args.commit):
        ap.error('--preview, --dry, or --commit required')

    audit = json.load(open(AUDIT_PATH, encoding='utf-8'))
    validation = json.load(open(VALIDATION_PATH, encoding='utf-8'))
    with open('data/questions.json', encoding='utf-8') as f: qs = json.load(f)
    with open('data/explanations.json', encoding='utf-8') as f: exs = json.load(f)
    with open(Q_BACKUP, encoding='utf-8') as f: q_backup = json.load(f)

    # Find the FAILed reframes: REFRAME decision in audit, but failed Opus validation,
    # and current dataset state is reverted (q matches backup).
    failed_idxs = []
    for k, v in audit.items():
        if v.get('decision') != 'REFRAME':
            continue
        idx = int(k)
        val = validation.get(str(idx))
        if not val:
            continue
        ima = q_backup[idx]['c']
        picked = val.get('best_option_idx')
        conf = val.get('confidence')
        also = val.get('also_defensible_idxs', [])
        ok = (picked == ima) and (conf == 'HIGH') and (len(also) == 0)
        # Also confirm currently reverted (q matches backup)
        if not ok and qs[idx]['q'] == q_backup[idx]['q']:
            failed_idxs.append(idx)

    print(f'Failed-and-reverted reframes to retry with Opus: {len(failed_idxs)}')

    if args.preview:
        print(f'Sample idxs: {failed_idxs[:10]}')
        return

    # Use backup question text (the original IMA stem) as input to the retry
    todo = [(i, q_backup[i], audit.get(str(i)), validation.get(str(i))) for i in failed_idxs]

    t0 = time.time()
    completed = 0
    results = {}

    def checkpoint_write():
        """Write all currently-passing reframes to disk."""
        cur_pass = [i for i, r in results.items() if r.get('status') == 'PASS']
        if not cur_pass:
            return 0
        for idx in cur_pass:
            r = results[idx]
            qs[idx]['q'] = r['new_stem']
            qs[idx].pop('c_accept', None)
            exs[idx] = r['new_explanation']
            audit[str(idx)] = {
                'decision': 'REFRAME',
                'reason': 'Opus retry after Sonnet failed Opus validation',
                'new_stem': r['new_stem'],
                'new_explanation': r['new_explanation'],
                'model_used': 'opus',
            }
            validation[str(idx)] = r['validation']
        with open('data/questions.json', 'w', encoding='utf-8') as f:
            json.dump(qs, f, ensure_ascii=False, indent=0)
        with open('data/explanations.json', 'w', encoding='utf-8') as f:
            json.dump(exs, f, ensure_ascii=False, indent=0)
        with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
            json.dump(audit, f, ensure_ascii=False, indent=2)
        with open(VALIDATION_PATH, 'w', encoding='utf-8') as f:
            json.dump(validation, f, ensure_ascii=False, indent=2)
        return len(cur_pass)

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(reframe_and_validate, t): t for t in todo}
        for fut in concurrent.futures.as_completed(futures):
            idx, new_stem, new_expl, val_result, err = fut.result()
            completed += 1
            if err:
                print(f'  [{completed}/{len(todo)}] idx={idx} ERROR: {err}')
                results[idx] = {'status': 'ERROR', 'err': err}
                continue
            ima = q_backup[idx]['c']
            picked = val_result.get('best_option_idx')
            conf = val_result.get('confidence')
            also = val_result.get('also_defensible_idxs', [])
            ok = (picked == ima) and (conf == 'HIGH') and (len(also) == 0)
            results[idx] = {
                'status': 'PASS' if ok else 'FAIL',
                'new_stem': new_stem,
                'new_explanation': new_expl,
                'validation': val_result,
            }
            if completed % 3 == 0 or completed == len(todo):
                pass_count = sum(1 for r in results.values() if r.get('status') == 'PASS')
                print(f'  [{completed}/{len(todo)}] idx={idx} {results[idx]["status"]} (cumulative PASS: {pass_count}) elapsed={time.time()-t0:.0f}s')
            # Checkpoint write every 5 completions if --commit
            if args.commit and completed % 5 == 0:
                n = checkpoint_write()
                if n:
                    print(f'    [checkpoint] persisted {n} PASS entries to disk')

    elapsed = time.time() - t0
    pass_idxs = [i for i, r in results.items() if r.get('status') == 'PASS']
    fail_idxs = [i for i, r in results.items() if r.get('status') == 'FAIL']
    err_idxs = [i for i, r in results.items() if r.get('status') == 'ERROR']
    print(f'\nDone in {elapsed:.1f}s')
    print(f'  PASS: {len(pass_idxs)}  (Opus reframe + Opus validation both happy)')
    print(f'  FAIL: {len(fail_idxs)}  (Opus reframed but validation still flagged residual issues)')
    print(f'  ERR:  {len(err_idxs)}   (API/parse errors — will retry next run)')

    if not args.commit:
        return

    # Final checkpoint to catch anything not yet persisted
    n = checkpoint_write()
    print(f'\nFinal checkpoint: persisted {n} total Opus PASS entries.')
    print(f'{len(fail_idxs)} remain reverted (genuinely hard to reframe).')


if __name__ == '__main__':
    main()
