---
description: Full audit → fix → deploy cycle for the Shlav A Mega geriatrics app. Run this for any session that touches the codebase.
---

You are working on **Shlav A Mega** — a geriatrics board exam PWA at `eiasash.github.io/Geriatrics`.

## REPO FACTS (v10.4)
- Single-file app: `shlav-a-mega.html` (~405 KB, ~5,935 lines, vanilla JS, no build step)
- Data files live in `data/` (single source of truth — no root-level duplicates):
  - `data/questions.json` (3,326 MCQs)
  - `data/notes.json` (40 topics, ids 0–39)
  - `data/drugs.json` (114 entries)
  - `data/flashcards.json` (159 cards)
  - `data/osce.json`, `data/tabs.json`, `data/topics.json`, `data/hazzard_chapters.json`, `data/regulatory.json`, `data/distractors.json`, `data/question_chapters.json`
- Shared engine: `shared/fsrs.js` (FSRS-4.5 spaced repetition, used for both questions and flashcards)
- Service worker: `sw.js` — cache key `shlav-a-v10.4` must equal `APP_VERSION` in HTML
- `package.json` version (`10.4.0`) must track `APP_VERSION`
- Deploy: GitHub Pages — push to `main` = live. CI (`.github/workflows/ci.yml`) validates first.
- Syllabus: P005-2026 — Hazzard's 8e (excl. Ch 2–6, 34, 62) + Harrison's 22e + 6 articles + Israeli MOH law docs. **NO GRS** in current notes/questions; v9.95 changelog entry contains the word but is never rendered (see STEP 2).
- AI explain feature: `explainWithAI(qIdx)` (async, line ~1631) → Claude via `callAI()` → Hebrew explanation anchored by `ANSWER KEY: The correct answer is DEFINITIVELY "…"` → cached in `localStorage['samega_ex']`
- API key storage: `localStorage['samega_apikey']`
- Critical localStorage keys (DO NOT rename): `samega`, `samega_ex`, `samega_apikey`, `shlav_q_images`, `shlav_exam_date`

## STEP 1 — READ EVERYTHING FIRST
```
Read: CLAUDE.md                (authoritative, overrides skill defaults)
Read: shlav-a-mega.html        (full — 5,935 lines)
Read: data/questions.json      (structure: {q, o, c, t, ti, e?})
Read: data/notes.json          (structure: {id, topic, ch, notes} — ch MUST cite Hazzard's/Harrison's, NO GRS)
Read: data/drugs.json          (structure: {name, heb, acb, beers, cat, risk})
Read: data/flashcards.json     (structure: {f, b})
Read: sw.js                    (check CACHE constant)
Read: skill/SKILL.md           (geriatrics knowledge pack)
```

## STEP 2 — AUDIT CHECKLIST

Run through each item. Mark PASS / FAIL / WARN.

### Correctness
- [ ] Sample 15 questions randomly — flag empty strings, out-of-range `c`, missing keys
- [ ] All `ti` values in `data/questions.json` are integers 0–39
- [ ] `data/notes.json`: no `ch` field contains "GRS"
- [ ] `data/notes.json` bodies also clean of "GRS"
- [ ] `data/questions.json` clean of "GRS" in `q`/`o`/`e`
- [ ] Syllabus tab: `SYL_HAZ_EXCLUDED = {2,3,4,5,6,34,62}` (7 chapters) struck through in rendering
- [ ] `SYL_HAZ` is the **full** Hazzard chapter map (~101 entries) — the 7 excluded IDs are rendered with `text-decoration:line-through`, not removed
- [ ] `SYL_HAR_ALL` + `SYL_HAR_BASE` total 69 Harrison chapters (currently 10 + 59)
- [ ] Topic coverage: ≥ 5 questions per `ti` across 0–39

### AI Explain Feature
- [ ] `explainWithAI(qIdx)` exists and is declared `async`
- [ ] Prompt contains `ANSWER KEY: The correct answer is DEFINITIVELY` (2 call sites: explain + autopsy)
- [ ] `_exCache` reads from `localStorage['samega_ex']` on init, writes on each success
- [ ] API key settings card (`samega_apikey`) accessible from Track/Settings tab
- [ ] Error path sets `{err: …}` and surfaces message in explain box (not silent)
- [ ] Cached explanations render immediately via `setTimeout(renderExplainBox, 0)`

### Flashcard FSRS (wired since pre-v10.4)
- [ ] `fcGetDueIndices`, `fcRebuildQueue`, `renderFlash`, `fcFsrsScore`, `fcRate` all present
- [ ] Due/Browse toggle + due-count badge in flashcard tab
- [ ] Next-interval hints on Hard/Good/Easy buttons call `fsrsIntervalWithDeadline`
- [ ] Empty-state UI when `fcQueue` is empty in Due mode
- [ ] Tests green: `tests/flashcardFsrs.test.js` + `tests/sharedFsrs.test.js`

### UI / UX
- [ ] Dark mode: `body.dark` class (toggled via `document.body.classList.toggle('dark')`, not a wrapper div)
- [ ] Core interactive elements ≥ 44px min-height (`.tabs button`, `.qo`, `.ck`, `.topic`, primary action buttons)
- [ ] Hebrew content RTL-correct (`html[dir="rtl"]` or `.heb` class; `unicode-bidi: plaintext` on mixed-language spans)
- [ ] `sanitize()` helper used on user-facing interpolation (≥50 call sites)
- [ ] Header version label uses `APP_VERSION` (v10.4 etc.)
- [ ] `APP_VERSION` ↔ `sw.js` CACHE version ↔ `package.json` version all aligned

