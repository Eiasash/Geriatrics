"""Track K — pair the 9 unpaired broken=true entries with their canonical duplicates.

Track H paired 13 of 22 broken=true 2023-Sep entries via q-stem n-gram matching.
The remaining 9 had truncated q-stems (parser dropped multi-part case body), so the
q-stem matcher had nothing to bite on. This script uses option-text overlap as the
fallback signal — the surviving column when stems are truncated.

For each of the 9 unpaired brokens, the matching algorithm in TRACK_K_FINDINGS.md
finds the highest-score canonical (oldest year, highest match-count, highest score-sum).
This script writes the pairings into broken_reason metadata so future automation
reading the field gets accurate canonical pointers.

Updates broken_reason ONLY. q/o/c/e/ref/t/ti unchanged. broken=true unchanged
(canonical remains authoritative; truncated entries stay filtered from user pool).

Backup is written to data/questions.json.bak-<timestamp>.
"""
import json
import shutil
import datetime
import sys
from pathlib import Path


PAIRINGS = [
    # (broken_idx, canonical_idx, canonical_t, canonical_ti, broken_c, canonical_c, conflict?)
    (63,  2395, '2020',           17, 0, 2, True),   # post-vasc discharge meds
    (66,  2396, '2020',           22, 1, 1, False),  # SGLT2 euglycemic DKA
    (85,  2399, '2020',            4, 2, 2, False),  # ACTH-axis adrenal axis
    (126, 2402, '2021-Jun',       24, 2, 0, True),   # urgent-dialysis indication
    (128, 2403, '2021-Jun',       15, 0, 1, True),   # MM bone-event prophylaxis
    (139, 2405, '2021-Jun',       16, 3, 1, True),   # PMR diagnostic feature — c-conflict (3 vs 1)
    (140, 2406, '2021-Jun',       38, 2, 2, False),  # periop cardiac risk (Cr>2)
    (179, 2408, '2021-Jun',        8, 1, 1, False),  # clozapine neutropenia
    (183, 2409, '2021-Jun',        5, 3, 3, False),  # primary polydipsia (low urine osm)
]


def main():
    repo_root = Path(__file__).resolve().parent.parent
    qpath = repo_root / 'data' / 'questions.json'

    ts = datetime.datetime.now().strftime('%Y%m%dT%H%M%SZ')
    backup = qpath.with_name(f'questions.json.bak-{ts}')
    shutil.copy2(qpath, backup)
    print(f'Backup: {backup.name}')

    data = json.loads(qpath.read_text(encoding='utf-8'))

    n_updated = 0
    for broken_idx, can_idx, can_t, can_ti, broken_c, can_c, conflict in PAIRINGS:
        q = data[broken_idx]
        if not q.get('broken'):
            print(f'  WARNING idx {broken_idx}: not broken=true, skipping')
            continue

        if conflict:
            new_reason = (
                f'Duplicate of idx={can_idx} (t={can_t}, ti={can_ti}) — '
                f'canonical entry has same options but answer differs '
                f'(broken c={broken_c} vs canonical c={can_c}); '
                f'flagged broken to keep canonical authoritative. '
                f'Found via Track K option-text-overlap match (Track H q-stem matcher missed: '
                f'truncated stem). c-conflict logged for separate audit; see TRACK_K_FINDINGS.md.'
            )
        else:
            new_reason = (
                f'Duplicate of idx={can_idx} (t={can_t}, ti={can_ti}) — '
                f'canonical entry has same options and same answer (c={can_c}); '
                f'broken stem is truncated case-fragment from 2023-Sep PDF, '
                f'flagged broken to keep canonical authoritative. '
                f'Found via Track K option-text-overlap match (Track H q-stem matcher missed). '
                f'See TRACK_K_FINDINGS.md.'
            )

        old_reason = q.get('broken_reason', '')
        q['broken_reason'] = new_reason
        n_updated += 1
        print(f'  idx {broken_idx} → canonical idx {can_idx} (conflict={conflict})')

    print(f'\nUpdated {n_updated}/9 entries')

    qpath.write_text(
        json.dumps(data, ensure_ascii=False, indent=0) + '\n',
        encoding='utf-8',
    )
    print(f'Wrote {qpath.name}')


if __name__ == '__main__':
    main()
