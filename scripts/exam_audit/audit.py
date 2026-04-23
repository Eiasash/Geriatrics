#!/usr/bin/env python3
"""
audit.py — Run full audit pipeline for all geriatrics exams.

For each exam:
  1. Parse canonical question PDF (with LIS monotonic fix)
  2. Parse revised (or original fallback) answer key
  3. Match each canonical Q against questions.json entries using SequenceMatcher
     (full text + options, threshold 0.75)
  4. Compare: c value matches accepted list? tag matches expected? img set if needed?
  5. Produce per-exam report + aggregated global report

Only reports findings — does NOT modify questions.json. Use apply scripts for fixes.

Usage:
    python3 audit.py                    # audit all exams
    python3 audit.py <exam_id>          # audit single exam
    python3 audit.py --summary          # short summary only
"""
import json, sys, re
from pathlib import Path
from difflib import SequenceMatcher
from collections import defaultdict

from parse_questions import parse_exam
from parse_answers import parse_answers

HERE = Path(__file__).parent
CACHE = HERE / 'cache'
CANONICAL = HERE / 'canonical'
CANONICAL.mkdir(exist_ok=True)
REPORTS = HERE / 'reports'
REPORTS.mkdir(exist_ok=True)
REPO = HERE.parent.parent
QJ = REPO / 'data' / 'questions.json'

IMG_BASE = "https://krmlzwwelqvlfslwltol.supabase.co/storage/v1/object/public/question-images"
BIDI_RE = re.compile(r'[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]')

def norm(s):
    if not s: return ''
    s = BIDI_RE.sub('', s)
    return re.sub(r'[^\u0590-\u05FFa-zA-Z0-9]', '', s).lower()

def similarity(a, b, max_len=600):
    if not a or not b: return 0
    return SequenceMatcher(None, a[:max_len], b[:max_len]).ratio()

def find_cache(exam_id, kind):
    """Find cached PDF by exam_id and kind."""
    matches = list(CACHE.glob(f'{exam_id}__{kind}__*'))
    return matches[0] if matches else None

def match_canonical_to_dataset(canonical_qs, dataset, prefer_tags=None):
    """For each canonical Q, find the best matching dataset idx.
    
    Returns {q_num: (idx, similarity, rank)} where rank is 0 for best match.
    Only returns matches with similarity >= 0.65.
    """
    matches = {}
    for q_num, cq in canonical_qs.items():
        # Build full canonical text: stem + options
        full_text = cq['q'] + ' ' + ' '.join(cq.get('o', []))
        cq_norm = norm(full_text)
        if len(cq_norm) < 30:
            continue
        candidates = []
        # Quick screen: need 2+ 20-char chunks to appear
        chunks = [cq_norm[i:i+20] for i in range(0, max(1, len(cq_norm)-20), 15)][:10]
        for idx, q in enumerate(dataset):
            ds_full = (q.get('q', '') or '') + ' ' + ' '.join(q.get('o', []) or [])
            ds_norm = norm(ds_full)
            if len(ds_norm) < 30: continue
            hits = sum(1 for c in chunks if c in ds_norm)
            if hits < 2: continue
            sim = similarity(cq_norm, ds_norm)
            if sim >= 0.65:
                candidates.append((idx, sim))
        # Sort by similarity desc, then by preferred tag
        if prefer_tags:
            def tag_rank(idx):
                t = dataset[idx].get('t')
                if t in prefer_tags:
                    return prefer_tags.index(t)
                return len(prefer_tags)
            candidates.sort(key=lambda x: (-x[1], tag_rank(x[0])))
        else:
            candidates.sort(key=lambda x: -x[1])
        matches[q_num] = candidates[:3]  # top 3
    return matches

