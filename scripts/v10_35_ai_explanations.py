#!/usr/bin/env python3
"""v10.35 AI explanations — call toranot proxy 6 workers, 1 Q per call.

Reads scripts/v10_35_new_questions.json. Adds 'e' (Hebrew explanation) and
optionally tightens 'ref' (Hazzard chapter). Validates each response.

Output: scripts/v10_35_new_questions_with_e.json
"""
import json, sys, time, re
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import urllib.request
import urllib.error

PROXY = 'https://toranot.netlify.app/api/claude'
SECRET = 'shlav-a-mega-1f97f311d307-2026'
WORKERS = 6
MAX_RETRIES = 2
TIMEOUT = 60

INPUT = Path('scripts/v10_35_new_questions.json')
OUTPUT = Path('scripts/v10_35_new_questions_with_e.json')

SYSTEM_TEMPLATE = """אתה עוזר רפואי המסביר תשובות נכונות לשאלות בחינה גריאטרית של מועצת הרופאים הישראלית (P005-2026).

המבנה הקבוע של ההסבר:
1. שורת פתיחה מודגשת בעברית עם **התשובה הנכונה (אות) — סיכום קצר**.
2. פסקה רפואית בעברית עם הסבר פתופיזיולוגי/קליני (לא יותר מ-3 משפטים).
3. שורת סיום של מקור: ציטוט פרק Hazzard או UpToDate או הנחיה רלוונטית.

חוקים נוקשים:
- אורך כולל: 250-650 תווים בעברית.
- אסור להשתמש בחיצים → או * כתיבה כשורה לבד; השתמש בכוכבית כפולה ל-bold (** **).
- 60% לפחות עברית.
- אל תכתוב markdown headings (#).
- אל תוסיף אנגלית מיותרת מעבר למונחים רפואיים בסוגריים.

**שאלה:**
{question}

**אופציות:**
א. {o0}
ב. {o1}
ג. {o2}
ד. {o3}

**התשובה הנכונה (קוד 0=א, 1=ב, 2=ג, 3=ד):** {c}
**תחום (ti):** {ti}

החזר רק את ההסבר. אל תוסיף מבוא או הערות."""


def heb_ratio(s):
    if not s: return 0
    heb = sum(1 for c in s if '֐' <= c <= '׿')
    total = sum(1 for c in s if c.isalpha())
    return heb / total if total else 0


def validate(text):
    """Returns (ok, reason)."""
    if not text or not isinstance(text, str):
        return False, 'empty'
    text = text.strip()
    L = len(text)
    if L < 200:
        return False, f'too_short ({L})'
    if L > 750:
        return False, f'too_long ({L})'
    if heb_ratio(text) < 0.40:
        return False, f'low_hebrew ({heb_ratio(text):.2f})'
    if '→' in text or '←' in text or '⇒' in text:
        return False, 'unicode_arrow'
    # Note: bold (** **) IS allowed per the existing 2025-Jun-Basic style.
    if re.search(r'^#+\s', text, re.MULTILINE):
        return False, 'markdown_heading'
    return True, 'ok'


def format_c(c):
    if isinstance(c, int):
        return str(c)
    if isinstance(c, list):
        if c == [0,1,2,3]: return 'all (כל התשובות מתקבלות)'
        return ' or '.join(str(x) for x in c) + ' (multi)'
    return str(c)


def call_proxy(prompt, attempt=1):
    body = json.dumps({
        'model': 'sonnet',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': 1024,
    }).encode('utf-8')
    req = urllib.request.Request(PROXY, data=body, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('x-api-secret', SECRET)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            text = data.get('content', [{}])[0].get('text', '')
            return text
    except urllib.error.HTTPError as e:
        return f'__HTTP_ERR_{e.code}__'
    except Exception as e:
        return f'__EXC__{type(e).__name__}__{e}__'


def explain_one(qd):
    qd_out = dict(qd)
    o = (qd['o'] + ['', '', '', ''])[:4]
    prompt = SYSTEM_TEMPLATE.format(
        question=qd['q'],
        o0=o[0], o1=o[1], o2=o[2], o3=o[3],
        c=format_c(qd['c']),
        ti=qd['ti'],
    )
    last_reason = ''
    last_text = ''
    for attempt in range(1, MAX_RETRIES + 2):
        text = call_proxy(prompt, attempt=attempt)
        if text.startswith('__'):
            last_reason = text
            time.sleep(1.5 ** attempt)
            continue
        ok, reason = validate(text)
        if ok:
            qd_out['e'] = text.strip()
            qd_out['_validate'] = 'ok'
            qd_out['_attempts'] = attempt
            return qd_out
        last_reason = reason
        last_text = text
        time.sleep(0.5 * attempt)
    qd_out['e'] = last_text.strip() if last_text else ''
    qd_out['_validate'] = f'FAIL: {last_reason}'
    qd_out['_attempts'] = MAX_RETRIES + 1
    return qd_out


def main():
    qs = json.load(open(INPUT, encoding='utf-8'))
    print(f'Generating explanations for {len(qs)} Qs with {WORKERS} workers...')
    t0 = time.time()
    out = [None] * len(qs)
    completed = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(explain_one, q): i for i, q in enumerate(qs)}
        for fut in as_completed(futures):
            i = futures[fut]
            out[i] = fut.result()
            completed += 1
            status = out[i].get('_validate', '?')
            tag_q = f'{out[i]["tag"]}-Q{out[i]["qnum"]}'
            print(f'  [{completed}/{len(qs)}] {tag_q}: {status}')
    dt = time.time() - t0
    fail = [q for q in out if not q['_validate'].startswith('ok')]
    print(f'\nDone in {dt:.1f}s. Failures: {len(fail)}/{len(out)}')
    for q in fail:
        print(f'  FAIL {q["tag"]}-Q{q["qnum"]}: {q["_validate"]} (preview: {q.get("e","")[:80]!r})')
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f'Wrote {OUTPUT}')

if __name__ == '__main__':
    main()
