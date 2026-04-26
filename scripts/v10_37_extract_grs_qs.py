#!/usr/bin/env python3
"""
v10_37_extract_grs_qs.py — extract stem + 4 options + answer letter for each
target Q from grs8_part01.pdf using a single full-text regex pass.
Pattern: "N. <stem> (A) <opt> (B) <opt> (C) <opt> (D) <opt> [(E) <opt>] ANSWER: X"
"""
import json, os, re, sys
import fitz  # pymupdf

PDF = 'grs8_part01.pdf'
OUT = '/tmp/grs8_extracted.json'

ALREADY = {15, 67, 119, 125, 135, 146, 155, 163, 185, 222, 234, 282, 292}

TARGETS = [
    (5, 'Behavior Problems in Dementia'),
    (8, 'Community-Based Care'),
    (11, 'Delirium'),
    (12, 'Dementia'),
    (21, 'Falls'),
    (23, 'Frailty'),
    (28, 'Heart Failure'),
    (32, 'Infectious Diseases'),
    (35, 'Malnutrition'),
    (43, 'Osteoporosis'),
    (49, 'Pharmacotherapy'),
    (51, 'Pressure Ulcers and Wound Care'),
    (61, 'Urinary Incontinence'),
    (46, 'Perioperative Care'),
]


def clean(s: str) -> str:
    s = re.sub(r'\s+', ' ', s).strip()
    s = s.replace('­', '').replace('®', '').replace('‐', '-')
    # Drop page-number cruft: numeric-only tokens that interrupt the flow
    s = re.sub(r'\s\d{1,3}\s(?=\(?[A-Z])', ' ', s)
    return s


def clean_stem(s: str) -> str:
    """Strip leading reference-list / boilerplate cruft from a Q stem."""
    s = clean(s)
    # Drop leading "Geriatric Review Syllabus, 8th edition" boilerplate header
    s = re.sub(r'^.*?Geriatric Review Syllabus,?\s*8th edition\s*', '', s, flags=re.IGNORECASE)
    # Drop leading "References:" block: any block ending with a year+pages cite
    # like "Year;Vol(Iss):pp-pp." can repeat. Strip until we find a clinical/Q
    # opening: "A NN-year-old", "An NN-year-old", "Mr/Mrs/Ms", or Which/What.
    open_re = re.compile(r'(A[n]?\s+\d{1,3}-year-old\b|Mr\.?\s|Mrs\.?\s|Ms\.?\s|Which\s|What\s|When\s|Per\s+the\s+|Per\s+her\s+|Per\s+his\s+|The\s+patient\b|This\s+patient\b)', re.IGNORECASE)
    m = open_re.search(s)
    if m and m.start() > 50:
        s = s[m.start():]
    # Strip residual leading "References:" / period-leading citations
    s = re.sub(r'^References?:\s*', '', s)
    s = s.strip()
    return s


