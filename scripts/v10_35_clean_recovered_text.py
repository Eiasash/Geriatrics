#!/usr/bin/env python3
"""v10.35 clean recovered text — fix RTL parser artifacts in newly-added Qs.

Patterns fixed (in-place in data/questions.json, only on past-exam tags
matching our recovery years):
  1. Hebrew-letter immediately followed by digit ("בן80" → "בן 80").
  2. "?" immediately followed by Hebrew letter (RTL question-mark drift):
     - Strip ALL mid-stem "?[heb]" inline marks.
     - Ensure stem ends with "?".

Operates on entire bank rows for tags 2022-Jun-Basic, 2023-Jun-Basic,
2024-May-Basic, 2024-Sep-Basic. (Other past-exam tags untouched — let
the existing baseline ratchets stay green for them.)
"""
import json, re
from pathlib import Path

QJ = Path('data/questions.json')
TARGET_TAGS = {'2022-Jun-Basic', '2023-Jun-Basic', '2024-May-Basic', '2024-Sep-Basic'}

HEB_DIGIT = re.compile(r'([֐-׿])(\d)')
DIGIT_HEB = re.compile(r'(\d)([֐-׿])')
QMARK_HEB = re.compile(r'\?([֐-׿])')
LEAD_QMARK = re.compile(r'^\s*\?\s*')

def fix_hebrew_digit(s):
    if not isinstance(s, str): return s
    s = HEB_DIGIT.sub(r'\1 \2', s)
    s = DIGIT_HEB.sub(r'\1 \2', s)
    return s

def fix_qmark_position(s, is_stem=False):
    if not isinstance(s, str): return s
    had_q = '?' in s
    # Move leading '?' to end (typical RTL drift)
    s = LEAD_QMARK.sub('', s)
    # Strip inline "?heb" — replace with just heb (drop the ?)
    s = QMARK_HEB.sub(r'\1', s)
    # If stem and originally had ?, ensure trailing ?
    if is_stem and had_q and not s.rstrip().endswith('?'):
        s = s.rstrip() + ' ?' if s and s[-1] != ' ' else s + '?'
        # tidy double spaces
        s = re.sub(r'\s+\?', '?', s)
    return s

def main():
    bank = json.load(open(QJ, encoding='utf-8'))
    fixed_q = fixed_o = 0
    for q in bank:
        if q.get('t') not in TARGET_TAGS:
            continue
        new_q = fix_hebrew_digit(q.get('q', ''))
        new_q = fix_qmark_position(new_q, is_stem=True)
        if new_q != q.get('q'):
            q['q'] = new_q
            fixed_q += 1
        opts = q.get('o', [])
        new_opts = []
        for o in opts:
            n = fix_hebrew_digit(o)
            n = fix_qmark_position(n, is_stem=False)
            if n != o: fixed_o += 1
            new_opts.append(n)
        q['o'] = new_opts

    with open(QJ, 'w', encoding='utf-8') as f:
        json.dump(bank, f, ensure_ascii=False, indent=0)
    print(f'Fixed {fixed_q} stems, {fixed_o} options across target tags.')

if __name__ == '__main__':
    main()
