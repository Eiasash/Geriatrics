#!/usr/bin/env python3
"""Regenerate explanations for c_accept-multi questions using the v102 prompt.

143 questions (3.8% of deck) have c_accept length > 1 — the dataset accepts
multiple defensible answers. Their stored explanations in data/explanations.json
were generated with the OLD prompt that commanded the AI to defend ONE answer
as "DEFINITIVELY" correct. Result: misleading lead-in like "C is correct,
though D is also classic" when the dataset accepts all four.

This script uses the v102 c_accept-aware prompt to regenerate each one. Output
is written to data/explanations.json in place (length preserved at 3743).

Usage:
  PREVIEW (3 samples, no write):  python3 scripts/regen_multi_accept_explanations.py --preview
  DRY RUN (all 143, no write):    python3 scripts/regen_multi_accept_explanations.py --dry
  FULL RUN (write):               python3 scripts/regen_multi_accept_explanations.py --commit
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, argparse

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-1f97f311d307-2026"
QS_PATH = "data/questions.json"
EX_PATH = "data/explanations.json"


def build_prompt(q):
    """Match v102 runExplainOnCall prompt verbatim. c_accept-aware.

    Format constraints added for batch regen: prose only, no markdown headers
    (##/###), no markdown tables (| col |), no bullets. Use **bold** for emphasis
    only — that's what the app's explanation renderer handles
    (`.replace(/\\*\\*(.*?)\\*\\*/g,'<b>$1</b>')`). Existing 3743 explanations
    follow this style; regen must match for visual consistency.
    """
    correct = q['o'][q['c']]
    acc = q.get('c_accept') or []
    if len(acc) > 1:
        accepted_list = ', '.join(f'"{q["o"][i]}"' for i in acc)
        key_line = (
            f'ANSWER KEY: This question accepts multiple valid answers: {accepted_list}. '
            f'IMA\'s published key is "{correct}". '
            f'Lead the explanation by acknowledging the multi-valid stem; '
            f'explain why each accepted answer is defensible and why IMA picked "{correct}".'
        )
    else:
        key_line = f'ANSWER KEY: The correct answer is DEFINITIVELY "{correct}".'
    return (
        f'{key_line}\n\n'
        f'הסבר בעברית (4-6 משפטים, פסקה אחת רציפה) למה זו התשובה הנכונה. '
        f'עגן בתשובה הנכונה. שאלה: {q["q"]}\nתשובה נכונה: {correct}\n\n'
        f'FORMAT CONSTRAINTS (strict):\n'
        f'- Plain prose only, one continuous paragraph.\n'
        f'- NO markdown headers (no ##, ###, or any heading syntax).\n'
        f'- NO markdown tables (no | col | col |).\n'
        f'- NO bullet lists (no -, *, or numbered items).\n'
        f'- Use **bold** for emphasis sparingly (drug names, key terms).\n'
        f'- Match the existing dataset style: dense Hebrew prose with embedded English medical terms.'
    )


def call_proxy(prompt, timeout=45):
    body = json.dumps({
        "model": "sonnet",
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


def regen_one(idx_q):
    idx, q = idx_q
    try:
        prompt = build_prompt(q)
        txt = call_proxy(prompt)
        return idx, txt, None
    except urllib.error.HTTPError as e:
        return idx, None, f'http_{e.code}'
    except Exception as e:
        return idx, None, f'{type(e).__name__}: {str(e)[:60]}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true', help='Show 3 samples, no write')
    ap.add_argument('--dry', action='store_true', help='Run all 143, no write')
    ap.add_argument('--commit', action='store_true', help='Run all 143 AND write')
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()

    if not (args.preview or args.dry or args.commit):
        ap.error('Specify --preview, --dry, or --commit')

    with open(QS_PATH, encoding='utf-8') as f:
        qs = json.load(f)
    with open(EX_PATH, encoding='utf-8') as f:
        exs = json.load(f)
    assert len(exs) == len(qs), f'Length mismatch: {len(exs)} vs {len(qs)}'

    multi = [
        (i, q) for i, q in enumerate(qs)
        if q.get('c_accept') and len(q['c_accept']) > 1
    ]
    print(f'Total Qs: {len(qs)}')
    print(f'Multi-accept Qs: {len(multi)}')

    if args.preview:
        # Take 3 with diverse c_accept lengths
        sample = []
        for target_len in (2, 3, 4):
            for i, q in multi:
                if len(q['c_accept']) == target_len:
                    sample.append((i, q))
                    break
        print(f'\nPreview sample (c_accept lengths: {[len(q["c_accept"]) for _,q in sample]}):\n')
        for i, q in sample:
            print(f'=== idx={i} | tag={q.get("t")} | c_accept={q["c_accept"]} | c={q["c"]} ===')
            print(f'Q: {q["q"][:200]}')
            print(f'Options: {q["o"]}')
            print(f'IMA key: {q["o"][q["c"]]}')
            print(f'\n--- OLD explanation ---')
            print(exs[i][:400])
            print(f'\n--- NEW explanation (calling proxy) ---')
            idx, txt, err = regen_one((i, q))
            if err:
                print(f'ERROR: {err}')
            else:
                print(txt[:600])
            print()
        return

    # Dry or commit — run all 143
    # Resume: any idxs already-different from backup get skipped
    backup_path = '/tmp/explanations.backup.json'
    import os as _os
    if _os.path.exists(backup_path):
        with open(backup_path, encoding='utf-8') as f:
            backup = json.load(f)
        already_done = [i for i, _ in multi if exs[i] != backup[i] and exs[i] and exs[i].strip()]
        if already_done:
            print(f'Resume: {len(already_done)} of {len(multi)} already regenerated, skipping those.')
            multi = [(i, q) for i, q in multi if i not in set(already_done)]

    print(f'Running {len(multi)} regenerations with {args.workers} workers...')
    new_exs = list(exs)  # copy
    errors = []
    completed_count = 0
    t0 = time.time()
    CHUNK = 25  # write to disk every CHUNK completions for resume safety
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as ex_pool:
        futures = {ex_pool.submit(regen_one, (idx, q)): (idx, q) for idx, q in multi}
        for fut in concurrent.futures.as_completed(futures):
            idx, txt, err = fut.result()
            completed_count += 1
            if err:
                errors.append((idx, err))
                print(f'  [{completed_count}/{len(multi)}] idx={idx} ERROR: {err}')
            else:
                new_exs[idx] = txt
                if completed_count % 10 == 0 or completed_count == len(multi):
                    print(f'  [{completed_count}/{len(multi)}] last idx={idx} ({len(txt)} chars) elapsed={time.time()-t0:.0f}s')
            # Checkpoint write — every CHUNK and at end
            if args.commit and (completed_count % CHUNK == 0 or completed_count == len(multi)):
                with open(EX_PATH, 'w', encoding='utf-8') as f:
                    json.dump(new_exs, f, ensure_ascii=False, indent=0)
                print(f'    [checkpoint] wrote {EX_PATH}')
    elapsed = time.time() - t0
    print(f'Done in {elapsed:.1f}s. {len(errors)} errors.')

    if errors:
        print('\nErrors:')
        for idx, err in errors[:10]:
            print(f'  idx={idx}: {err}')

    if not args.commit:
        print('\n(dry run — no write)')
        return

    # Validate length unchanged
    assert len(new_exs) == len(exs), f'Length changed: {len(new_exs)} vs {len(exs)}'
    # Validate no None/empty in regenerated slots
    for idx, _ in multi:
        if not new_exs[idx] or not new_exs[idx].strip():
            errors.append((idx, 'empty_after_regen'))
    if errors:
        print(f'BLOCKED: {len(errors)} questions failed. Not writing.')
        sys.exit(1)

    # Write
    with open(EX_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_exs, f, ensure_ascii=False, indent=0)
    print(f'\nWrote {EX_PATH}')


if __name__ == '__main__':
    main()
