#!/usr/bin/env python3
"""Generate Hebrew explanations for Dec21 missing Qs via direct Anthropic API.
Model: claude-sonnet-4-5 | Parallel: 10 workers | max_tokens: 2000 per Q
"""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from anthropic import Anthropic

client = Anthropic(api_key=os.environ['ANTHROPIC_API_KEY'])

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
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": PROMPT.format(
            q=q['q'],
            o0=q['o'][0], o1=q['o'][1], o2=q['o'][2], o3=q['o'][3],
            letter=HEB[q['c']],
            accepted=accepted,
            ref=q['ref']
        )}]
    )
    return q['n'], msg.content[0].text.strip()

def main():
    qs = json.load(open('exams/2021_dec_al/missing_q_clean.json'))
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
    json.dump(qs, open('exams/2021_dec_al/missing_q_final.json','w'), ensure_ascii=False, indent=2)
    print(f'Generated {len(results)}/{len(qs)} explanations', file=sys.stderr)

if __name__ == '__main__':
    main()
