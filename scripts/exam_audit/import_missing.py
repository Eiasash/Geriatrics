#!/usr/bin/env python3
"""
import_missing.py — Import canonical Qs that are missing from questions.json.

For each exam in audit reports, find the canonical Qs not matched in dataset.
Dedupe across exams (same Q recycled in basis+al of same year → one import).
Classify each with a topic index (ti) via keyword matching vs topics.json.
Assign the correct c value from the revised answer key.

Usage:
    python3 import_missing.py           # dry-run preview
    python3 import_missing.py --apply   # write new entries to questions.json
"""
import json, sys, re
from pathlib import Path
from difflib import SequenceMatcher

HERE = Path(__file__).parent
REPO = HERE.parent.parent
QJ = REPO / 'data' / 'questions.json'
TOPICS_J = REPO / 'data' / 'topics.json'
REPORTS = HERE / 'reports'
CANONICAL = HERE / 'canonical'

# Map exam_id → (primary tag to assign, secondary exam to dedup against)
EXAM_TAG_MAP = {
    '2020_al': '2020',
    '2021_al': 'יוני 21',
    '2022_al': '2022',
    '2022_basis': '2022',
    '2023_al': 'יוני 23',
    '2023_basis': 'יוני 23',
    'may24_al': 'מאי 24',
    'may24_basis': 'מאי 24',
    'sept24_al': 'ספט 24',
    'sept24_basis': 'ספט 24',
    '2025_al': 'יוני 25',
    '2025_basis': 'יוני 25',
}

def norm(s):
    if not s: return ''
    s = re.sub(r'[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]', '', s)
    return re.sub(r'[^\u0590-\u05FFa-zA-Z0-9]', '', s).lower()

def classify_ti(q_text, topics):
    """Return the topic index whose keywords best match the question text."""
    q_lower = q_text.lower()
    best_ti = 0
    best_score = 0
    for ti, kwlist in enumerate(topics):
        score = 0
        for kw in kwlist:
            kw_lower = kw.lower()
            # Hebrew keyword or English — substring match
            if kw_lower in q_lower:
                score += len(kw_lower)  # longer matches weigh more
        if score > best_score:
            best_score = score
            best_ti = ti
    return best_ti, best_score

def load_answers(exam_id):
    """Parse revised (preferred) or original answer key for an exam."""
    from parse_answers import parse_answers
    cache = HERE / 'cache'
    for kind in ['revised_pdf', 'ans_pdf']:
        matches = list(cache.glob(f'{exam_id}__{kind}__*'))
        if matches:
            return parse_answers(matches[0])
    return {}

def main():
    apply = '--apply' in sys.argv
    
    with open(QJ, encoding='utf-8') as f: qs = json.load(f)
    with open(TOPICS_J, encoding='utf-8') as f: topics = json.load(f)
    
    reports = json.load(open(REPORTS / '_all_reports.json', encoding='utf-8'))
    
    # Collect all missing canonical Q entries
    candidates = []  # list of (exam_id, q_num, canonical_q_dict, tag, accepted)
    for exam_id, report in reports.items():
        canon_file = CANONICAL / f'{exam_id}.json'
        if not canon_file.exists(): continue
        canon = json.load(open(canon_file, encoding='utf-8'))
        answers = load_answers(exam_id)
        tag = EXAM_TAG_MAP.get(exam_id)
        if not tag: continue
        for q_num, _stem_snippet in report['findings']['no_match']:
            canon_q = canon['questions'].get(str(q_num))
            if not canon_q: continue
            # Must have 4 complete options
            if len(canon_q.get('o', [])) != 4: continue
            # Must have answer key
            accepted = answers.get(q_num)
            if not accepted or len(accepted) != 1:
                # Skip multi-accept or missing for now (safer)
                continue
            candidates.append((exam_id, q_num, canon_q, tag, accepted))
    
    print(f"Total missing candidates: {len(candidates)}")
    
    # Dedupe: group by question text similarity >= 0.85
    unique = []
    for cand in candidates:
        exam_id, q_num, cq, tag, accepted = cand
        cq_norm = norm(cq['q'] + ' '.join(cq['o']))
        matched_existing = False
        for u in unique:
            u_norm = norm(u[2]['q'] + ' '.join(u[2]['o']))
            if SequenceMatcher(None, cq_norm[:500], u_norm[:500]).ratio() >= 0.85:
                matched_existing = True
                break
        if not matched_existing:
            unique.append(cand)
    
    print(f"After dedup: {len(unique)} unique Qs")
    
    # IDEMPOTENCY GUARD: reject any candidate that already exists in dataset.
    # Prevents duplicate entries on repeated --apply runs.
    existing_norms = set()
    for q in qs:
        ek = norm((q.get('q','') or '') + ' '.join(q.get('o',[]) or []))
        if len(ek) >= 50:
            existing_norms.add(ek[:500])
    already_in_dataset = []
    truly_new = []
    for cand in unique:
        exam_id, q_num, cq, tag, accepted = cand
        cq_norm = norm(cq['q'] + ' '.join(cq['o']))[:500]
        if cq_norm in existing_norms:
            already_in_dataset.append(cand)
            continue
        truly_new.append(cand)
    if already_in_dataset:
        print(f"Skipping {len(already_in_dataset)} candidates already in dataset")
    unique = truly_new
    
    # Build new entries
    new_entries = []
    for exam_id, q_num, cq, tag, accepted in unique:
        stem = cq['q'].strip()
        # Clean up trailing option marker if bled in
        stem = re.sub(r'\s*[אבגד]\s*\.?\s*$', '', stem).strip()
        opts = [o.strip() for o in cq['o']]
        ti, score = classify_ti(stem + ' ' + ' '.join(opts), topics)
        entry = {
            'q': stem,
            'o': opts,
            'c': accepted[0],
            't': tag,
            'ti': ti,
        }
        new_entries.append((exam_id, q_num, entry, score))
    
    # Preview
    print("\nPreview (first 10):")
    for exam_id, qn, e, score in new_entries[:10]:
        print(f"  {exam_id} Q{qn}: tag={e['t']!r} ti={e['ti']} (kw_score={score}) c={e['c']}")
        print(f"    q: {e['q'][:80]}")
    
    if apply:
        # Append to dataset
        for _, _, entry, _ in new_entries:
            qs.append(entry)
        with open(QJ, 'w', encoding='utf-8') as f:
            json.dump(qs, f, ensure_ascii=False, indent=1)
        print(f"\nAppended {len(new_entries)} entries. New total: {len(qs)}")
    else:
        print(f"\nDRY RUN — use --apply to append {len(new_entries)} new entries")

if __name__ == '__main__':
    main()
