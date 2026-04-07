---
description: Full audit → fix → deploy cycle for the Shlav A Mega geriatrics app. Run this for any session that touches the codebase.
---

You are working on **Shlav A Mega** — a geriatrics board exam PWA at `eiasash.github.io/Geriatrics`.

## REPO FACTS
- Single-file app: `shlav-a-mega.html` (~96KB, vanilla JS, no build step)
- Data files: `questions.json` (1131 MCQs), `notes.json` (40 topics), `flashcards.json` (159), `drugs.json` (53)
- Deploy: GitHub Pages — push to main = live. No build, no CI needed.
- Syllabus: P005-2026 — Hazzard's 8e (excl. Ch 2-6,34,62) + Harrison's 22e (specific chapters) + 6 articles + 13 Israeli law docs. **NO GRS.**
- AI explain feature: `explainWithAI(qIdx)` → Claude Opus → Hebrew explanation anchored on answer key → cached `localStorage['samega_ex']`
- API key stored: `localStorage['samega_apikey']`

## STEP 1 — READ EVERYTHING FIRST
```
Read: shlav-a-mega.html (full)
Read: questions.json (check structure: {q, o, c, t, ti})
Read: notes.json (check ch field — must cite Hazzard's/Harrison's, NO GRS)
Read: skill/SKILL.md
```

## STEP 2 — AUDIT CHECKLIST

Run through each item. Mark PASS / FAIL / WARN.

### Correctness
- [ ] Sample 15 questions randomly — verify `c` index (0-3) is plausible for the question
- [ ] All `ti` values in questions.json are 0-39
- [ ] notes.json: no `ch` field contains "GRS"
- [ ] Syllabus tab: Hazzard's section shows excluded chapters as STRUCK THROUGH (not as required)
- [ ] `SYL_HAZ` array = 7 excluded chapters rendered with red strikethrough
- [ ] `SYL_HAR_ALL` = 10 chapters, `SYL_HAR_BASE` = 57 chapters — count them

### AI Explain Feature
- [ ] `explainWithAI(qIdx)` exists and is async
- [ ] Prompt starts with `ANSWER KEY: The correct answer is DEFINITIVELY...`
- [ ] `_exCache` reads/writes from `localStorage['samega_ex']`
- [ ] API key settings card exists in stats/settings tab
- [ ] Error handling: shows error message in box (not silent fail)
- [ ] Cached explanations show immediately via `setTimeout(renderExplainBox, 0)`

### UI / UX
- [ ] Dark mode: `.dark` class applied on `body`, not a wrapper div
- [ ] All interactive elements ≥44px min-height
- [ ] Hebrew content has `dir="rtl"` or `.heb` class
- [ ] `sanitize()` used on all user-facing string interpolation
- [ ] Version number in header matches latest commit
- [ ] Service worker version in `sw.js` matches app version

### Data Integrity
- [ ] `questions.json` — no questions with `c` outside 0 to `o.length-1`
- [ ] `questions.json` — all objects have keys: q, o, c, t (ti optional but present)
- [ ] `notes.json` — all 40 topics present (ids 0-39)
- [ ] `drugs.json` — all entries have: name, heb, acb, beers, cat, risk

### Performance
- [ ] File size under 150KB
- [ ] No synchronous localStorage reads blocking render (check load path)

## STEP 3 — FIX ALL FAILURES

Fix every FAIL directly in the files. For questions.json data issues, fix the specific entry.
For HTML/JS bugs, fix in-place with str_replace. Never break working features.

Common fixes:
- GRS in notes.json `ch` field → replace with correct Hazzard's chapter
- Wrong `ti` value → re-tag based on question content vs TOPICS array
- Missing `sanitize()` call → wrap interpolated strings
- Dark mode gaps → add `.dark` selector to CSS

## STEP 4 — VALIDATE

```bash
python3 -c "
import json
q = json.load(open('questions.json'))
n = json.load(open('notes.json'))
d = json.load(open('drugs.json'))
f = json.load(open('flashcards.json'))

errors = []
for i,x in enumerate(q):
    if x['c'] not in range(len(x['o'])): errors.append(f'Q{i}: c={x[\"c\"]} invalid')
    if 'ti' in x and x['ti'] not in range(40): errors.append(f'Q{i}: ti={x[\"ti\"]} invalid')
    
ids = [x['id'] for x in n]
for i in range(40):
    if i not in ids: errors.append(f'Note topic {i} missing')
for x in n:
    if 'GRS' in x.get('ch',''): errors.append(f'Note {x[\"id\"]} ({x[\"topic\"]}): GRS in ch field')

if errors:
    print(f'ERRORS ({len(errors)}):')
    for e in errors: print(' ', e)
else:
    print(f'OK — {len(q)} questions, {len(n)} notes, {len(d)} drugs, {len(f)} flashcards')
"
```

HTML validation:
```bash
python3 -c "
c = open('shlav-a-mega.html').read()
print('Size:', len(c)//1024, 'KB')
print('Braces:', c.count('{'), c.count('}'), 'diff=', c.count('{')-c.count('}'))
assert 'ANSWER KEY: The correct answer is DEFINITIVELY' in c, 'AI prompt anchor missing'
assert 'samega_apikey' in c, 'API key storage missing'
assert 'explainWithAI' in c, 'AI explain function missing'
assert 'GRS' not in c.split('No GRS')[1][:500], 'GRS still in app content'
print('HTML checks: PASS')
"
```

## STEP 5 — COMMIT AND PUSH

```bash
git add -A
git commit -m "audit: [describe what was fixed]"
# Token provided by user — ask if not in context
git remote set-url origin "https://Eiasash:TOKEN@github.com/Eiasash/Geriatrics.git"
git push origin main
git remote set-url origin https://github.com/Eiasash/Geriatrics.git
```

After push: live at `https://eiasash.github.io/Geriatrics` within ~60 seconds (GitHub Pages).

## STEP 6 — REPORT

Output a table:
| Check | Status | Fix Applied |
|-------|--------|-------------|
| ... | PASS/FIXED/WARN | ... |

Then list any remaining WARNs that weren't auto-fixable.
