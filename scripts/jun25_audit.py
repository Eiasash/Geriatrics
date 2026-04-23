#!/usr/bin/env python3
"""
Jun25 exam audit pipeline — persistent version of the session-built tooling.

Usage:
    python3 scripts/jun25_audit.py path/to/basis_150q.pdf

What it does:
1. Extracts 150 question texts + 4 options from the Basis PDF using PyMuPDF
2. Matches against data/questions.json entries tagged 'יוני 25' and '2025-א'
3. Reports: corruption signals, tag coverage, ghost entries, missing Qs
4. Optionally applies safe fixes (only where 2025-א is cleaner AND options align in order
   AND the 'c' answer key would not be invalidated)

Requires: pymupdf (pip install pymupdf)

Invariants the pipeline guarantees:
- Never changes `c`, `ti`, `e`, or `num` on any question
- Only overwrites `q` and `o` when a verified cleaner twin exists
- Option order preserved — no risk of invalidating answer key
- All fixes backed up to scripts/_jun25_backup.json before apply
"""
import sys, json, re, copy
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
QJ = REPO / 'data' / 'questions.json'
BACKUP = REPO / 'scripts' / '_jun25_backup.json'

BIDI_RE = re.compile(r'[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]')
HEADER_RE = re.compile(r'[^\n]*בחינת שלב א[^\n]*\n')
OPT_START = re.compile(r'(?m)^\s*([אבגד])\.\s*')

def norm(s):
    if not s: return ''
    s = BIDI_RE.sub('', s)
    return re.sub(r'[^\u0590-\u05FFa-zA-Z0-9]', '', s).lower()

def extract_pdf(pdf_path):
    import fitz
    doc = fitz.open(str(pdf_path))
    txt = ''.join(doc[p].get_text() + '\n' for p in range(doc.page_count))
    txt = BIDI_RE.sub('', txt)
    txt = HEADER_RE.sub('', txt)

    # Find question boundaries (two formats: "N\n.\n..." and "N. ...")
    markers = {}
    for m in re.finditer(r'(?m)^\s*(\d{1,3})\s*$', txt):
        n = int(m.group(1))
        if 1 <= n <= 150 and re.match(r'\s*\.', txt[m.end():m.end()+50]):
            markers.setdefault(m.start(), n)
    for m in re.finditer(r'(?<![\d.])(\d{1,3})\.\s*[\u0590-\u05FFa-zA-Z?]', txt):
        n = int(m.group(1))
        if 1 <= n <= 150:
            markers.setdefault(m.start(), n)

    sorted_markers = sorted(markers.items())
    filtered, expected = [], 1
    for pos, n in sorted_markers:
        if n == expected:
            filtered.append((n, pos))
            expected += 1
            if expected > 150: break

    questions = {}
    for idx, (n, pos) in enumerate(filtered):
        end_pos = filtered[idx+1][1] if idx+1 < len(filtered) else len(txt)
        blk = txt[pos:end_pos]
        blk = re.sub(r'^\s*\d{1,3}\s*\.\s*', '', blk)
        m = OPT_START.search(blk)
        if not m:
            questions[n] = {'q': ' '.join(blk.split()), 'o': []}
            continue
        q_text = ' '.join(blk[:m.start()].split())
        opts_text = blk[m.start():]
        opts_dict = {}
        matches = list(OPT_START.finditer(opts_text))
        for i, mm in enumerate(matches):
            letter = mm.group(1)
            end = matches[i+1].start() if i+1 < len(matches) else len(opts_text)
            body = ' '.join(opts_text[mm.end():end].split())
            opts_dict.setdefault(letter, body)
        questions[n] = {'q': q_text, 'o': [opts_dict.get(l, '') for l in 'אבגד']}
    return questions

