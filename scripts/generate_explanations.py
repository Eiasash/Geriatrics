#!/usr/bin/env python3
"""
generate_explanations.py — Fill empty `e` fields for Geriatrics MCQs.

For each question in data/questions.json whose `e` field is <10 chars,
call Claude Sonnet 4.5 to generate a Hebrew explanation matching the
corpus style. Only touches `e` — never q/o/c/ti/t.

Usage:
  ANTHROPIC_API_KEY=sk-ant-... python3 scripts/generate_explanations.py
  Options: --dry-run, --limit N

Validation per response:
  - ≥100 chars
  - ≥25% Hebrew characters
  - Contains '## התשובה הנכונה' header
  - Contains the correct-answer letter (א/ב/ג/ד)
  - No `ð` mojibake
"""
import json, os, sys, re, time, argparse
import urllib.request, urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

API_KEY = os.environ.get('ANTHROPIC_API_KEY')
if not API_KEY:
    print('ERROR: set ANTHROPIC_API_KEY', file=sys.stderr); sys.exit(1)

MODEL = 'claude-sonnet-4-5'
ENDPOINT = 'https://api.anthropic.com/v1/messages'
MAX_TOKENS = 1500
WORKERS = 10
CHECKPOINT_EVERY = 10
RETRIES = 3

QUESTIONS_PATH = Path(__file__).parent.parent / 'data' / 'questions.json'
FAILURES_PATH = Path('/tmp/explanation_failures.json')

HEB_LETTER = ['א','ב','ג','ד']

PROMPT_TEMPLATE = """אתה מומחה לרפואת גריאטריה בישראל וכותב הסברים לשאלות מבחן שלב א' לפי סילבוס המועצה המדעית P005-2026. הספרים הרלוונטיים הם Hazzard's Geriatric Medicine and Gerontology 8e (מקור ראשי) ו-Harrison's Principles of Internal Medicine 22e (מקור משני). החזר *רק* את ההסבר, בעברית, ללא preamble וללא code fences.

מבנה חובה (תואם 3,254 ההסברים הקיימים בקורפוס):

## התשובה הנכונה: {correct_letter} — {correct_text_brief}

**למה {correct_letter} נכונה:**
[2-4 משפטים בעברית. ציין Hazzard ch. X / Harrison ch. X רק אם בטוח בפרק — עדיף לא לציין מאשר לציין שגוי.]

**למה האפשרויות האחרות שגויות:**
- **א.** [משפט אחד אם לא התשובה הנכונה]
- **ב.** [...]
- **ג.** [...]
- **ד.** [...]

**נקודת המפתח לקשיש:**
[משפט אחד עם הפרט הגריאטרי החשוב — Beers, STOPP-START, eGFR cutoff, שיקול פונקציונלי, וכו'.]

הנחיות סגנון:
1. עברית בלבד. שמות תרופות/מחלות באנגלית בתוך משפט עברי בסדר (Furosemide, NYHA III), אבל אל תיצור משפטים דו-לשוניים מלאים.
2. אין placeholder, אין TODO, אין סוגריים מרובעים ריקים.
3. אין `>` או `→` — רק markdown מובנה.
4. ציין Beers/STOPP-START מפורשות כשרלוונטי.
5. מינונים ריאליים לקשיש: Haloperidol 0.25-0.5 מ"ג PRN, לא 5 מ"ג.

השאלה:
{question_stem}

האפשרויות:
א. {opt_a}
ב. {opt_b}
ג. {opt_c}
ד. {opt_d}

התשובה הנכונה: {correct_letter}

החזר את ההסבר בפורמט לעיל.
"""


def call_claude(prompt):
    body = json.dumps({
        'model': MODEL,
        'max_tokens': MAX_TOKENS,
        'messages': [{'role': 'user', 'content': prompt}],
    }).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.loads(r.read())
    return ''.join(b.get('text','') for b in data.get('content',[]) if b.get('type')=='text')


def hebrew_ratio(s):
    if not s: return 0
    heb = sum(1 for c in s if '\u0590' <= c <= '\u05FF')
    letters = sum(1 for c in s if c.isalpha())
    return heb / max(1, letters)


def validate(text, correct_letter):
    if len(text) < 100: return 'too short'
    if 'ð' in text: return 'mojibake'
    if hebrew_ratio(text) < 0.25: return 'low Hebrew ratio'
    if '## התשובה הנכונה' not in text: return 'missing header'
    if correct_letter not in text: return f'missing correct letter {correct_letter}'
    return None


def generate_one(i, q):
    if not isinstance(q.get('c'), int) or not (0 <= q['c'] < 4):
        return (i, None, 'invalid c')
    if not isinstance(q.get('o'), list) or len(q['o']) != 4:
        return (i, None, 'invalid options')

    cl = HEB_LETTER[q['c']]
    correct_text = q['o'][q['c']][:80]
    prompt = PROMPT_TEMPLATE.format(
        correct_letter=cl,
        correct_text_brief=correct_text,
        question_stem=q.get('q','').strip(),
        opt_a=q['o'][0], opt_b=q['o'][1], opt_c=q['o'][2], opt_d=q['o'][3],
    )

    last_err = None
    for attempt in range(RETRIES):
        try:
            text = call_claude(prompt).strip()
            err = validate(text, cl)
            if err is None:
                return (i, text, None)
            last_err = err
            time.sleep(1 + attempt * 2)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            last_err = f'{type(e).__name__}: {e}'
            time.sleep(2 + attempt * 3)
    return (i, None, last_err)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--limit', type=int, default=None)
    args = ap.parse_args()

    with open(QUESTIONS_PATH, encoding='utf-8') as f:
        questions = json.load(f)

    todo = [(i, q) for i, q in enumerate(questions) if len(q.get('e','') or '') < 10]
    print(f'Questions with empty e: {len(todo)}')
    if args.limit:
        todo = todo[:args.limit]
        print(f'Limited to: {len(todo)}')

    if args.dry_run:
        for i, q in todo[:5]:
            print(f'  [{i}] t={q.get("t")!r} c={q.get("c")} q={q.get("q","")[:60]}')
        return

    lock = threading.Lock()
    done = 0
    failures = []

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = [ex.submit(generate_one, i, q) for i, q in todo]
        for fut in as_completed(futures):
            i, text, err = fut.result()
            with lock:
                if text:
                    questions[i]['e'] = text
                    done += 1
                    if done % 10 == 0:
                        with open(QUESTIONS_PATH, 'w', encoding='utf-8', encoding='utf-8') as f:
                            json.dump(questions, f, ensure_ascii=False, indent=2)
                        print(f'  checkpoint: {done}/{len(todo)} done')
                else:
                    failures.append({'i': i, 'err': err, 'q': questions[i].get('q','')[:120]})
                    print(f'  FAIL [{i}]: {err}')

    with open(QUESTIONS_PATH, 'w', encoding='utf-8', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    with open(FAILURES_PATH, 'w', encoding='utf-8', encoding='utf-8') as f:
        json.dump(failures, f, ensure_ascii=False, indent=2)

    print(f'\nFinal: {done}/{len(todo)} succeeded, {len(failures)} failed')
    print(f'Failures logged to {FAILURES_PATH}')


if __name__ == '__main__':
    main()
