#!/usr/bin/env python3
"""Parse Israeli geriatrics exam answer key PDF → {q_num: [accepted 0-indexed]}.

Handles two formats encountered in practice:
- Original key (640000-series): "1ב" in single lines, or "1 ב"
- Revised/appeal key: "ב" then Q number in separate tokens, with \xa0 separators
  for multi-accept: "2א\xa0\xa0ב\xa0\xa0ג\xa0\xa0ד"
"""
import fitz, re, sys, json
from pathlib import Path

BIDI_RE = re.compile(r'[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]')
HEB_LETTERS = {'\u05d0':0, '\u05d1':1, '\u05d2':2, '\u05d3':3}  # א=0, ב=1, ג=2, ד=3

def extract_text(pdf_path):
    d = fitz.open(str(pdf_path))
    full = ''
    for p in range(d.page_count):
        full += d[p].get_text() + '\n'
    return BIDI_RE.sub('', full)

def parse_answers(pdf_path):
    """Return {q_num: [accepted_indices_0based]}.
    
    Strategy: find occurrences of (Hebrew letter group) near (1-3 digit number),
    with the letter group containing 1-4 letters from {א,ב,ג,ד}.
    """
    full = extract_text(pdf_path)
    # Remove "כל התשובות מתקבלות" noise (means "all accepted" - handled separately)
    all_accepted_positions = [m.start() for m in re.finditer(r'כל\s*ה?\s*תשובות\s*מ?תקבלות', full)]
    
    answers = {}
    
    # Pattern A (dense format, e.g. revised key): "Nא" or "Nא\xa0\xa0ב\xa0\xa0ג"  
    # This is the most common format post-strip-bidi.
    # Number followed IMMEDIATELY (no non-Hebrew chars) by Hebrew letters (possibly with \xa0 separators)
    for m in re.finditer(r'(\d{1,3})([\u05d0-\u05d3](?:[\s\u00a0]*[\u05d0-\u05d3])*)', full):
        try:
            n = int(m.group(1))
        except:
            continue
        if not (1 <= n <= 200): continue
        letters = re.findall(r'[\u05d0-\u05d3]', m.group(2))
        accepted = sorted(set(HEB_LETTERS[l] for l in letters if l in HEB_LETTERS))
        if accepted:
            # Check: is there a "כל התשובות מתקבלות" annotation near this match?
            near_all = any(abs(p - m.start()) < 200 for p in all_accepted_positions)
            if near_all and len(accepted) >= 3:
                accepted = [0, 1, 2, 3]
            # First-match wins (handles duplicates from multi-page layout)
            if n not in answers:
                answers[n] = accepted
    
    # Pattern B (sparse/layout format, e.g. original key): "<letter>\n<number>\n" 
    # where the order is reversed due to RTL layout (number line BELOW the letter line)
    # Example: "\nא\n1\n\nג\n2\n..."
    for m in re.finditer(r'\n([\u05d0-\u05d3]{1,4}(?:\s+[\u05d0-\u05d3]{1,4})*)\s*\n\s*(\d{1,3})\s*\n', full):
        try:
            n = int(m.group(2))
        except:
            continue
        if not (1 <= n <= 200): continue
        letters = re.findall(r'[\u05d0-\u05d3]', m.group(1))
        accepted = sorted(set(HEB_LETTERS[l] for l in letters if l in HEB_LETTERS))
        if accepted and n not in answers:
            answers[n] = accepted
    
    # Pattern C (layout format with letter BEFORE number with spaces):
    # "  ‫א‬                            ‫‪1‬‬"
    # After bidi-strip: whitespace letter(s) whitespace number
    for m in re.finditer(r'(?m)^\s*([\u05d0-\u05d3](?:\s+[\u05d0-\u05d3])*)\s+(\d{1,3})\s*$', full):
        try:
            n = int(m.group(2))
        except:
            continue
        if not (1 <= n <= 200): continue
        letters = re.findall(r'[\u05d0-\u05d3]', m.group(1))
        accepted = sorted(set(HEB_LETTERS[l] for l in letters if l in HEB_LETTERS))
        if accepted and n not in answers:
            answers[n] = accepted
    
    return answers

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: parse_answers.py <pdf_path>")
        sys.exit(1)
    ans = parse_answers(sys.argv[1])
    print(json.dumps({str(k): v for k, v in sorted(ans.items())}, ensure_ascii=False, indent=1))
