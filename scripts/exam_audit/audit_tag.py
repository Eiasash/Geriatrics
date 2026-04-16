#!/usr/bin/env python3
"""
audit_tag.py — Reverse audit: verify entries in a specific tag actually belong there.

For each entry tagged X, check if its text matches a canonical Q in the exam(s)
that tag is supposed to represent. Categories:
  - VERIFIED: matches canonical Q in target exam (sim >= 0.85)
  - MISTAGGED: matches canonical Q in a DIFFERENT exam (should be retagged)
  - ORPHAN: doesn't match any canonical exam Q (possibly AI-gen, textbook, or synthetic)

Usage:
    python3 audit_tag.py <tag> [canonical_exam_id ...]
    
Example:
    python3 audit_tag.py "ספט 24" sept24_al sept24_basis
    python3 audit_tag.py "2021"
"""
import json, sys, re
from pathlib import Path
from difflib import SequenceMatcher

HERE = Path(__file__).parent
REPO = HERE.parent.parent
QJ = REPO / 'data' / 'questions.json'
CANONICAL = HERE / 'canonical'

# Default canonical sources per tag
TAG_CANONICALS = {
    'ספט 24': ['sept24_al', 'sept24_basis'],
    'מאי 24': ['may24_al', 'may24_basis'],
    'יוני 25': ['2025_al', '2025_basis'],
    '2025-א': ['2025_al', '2025_basis'],
    '2020': ['2020_al'],
    'יוני 21': ['2021_al'],
    '2021': ['2021_al'],
    '2022': ['2022_al', '2022_basis'],
    'יוני 23': ['2023_al', '2023_basis'],
    '2023-ב': ['2023_basis'],
}

# All exam canonicals (for cross-tag search)
ALL_EXAMS = ['2020_al','2021_al','2022_al','2022_basis','2023_al','2023_basis',
             'may24_al','may24_basis','sept24_al','sept24_basis','2025_al','2025_basis']

def norm(s):
    if not s: return ''
    s = re.sub(r'[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]', '', s)
    return re.sub(r'[^\u0590-\u05FFa-zA-Z0-9]','',s).lower()

def load_canonical_map(exam_id):
    """Return list of (q_num, norm_text) for an exam's canonical Qs."""
    f = CANONICAL / f'{exam_id}.json'
    if not f.exists(): return []
    canon = json.load(open(f))
    result = []
    for q_num, cq in canon['questions'].items():
        text = (cq.get('q', '') or '') + ' ' + ' '.join(cq.get('o', []) or [])
        result.append((int(q_num), norm(text)))
    return result

def best_match(entry_norm, canonical_maps, threshold=0.85):
    """Find best match across given exam canonicals. Returns (exam_id, q_num, sim) or None."""
    best = (None, None, 0)
    if not entry_norm or len(entry_norm) < 40:
        return None
    # Quick screen
    screen_chunks = [entry_norm[i:i+18] for i in range(0, max(1, len(entry_norm)-18), 14)][:8]
    for exam_id, canon_list in canonical_maps.items():
        for q_num, c_norm in canon_list:
            if not c_norm or len(c_norm) < 40: continue
            hits = sum(1 for c in screen_chunks if c in c_norm)
            if hits < 2: continue
            sim = SequenceMatcher(None, entry_norm[:600], c_norm[:600]).ratio()
            if sim > best[2]:
                best = (exam_id, q_num, sim)
    return best if best[2] >= threshold else None

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    target_tag = sys.argv[1]
    explicit_exams = sys.argv[2:] if len(sys.argv) > 2 else None
    target_exams = explicit_exams or TAG_CANONICALS.get(target_tag, [])
    
    with open(QJ) as f:
        qs = json.load(f)
    
    entries = [(i, q) for i, q in enumerate(qs) if q.get('t') == target_tag]
    print(f"Tag {target_tag!r}: {len(entries)} entries")
    print(f"Expected canonical sources: {target_exams or '(none configured, using all)'}")
    
    # Load canonicals
    all_canonicals = {eid: load_canonical_map(eid) for eid in ALL_EXAMS}
    target_canonicals = {eid: all_canonicals[eid] for eid in (target_exams or ALL_EXAMS) if eid in all_canonicals}
    other_canonicals = {eid: all_canonicals[eid] for eid in ALL_EXAMS if eid not in target_canonicals}
    
    verified, mistagged, orphans = [], [], []
    for idx, q in entries:
        q_text = (q.get('q','') or '') + ' ' + ' '.join(q.get('o',[]) or [])
        e_norm = norm(q_text)
        
        target_match = best_match(e_norm, target_canonicals, threshold=0.85)
        if target_match:
            verified.append((idx, target_match))
            continue
        
        other_match = best_match(e_norm, other_canonicals, threshold=0.85)
        if other_match:
            mistagged.append((idx, other_match))
            continue
        
        orphans.append((idx, q.get('q','')[:60]))
    
    print(f"\n=== RESULTS ===")
    print(f"  VERIFIED (matches target exam):    {len(verified):4d}")
    print(f"  MISTAGGED (matches OTHER exam):    {len(mistagged):4d}")
    print(f"  ORPHAN (no canonical match):       {len(orphans):4d}")
    
    if mistagged:
        print(f"\n=== MISTAGGED breakdown ===")
        from collections import Counter
        src_counter = Counter(m[1][0] for m in mistagged)
        for src, count in src_counter.most_common():
            print(f"  {src}: {count} entries")
        print(f"\nFirst 10 mistagged examples:")
        for idx, (exam, qn, sim) in mistagged[:10]:
            print(f"  idx={idx} → {exam} Q{qn} (sim={sim:.3f})")
            print(f"    q: {qs[idx].get('q','')[:80]}")
    
    # Save full report
    report = {
        'tag': target_tag,
        'target_exams': target_exams,
        'verified': [(i, m[0], m[1], m[2]) for i, m in verified],
        'mistagged': [(i, m[0], m[1], m[2]) for i, m in mistagged],
        'orphans': [i for i, _ in orphans],
        'stats': {'verified': len(verified), 'mistagged': len(mistagged), 'orphan': len(orphans)}
    }
    safe_tag = re.sub(r'[^\w]', '_', target_tag)
    out = HERE / 'reports' / f'tag_audit_{safe_tag}.json'
    with open(out, 'w') as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(f"\nFull report: {out}")

if __name__ == '__main__':
    main()
