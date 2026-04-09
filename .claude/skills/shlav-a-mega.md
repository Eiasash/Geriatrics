---
description: >
  Complete development skill for the Shlav A Mega geriatrics board exam study PWA.
  ALWAYS use this skill when: modifying shlav-a-mega.html, fixing bugs, adding features,
  adding questions, pushing to GitHub, editing quiz logic, modifying AI calls, updating
  the service worker, changing filters, or anything related to the Geriatrics codebase.
  Also trigger on: "fix the app", "push", "deploy", "add questions", "update questions",
  "study app", "shlav", "שלב א", references to eiasash.github.io/Geriatrics,
  question bank changes, AI proxy issues, or SW cache problems.
globs:
  - "shlav-a-mega.html"
  - "sw.js"
  - "hazzard_chapters.json"
  - "questions.json"
  - "*.html"
---

# Shlav A Mega — Development Skill

## Overview
Single-file Hebrew RTL PWA for Israeli geriatrics board exam prep (שלב א׳).
**Repo:** `github.com/Eiasash/Geriatrics.git`
**Live:** `eiasash.github.io/Geriatrics/shlav-a-mega.html` (GitHub Pages)
**Version:** 9.6 (Apr 2026)

## Architecture
- **Single HTML file** (`shlav-a-mega.html`, ~2.3MB) contains ALL JS, CSS, and question data inline
- **Two `<script>` tags:** Script 1 = header clock (small), Script 2 = main app (~2.2MB)
- **Service Worker** (`sw.js`) — network-first for HTML, cache-first for JSON/images
- **External data:** `hazzard_chapters.json` (556KB, lazy-loaded), `questions.json` (source of truth for QZ)
- **No build step** — edit HTML directly, push to main, GitHub Pages deploys

## Question Data
- **1419 questions** in `const QZ=[...]` array inside Script 2
- **Source:** `questions.json` (1432 entries, deduped to 1419 in QZ)
- **9 exam tags:** `2021`, `2022`, `יוני 23`, `2023-ב`, `מאי 24`, `ספט 24`, `יוני 25`, `2025-א`, `Hazzard`
- **Fields per question:** `q` (text), `o` (options array), `c` (correct index), `t` (exam tag), `ti` (topic index 0-39), `e` (Hebrew explanation), `img` (optional image path), `num` (optional question number)
- **40 topics** in `const TOPICS=[...]` array

## AI Routing
ALL AI calls go through `callAI(messages, maxTokens, model)`:
1. **Proxy first:** `POST toranot.netlify.app/api/claude` with `x-api-secret: shlav-a-mega-2026`
2. **Fallback:** Direct Anthropic API with personal key from `localStorage('samega_apikey')`
3. **Model aliases:** `sonnet` → `claude-sonnet-4-6`, `opus` → `claude-opus-4-6`, `haiku` → `claude-haiku-4-5-20251001`

AI features using callAI:
- `explainWithAI()` — Hebrew explanation of correct answer (sonnet)
- `aiAutopsy()` — per-wrong-option analysis (sonnet)
- `gradeTeachBack()` — grades student explanation 1-3 (haiku)
- `submitReport()` wrong_answer — AI verifies answer key (sonnet)
- Chat tab — direct proxy call with system prompt (sonnet)

## Critical Rules

### Hebrew Text in JS
**NEVER** use single quotes around Hebrew text containing geresh (׳) or apostrophe.
`שלב א'` inside `'...'` will CRASH the entire app.
Always use backtick template literals for Hebrew content: `` `שלב א'` ``

### JS Syntax Validation
Before every commit, validate with:
```bash
node -e "
const fs=require('fs');
const html=fs.readFileSync('shlav-a-mega.html','utf8');
const scripts=html.match(/<script>([\s\S]*?)<\/script>/g);
scripts.forEach((s,i)=>{const js=s.replace(/<\/?script>/g,'');try{new Function(js);console.log('Script',i+1,'OK');}catch(e){console.log('Script',i+1,'ERROR:',e.message);}});
"
```
Both scripts must say OK. The first `match` is non-greedy — gets Script 1 (small clock). Script 2 is the main app.

### Service Worker
- Cache name format: `shlav-a-v{VERSION}` (e.g., `shlav-a-v9.6.1`)
- **Network-first** for `.html` files — always fetches fresh, falls back to cache offline
- **Cache-first** for everything else (JSON, images, PDFs)
- On load, app deletes old caches not matching current version
- MUST bump cache version string on every push or users get stale content

### Filter Pills & buildPool()
Filter pill values must EXACTLY match `q.t` tag strings in QZ.
The `buildPool()` function handles special filters:
- `'hard'` — EF < 2.5 sorted worst-first, fallback to any SR data
- `'slow'` — avg answer time > 60s sorted slowest-first
- `'weak'` — weakest 10 topics by accuracy
- `'due'` — SM-2 spaced repetition queue
- `'topic'` — single topic by index
- Any other string — matched against `q.t.includes(filt)`

### Deployment Pipeline
```bash
# 1. Validate syntax
node -e "..." # (see above)

# 2. Commit
git add -A && git commit -m "message"

# 3. Push with PAT
git remote set-url origin https://x-access-token:[PAT]@github.com/Eiasash/Geriatrics.git
git push origin main
git remote set-url origin https://github.com/Eiasash/Geriatrics.git

# 4. Verify deploy (~60s)
curl -s "https://eiasash.github.io/Geriatrics/shlav-a-mega.html" | grep -o "v9\.[0-9]*"
```
Remind user to revoke PAT at `https://github.com/settings/tokens` after push.

## Key State Variables
- `S` — main state object (persisted to localStorage/IDB)
- `S.sr` — spaced repetition data: `{[qIdx]: {ef, n, next, ts[], at}}`
- `S.qOk`, `S.qNo` — correct/wrong counts
- `S.bk` — bookmarks `{[qIdx]: true}`
- `S.ck` — syllabus checklist `{[topicIdx]: true}`
- `S.dark`, `S.studyMode` — display modes
- `pool[]` — current question indices, `qi` — current index, `filt` — active filter

## Supabase
- **Project:** `krmlzwwelqvlfslwltol`
- **Table:** `shlav_feedback` (id, message, diagnostics, app_version, type, context, created_at)
- **Anon key:** starts with `eyJ...` ends with `...dinAAQ`
- **Cloud sync:** state backed up to Supabase keyed by device ID

## Common Pitfalls
1. **Stale cache** — always bump SW version. Network-first SW should auto-update but old SWs may persist.
2. **prompt() on mobile** — ugly and breaks flow. Use inline inputs instead.
3. **QZ out of sync with questions.json** — if adding questions, rebuild QZ from questions.json with dedup.
4. **RTL garbled text** — PDF extraction sometimes reverses English in Hebrew context. Check for `[a-z][A-Z]` patterns.
5. **Model names** — proxy uses aliases (`sonnet`, `opus`, `haiku`). Direct API needs full names. `callAI()` handles mapping.
6. **Large file** — HTML is ~2.3MB. Don't use `cat` to view. Use `grep -n` and `sed -n` for targeted reads.