def audit_exam(exam_meta, dataset):
    """Audit a single exam. Returns a report dict."""
    exam_id = exam_meta['id']
    tags = exam_meta.get('tag_candidates', [])
    
    # Parse canonical
    q_pdf = find_cache(exam_id, 'q_pdf')
    if not q_pdf:
        return {'error': f'No q_pdf cached for {exam_id}'}
    canonical_qs, stats = parse_exam(q_pdf)
    # Save canonical for reuse
    with open(CANONICAL / f'{exam_id}.json', 'w', encoding='utf-8') as f:
        json.dump({'questions': {str(k): v for k,v in canonical_qs.items()}, 'stats': stats}, f, ensure_ascii=False, indent=1)
    
    # Parse answers (prefer revised)
    ans_pdf = find_cache(exam_id, 'revised_pdf') or find_cache(exam_id, 'ans_pdf')
    answers = parse_answers(ans_pdf) if ans_pdf else {}
    
    # Match canonical to dataset
    matches = match_canonical_to_dataset(canonical_qs, dataset, prefer_tags=tags)
    
    # Build report
    report = {
        'exam_id': exam_id,
        'track': exam_meta.get('track'),
        'date': exam_meta.get('date'),
        'tag_candidates': tags,
        'stats': {
            'canonical_parsed': len(canonical_qs),
            'canonical_with_4_opts': stats['with_full_options'],
            'answers_parsed': len(answers),
            'questions_with_matches': sum(1 for m in matches.values() if m),
            'questions_without_matches': sum(1 for m in matches.values() if not m),
        },
        'findings': {
            'c_mismatches': [],         # (q_num, idx, tag, current_c, expected_accepted, sim)
            'tag_mismatches': [],       # (q_num, idx, current_tag, expected_tags, sim)
            'no_match': [],             # (q_num, stem_snippet)
            'low_confidence': [],       # (q_num, idx, sim) — match sim 0.65-0.75
            'duplicates': [],           # (q_num, [(idx, tag, sim)]) — multiple strong matches
            'missing_ti': [],           # (q_num, idx)
            'truncated_q': [],          # (q_num, idx, len)
        }
    }
    
    for q_num, match_list in matches.items():
        if not match_list:
            stem = canonical_qs[q_num]['q'][:80]
            report['findings']['no_match'].append((q_num, stem))
            continue
        
        # Primary match
        idx, sim = match_list[0]
        q = dataset[idx]
        current_c = q.get('c')
        current_tag = q.get('t')
        current_ti = q.get('ti')
        current_img = q.get('img')
        ds_q_len = len((q.get('q','') or ''))
        
        # c check
        accepted = answers.get(q_num, [])
        if accepted:
            if current_c is None or current_c not in accepted:
                report['findings']['c_mismatches'].append({
                    'q_num': q_num,
                    'idx': idx,
                    'tag': current_tag,
                    'current_c': current_c,
                    'accepted': accepted,
                    'recommended_c': accepted[0],
                    'sim': round(sim, 3),
                })
        
        # Tag check
        if tags and current_tag not in tags:
            report['findings']['tag_mismatches'].append({
                'q_num': q_num,
                'idx': idx,
                'current_tag': current_tag,
                'expected_tags': tags,
                'sim': round(sim, 3),
            })
        
        # Low confidence
        if sim < 0.75:
            report['findings']['low_confidence'].append({
                'q_num': q_num,
                'idx': idx,
                'sim': round(sim, 3),
                'tag': current_tag,
            })
        
        # Multiple strong matches → duplicates
        strong_matches = [(i, dataset[i].get('t'), s) for i, s in match_list if s >= 0.85]
        if len(strong_matches) > 1:
            report['findings']['duplicates'].append({
                'q_num': q_num,
                'matches': strong_matches,
            })
        
        # Missing ti
        if current_ti is None:
            report['findings']['missing_ti'].append({'q_num': q_num, 'idx': idx})
        
        # Truncated question text (<40 chars is very short)
        if ds_q_len < 40 and q.get('o'):
            report['findings']['truncated_q'].append({
                'q_num': q_num, 'idx': idx,
                'ds_q_len': ds_q_len,
                'tag': current_tag,
            })
    
    return report

def main():
    with open(HERE / 'sources.json', encoding='utf-8') as f:
        src = json.load(f)
    with open(QJ, encoding='utf-8') as f:
        dataset = json.load(f)
    
    # Parse args
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    summary_only = '--summary' in sys.argv
    
    exams_to_audit = src['exams']
    if args:
        exams_to_audit = [e for e in exams_to_audit if e['id'] in args]
    
    all_reports = {}
    
    for exam in exams_to_audit:
        print(f"\n{'='*70}")
        print(f"AUDITING: {exam['id']}  ({exam.get('track')} / {exam.get('date')})")
        print(f"{'='*70}")
        report = audit_exam(exam, dataset)
        if 'error' in report:
            print(f"  ERROR: {report['error']}")
            continue
        
        s = report['stats']
        f_ = report['findings']
        print(f"  Canonical parsed: {s['canonical_parsed']} ({s['canonical_with_4_opts']} with 4 opts)")
        print(f"  Answer key parsed: {s['answers_parsed']}")
        print(f"  Matched in dataset: {s['questions_with_matches']}/{s['canonical_parsed']}")
        print(f"  NOT in dataset: {s['questions_without_matches']}")
        print()
        print(f"  FINDINGS:")
        print(f"    c-value mismatches:   {len(f_['c_mismatches']):3d}")
        print(f"    tag mismatches:       {len(f_['tag_mismatches']):3d}")
        print(f"    duplicates:           {len(f_['duplicates']):3d}")
        print(f"    no match found:       {len(f_['no_match']):3d}")
        print(f"    low-confidence match: {len(f_['low_confidence']):3d}")
        print(f"    truncated q text:     {len(f_['truncated_q']):3d}")
        print(f"    missing ti:           {len(f_['missing_ti']):3d}")
        
        all_reports[exam['id']] = report
        # Save detail
        with open(REPORTS / f'{exam["id"]}.json', 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
    
    # Global aggregation
    with open(REPORTS / '_all_reports.json', 'w', encoding='utf-8') as f:
        json.dump(all_reports, f, ensure_ascii=False, indent=1)
    
    # Summary
    print("\n" + "="*70)
    print("GLOBAL SUMMARY")
    print("="*70)
    total = {'c_mismatches':0, 'tag_mismatches':0, 'duplicates':0, 'no_match':0, 'low_confidence':0, 'truncated_q':0, 'missing_ti':0}
    for eid, r in all_reports.items():
        for k in total:
            total[k] += len(r['findings'][k])
    print(f"  Total c-value mismatches across all exams:   {total['c_mismatches']}")
    print(f"  Total tag mismatches:                        {total['tag_mismatches']}")
    print(f"  Total duplicate entries (>=0.85 sim):        {total['duplicates']}")
    print(f"  Total canonical Qs not found in dataset:     {total['no_match']}")
    print(f"  Total low-confidence matches (0.65-0.75):    {total['low_confidence']}")
    print(f"  Total truncated question texts:              {total['truncated_q']}")
    print(f"  Total entries missing ti:                    {total['missing_ti']}")
    print(f"\nDetail reports: {REPORTS}/")

if __name__ == '__main__':
    main()
