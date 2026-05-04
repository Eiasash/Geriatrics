"""Track I — pre-regen step: strip drifted idxs from distractors.json.

Reads `.audit_logs/track_i_drift_findings.json` to identify the set of
questions with content-drifted distractors. Removes those entries from
data/distractors.json so the regeneration script picks them up as
"missing" and regenerates them. Leaves non-drifted entries intact.

This avoids spending API credits on the ~1669 questions whose distractors
are already content-aligned with their options.

Backup of distractors.json is written before mutation.
"""
import json
import shutil
import datetime
from pathlib import Path
from collections import Counter


def main():
    repo_root = Path(__file__).resolve().parent.parent
    findings_path = repo_root / '.audit_logs' / 'track_i_drift_findings.json'
    distractors_path = repo_root / 'data' / 'distractors.json'

    findings = json.loads(findings_path.read_text(encoding='utf-8'))['findings']
    drifted_idxs = sorted({f['idx'] for f in findings})
    print(f'Findings rows (idx, slot pairs with zero-token-overlap): {len(findings)}')
    print(f'Unique idxs to regenerate: {len(drifted_idxs)}')

    # Stats: how many idxs have how many drifted slots
    per_idx_count = Counter()
    for f in findings:
        per_idx_count[f['idx']] += 1
    by_count = Counter(per_idx_count.values())
    for n_drifted_slots, count in sorted(by_count.items()):
        print(f'  {count} idxs with {n_drifted_slots} drifted slot(s)')

    distractors = json.loads(distractors_path.read_text(encoding='utf-8'))
    before = len(distractors)
    print(f'\nDistractors entries before: {before}')

    # Backup
    ts = datetime.datetime.now().strftime('%Y%m%dT%H%M%SZ')
    backup = distractors_path.with_name(f'distractors.json.bak-{ts}')
    shutil.copy2(distractors_path, backup)
    print(f'Backup: {backup.name}')

    # Strip drifted idxs (entries are keyed by string-idx)
    stripped = 0
    for idx in drifted_idxs:
        k = str(idx)
        if k in distractors:
            del distractors[k]
            stripped += 1

    print(f'Stripped {stripped} entries')
    print(f'Distractors entries after: {len(distractors)}')

    # Atomic write
    tmp = distractors_path.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(distractors, ensure_ascii=False), encoding='utf-8')
    tmp.replace(distractors_path)
    print(f'Wrote {distractors_path.name}')


if __name__ == '__main__':
    main()