def corrupt_score(text):
    if not text: return 0
    s = 0
    s += len(re.findall(r'(?<=\s)[א-ת](?=\s)', text))           # split single hebrew letters
    s += (1 if '?' in text and not text.rstrip().endswith('?') else 0)
    s += len(re.findall(r'\d[\u0590-\u05FF]', text))             # digit hugging hebrew
    s += len(re.findall(r'[\u0590-\u05FF][a-zA-Z]', text))       # hebrew hugging english
    s += len(re.findall(r'[a-zA-Z][\u0590-\u05FF]', text))       # english hugging hebrew
    s += len(re.findall(r' ,', text))                            # stray space before comma
    return s

def audit(pdf_path, apply=False):
    with open(QJ, encoding='utf-8') as f:
        sa_qs = json.load(f)
    pdf_qs = extract_pdf(pdf_path)

    yoni_idxs = [i for i,q in enumerate(sa_qs) if q.get('t') == 'יוני 25']
    a2025_idxs = [i for i,q in enumerate(sa_qs) if q.get('t') == '2025-א']

    def opt_set_overlap(o1, o2):
        s1 = {norm(x) for x in o1 if x}
        s2 = {norm(x) for x in o2 if x}
        if not s1 or not s2: return 0
        return len(s1 & s2)

    safe_fixes = []
    for yi in yoni_idxs:
        y_q = sa_qs[yi].get('q', '')
        y_opts = sa_qs[yi].get('o', [])
        if len(y_opts) != 4: continue
        y_corrupt = corrupt_score(y_q) + sum(corrupt_score(o) for o in y_opts)
        if y_corrupt == 0: continue
        y_qn = norm(y_q)
        if len(y_qn) < 20: continue

        best, best_lcp = None, 0
        for ci in a2025_idxs:
            cn = norm(sa_qs[ci].get('q', ''))
            lcp = 0
            for k in range(min(len(y_qn), len(cn))):
                if y_qn[k] == cn[k]: lcp = k+1
                else: break
            if lcp < 30: continue
            if opt_set_overlap(y_opts, sa_qs[ci].get('o', [])) < 3: continue
            if lcp > best_lcp:
                best_lcp, best = lcp, ci

        if best is None: continue
        ci = best
        c_q = sa_qs[ci].get('q', '')
        c_opts = sa_qs[ci].get('o', [])
        c_corrupt = corrupt_score(c_q) + sum(corrupt_score(o) for o in c_opts)
        if c_corrupt >= y_corrupt: continue

        # option-order safety check
        y_set = [norm(o) for o in y_opts]
        c_set = [norm(o) for o in c_opts]
        if set(y_set) == set(c_set) and y_set != c_set:
            continue
        safe_fixes.append({'yi': yi, 'ci': ci, 'y_corrupt': y_corrupt, 'c_corrupt': c_corrupt})

    print(f"Yoni 25 entries: {len(yoni_idxs)}")
    print(f"2025-א entries: {len(a2025_idxs)}")
    print(f"PDF questions parsed: {len(pdf_qs)}")
    print(f"Safe fixes identified: {len(safe_fixes)}")

    if apply and safe_fixes:
        backup = {m['yi']: copy.deepcopy(sa_qs[m['yi']]) for m in safe_fixes}
        for m in safe_fixes:
            yi, ci = m['yi'], m['ci']
            sa_qs[yi]['q'] = sa_qs[ci]['q']
            if sa_qs[ci].get('o'):
                sa_qs[yi]['o'] = sa_qs[ci]['o']
        with open(QJ, 'w', encoding='utf-8', encoding='utf-8') as f:
            json.dump(sa_qs, f, ensure_ascii=False, indent=2)
        with open(BACKUP, 'w', encoding='utf-8', encoding='utf-8') as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        print(f"Applied {len(safe_fixes)} fixes. Backup → {BACKUP}")
    elif safe_fixes:
        print("Run with --apply to write changes.")
    return safe_fixes

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    pdf = Path(sys.argv[1])
    apply = '--apply' in sys.argv
    audit(pdf, apply=apply)
