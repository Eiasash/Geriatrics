#!/usr/bin/env python3
"""v10.35 assemble — build new Q dicts ready for AI explanation phase.

Inputs:
  scripts/v10_35_recovery_list.json
  scripts/v10_35_answer_keys.json
  scripts/exam_audit/canonical/<year>_basis.json
  data/topics.json
  data/questions.json (for ref-mode-by-ti lookup)

Output:
  scripts/v10_35_new_questions.json — list of dicts {tag, qnum, q, o, c, ti, ref, source}
  scripts/v10_35_orphan_deletes.json — list of bank_idx to delete
  scripts/v10_35_stale_fixes.json — list of {bank_idx, options} to overwrite
"""
import json, re, sys
from pathlib import Path
from collections import Counter
sys.path.insert(0, 'scripts/exam_audit')
from audit import norm

REPO = Path('.')
RECOVERY = REPO / 'scripts' / 'v10_35_recovery_list.json'
ANSWERS = REPO / 'scripts' / 'v10_35_answer_keys.json'
CANONICAL_DIR = REPO / 'scripts' / 'exam_audit' / 'canonical'
TOPICS = REPO / 'data' / 'topics.json'
QJ = REPO / 'data' / 'questions.json'

YEARS = {
    '2022_basis': '2022-Jun-Basic',
    '2023_basis': '2023-Jun-Basic',
    'may24_basis': '2024-May-Basic',
    'sept24_basis': '2024-Sep-Basic',
}

def assign_ti(stem_plus_options, topics):
    """Match Q text against topic keyword lists. Returns best ti or 2 (CGA fallback)."""
    text_lower = stem_plus_options.lower()
    text_norm = norm(stem_plus_options).lower()
    best_ti = 2
    best_hits = 0
    for ti, kws in enumerate(topics):
        hits = 0
        for kw in kws:
            if not kw: continue
            kw_l = kw.lower()
            if any(c >= '֐' and c <= '׿' for c in kw):  # Hebrew kw
                if kw_l in text_lower:
                    hits += 2
            else:  # English kw
                kw_norm = re.sub(r'[^a-z0-9]', '', kw_l)
                if kw_norm and (kw_l in text_lower or kw_norm in text_norm):
                    hits += 1
        if hits > best_hits:
            best_hits = hits
            best_ti = ti
    return best_ti, best_hits

def ref_mode_by_ti(bank, ti):
    """Most-common non-empty ref string for this ti in existing bank."""
    refs = [q.get('ref', '') for q in bank if q.get('ti') == ti and q.get('ref')]
    if not refs: return ''
    c = Counter(refs)
    return c.most_common(1)[0][0]

def encode_c(accepted_indices):
    """Encode answer key into c field.

    Bank convention: c is integer 0-3 for SINGLE, list for MULTI, -1 / 'all' for ALL.
    Inspecting existing bank: most are int. For MULTI/ALL we'll use list of ints.
    """
    if not accepted_indices:
        return 0
    if len(accepted_indices) == 1:
        return accepted_indices[0]
    if len(accepted_indices) == 4:
        return [0, 1, 2, 3]  # ALL
    return accepted_indices  # MULTI

