# AGENTS.md — Shlav A Mega (Geriatrics, שלב א)

Current operating and release rules are in `CLAUDE.md`. The active app here is
`stage-a/`; read `stage-a/AGENTS.md` for it. Only Stage A and the separate
Hazzard reader are in use. The retained `shlav-a-mega.html` exam PWA and its
big question bank are inactive; do not start work on them.
The remaining legacy details below apply only to an explicitly assigned legacy change.

## Setup & commands
```bash
npm ci
npm test           # vitest only (no build step)
npm run verify     # supplemental legacy checks; required CI is validate, js-integrity, scan
```
For active console work use `stage-a/`. Read/write text with UTF-8.

## HARD RULES (do not violate)
1. **Branch `codex/<slug>` → PR. NEVER push to `main`** (Pages deploys `main`).
2. **Version TRINITY — bump all three together:** `package.json` "version", `const APP_VERSION` in `shlav-a-mega.html` (~line 7354), `sw.js` `CACHE='shlav-a-v<ver>'`. Enforced by `check-version-sync.py`.
3. **Question/answer edits:** quote the source (Hazzard 8e primary; Harrison 22e cross-ref) before the edit — never fabricate/paraphrase option text. **NEVER import medexams or any paywalled bank — PUBLIC repo = unlawful republication.**
4. **Hebrew RTL:** UTF-8 as-is, never transliterate; `dir="auto"` + `unicode-bidi:plaintext`.
5. **Shared files** `shared/fsrs.js` + `harrison_chapters.json` are byte-identical across the 3 medical PWAs — don't diverge.

## Data & state
- `data/questions.json` (4,297 Qs) schema: `{q, o[], c, t, ti, ref, tis}`. Topics: `TOPICS[46]` (from `data/topics.json`); `q.ti` = primary topic index, `q.tis[]` = multi-topic.
- State: localStorage object `S = {qOk, qNo, sr:{}, ck:{}, ...}`. `S.qOk/S.qNo` = total correct/wrong; `S.sr[qIdx]` = FSRS `{ef, n, ok, tot, ...}` keyed by question array index.
- Views: tabs from `data/tabs.json` → `renderTabs()` (#tb) → `render()` `switch(tab){...}`. Track tab already has KPI cards + a 46-topic mastery heatmap + a year×topic weak-spots map. (A per-topic accuracy list + radar/ROI chart were deliberately removed as redundant — don't re-add.)

## Adding questions (only legit path)
`scripts/gen_highyield.mjs` (Toranot proxy, grounded in Hazzard + guidelines, tag `AI-2026-hy`) → untracked output → `verify_questions.mjs`. This legacy workflow is inactive; do not run it without a specific assignment. Merge authority remains the coordinator under `CLAUDE.md`. NEVER copy external/paywalled questions.
