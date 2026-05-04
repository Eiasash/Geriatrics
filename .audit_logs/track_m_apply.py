"""Track M — side-finding from Track K closure: fix idx 347 mis-routed ref.

Track K side-finding identified 4 condensed 2021-Dec entries (idx 285, 287,
299, 347) as intentional curator-written second-editions of their 2021-Jun
originals (idx 2402, 2403, 2405, 2408). They share question stem + same
options + same correct answer, but have:
  - Independently AI-generated explanations (different wording)
  - Grammatically condensed Hebrew (no parser truncation pattern)
  - Standardized formatting (cleaner option text)
  - Sometimes improved/different refs

Of the 4, three have defensible refs (285 ≈ 287 ≈ 299, all reasonable for
their topics). One (idx 347, ti=8 polypharmacy/clozapine-agranulocytosis) has
an obviously mis-routed ref: "Hazzard Ch 44 — SLEEP DISORDERS" — sleep is not
the topic of a clozapine-induced neutropenia question.

The 2021-Jun original (idx 2408) has the correct ref:
"Hazzard Ch 22 — MEDICATION PRESCRIBING AND DE-PRESCRIBING".

Fix: align idx 347's ref to match its sibling. q/o/c/e/t/ti unchanged.
"""
import json
import shutil
import datetime
from pathlib import Path


CHANGES = [
    # (idx, old_ref_substring_to_assert, new_ref)
    (
        347,
        'Hazzard Ch 44 — SLEEP DISORDERS',
        'Hazzard Ch 22 — MEDICATION PRESCRIBING AND DE-PRESCRIBING',
    ),
]


def main():
    repo_root = Path(__file__).resolve().parent.parent
    qpath = repo_root / 'data' / 'questions.json'

    ts = datetime.datetime.now().strftime('%Y%m%dT%H%M%SZ')
    backup = qpath.with_name(f'questions.json.bak-{ts}')
    shutil.copy2(qpath, backup)
    print(f'Backup: {backup.name}')

    data = json.loads(qpath.read_text(encoding='utf-8'))

    n = 0
    for idx, old_substr, new_ref in CHANGES:
        q = data[idx]
        cur = q.get('ref', '')
        assert old_substr in cur, f'idx {idx}: expected {old_substr!r} in ref={cur!r}'
        q['ref'] = new_ref
        n += 1
        print(f'  idx {idx}: {cur!r} → {new_ref!r}')

    qpath.write_text(
        json.dumps(data, ensure_ascii=False, indent=0) + '\n',
        encoding='utf-8',
    )
    print(f'Applied {n} ref fix(es); wrote {qpath.name}')


if __name__ == '__main__':
    main()