def main():
    chapters = json.load(open('data/grs8_chapters.json', encoding='utf-8'))
    qpages = json.load(open('data/grs8_question_pages.json', encoding='utf-8'))

    q_chapter = {}
    for cid, _ in TARGETS:
        for qnum in chapters[str(cid)]['questions']:
            if qnum in ALREADY:
                continue
            q_chapter.setdefault(qnum, cid)
    target_qs = sorted(q_chapter.keys())
    print(f'Will extract {len(target_qs)} Qs from {PDF}', file=sys.stderr)

    doc = fitz.open(PDF)
    full = '\n'.join(doc[i].get_text() for i in range(doc.page_count))

    # Find ALL question blocks. Each block is anchored at "N. <stem...> (A) ... ANSWER: X"
    # We use ANSWER positions as the anchor (one per Q, exactly 333). For each
    # ANSWER, search backwards for the nearest "N. " pattern matching the
    # expected question number.
    answer_re = re.compile(r'\bANSWER\s*:\s*([A-E])\b')
    answer_matches = list(answer_re.finditer(full))
    print(f'Total ANSWER markers: {len(answer_matches)}', file=sys.stderr)

    extracted = []
    skipped_5opt = []
    failed = []

    for qnum_idx, ans_match in enumerate(answer_matches, start=1):
        if qnum_idx not in q_chapter:
            continue
        # Stem region: from prev ANSWER end (or 0) to this ANSWER start.
        prev_end = answer_matches[qnum_idx - 2].end() if qnum_idx >= 2 else 0
        slice_text = full[prev_end:ans_match.start()]

        # Find the stem. Strategy: locate the LAST "(A) " in the slice (the
        # Q's first option) and search backward for any "<digits>. " marker
        # that's the start of the stem. PDF extraction sometimes corrupts the
        # leading digit (e.g. "53." → "93.") so we don't insist on qnum match.
        opt_a_iter = list(re.finditer(r'\(A\)\s', slice_text))
        if not opt_a_iter:
            failed.append((qnum_idx, 'no (A) option marker'))
            continue
        opt_a = opt_a_iter[-1]
        # Search backward from (A) for the most recent "NN. " marker
        before_a = slice_text[:opt_a.start()]
        stem_pat = re.compile(r'(?:^|\n)\s*(\d{1,3})\.\s')
        stem_matches = list(stem_pat.finditer(before_a))
        if not stem_matches:
            # Loosen: any "NN. " not just at line-start
            stem_pat2 = re.compile(r'(?<=\s)(\d{1,3})\.\s')
            stem_matches = list(stem_pat2.finditer(before_a))
        if not stem_matches:
            failed.append((qnum_idx, 'no NN. marker before (A)'))
            continue
        # Prefer the LAST stem marker (closest to (A)) — the Q references
        # earlier in slice would be 1.,2.,3. and the Q stem comes after them
        sm = stem_matches[-1]
        body = slice_text[sm.end():]
        # Find option markers (A)..(E) in order
        opt_pat = re.compile(r'\(([A-E])\)\s')
        opts_found = list(opt_pat.finditer(body))
        # Filter: keep only the FIRST monotonic A,B,C,D[,E] sequence
        seq = []
        expected = ord('A')
        for m in opts_found:
            if ord(m.group(1)) == expected:
                seq.append(m)
                expected += 1
                if expected > ord('E'):
                    break
        if len(seq) < 4:
            failed.append((qnum_idx, f'only {len(seq)} options'))
            continue
        n_opts = len(seq)  # 4 or 5
        stem = body[:seq[0].start()].strip()
        options = []
        for i in range(n_opts):
            start = seq[i].end()
            end = seq[i + 1].start() if i + 1 < n_opts else len(body)
            options.append(body[start:end].strip())

        ans_letter = ans_match.group(1)
        ans_idx = ord(ans_letter) - ord('A')
        if ans_idx >= n_opts:
            failed.append((qnum_idx, f'answer {ans_letter} out of {n_opts}-opt range'))
            continue

        # 5-option Qs: include (bank schema allows up to 5%)
        stem = clean_stem(stem)
        options = [clean(o) for o in options]
        # Sanity
        if len(stem) < 30:
            failed.append((qnum_idx, f'stem short: {stem[:60]!r}'))
            continue
        if any(len(o) < 3 for o in options):
            failed.append((qnum_idx, f'short opts: {[o[:30] for o in options]}'))
            continue
        # Strip leading boilerplate
        stem = re.sub(r'^.*?Note:[^.]*\.\s*', '', stem)

        extracted.append({
            'qnum': qnum_idx,
            'stem': stem,
            'options': options,
            'answer_idx': ans_idx,
            'page': qpages.get(str(qnum_idx)),
            'chapter_id': q_chapter[qnum_idx],
        })

    print(f'Extracted {len(extracted)}/{len(target_qs)} Qs', file=sys.stderr)
    if skipped_5opt:
        print(f'Skipped {len(skipped_5opt)} 5-option Qs: {skipped_5opt}', file=sys.stderr)
    if failed:
        print(f'Failed {len(failed)}:', file=sys.stderr)
        for q, why in failed:
            print(f'  Q{q}: {why}', file=sys.stderr)

    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(extracted, f, ensure_ascii=False, indent=2)
    print(f'Wrote {OUT}', file=sys.stderr)


if __name__ == '__main__':
    main()
