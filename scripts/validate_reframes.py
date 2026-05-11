#!/usr/bin/env python3
"""Cross-model validation of the 108 reframed questions from v105.

For each REFRAME from .audit_logs/reframe_decisions.json:
- Ask Opus (different model from the Sonnet that wrote the reframe) to
  independently answer the new question COLD — no hint about which option
  is the IMA key.
- Compare Opus's answer + confidence to q.c.
- VALID: Opus picks q.c with HIGH confidence and no other defensible options.
- FAIL: anything else (wrong pick, low confidence, multiple defensible).

For FAIL questions, revert to pre-v105 state from backups.

Outputs:
- .audit_logs/reframe_validation.json with per-question verdict
- Reverts FAIL questions in data/questions.json + data/explanations.json
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, argparse, os

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-1f97f311d307-2026"
AUDIT_PATH = ".audit_logs/reframe_decisions.json"
VALIDATION_PATH = ".audit_logs/reframe_validation.json"
Q_BACKUP = "/tmp/questions.backup.json"
E_BACKUP = "/tmp/explanations.backup2.json"

VALIDATOR_PROMPT = """You are a board-certified internal medicine physician answering a Hebrew geriatrics MCQ cold. You have NO information about which option is the "official" answer — answer as if you encountered this on an exam.

Question:
{q}

Options:
{opts}

Reference textbook chapter: {ref}

Answer with STRICT JSON on one line, no markdown, no preamble:
{{"best_option_idx": <0-3>, "confidence": "HIGH"|"MEDIUM"|"LOW", "also_defensible_idxs": [<0-3>...], "reasoning": "<1-2 sentences>"}}

DEFINITIONS:
- best_option_idx: the option that, given ONLY the clinical/factual details in the stem, is the single best answer.
- confidence:
  - HIGH = the stem's details unambiguously point to one option; the others are clearly ruled out by specific findings in the stem.
  - MEDIUM = one option is best but another could be argued.
  - LOW = the stem doesn't discriminate well; multiple options are roughly equally defensible.
- also_defensible_idxs: list ALL other options (excluding best_option_idx) that a reasonable physician could defend given the stem's clinical details. Empty list [] if the stem rules out all others cleanly.

CRITICAL: judge based ONLY on the clinical/factual details in the stem. If the stem says "afebrile" and one option is "sepsis", sepsis is NOT defensible. If the stem says "normal CK" and one option is "rhabdomyolysis", rhabdo is NOT defensible. Only flag also_defensible if the stem genuinely does not exclude that option."""


def call_proxy(prompt, timeout=60):
    body = json.dumps({
        "model": "opus",  # cross-model: validate Sonnet's work with Opus
        "max_tokens": 600,
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


def validate_one(args_tuple):
    idx, q = args_tuple
    opts_str = '\n'.join(f'  [{i}] {o}' for i, o in enumerate(q['o']))
    prompt = VALIDATOR_PROMPT.format(q=q['q'], opts=opts_str, ref=q.get('ref', '—'))
    try:
        txt = call_proxy(prompt)
        parsed = json.loads(extract_json(txt))
        return idx, parsed, None
    except json.JSONDecodeError as e:
        return idx, None, f'json_parse: {str(e)[:50]}'
    except Exception as e:
        return idx, None, f'{type(e).__name__}: {str(e)[:60]}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='Validate only, no reverts')
    ap.add_argument('--commit', action='store_true', help='Validate + revert FAILs')
    ap.add_argument('--workers', type=int, default=4)  # opus is slower, lower concurrency
    args = ap.parse_args()
    if not (args.dry or args.commit):
        ap.error('--dry or --commit required')

    audit = json.load(open(AUDIT_PATH, encoding='utf-8'))
    reframed_idxs = [int(k) for k, v in audit.items() if v.get('decision') == 'REFRAME']
    print(f'Reframed questions to validate: {len(reframed_idxs)}')

    with open('data/questions.json', encoding='utf-8') as f: qs = json.load(f)

    # Resume support
    validation = {}
    if os.path.exists(VALIDATION_PATH):
        validation = json.load(open(VALIDATION_PATH, encoding='utf-8'))
        print(f'Resume: {len(validation)} already validated')

    todo = [(i, qs[i]) for i in reframed_idxs if str(i) not in validation]
    print(f'Remaining: {len(todo)}')

    t0 = time.time()
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(validate_one, t): t for t in todo}
        for fut in concurrent.futures.as_completed(futures):
            idx, parsed, err = fut.result()
            completed += 1
            if err:
                print(f'  [{completed}/{len(todo)}] idx={idx} ERROR: {err}')
                continue
            validation[str(idx)] = parsed
            ima_key = qs[idx]['c']
            picked = parsed.get('best_option_idx')
            conf = parsed.get('confidence', 'LOW')
            also = parsed.get('also_defensible_idxs', [])
            ok = (picked == ima_key) and (conf == 'HIGH') and (len(also) == 0)
            if completed % 10 == 0 or completed == len(todo):
                print(f'  [{completed}/{len(todo)}] idx={idx} picked={picked} ima={ima_key} conf={conf} also={also} -> {"OK" if ok else "FAIL"} elapsed={time.time()-t0:.0f}s')
            # Checkpoint every 20
            if completed % 20 == 0 or completed == len(todo):
                with open(VALIDATION_PATH, 'w', encoding='utf-8') as f:
                    json.dump(validation, f, ensure_ascii=False, indent=2)
    with open(VALIDATION_PATH, 'w', encoding='utf-8') as f:
        json.dump(validation, f, ensure_ascii=False, indent=2)
    print(f'Validation done in {time.time()-t0:.1f}s')

    # Categorize
    valid = []
    fails = []
    for idx_str, v in validation.items():
        idx = int(idx_str)
        ima_key = qs[idx]['c']
        picked = v.get('best_option_idx')
        conf = v.get('confidence', 'LOW')
        also = v.get('also_defensible_idxs', [])
        if picked == ima_key and conf == 'HIGH' and len(also) == 0:
            valid.append(idx)
        else:
            fails.append((idx, {
                'picked': picked,
                'ima': ima_key,
                'conf': conf,
                'also': also,
                'reasoning': v.get('reasoning', '')[:200],
            }))

    print(f'\nVALID: {len(valid)}')
    print(f'FAIL: {len(fails)}')
    print('\nFAIL details:')
    for idx, info in fails[:30]:
        print(f'  idx={idx}: picked={info["picked"]} ima={info["ima"]} conf={info["conf"]} also={info["also"]}')
        print(f'    reason: {info["reasoning"][:160]}')

    if not args.commit:
        return

    # Revert FAILs to pre-v105 state from backups
    with open(Q_BACKUP, encoding='utf-8') as f: q_backup = json.load(f)
    with open(E_BACKUP, encoding='utf-8') as f: e_backup = json.load(f)
    with open('data/explanations.json', encoding='utf-8') as f: exs = json.load(f)

    for idx, info in fails:
        qs[idx]['q'] = q_backup[idx]['q']
        if 'c_accept' in q_backup[idx]:
            qs[idx]['c_accept'] = q_backup[idx]['c_accept']
        exs[idx] = e_backup[idx]

    with open('data/questions.json', 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=0)
    with open('data/explanations.json', 'w', encoding='utf-8') as f:
        json.dump(exs, f, ensure_ascii=False, indent=0)
    print(f'\nReverted {len(fails)} FAILed reframes to pre-v105 state.')


if __name__ == '__main__':
    main()
