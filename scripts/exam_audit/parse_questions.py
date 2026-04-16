#!/usr/bin/env python3
"""
parse_questions.py — Parse an Israeli geriatrics exam question PDF into canonical JSON.

CRITICAL FIX: the naive regex approach splits Q23 in the Sept 2024 basis exam because
the phrase "ציון MoCA 27." appears in Q23's scenario — the parser reads "27\n." as
the start of Q27. This parser enforces **monotonic Q-numbering** — each candidate
question start must have N strictly greater than the last accepted N, and the number
of questions matches the expected count.

Usage:
    python3 parse_questions.py <cached_pdf_path> [expected_count]
"""
import fitz, re, sys, json
from pathlib import Path

BIDI_RE = re.compile(r'[\u200E\u200F\u202A-\u202E\u2066-\u2069\u061C]')

def extract_full_text(pdf_path):
    d = fitz.open(str(pdf_path))
    full = ''
    for p in range(d.page_count):
        full += d[p].get_text() + '\n'
    # Strip bidirectional marks
    full = BIDI_RE.sub('', full)
    return full

def find_question_starts(text, max_n=200):
    """Find all candidate question-start markers.
    
    Two layouts observed:
      Layout A (newline-separated): "\n<num>\n\s*\.\s<text>" — period on own line
      Layout B (inline):             "\n<num>\s*\.\s<text>"   — period follows number directly
    
    Both patterns are enforced at line boundaries to avoid matching
    decimals like "1.2" or section references.
    """
    candidates = []
    # Layout A: newline, num, newline, period, then non-digit
    for m in re.finditer(r'\n\s*(\d{1,3})\s*\n[\s?]*\.\s*(?=[^\d\s])', text):
        n = int(m.group(1))
        if 1 <= n <= max_n:
            candidates.append((m.start(), m.end(), n))
    # Layout B: newline, num, period (same line), then Hebrew/Latin/question mark
    for m in re.finditer(r'\n\s*(\d{1,3})\s*\.\s*(?=[\u0590-\u05FFa-zA-Z?])', text):
        n = int(m.group(1))
        if 1 <= n <= max_n:
            candidates.append((m.start(), m.end(), n))
    return candidates

def monotonic_select(candidates, target_count=None):
    """Select the longest strictly-increasing subsequence of N in position order.
    
    Genuine question markers form a strictly-increasing N in position order.
    Spurious mentions like "ציון MoCA 27" inside Q23's scenario appear at an
    earlier position but with a higher N than the surrounding real questions —
    LIS naturally skips them to preserve the real Q24..Q27 chain.
    O(n log n) via patience sort.
    """
    from bisect import bisect_left
    cands = sorted(candidates)  # by position
    if not cands:
        return []
    ns = [c[2] for c in cands]
    tails = []
    tail_idx = []
    prev = [-1] * len(cands)
    for i, n in enumerate(ns):
        pos = bisect_left(tails, n)
        if pos == len(tails):
            tails.append(n)
            tail_idx.append(i)
        else:
            tails[pos] = n
            tail_idx[pos] = i
        prev[i] = tail_idx[pos-1] if pos > 0 else -1
    seq = []
    k = tail_idx[-1]
    while k != -1:
        seq.append(cands[k])
        k = prev[k]
    return list(reversed(seq))

def extract_question_text(full_text, start_pos, end_pos):
    """Extract and normalize the text of a single question."""
    txt = full_text[start_pos:end_pos].strip()
    # Collapse whitespace
    txt = re.sub(r'\s+', ' ', txt)
    # Strip trailing page-footer artifacts
    txt = re.sub(r'\s*\d+\s*$', '', txt)
    return txt

def split_stem_options(q_text):
    """Split a question block into stem + list of 4 options.
    
    Handles two formats observed in IMA exams:
      Modern: "א. text ב. text ג. text ד. text"  (letter, period)
      Older:  ".א text .ב text .ג text .ד text"  (period, letter)
    
    Also truncates the last option at the next question marker to prevent
    bleed when the PDF extraction flows past question boundaries (common
    in 2022/2023 exams).
    """
    # Try modern format first
    pattern_modern = re.compile(r'([\u05d0-\u05d3])\s*\.\s')
    marks = list(pattern_modern.finditer(q_text))
    if len([m for m in marks if m.group(1) in ('\u05d0','\u05d1','\u05d2','\u05d3')]) < 4:
        # Try older format
        pattern_older = re.compile(r'\.\s*([\u05d0-\u05d3])\s')
        marks = list(pattern_older.finditer(q_text))
    if len(marks) < 4:
        return q_text, []
    letters = {'\u05d0':0, '\u05d1':1, '\u05d2':2, '\u05d3':3}
    expected = 0
    selected = []
    for m in marks:
        letter = m.group(1)
        idx = letters.get(letter)
        if idx == expected:
            selected.append(m)
            expected += 1
            if expected == 4:
                break
    if len(selected) < 4:
        return q_text, []
    stem = q_text[:selected[0].start()].strip()
    stem = re.sub(r'\s*\?\s*$', '?', stem)
    options = []
    for i in range(4):
        opt_start = selected[i].end()
        opt_end = selected[i+1].start() if i+1 < 4 else len(q_text)
        opt = q_text[opt_start:opt_end].strip()
        # For the last option (ד), truncate at next question marker to
        # prevent bleed into Q(n+1) content. Match patterns: "N .", "N. ", ".N "
        if i == 3:
            # Find next Q marker: "<digit-1-3> ." at start or after space
            # Conservative: require digit(s) followed by dot with space/letter
            trunc_match = re.search(r'\s\d{1,3}\s*\.\s*[\u0590-\u05FFa-zA-Z?]', opt)
            if trunc_match:
                opt = opt[:trunc_match.start()].strip()
        opt = re.sub(r'\s*\?\s*$', '', opt)
        options.append(opt)
    return stem, options

def parse_exam(pdf_path, expected_count=None):
    """Parse a question PDF into {q_num: {q, o, raw}}."""
    full = extract_full_text(pdf_path)
    candidates = find_question_starts(full)
    accepted = monotonic_select(candidates)
    
    questions = {}
    for i, (pos, e_pos, n) in enumerate(accepted):
        end = accepted[i+1][0] if i+1 < len(accepted) else len(full)
        raw = extract_question_text(full, e_pos, end)
        stem, options = split_stem_options(raw)
        questions[n] = {
            'q': stem,
            'o': options,
            'raw': raw,
            'n_options': len(options),
        }
    
    return questions, {
        'total_candidates': len(candidates),
        'accepted': len(accepted),
        'with_full_options': sum(1 for q in questions.values() if q['n_options'] == 4),
    }

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: parse_questions.py <pdf_path> [expected_count]")
        sys.exit(1)
    pdf = Path(sys.argv[1])
    expected = int(sys.argv[2]) if len(sys.argv) > 2 else None
    qs, stats = parse_exam(pdf, expected)
    print(json.dumps({'questions': qs, 'stats': stats}, ensure_ascii=False, indent=1))