### Data Integrity
- [ ] `data/questions.json` — `c` in range `0 .. len(o)-1` for every entry
- [ ] `data/questions.json` — every entry has keys `q`, `o`, `c`, `t` (`ti` + `e` optional but present for most)
- [ ] `data/notes.json` — exactly 40 entries, ids 0–39 present
- [ ] `data/drugs.json` — every entry has `name`, `heb`, `acb`, `beers`, `cat`, `risk`
- [ ] `data/flashcards.json` — every entry has `f` and `b`

### Performance
- [ ] File size for `shlav-a-mega.html` ~400 KB (expected for 3,326-question corpus; monolith is intentional, no bundler)
- [ ] Data loads lazily from `data/*.json` at runtime — no large JSON inlined in HTML
- [ ] No synchronous localStorage reads of heavy state blocking first paint

## STEP 3 — FIX ALL FAILURES

Fix every FAIL directly in the files. For `data/*.json` issues, fix the specific entry.
For HTML/JS bugs, fix in-place with `Edit`. Never break working features.

Common fixes:
- GRS in `data/notes.json` `ch` field → replace with the correct Hazzard's/Harrison's chapter citation
- Wrong `ti` value → re-tag based on question content vs. the 40-topic index (see CLAUDE.md)
- Missing `sanitize()` call → wrap interpolated strings
- Dark mode gaps → add `body.dark` selector to CSS (not `.dark` wrapper div)
- Version drift → update `APP_VERSION` in HTML, `CACHE` in `sw.js`, and `version` in `package.json` together

## STEP 4 — VALIDATE

```bash
python3 <<'PY'
import json
q = json.load(open('data/questions.json'))
n = json.load(open('data/notes.json'))
d = json.load(open('data/drugs.json'))
f = json.load(open('data/flashcards.json'))

errors = []
for i,x in enumerate(q):
    if not isinstance(x.get('o'), list) or len(x['o']) < 2:
        errors.append(f'Q{i}: bad options')
        continue
    if not isinstance(x.get('c'), int) or x['c'] < 0 or x['c'] >= len(x['o']):
        errors.append(f'Q{i}: c={x.get("c")} invalid for {len(x["o"])} options')
    if 'ti' in x and (not isinstance(x['ti'], int) or x['ti'] < 0 or x['ti'] > 39):
        errors.append(f'Q{i}: ti={x["ti"]} out of range')

ids = {x['id'] for x in n}
for i in range(40):
    if i not in ids: errors.append(f'Note topic {i} missing')
for x in n:
    if 'GRS' in (x.get('ch') or ''):
        errors.append(f'Note {x["id"]} ({x["topic"]}): GRS in ch field')
    if 'GRS' in (x.get('notes') or ''):
        errors.append(f'Note {x["id"]} ({x["topic"]}): GRS in notes body')

for i,x in enumerate(d):
    for k in ('name','heb','acb','beers','cat','risk'):
        if k not in x: errors.append(f'Drug {i}: missing {k}')
for i,x in enumerate(f):
    for k in ('f','b'):
        if k not in x: errors.append(f'Flashcard {i}: missing {k}')

if errors:
    print(f'ERRORS ({len(errors)}):')
    for e in errors[:30]: print(' ', e)
    if len(errors) > 30: print(f'  … +{len(errors)-30} more')
else:
    print(f'OK — {len(q)} questions, {len(n)} notes, {len(d)} drugs, {len(f)} flashcards')
PY
```

HTML sanity:
```bash
python3 <<'PY'
import re
c = open('shlav-a-mega.html').read()
sw = open('sw.js').read()
pkg = open('package.json').read()

print('Size:', len(c)//1024, 'KB')
print('Braces: {', c.count('{'), '} ', c.count('}'), 'diff=', c.count('{') - c.count('}'))
assert c.count('{') == c.count('}'), 'Brace mismatch'
assert 'ANSWER KEY: The correct answer is DEFINITIVELY' in c, 'AI prompt anchor missing'
assert 'samega_apikey' in c, 'API key storage missing'
assert 'async function explainWithAI' in c, 'explainWithAI not async'
assert re.search(r"const APP_VERSION\s*=\s*'([\d.]+)'", c), 'APP_VERSION not found'
app_ver = re.search(r"const APP_VERSION\s*=\s*'([\d.]+)'", c).group(1)
sw_ver = re.search(r"CACHE\s*=\s*'shlav-a-v([\d.]+)'", sw).group(1)
pkg_ver = re.search(r'"version":\s*"([\d.]+)"', pkg).group(1).rsplit('.', 1)[0] if re.search(r'"version":\s*"([\d.]+)"', pkg) else None
assert app_ver == sw_ver, f'Version drift: APP={app_ver} SW={sw_ver}'
print(f'Version sync OK: APP_VERSION={app_ver}, SW CACHE=shlav-a-v{sw_ver}, package.json={pkg_ver}.x')
print('HTML checks: PASS')
PY
```

Tests:
```bash
npm test        # vitest — 693+ tests across 23 files
```

## STEP 5 — COMMIT AND PUSH

```bash
git add -A
git commit -m "audit: <describe what was fixed>"
git push -u origin <current-branch>
```

CI runs on push. On green, GitHub Pages updates within ~60 seconds. If this is running under the Claude Code web harness on a `claude/...` branch, open a draft PR to `main` rather than pushing directly.

## STEP 6 — REPORT

Output a table:

| Check | Status | Fix Applied |
|-------|--------|-------------|
| ... | PASS / FIXED / WARN | ... |

Then list any remaining WARNs that weren't auto-fixable.
