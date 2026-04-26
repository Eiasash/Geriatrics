#!/usr/bin/env python3
"""
v10_37_gen_explanations.py — generate Hebrew board-explanation for each
extracted GRS Q via the toranot Netlify proxy. 6 workers, 1 Q per call,
model='sonnet'. Validates: Hebrew >40%, length 200-700, no markdown bold,
no Unicode arrows. Up to 2 retries on validation failure.

Reads:  /tmp/grs8_extracted.json
Writes: /tmp/grs8_with_explanations.json
"""
import json, os, re, sys, time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

IN = '/tmp/grs8_extracted.json'
OUT = '/tmp/grs8_with_explanations.json'

PROXY_URL = 'https://toranot.netlify.app/api/claude'
PROXY_SECRET = 'shlav-a-mega-2026'
MODEL = 'claude-sonnet-4-6'
WORKERS = 6
MAX_RETRIES = 2
TIMEOUT_S = 60

SYSTEM_PROMPT = (
    "אתה מומחה גריאטריה ישראלי שמסייע בהכנה למבחן שלב א גריאטריה. "
    "כתוב הסבר תמציתי בעברית להצדקת התשובה הנכונה לשאלת מבחן שמופיעה למטה. "
    "אורך 200-700 תווים. ללא markdown (אין **bold** או כותרות), ללא חיצים יוניקודיים, "
    "ללא ‎→‎ או ‎←‎. ציין מקור (Hazzard 8e פרק / Harrison פרק / GRS8) אם רלוונטי. "
    "פתח עם הסבר פתופיזיולוגי קצר, ואז נמק למה התשובה הנכונה עדיפה על שאר ההיסחות. "
    "ענה בעברית בלבד; אסור להעתיק את השאלה מחדש."
)


def hebrew_ratio(s: str) -> float:
    if not s:
        return 0.0
    heb = sum(1 for c in s if '֐' <= c <= '׿')
    letters = sum(1 for c in s if c.isalpha())
    return heb / letters if letters else 0.0


def validate(text: str) -> tuple[bool, str]:
    if not text:
        return False, 'empty'
    if not (200 <= len(text) <= 750):
        return False, f'length {len(text)} out of [200,750]'
    if hebrew_ratio(text) < 0.4:
        return False, f'hebrew_ratio {hebrew_ratio(text):.2f} < 0.4'
    if '**' in text or '##' in text:
        return False, 'markdown bold/heading found'
    if '→' in text or '←' in text or '⟶' in text or '⇒' in text:
        return False, 'unicode arrow'
    return True, 'ok'


def call_proxy(stem: str, options: list[str], answer_idx: int) -> str:
    letter = chr(ord('A') + answer_idx)
    opts_block = '\n'.join(f'{chr(65+i)}. {o}' for i, o in enumerate(options))
    user_msg = f'Q: {stem}\n\n{opts_block}\n\nתשובה נכונה: {letter}'
    body = json.dumps({
        'model': MODEL,
        'max_tokens': 800,
        'system': SYSTEM_PROMPT,
        'messages': [{'role': 'user', 'content': user_msg}],
    }).encode('utf-8')
    req = urllib.request.Request(
        PROXY_URL, data=body,
        headers={'Content-Type': 'application/json', 'x-api-secret': PROXY_SECRET},
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    # Anthropic-style response: {content: [{type:'text', text:'...'}]}
    blocks = data.get('content') or []
    text_parts = [b.get('text', '') for b in blocks if isinstance(b, dict) and b.get('type') == 'text']
    return ''.join(text_parts).strip()


def gen_one(q: dict) -> dict:
    out = dict(q)
    last_err = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            txt = call_proxy(q['stem'], q['options'], q['answer_idx'])
            ok, why = validate(txt)
            if ok:
                out['e'] = txt
                out['e_status'] = 'ok'
                return out
            last_err = why
        except Exception as ex:
            last_err = f'exception: {ex}'
        time.sleep(1.5 * (attempt + 1))
    out['e'] = '[הסבר אוטומטי לא נוצר — בדוק GRS8 Ch ' + str(q['chapter_id']) + ' Q#' + str(q['qnum']) + ']'
    out['e_status'] = f'FAIL: {last_err}'
    return out


def main():
    qs = json.load(open(IN, encoding='utf-8'))
    print(f'Generating Hebrew explanations for {len(qs)} Qs ({WORKERS} workers)...', file=sys.stderr)
    t0 = time.time()
    results = [None] * len(qs)
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(gen_one, q): i for i, q in enumerate(qs)}
        done = 0
        for fut in as_completed(futures):
            i = futures[fut]
            results[i] = fut.result()
            done += 1
            status = results[i].get('e_status', '?')
            if status != 'ok':
                print(f'  [{done}/{len(qs)}] Q{results[i]["qnum"]}: {status}', file=sys.stderr)
            elif done % 10 == 0:
                print(f'  [{done}/{len(qs)}] ...', file=sys.stderr)
    dt = time.time() - t0
    ok_n = sum(1 for r in results if r['e_status'] == 'ok')
    fail_n = len(results) - ok_n
    print(f'Done in {dt:.0f}s. {ok_n} ok, {fail_n} failed.', file=sys.stderr)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'Wrote {OUT}', file=sys.stderr)


if __name__ == '__main__':
    main()
