#!/usr/bin/env python3
"""Triage + reframe the 142 remaining multi-accept questions.

For each question with c_accept length > 1, ask the AI to decide:
- REFRAME: stem-flawed MCQ (abstract stem where multiple options literally
  satisfy the criterion). Generate a Hebrew clinical vignette where exactly
  ONE option fits, plus a matching explanation.
- KEEP: clinically-ambiguous (realistic case where reasonable physicians
  disagree). The multi-answer state reflects real medicine; leave as-is.

Writes decisions to .audit_logs/reframe_decisions.json with full audit trail.
Applies REFRAME changes to data/questions.json + data/explanations.json.

Usage:
  --preview          3 samples, no write
  --commit           all 142, write
  --workers N        parallelism (default 6)
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, argparse, os, re

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-1f97f311d307-2026"
QS_PATH = "data/questions.json"
EX_PATH = "data/explanations.json"
AUDIT_PATH = ".audit_logs/reframe_decisions.json"

CLASSIFIER_PROMPT = """You are reviewing an MCQ from a Hebrew geriatrics board exam study app. The grader accepts MULTIPLE answers for this question (c_accept has more than one valid index). Decide which category applies:

CASE A — STEM-FLAWED:
The stem is structurally broken. Typically an abstract question with no clinical context, where multiple options LITERALLY satisfy the stem's criterion. The IMA expected one specific answer but the wording doesn't discriminate.
EXAMPLE: "In which case is FeNa<1% expected?" with options [Pre-Renal, CIN, Rhabdo, Sepsis] — all four CAN have FeNa<1%; the stem has no clinical discriminator.
ACTION: REFRAME — rewrite as a Hebrew clinical vignette adding discriminators that rule out the wrong options. ONE option (the IMA key) must fit unambiguously.

CASE B — CLINICALLY AMBIGUOUS:
The stem is already a clinical case description. The medicine itself is genuinely gray — reasonable physicians would disagree. The multi-answer state reflects real clinical reasoning, not a stem-writing flaw.
EXAMPLE: 92yo with mixed cognitive findings — Normal Aging vs MCI is a real clinical dilemma without a single right answer.
ACTION: KEEP — leave as-is. The teaching value IS the ambiguity.

---

Question (Hebrew):
{q}

Options:
{opts}

IMA published key: index {c} = "{correct}"
Currently accepted indices: {accepted}

Reference: {ref}

---

Respond with STRICT JSON on one line, no markdown, no code fences, no preamble:

For REFRAME:
{{"decision":"REFRAME","reason":"<1 sentence>","new_stem":"<full Hebrew vignette stem, dense single paragraph>","new_explanation":"<Hebrew explanation, 4-6 sentences, plain prose with **bold** for key terms, NO markdown headers, NO tables, NO bullet lists. Lead with the diagnosis, explain why it fits, then walk through why each other option is ruled out by the new clinical details.>"}}

For KEEP:
{{"decision":"KEEP","reason":"<1 sentence explaining why the ambiguity is genuine clinical reasoning, not a stem flaw>"}}

