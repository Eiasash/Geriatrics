#!/usr/bin/env python3
"""
build_grs8_q_pages.py — extract per-question page anchors from grs8_part01.pdf
and emit data/grs8_question_pages.json.

GRS8 Book 3 has 333 case-based MCQs. Each Q has the structure:
  N. <case stem>
  (A) ... (B) ... (C) ... (D) ...
  ANSWER: X
  <critique>
  References:
  1. <ref1>
  2. <ref2>
  ...

Reference numbers RESTART at 1 after every question, so naive "N. " pattern
matching is unreliable. The only reliable per-question landmark is the
"ANSWER:" line — every question has exactly one. We collect all ANSWER pages
in document order; the i-th ANSWER belongs to question i+1. The PAGE we
record for question N is the page of its ANSWER (this matches the original
_q_pages.json convention used by build_grs8_chapters.py — the page ranges
already in data/grs8_chapters.json were computed from this same dataset).
"""
import json, os, re, sys
from PyPDF2 import PdfReader

PDF = 'grs8_part01.pdf'
OUT = 'data/grs8_question_pages.json'
TOTAL_QS = 333
ANSWER_RE = re.compile(r'^\s*ANSWER\s*:\s*[A-E]\b', re.MULTILINE)

def main():
    if not os.path.exists(PDF):
        print(f'FATAL: {PDF} not found', file=sys.stderr)
        sys.exit(1)
    r = PdfReader(PDF)
    n_pages = len(r.pages)
    answer_pages = []
    for i in range(n_pages):
        try:
            text = r.pages[i].extract_text() or ''
        except Exception:
            continue
        for _ in ANSWER_RE.finditer(text):
            answer_pages.append(i + 1)
    print(f'Found {len(answer_pages)} ANSWER markers across {n_pages} pages')
    if len(answer_pages) < TOTAL_QS:
        print(f'WARN: expected {TOTAL_QS} ANSWER markers, got {len(answer_pages)}; '
              f'will pad with last known page', file=sys.stderr)
        while len(answer_pages) < TOTAL_QS:
            answer_pages.append(answer_pages[-1] if answer_pages else 13)
    elif len(answer_pages) > TOTAL_QS:
        print(f'WARN: found {len(answer_pages)} ANSWER markers but only {TOTAL_QS} '
              f'questions exist; truncating', file=sys.stderr)
        answer_pages = answer_pages[:TOTAL_QS]
    out = {str(i + 1): answer_pages[i] for i in range(TOTAL_QS)}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'Wrote {len(out)} q-page anchors -> {OUT}')
    samples = [1, 2, 3, 10, 20, 28, 50, 100, 150, 200, 250, 300, 333]
    for s in samples:
        print(f'  Q{s} -> p{out[str(s)]}')

if __name__ == '__main__':
    main()
