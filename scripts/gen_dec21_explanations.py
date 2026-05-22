#!/usr/bin/env python3
"""Generate Hebrew explanations for Dec21 missing Qs via Toranot proxy.
Model: 'sonnet' (alias, proxy) / claude-sonnet-4-5 (direct) | Parallel: 10 workers | max_tokens: 2000 per Q

v10.64.131: migrated from anthropic SDK to scripts/lib/proxy_client.py.
Default = proxy mode (no local key needed). Set PYAI_DIRECT=1 + ANTHROPIC_API_KEY for fallback.
"""
import json, os, sys, pathlib
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, str(pathlib.Path(__file__).parent / 'lib'))
from proxy_client import call_claude as _proxy_call, get_direct_key

_DIRECT = os.environ.get('PYAI_DIRECT') == '1'
_KEY = get_direct_key() if _DIRECT else None
if _DIRECT and not _KEY:
    print('PYAI_DIRECT=1 but ANTHROPIC_API_KEY not set', file=sys.stderr); sys.exit(1)

# Model branches on mode: 'sonnet' alias for proxy, canonical ID for direct.
MODEL = 'claude-sonnet-4-5' if _DIRECT else 'sonnet' 

PROMPT = """אתה מומחה בגריאטריה שכותב הסברים קליניים לשאלות בחינת שלב א' הישראלית. כתוב הסבר מקיף ומקצועי בעברית לשאלה הבאה.

שאלה: {q}

אפשרויות:
א. {o0}
ב. {o1}
ג. {o2}
ד. {o3}

התשובה הנכונה: {letter} ({accepted})
מקור: {ref}

כתוב הסבר בסגנון הבא:
- פתח ב"התשובה הנכונה היא [אות]."
- הסבר מדוע התשובה נכונה (2-3 משפטים, עם ציון המקור ב-HAZZARD אם רלוונטי)
- הסבר בקצרה מדוע כל אחת משאר האפשרויות שגויה
- סיים עם עיקרון קליני שימושי או נקודת המפתח

אורך רצוי: 400-700 מילים. כתוב בעברית מקצועית, ללא markdown, ללא כוכביות לדגשה. השתמש במונחים אנגליים רק למונחים רפואיים ותרופות (כמו Hazzard, MRI, TIA וכו'). ענה רק עם ההסבר עצמו, ללא הקדמה."""

HEB = 'אבגד'

def gen(q):
    accepted = '/'.join(HEB[c] for c in q['c_all'])
    prompt = PROMPT.format(
        q=q['q'],
        o0=q['o'][0], o1=q['o'][1], o2=q['o'][2], o3=q['o'][3],
        letter=HEB[q['c']],
        accepted=accepted,
        ref=q['ref']
    )
    text = _proxy_call(prompt, model=MODEL, max_tokens=2000, timeout_s=120, direct=_DIRECT, api_key=_KEY)
    return q['n'], text.strip()

def main():
    qs = json.load(open('exams/2021_dec_al/missing_q_clean.json', encoding='utf-8'))
    results = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(gen, q): q['n'] for q in qs}
        for fut in as_completed(futs):
            try:
                n, expl = fut.result()
                results[n] = expl
                print(f'  Q{n}: {len(expl)} chars', file=sys.stderr)
            except Exception as e:
                print(f'  Q{futs[fut]} FAILED: {e}', file=sys.stderr)
    # Merge back into staged JSON
    for q in qs:
        if q['n'] in results:
            q['e'] = results[q['n']]
    json.dump(qs, open('exams/2021_dec_al/missing_q_final.json','w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'Generated {len(results)}/{len(qs)} explanations', file=sys.stderr)

if __name__ == '__main__':
    main()
