# Web Project Instructions for claude.ai → Projects → Geriatrics

This file is the canonical text to paste into the **Project Instructions** field
on claude.ai for this project. Keep it terse — every line costs tokens on every
message. Update only when a new past-incident invariant emerges, not for routine
version bumps.

Companion: upload the repo's `CLAUDE.md` as a Project Knowledge file so web
Claude can retrieve deeper context on demand without paying per-message token
cost.

---

## PASTE BELOW THIS LINE INTO claude.ai PROJECT INSTRUCTIONS

# Shlav A Mega — Israeli Geriatrics Board Exam PWA

Single-file PWA at https://eiasash.github.io/Geriatrics/ — `shlav-a-mega.html`,
no build. Hebrew-RTL, 3,833 questions, currently v10.64.47.

## Working rules (non-negotiable)
1. Don't assume. Don't hide confusion. Surface tradeoffs.
2. Minimum code. Nothing speculative.
3. Touch only what you must.
4. Define success criteria. Loop until verified.

## Authority sources (do not invert)
- `q.c` (correct index): IMA published key + 110 curator overrides — NEVER auto-flip
- `q.ref`: free-form text — rebuild toward question_chapters.json, not vice versa
- `question_chapters.json.haz/.har`: audited truth, schema-guarded

## 110 curator overrides — DO NOT AUTO-FIX
Tracks J/L/N/O/P triangulated 110 questions where IMA's published key is
medically wrong but our dataset is right. Evidence at `.audit_logs/review/{tag}.md`.
~70% of IMA-vs-textbook conflicts in spot-checks favor textbook.
Never suggest "fixing" a c-disagreement without checking the registry.

## Content edits (mandatory)
Any change to `o[]`, `c`, or `e` MUST quote the source PDF (Hazzard 8e /
Harrison 22e / GRS8) verbatim in the chat or commit. Never paraphrase.
v9.81 idx 510 incident — fabricated option, required v9.82 hotfix.

## Release ritual
1. Edit
2. Bump trinity together: package.json + sw.js CACHE + APP_VERSION
3. `npm run verify`
4. `git push origin main` → wait ~60–90s
5. `bash scripts/verify-deploy.sh` — don't claim "shipped" until live witness passes

## Two-Claude coordination
User runs terminal + claude.ai web in parallel. Branches: `claude/web-<slug>`
for web work, `claude/term-<slug>` for terminal. Never push main directly.
Session start: check `git log --all --since="1 day ago" --oneline` for
parallel work before editing shared files.

## Supabase
Project `krmlzwwelqvlfslwltol`. New `sb_publishable_*` keys fail RLS on
direct table writes (PG-42501) — go through SECURITY DEFINER RPC.
v10.64.42 migrated cloud backup to `backup_set` RPC.

## Notes citation
`notes.ch` must cite Hazzard 8e or Harrison 22e (NO legacy GRS — GRS8 is fine).
Exception: ids 29-35 (legal topics) may cite Israeli law.

## Stale-count trap (live-bug class)
Pre-load skeleton at `shlav-a-mega.html:3271` hardcodes the question count
because `_SYLLABUS` is module-private inside `src/study_plan.js`. Currently
`'3,743'` per the v10.64.41 fallback. The 12 occurrences of `3,833` at lines
≥6688 are CHANGELOG audit quotes — DO NOT touch. STALE_COUNTS guard in
`tests/dataIntegrity.test.js` slices at `const CHANGELOG=` and scans only the
live prefix.
