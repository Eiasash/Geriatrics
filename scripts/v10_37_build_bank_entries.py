#!/usr/bin/env python3
"""
v10_37_build_bank_entries.py — assemble final bank entries from extracted
GRS Qs + Hebrew explanations, then append to data/questions.json.

For each Q:
  q       = English stem
  o       = list of 4 (or 5) English options
  c       = answer index 0..4
  t       = 'GRS8'
  ti      = chapter.ti[0] from data/grs8_chapters.json
  e       = Hebrew explanation
  ref     = "Hazzard Ch X — TITLE · GRS8 Ch Y — TITLE · Q#NNN"
"""
import json, os, re, sys

IN = '/tmp/grs8_with_explanations.json'
QFILE = 'data/questions.json'

# ti -> (hazzard_chapter_num, hazzard_title) — derived from question_chapters.json dominant haz per ti
TI_HAZZARD = {
    3:  (42, 'FRAILTY'),
    4:  (43, 'FALLS'),
    5:  (58, 'DELIRIUM'),
    6:  (59, 'DEMENTIA INCLUDING ALZHEIMER DISEASE'),
    8:  (22, 'MEDICATION PRESCRIBING AND DE-PRESCRIBING'),
    9:  (30, 'NUTRITION DISORDERS, OBESITY, AND ENTERAL/PARENTERAL ALIMENTATION'),
    10: (46, 'PRESSURE INJURIES'),
    11: (47, 'INCONTINENCE'),
    15: (51, 'OSTEOPOROSIS'),
    18: (76, 'HEART FAILURE'),
    27: (39, 'INFECTIOUS DISEASES'),  # No exact match in hazzard JSON; placeholder closest
    35: (17, 'COMMUNITY-BASED LONG-TERM SERVICES AND SUPPORT, AND HOME-BASED MEDICAL CARE'),
    38: (27, 'PERIOPERATIVE CARE: EVALUATION AND MANAGEMENT'),
}


def main():
    qs = json.load(open(IN, encoding='utf-8'))
    chapters = json.load(open('data/grs8_chapters.json', encoding='utf-8'))
    bank = json.load(open(QFILE, encoding='utf-8'))
    new_entries = []
    for q in qs:
        cid = q['chapter_id']
        ch = chapters[str(cid)]
        ti = ch['ti'][0]
        haz_num, haz_title = TI_HAZZARD.get(ti, (0, '?'))
        ref = f'Hazzard Ch {haz_num} — {haz_title} · GRS8 Ch {cid} — {ch["title"]} · Q#{q["qnum"]}'
        new_entries.append({
            'q': q['stem'],
            'o': q['options'],
            'c': q['answer_idx'],
            't': 'GRS8',
            'ti': ti,
            'e': q['e'],
            'ref': ref,
        })
    print(f'Assembled {len(new_entries)} new entries (was bank={len(bank)})', file=sys.stderr)

    # Find insertion point: after the last existing GRS8-tagged Q
    last_grs_idx = -1
    for i, b in enumerate(bank):
        if b.get('t') == 'GRS8':
            last_grs_idx = i
    insert_at = last_grs_idx + 1 if last_grs_idx >= 0 else len(bank)
    print(f'Inserting at index {insert_at}', file=sys.stderr)

    out = bank[:insert_at] + new_entries + bank[insert_at:]
    print(f'New bank size: {len(out)} (delta +{len(new_entries)})', file=sys.stderr)

    with open(QFILE, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=0)
    print(f'Wrote {QFILE}', file=sys.stderr)


if __name__ == '__main__':
    main()