CRITICAL RULES for REFRAME:
- Do NOT change medical facts. Only ADD discriminators (e.g., "afebrile", "normal CK", "no dehydration") that rule out wrong options.
- The IMA-key option ("{correct}") MUST remain the single best answer.
- Match the dataset's existing vignette style: dense Hebrew with embedded English medical terms, age-specified, lab values realistic, ~250-400 chars.
- Do not invent diagnoses or findings not implied by the original question's teaching point.
- Use the question reference ({ref}) as the authoritative source for the teaching point."""


def call_proxy(prompt, timeout=60, max_tokens=1500):
    body = json.dumps({
        "model": "sonnet",
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
    """Robustly extract JSON object from response."""
    txt = txt.strip()
    if txt.startswith('```'):
        # strip code fence
        lines = txt.split('\n')
        txt = '\n'.join(l for l in lines if not l.strip().startswith('```'))
    # Find the first { and the matching last }
    if '{' in txt:
        start = txt.index('{')
        # Find matching closing brace by counting
        depth = 0
        for i, ch in enumerate(txt[start:]):
            if ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    return txt[start:start+i+1]
    return txt


def triage_one(args_tuple):
    idx, q = args_tuple
    correct = q['o'][q['c']]
    opts_str = '\n'.join(f'  [{i}] {o}' for i, o in enumerate(q['o']))
    prompt = CLASSIFIER_PROMPT.format(
        q=q['q'],
        opts=opts_str,
        c=q['c'],
        correct=correct,
        accepted=q.get('c_accept', []),
        ref=q.get('ref', '—'),
    )
    try:
        txt = call_proxy(prompt)
        parsed = json.loads(extract_json(txt))
        # Validate
        if parsed.get('decision') not in ('REFRAME', 'KEEP'):
            return idx, None, f'bad_decision={parsed.get("decision")}'
        if parsed['decision'] == 'REFRAME':
            if not parsed.get('new_stem', '').strip():
                return idx, None, 'reframe_missing_new_stem'
            if not parsed.get('new_explanation', '').strip():
                return idx, None, 'reframe_missing_new_explanation'
            # Quality checks
            for field in ('new_stem', 'new_explanation'):
                v = parsed[field]
                if re.search(r'^#{1,6} ', v, re.MULTILINE):
                    return idx, None, f'{field}_has_markdown_header'
                if v.count('|') >= 4 and '| ' in v:
                    return idx, None, f'{field}_has_markdown_table'
        return idx, parsed, None
    except json.JSONDecodeError as e:
        return idx, None, f'json_parse: {str(e)[:50]}'
    except urllib.error.HTTPError as e:
        return idx, None, f'http_{e.code}'
    except Exception as e:
        return idx, None, f'{type(e).__name__}: {str(e)[:60]}'


def load_existing_audit():
    if os.path.exists(AUDIT_PATH):
        try:
            return json.load(open(AUDIT_PATH, encoding='utf-8'))
        except Exception:
            return {}
    return {}


def save_audit(audit):
    os.makedirs(os.path.dirname(AUDIT_PATH), exist_ok=True)
    with open(AUDIT_PATH, 'w', encoding='utf-8') as f:
        json.dump(audit, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview', action='store_true')
    ap.add_argument('--commit', action='store_true')
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()
    if not (args.preview or args.commit):
        ap.error('--preview or --commit required')

    with open(QS_PATH, encoding='utf-8') as f: qs = json.load(f)
    with open(EX_PATH, encoding='utf-8') as f: exs = json.load(f)
    assert len(qs) == len(exs) == 3743

    multi = [(i, q) for i, q in enumerate(qs) if q.get('c_accept') and len(q['c_accept']) > 1]
    print(f'Multi-accept Qs to triage: {len(multi)}')

    if args.preview:
        # 3 diverse samples: short-stem (likely flawed), long-vignette (likely keep), mid
        sorted_by_len = sorted(multi, key=lambda x: len(x[1]['q']))
        sample = [sorted_by_len[0], sorted_by_len[len(sorted_by_len)//2], sorted_by_len[-1]]
        for i, q in sample:
            print(f'\n=== idx={i} | stem-len={len(q["q"])} | c_accept={q["c_accept"]} ===')
            print(f'Q: {q["q"][:300]}')
            idx, parsed, err = triage_one((i, q))
            if err:
                print(f'ERROR: {err}')
                continue
            print(f'DECISION: {parsed["decision"]}')
            print(f'REASON: {parsed["reason"]}')
            if parsed['decision'] == 'REFRAME':
                print(f'NEW STEM: {parsed["new_stem"][:400]}')
                print(f'NEW EXPL: {parsed["new_explanation"][:400]}')
        return

    # Full commit run — resume support via audit log
    audit = load_existing_audit()
    todo = [(i, q) for i, q in multi if str(i) not in audit]
    print(f'Already triaged: {len(multi) - len(todo)}; Remaining: {len(todo)}')

    errors = []
    t0 = time.time()
    completed = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(triage_one, t): t for t in todo}
        for fut in concurrent.futures.as_completed(futures):
            idx, parsed, err = fut.result()
            completed += 1
            if err:
                errors.append((idx, err))
                print(f'  [{completed}/{len(todo)}] idx={idx} ERROR: {err}')
            else:
                audit[str(idx)] = parsed
                if completed % 10 == 0 or completed == len(todo):
                    print(f'  [{completed}/{len(todo)}] last idx={idx} {parsed["decision"]} elapsed={time.time()-t0:.0f}s')
            # Checkpoint every 20
            if completed % 20 == 0 or completed == len(todo):
                save_audit(audit)
    save_audit(audit)
    print(f'\nDone in {time.time()-t0:.1f}s. Errors: {len(errors)}')

    if errors:
        for idx, err in errors[:10]:
            print(f'  idx={idx}: {err}')
        if len(errors) > len(todo) // 4:
            print('FAIL: too many errors, not applying changes')
            sys.exit(1)

    # Apply REFRAME decisions to dataset
    reframes = {int(k): v for k, v in audit.items() if v.get('decision') == 'REFRAME'}
    keeps = {int(k): v for k, v in audit.items() if v.get('decision') == 'KEEP'}
    print(f'\nReframes to apply: {len(reframes)}')
    print(f'Keeps (left as-is): {len(keeps)}')

    if not args.commit:
        return

    for idx, parsed in reframes.items():
        qs[idx]['q'] = parsed['new_stem']
        qs[idx].pop('c_accept', None)  # now single-answer
        exs[idx] = parsed['new_explanation']

    with open(QS_PATH, 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=0)
    with open(EX_PATH, 'w', encoding='utf-8') as f:
        json.dump(exs, f, ensure_ascii=False, indent=0)
    print(f'\nWrote {QS_PATH} and {EX_PATH}')


if __name__ == '__main__':
    main()
