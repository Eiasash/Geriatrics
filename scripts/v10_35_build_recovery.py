#!/usr/bin/env python3
"""v10.35 recovery driver — build recovery_list.json across 4 years.

For each year (2022-Jun-Basic, 2023-Jun-Basic, 2024-May-Basic, 2024-Sep-Basic):
  - Load canonical/<year>_basis.json (qnum-keyed dict).
  - Load bank rows for that tag.
  - Match each canonical Q to bank rows via norm+SequenceMatcher.
  - Categorize: missing (sim<0.45) | stale (0.45<=sim<0.65) | matched (sim>=0.65).

Output: scripts/v10_35_recovery_list.json
"""
import json, sys, os
from pathlib import Path
sys.path.insert(0, 'scripts/exam_audit')
from audit import norm, similarity

REPO = Path('.')
CANONICAL = REPO / 'scripts' / 'exam_audit' / 'canonical'
QJ = REPO / 'data' / 'questions.json'
OUT = REPO / 'scripts' / 'v10_35_recovery_list.json'

YEARS = {
    '2022_basis': '2022-Jun-Basic',
    '2023_basis': '2023-Jun-Basic',
    'may24_basis': '2024-May-Basic',
    'sept24_basis': '2024-Sep-Basic',
}

def best_match(canonical_q, bank_rows):
    """Return (best_bank_idx, best_sim, second_sim) or (None, 0, 0)."""
    full_c = canonical_q['q'] + ' ' + ' '.join(canonical_q.get('o', []))
    cq_norm = norm(full_c)
    if len(cq_norm) < 30:
        return (None, 0, 0)
    chunks = [cq_norm[i:i+20] for i in range(0, max(1, len(cq_norm)-20), 15)][:10]
    candidates = []
    for bi, bq in bank_rows:
        bf = (bq.get('q', '') or '') + ' ' + ' '.join(bq.get('o', []) or [])
        bn = norm(bf)
        if len(bn) < 30: continue
        hits = sum(1 for c in chunks if c in bn)
        if hits < 1: continue
        sim = similarity(cq_norm, bn)
        if sim >= 0.30:
            candidates.append((bi, sim))
    candidates.sort(key=lambda x: -x[1])
    if not candidates: return (None, 0, 0)
    second = candidates[1][1] if len(candidates) > 1 else 0
    return (candidates[0][0], candidates[0][1], second)

def reverse_match(bank_q, canonical_qs):
    """For a bank row, find best canonical match."""
    full_b = (bank_q.get('q', '') or '') + ' ' + ' '.join(bank_q.get('o', []) or [])
    bn = norm(full_b)
    if len(bn) < 30: return (None, 0)
    best = (None, 0)
    for qnum, cq in canonical_qs.items():
        full_c = cq['q'] + ' ' + ' '.join(cq.get('o', []))
        cn = norm(full_c)
        if len(cn) < 30: continue
        sim = similarity(bn, cn)
        if sim > best[1]:
            best = (qnum, sim)
    return best

def main():
    bank = json.load(open(QJ, encoding='utf-8'))
    out = {}
    for cf, tag in YEARS.items():
        cdata = json.load(open(CANONICAL / f'{cf}.json', encoding='utf-8'))
        cqs = cdata['questions']
        bank_rows = [(i, q) for i, q in enumerate(bank) if q.get('t') == tag]
        report = {
            'tag': tag,
            'canonical_count': len(cqs),
            'bank_count': len(bank_rows),
            'matched': [],
            'missing': [],
            'stale_options_strip': [],
            'bank_orphans': [],
        }
        # Forward: canonical → bank
        used_bank = set()
        for qnum, cq in cqs.items():
            bi, sim, second = best_match(cq, bank_rows)
            if bi is None or sim < 0.45:
                report['missing'].append({
                    'qnum': qnum,
                    'q': cq['q'],
                    'o': cq.get('o', []),
                    'best_sim': round(sim, 3),
                })
            elif sim < 0.65:
                used_bank.add(bi)
                # Identify stale: check option-length truncation
                bank_q = bank[bi]
                bank_opts = bank_q.get('o', [])
                opt_strip = []
                for i in range(min(4, len(cq.get('o', [])), len(bank_opts))):
                    if len(bank_opts[i]) < 25 and len(cq['o'][i]) > 40:
                        opt_strip.append(i)
                report['stale_options_strip'].append({
                    'qnum': qnum,
                    'bank_idx': bi,
                    'sim': round(sim, 3),
                    'q': cq['q'][:120],
                    'stripped_opt_indices': opt_strip,
                    'canonical_o': cq.get('o', []),
                })
            else:
                used_bank.add(bi)
                report['matched'].append({
                    'qnum': qnum,
                    'bank_idx': bi,
                    'sim': round(sim, 3),
                })
        # Reverse: bank rows with no canonical match (orphans = parser hallucinations)
        for bi, bq in bank_rows:
            if bi in used_bank:
                continue
            qn, sim = reverse_match(bq, cqs)
            report['bank_orphans'].append({
                'bank_idx': bi,
                'q': (bq.get('q', '') or '')[:120],
                'best_canonical_qnum': qn,
                'best_sim': round(sim, 3),
            })
        out[tag] = report
        print(f'{tag}: canonical={len(cqs)} bank={len(bank_rows)} '
              f'matched={len(report["matched"])} missing={len(report["missing"])} '
              f'stale={len(report["stale_options_strip"])} orphans={len(report["bank_orphans"])}')
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {OUT}')

if __name__ == '__main__':
    main()
