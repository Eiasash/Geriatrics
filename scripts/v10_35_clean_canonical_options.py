#!/usr/bin/env python3
"""Clean footer-cruft + obvious tails from canonical options before applying.

Patterns observed:
  '... 30.09.24 בחינת שלב א׳ גריאטריה בסיס'
  '... 30.9.24 בחינת שלב א גריאטריה בסיס'
  generic 'בחינת שלב' suffix
"""
import json, re
from pathlib import Path

CANON_DIR = Path('scripts/exam_audit/canonical')

# Patterns:
# - date (dd.mm.yy or dd/mm/yy or dd.mm.yyyy) followed by exam header
# - just exam header trailing
DATE_HEADER_RE = re.compile(
    r'\s*\d{1,2}[./]\d{1,2}[./](?:20)?\d{2}\s*בחינת\s*שלב.*$'
)
# 'בחינת שלב' anywhere in tail (catches variants without date prefix)
HEADER_TAIL_RE = re.compile(
    r'\s*בחינת\s*שלב.*$'
)
DATE_TAIL_RE = re.compile(
    r'\s*\d{1,2}[./]\d{1,2}[./](?:20)?\d{2}\s*$'
)

def clean(s):
    if not isinstance(s, str): return s
    orig = s
    s = DATE_HEADER_RE.sub('', s)
    s = HEADER_TAIL_RE.sub('', s)
    s = DATE_TAIL_RE.sub('', s)
    return s.strip()

def main():
    for cf in ['2022_basis', '2023_basis', 'may24_basis', 'sept24_basis']:
        path = CANON_DIR / f'{cf}.json'
        d = json.load(open(path, encoding='utf-8'))
        cleaned = 0
        for qn, q in d['questions'].items():
            new_o = []
            for o in q.get('o', []):
                c = clean(o)
                if c != o:
                    cleaned += 1
                new_o.append(c)
            q['o'] = new_o
            # Also clean stems if needed
            new_q = clean(q['q'])
            if new_q != q['q']:
                q['q'] = new_q
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
        print(f'{cf}: cleaned {cleaned} option strings')

if __name__ == '__main__':
    main()
