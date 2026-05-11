#!/usr/bin/env python3
"""Retry the 39 v106-reverted reframes using Opus instead of Sonnet.

v105 used Sonnet for reframing; v106 found 33% failed Opus cross-validation.
Hypothesis: Sonnet is at competence boundary for clinical reframing.
This script: regenerate the 39 FAILs with Opus → cross-validate with Opus
cold-answer → apply only those that pass.

Reads .audit_logs/reframe_validation.json to identify the 39.
Writes .audit_logs/reframe_retries.json with per-question outcome.
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, os, re

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-1f97f311d307-2026"

# Reuse the prompts from existing scripts
sys.path.insert(0, 'scripts')
from reframe_multi_accept import CLASSIFIER_PROMPT, extract_json as extract_json_reframe
from validate_reframes import VALIDATOR_PROMPT, extract_json as extract_json_val


def call_proxy(prompt, model="opus", max_tokens=1500, timeout=90):
    body = json.dumps({
        "model": model,
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


def reframe_with_opus(idx, q):
    """Reframe via Opus + extract JSON. Reuses CLASSIFIER_PROMPT but trusts it'll choose REFRAME for these (Sonnet already said so)."""
    correct = q['o'][q['c']]
    opts_str = '\n'.join(f'  [{i}] {o}' for i, o in enumerate(q['o']))
    # Original q from backup, since current state was reverted
    prompt = CLASSIFIER_PROMPT.format(
        q=q['q'], opts=opts_str, c=q['c'], correct=correct,
        accepted=q.get('c_accept', []), ref=q.get('ref', '—'),
    )
    txt = call_proxy(prompt, model="opus", max_tokens=2000, timeout=90)
    parsed = json.loads(extract_json_reframe(txt))
    return parsed


def validate_with_opus(new_stem, options, ref):
    """Cold-answer validation via Opus."""
    opts_str = '\n'.join(f'  [{i}] {o}' for i, o in enumerate(options))
    prompt = VALIDATOR_PROMPT.format(q=new_stem, opts=opts_str, ref=ref)
    txt = call_proxy(prompt, model="opus", max_tokens=600, timeout=60)
    return json.loads(extract_json_val(txt))


def retry_one(args_tuple):
    """Reframe with Opus → validate cold with Opus → return verdict."""
    idx, q_orig = args_tuple
    try:
        # Step 1: reframe with Opus
        reframe = reframe_with_opus(idx, q_orig)
        if reframe.get('decision') != 'REFRAME':
            return idx, None, f'opus_chose_{reframe.get("decision")}'
        new_stem = reframe.get('new_stem', '')
        new_expl = reframe.get('new_explanation', '')
        if not new_stem or not new_expl:
            return idx, None, 'missing_stem_or_expl'
        # Quality check
        if re.search(r'^#{1,6} ', new_stem + '\n' + new_expl, re.MULTILINE):
            return idx, None, 'markdown_header'

        # Step 2: validate with Opus cold-answer
        val = validate_with_opus(new_stem, q_orig['o'], q_orig.get('ref', '—'))
        picked = val.get('best_option_idx')
        conf = val.get('confidence')
        also = val.get('also_defensible_idxs', [])
        ima = q_orig['c']
        passed = (picked == ima) and (conf == 'HIGH') and (len(also) == 0)
        return idx, {
            'passed': passed,
            'new_stem': new_stem,
            'new_explanation': new_expl,
            'reframe_reason': reframe.get('reason', ''),
            'validation': val,
        }, None
    except json.JSONDecodeError as e:
        return idx, None, f'json_parse: {str(e)[:50]}'
    except urllib.error.HTTPError as e:
        return idx, None, f'http_{e.code}'
    except Exception as e:
        return idx, None, f'{type(e).__name__}: {str(e)[:60]}'


def main():
    # Identify the 39 FAIL idxs from v106
    val_log = json.load(open('.audit_logs/reframe_validation.json', encoding='utf-8'))
    audit = json.load(open('.audit_logs/reframe_decisions.json', encoding='utf-8'))
    reframed_in_v105 = [int(k) for k, v in audit.items() if v.get('decision') == 'REFRAME']

    with open('/tmp/questions.backup.json', encoding='utf-8') as f: q_backup = json.load(f)

    fails = []
    for idx in reframed_in_v105:
        v = val_log.get(str(idx))
        if not v: continue
        ima = q_backup[idx]['c']
        picked = v.get('best_option_idx')
        conf = v.get('confidence')
        also = v.get('also_defensible_idxs', [])
        if not (picked == ima and conf == 'HIGH' and len(also) == 0):
            fails.append(idx)
    print(f'v106 FAILs to retry with Opus: {len(fails)}')

    # Load originals from backup
    targets = [(idx, q_backup[idx]) for idx in fails]

    # Resume support
    out_path = '.audit_logs/reframe_retries.json'
    results = {}
    if os.path.exists(out_path):
        results = json.load(open(out_path, encoding='utf-8'))
        print(f'Resume: {len(results)} already retried')
    todo = [(idx, q) for idx, q in targets if str(idx) not in results]
    print(f'Remaining: {len(todo)}')

    errors = []
    completed = 0
    t0 = time.time()
    # Opus is slower, use lower concurrency to avoid timeouts
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(retry_one, t): t for t in todo}
        for fut in concurrent.futures.as_completed(futures):
            idx, parsed, err = fut.result()
            completed += 1
            if err:
                errors.append((idx, err))
                print(f'  [{completed}/{len(todo)}] idx={idx} ERROR: {err}')
            else:
                results[str(idx)] = parsed
                status = "PASS" if parsed['passed'] else "FAIL"
                print(f'  [{completed}/{len(todo)}] idx={idx} {status} elapsed={time.time()-t0:.0f}s')
            if completed % 5 == 0 or completed == len(todo):
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(results, f, ensure_ascii=False, indent=2)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'\nRetries done in {time.time()-t0:.1f}s. {len(errors)} errors.')

    # Apply PASSes to dataset
    passed = [int(k) for k, v in results.items() if v.get('passed')]
    failed = [int(k) for k, v in results.items() if not v.get('passed')]
    print(f'\nPASS: {len(passed)}')
    print(f'FAIL: {len(failed)} (left in reverted state)')

    if not passed:
        print('No PASSes to apply.')
        return

    with open('data/questions.json', encoding='utf-8') as f: qs = json.load(f)
    with open('data/explanations.json', encoding='utf-8') as f: exs = json.load(f)
    for idx_str, v in results.items():
        if not v.get('passed'): continue
        idx = int(idx_str)
        qs[idx]['q'] = v['new_stem']
        qs[idx].pop('c_accept', None)
        exs[idx] = v['new_explanation']
    with open('data/questions.json', 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=0)
    with open('data/explanations.json', 'w', encoding='utf-8') as f:
        json.dump(exs, f, ensure_ascii=False, indent=0)
    print(f'\nApplied {len(passed)} Opus-validated reframes.')


if __name__ == '__main__':
    main()
