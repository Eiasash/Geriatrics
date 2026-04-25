#!/usr/bin/env python3
"""v10.35 apply — write changes into data/questions.json.

Operations (in order):
  1. Read scripts/v10_35_new_questions_with_e.json (62 Qs).
     Convert list-c to c (first accepted) + c_accept (full list).
  2. Read scripts/v10_35_orphan_deletes.json (15 deletes).
  3. Read scripts/v10_35_stale_fixes.json (0 entries — schema present).
  4. Apply: delete orphans first (high indices first to preserve numbering),
     then append new Qs after each year's existing rows (preserves grouping).
  5. Write back with json.dump(d, f, ensure_ascii=False, indent=0).
  6. Backup data/questions.json → data/questions.json.bak before writing.

Honesty check: report final per-tag counts.
"""
import json, shutil
from pathlib import Path
from collections import defaultdict

QJ = Path('data/questions.json')
NEW = Path('scripts/v10_35_new_questions_with_e.json')
DEL = Path('scripts/v10_35_orphan_deletes.json')
STALE = Path('scripts/v10_35_stale_fixes.json')
BAK = Path('data/questions.json.bak')

INTERNAL_FIELDS = {'_validate', '_attempts', '_ti_hits', '_source', 'tag', 'qnum'}

def normalize_q(q):
    """Convert recovery dict → bank dict (strip internals, fix c/c_accept)."""
    out = {}
    # Field order to match bank style
    for k in ('q', 'o', 'c', 'c_accept', 't', 'ti', 'e', 'img', 'imgDep', 'ref'):
        if k in q:
            out[k] = q[k]
    # Convert list-c to c + c_accept
    if isinstance(out.get('c'), list):
        accepted = out['c']
        out['c'] = accepted[0]
        out['c_accept'] = accepted
    # Drop empty img/imgDep keys (not present in source)
    return out

def main():
    bank = json.load(open(QJ, encoding='utf-8'))
    new_qs = json.load(open(NEW, encoding='utf-8'))
    deletes = json.load(open(DEL, encoding='utf-8'))
    stale_fixes = json.load(open(STALE, encoding='utf-8'))

    print(f'Initial bank size: {len(bank)}')

    # Backup
    shutil.copy2(QJ, BAK)
    print(f'Backup → {BAK}')

    # 1. Apply stale fixes (option restoration). Currently 0 but skeleton.
    fixed = 0
    for s in stale_fixes:
        bi = s['bank_idx']
        bank[bi]['o'] = s['new_o']
        fixed += 1
    print(f'Stale option fixes applied: {fixed}')

    # 2. Apply orphan deletes (descending index to keep earlier indices stable).
    del_indices = sorted(set(d['bank_idx'] for d in deletes), reverse=True)
    for bi in del_indices:
        bank.pop(bi)
    print(f'Orphans deleted: {len(del_indices)}')

    # 3. Append new Qs at end (simpler than inserting after each year's group;
    #    bank order is not meaningful — engine keys by t).
    for q in new_qs:
        bank.append(normalize_q(q))
    print(f'New Qs appended: {len(new_qs)}')

    # 4. Write with ensure_ascii=False, indent=0 (matches existing format)
    with open(QJ, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=0)

    # 5. Per-tag report
    counts = defaultdict(int)
    for q in bank:
        counts[q.get('t', '?')] += 1
    print(f'\nFinal bank size: {len(bank)}')
    print('Per-Basic-tag counts:')
    for t in sorted(counts):
        if 'Basic' in t:
            print(f'  {t}: {counts[t]}')
    print(f'\nTotal Qs: {len(bank)}')

if __name__ == '__main__':
    main()