def main():
    recovery = json.load(open(RECOVERY, encoding='utf-8'))
    answers = json.load(open(ANSWERS, encoding='utf-8'))
    topics = json.load(open(TOPICS, encoding='utf-8'))
    bank = json.load(open(QJ, encoding='utf-8'))

    new_qs = []
    orphan_deletes = []
    stale_fixes = []

    # 2022: 5 missing → recover. Skip orphans (canonical incomplete, may be valid).
    # 2023: 2 missing + 2 stale + 11 orphans → delete orphans, add missing, restore stale options.
    # 2024-May: 2 missing + 2 orphans → delete orphans, add missing.
    # 2024-Sep: 53 missing + 2 orphans → delete orphans, add missing.
    POLICY = {
        '2022-Jun-Basic': {'add_missing': True, 'fix_stale': True, 'delete_orphans': False},
        '2023-Jun-Basic': {'add_missing': True, 'fix_stale': True, 'delete_orphans': True},
        '2024-May-Basic': {'add_missing': True, 'fix_stale': True, 'delete_orphans': True},
        '2024-Sep-Basic': {'add_missing': True, 'fix_stale': True, 'delete_orphans': True},
    }

    summary = {}
    for cf, tag in YEARS.items():
        rep = recovery[tag]
        ans = answers[tag]['final']
        canon = json.load(open(CANONICAL_DIR / f'{cf}.json', encoding='utf-8'))['questions']
        pol = POLICY[tag]
        added = stale_n = del_n = 0

        # MISSING → new Qs from canonical
        if pol['add_missing']:
            for m in rep['missing']:
                qnum = m['qnum']
                cq = canon[qnum]
                opts = cq.get('o', [])
                # Pad/trim to 4
                while len(opts) < 4: opts.append('')
                opts = opts[:4]
                stem = cq['q']
                accepted = ans.get(qnum)
                if accepted is None:
                    print(f'WARN: {tag} Q{qnum} no answer key — skip')
                    continue
                c = encode_c(accepted)
                ti, hits = assign_ti(stem + ' ' + ' '.join(opts), topics)
                ref = ref_mode_by_ti(bank, ti)
                new_qs.append({
                    'tag': tag,
                    'qnum': qnum,
                    'q': stem,
                    'o': opts,
                    'c': c,
                    't': tag,
                    'ti': ti,
                    'e': '',
                    'ref': ref,
                    '_ti_hits': hits,
                    '_source': 'canonical_missing',
                })
                added += 1

        # STALE → fix options[3] (and any other stripped opt) from canonical
        if pol['fix_stale']:
            for s in rep['stale_options_strip']:
                bi = s['bank_idx']
                if not s['stripped_opt_indices']:
                    continue  # only flag, no actual strip
                bank_q = bank[bi]
                fixed_opts = list(bank_q.get('o', []))
                while len(fixed_opts) < 4: fixed_opts.append('')
                for idx in s['stripped_opt_indices']:
                    if idx < len(s['canonical_o']):
                        fixed_opts[idx] = s['canonical_o'][idx]
                stale_fixes.append({
                    'tag': tag,
                    'bank_idx': bi,
                    'qnum': s['qnum'],
                    'old_o': bank_q.get('o', []),
                    'new_o': fixed_opts[:4],
                })
                stale_n += 1

        # ORPHANS → delete bank rows with no canonical match
        if pol['delete_orphans']:
            for o in rep['bank_orphans']:
                orphan_deletes.append({
                    'tag': tag,
                    'bank_idx': o['bank_idx'],
                    'q_preview': o['q'],
                    'best_canonical': o['best_canonical_qnum'],
                    'best_sim': o['best_sim'],
                })
                del_n += 1

        bank_now = rep['bank_count']
        bank_after = bank_now + added - del_n  # stale fixes don't change count
        summary[tag] = {
            'bank_before': bank_now,
            'added': added,
            'stale_fixes': stale_n,
            'orphans_deleted': del_n,
            'bank_after': bank_after,
            'canonical_target': rep['canonical_count'],
        }

    with open('scripts/v10_35_new_questions.json', 'w', encoding='utf-8') as f:
        json.dump(new_qs, f, ensure_ascii=False, indent=2)
    with open('scripts/v10_35_orphan_deletes.json', 'w', encoding='utf-8') as f:
        json.dump(orphan_deletes, f, ensure_ascii=False, indent=2)
    with open('scripts/v10_35_stale_fixes.json', 'w', encoding='utf-8') as f:
        json.dump(stale_fixes, f, ensure_ascii=False, indent=2)

    print('\n=== Summary ===')
    for tag, s in summary.items():
        marker = '✓' if s['bank_after'] == s['canonical_target'] else '!'
        print(f'  {marker} {tag}: {s["bank_before"]} → {s["bank_after"]} '
              f'(+{s["added"]} -{s["orphans_deleted"]}, {s["stale_fixes"]} stale fixed) '
              f'/ canon target {s["canonical_target"]}')
    total_new = sum(s['added'] for s in summary.values())
    total_del = sum(s['orphans_deleted'] for s in summary.values())
    total_stale = sum(s['stale_fixes'] for s in summary.values())
    print(f'\nTotal: +{total_new} new Qs, -{total_del} deletes, {total_stale} stale fixes')
    print(f'  Bank delta: {total_new - total_del:+d}  (3709 → {3709 + total_new - total_del})')
    print(f'\nNew Qs needing AI explanations: {len(new_qs)}')
    print(f'Wrote: v10_35_new_questions.json, v10_35_orphan_deletes.json, v10_35_stale_fixes.json')

if __name__ == '__main__':
    main()
