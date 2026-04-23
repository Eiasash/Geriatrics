#!/usr/bin/env python3
"""
Sept 2024 Al exam audit — cross-verify Shlav A answer keys against authoritative revised answer key.

This is different from jun25_audit.py: that one fixed corrupted text. This one catches
WRONG answer keys (c-field errors) by comparing against the Haאratzofim HaRi revised
answer key published for the Sept 30 2024 exam.

Sept 2024 Al had 100 questions; 59 of them are tagged as 'מאי 24' in Shlav A (the
same questions were recycled between May and Sept 2024 exams). This auditor searches
ALL tags for matching questions, not just ספט 24.

Usage:
    python3 scripts/sept24_audit.py path/to/al_100q.pdf scripts/sept24_answers.json [--apply]

The answers JSON (from scripts/sept24_answers.json) contains the revised key.
"""
import sys, json, re, copy
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
QJ = REPO / 'data' / 'questions.json'
BACKUP = REPO / 'scripts' / '_sept24_backup.json'

BIDI_RE = re.compile(r'[\u202A-\u202E\u2066-\u2069\u200E\u200F\u061C]')
HEADER_RE = re.compile(r'[^\n]*בחינת שלב א[^\n]*\n')
OPT_START = re.compile(r'(?m)^\s*([אבגד])\s*\.\s*')

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

    markers = {}
    for m in re.finditer(r'(?m)^\s*(\d{1,3})\s*$', txt):
        n = int(m.group(1))
        if 1 <= n <= 100 and re.match(r'\s*\.', txt[m.end():m.end()+50]):
            markers.setdefault(m.start(), n)
    for m in re.finditer(r'(?<![\d.])(\d{1,3})\.\s*[\u0590-\u05FFa-zA-Z?]', txt):
        n = int(m.group(1))
        if 1 <= n <= 100:
            markers.setdefault(m.start(), n)

    sorted_markers = sorted(markers.items())
    filtered, expected = [], 1
    for pos, n in sorted_markers:
        if n == expected:
            filtered.append((n, pos)); expected += 1
            if expected > 100: break

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

def audit(pdf_path, answers_path, apply=False):
    with open(QJ, encoding='utf-8') as f:
        sa_qs = json.load(f)
    pdf_qs = extract_pdf(pdf_path)
    with open(answers_path, encoding='utf-8') as f:
        answers = json.load(f)

    def opt_set_overlap(o1, o2, k=20):
        s1 = {norm(x)[:k] for x in o1 if x}
        s2 = {norm(x)[:k] for x in o2 if x}
        return len(s1 & s2) if s1 and s2 else 0

    # Match each PDF Q to best Shlav A entry by option overlap (any tag)
    mapping = {}
    for pn_str, pq in pdf_qs.items():
        pn = int(pn_str)
        best, best_ovl = None, 0
        for i, q in enumerate(sa_qs):
            ovl = opt_set_overlap(q.get('o', []), pq['o'])
            if ovl >= 3 and ovl > best_ovl:
                best_ovl = ovl; best = i
        if best is not None:
            mapping[pn] = best

    # Find c-errors
    errors = []
    for pn, sa_idx in mapping.items():
        sa_c = sa_qs[sa_idx].get('c')
        acc = answers.get(str(pn), {}).get('accepted', [])
        if not acc or sa_c is None: continue
        # Map sa.c → pdf position via option content
        sa_opts_n = [norm(o)[:20] for o in sa_qs[sa_idx].get('o', [])]
        pdf_opts_n = [norm(o)[:20] for o in pdf_qs[str(pn)]['o']]
        if sa_c >= len(sa_opts_n): continue
        sa_answer = sa_opts_n[sa_c]
        # Find which pdf position(s) have this content
        pdf_positions = [i for i, p in enumerate(pdf_opts_n)
                         if p == sa_answer or (p and sa_answer and (p in sa_answer or sa_answer in p))]
        if not pdf_positions or not any(p in acc for p in pdf_positions):
            # Wrong! Find sa position matching an accepted pdf position
            new_c = None
            for ap in acc:
                if ap >= len(pdf_opts_n): continue
                target = pdf_opts_n[ap]
                for sp, so in enumerate(sa_opts_n):
                    if so and target and (so == target or so.startswith(target[:15]) or target.startswith(so[:15])):
                        new_c = sp; break
                if new_c is not None: break
            if new_c is not None:
                errors.append({'sa_idx': sa_idx, 'pn': pn, 'cur_c': sa_c, 'new_c': new_c,
                               'tag': sa_qs[sa_idx].get('t')})

    print(f"PDF Qs matched: {len(mapping)}/100")
    print(f"C-field errors: {len(errors)}")
    if apply and errors:
        backup = {str(e['sa_idx']): copy.deepcopy(sa_qs[e['sa_idx']]) for e in errors}
        for e in errors:
            sa_qs[e['sa_idx']]['c'] = e['new_c']
        with open(QJ, 'w', encoding='utf-8', encoding='utf-8') as f:
            json.dump(sa_qs, f, ensure_ascii=False, indent=1)
        with open(BACKUP, 'w', encoding='utf-8', encoding='utf-8') as f:
            json.dump(backup, f, ensure_ascii=False, indent=2)
        print(f"Applied {len(errors)} c-fixes. Backup → {BACKUP}")
    elif errors:
        print("Run with --apply to write changes.")
    return errors

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    audit(Path(sys.argv[1]), Path(sys.argv[2]), apply='--apply' in sys.argv)
