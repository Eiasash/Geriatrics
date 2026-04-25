#!/usr/bin/env python3
"""v10.35 refine ref — extract Hazzard chapter from explanation text where possible.

Strategy:
  1. Look for 'Hazzard' + chapter number/title in `e`.
  2. Fallback to existing `ref` (most-common-by-ti).

Updates scripts/v10_35_new_questions_with_e.json in place.
"""
import json, re
from pathlib import Path

INPUT = Path('scripts/v10_35_new_questions_with_e.json')
HAZZARD = Path('data/hazzard_chapters.json')

# Title-keyword index for hazzard chapters
def build_title_idx():
    h = json.load(open(HAZZARD, encoding='utf-8'))
    idx = {}
    for ch_num, info in h.items():
        idx[int(ch_num)] = info.get('title', '').strip()
    return idx

def extract_hazzard_ref(e_text, ti_fallback_ref, title_idx):
    if not e_text: return ti_fallback_ref
    # Pattern 1: "Hazzard's Geriatric Medicine, פרק X — Y"
    m = re.search(r'Hazzard.{0,40}?(?:Ch(?:apter)?|פרק)\s*(\d{1,3})', e_text)
    if m:
        try:
            n = int(m.group(1))
            if n in title_idx:
                return f'Hazzard Ch {n} — {title_idx[n]}'
        except: pass
    return ti_fallback_ref

def main():
    qs = json.load(open(INPUT, encoding='utf-8'))
    title_idx = build_title_idx()
    refined = 0
    for q in qs:
        old_ref = q.get('ref', '')
        new_ref = extract_hazzard_ref(q.get('e', ''), old_ref, title_idx)
        if new_ref != old_ref:
            q['ref'] = new_ref
            refined += 1
    with open(INPUT, 'w', encoding='utf-8') as f:
        json.dump(qs, f, ensure_ascii=False, indent=2)
    print(f'Refined ref for {refined}/{len(qs)} Qs')

if __name__ == '__main__':
    main()
