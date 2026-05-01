# IMPROVEMENTS.md — Shlav A Mega audit log

This file is appended to by every `audit-fix-deploy` pipeline run. Each entry records: state at audit time, what was fixed, what the next pass should look at.

---

## 2026-05-01 — v10.63.1 audit pass

### Pre-audit state

| Metric | Value | Notes |
|---|---|---|
| Branch | `main` | clean after `git pull --rebase` |
| `APP_VERSION` | 10.63.1 | trinity aligned (HTML / sw.js / package.json) |
| Q corpus | 3833 | data/questions.json |
| Topics | 46 | ti 0..45 |
| Function count | 210 | `shlav-a-mega.html` (was ~270 in stale CLAUDE.md, was ~219 in audit-fix-deploy skill text — both pre-decomposition figures; current actual is 210) |
| Helper prefixes | 27 distinct | `_rl*`, `_rt*`, `_rqm*`, `_rq*`, `_restore*`, `_run*`, `_rpc` |
| HTML size | 524 KB | over 500 KB warn — no action this pass, monitor |
| Test count (pre) | 938 across 42 files | per latest commit on main |
| Test count (post) | 1047 across 45 files | +109 tests / +3 files added in this pass |
| Past-exam dirs | 7 | 2020 / 2021Dec / 2022Jun / 2023Jun / 2024May / 2024Sep / 2025Jun |
| FSRS hash | git-blob `9f91faaf4f81…` | shared/fsrs.js — see "Sibling drift" below |

### Audit findings

| Severity | Finding | Action |
|---|---|---|
| Info | All 7 verify checks green pre-audit (version sync, brace balance, two innerHTML audits, Harrison Hebrew baseline, vitest, sw-update.js syntax). No active issue. | None — pipeline confirmed healthy. |
| Info | Skill-text Q-count drift: skill says 3326 / 4 exam dirs / 219 functions / 693 tests. Repo is at 3833 Qs / 7 exam dirs / 210 functions / 938 tests. | Recorded — central skill is reference text, not enforced. The geriatrics-dev local skill mirror should reflect real numbers (see "skill update" below). |
| Low | 2 ungated `console.log` lines at `shlav-a-mega.html:1254-1255` (data-load logs). | Pre-existing, intentional load-time diagnostics. No action; recorded. |
| Low | Within-session stem duplicates in past-exam corpus (2 known cases — v10.63.1 baseline): `2025-Jun-Basic` paired vignette, `2023-Jun-Subspec` paper-cited Q×2. | New `pastExamCoverage` test pins ceiling at 10 / max 3 per stem — bumps an alarm if a future ingest doubles the corpus. |
| Info | RLS sanity pass NOT executed this session — Supabase MCP requires interactive OAuth. `progress_state` schema-known-good per CLAUDE.md (lives in `public`, RLS on). | **Open follow-up**: run the 4 RLS queries on `krmlzwwelqvlfslwltol` next time the OAuth flow is alive. Schema has been stable since v10.59 (RPC-mediated reads, public SELECT dropped). |

### Sibling drift watch — `shared/fsrs.js`

The workspace `CLAUDE.md` documents a canonical md5 of `cea66a0435…` (LF-normalized). Local git-blob (SHA1) of the file in this repo: `9f91faaf4f814c5747318f8f6bcf2157b883582d`. The two figures aren't directly comparable; the auto-audit cross-repo monitor (`auto-audit/scripts/probe.py`) is the source of truth on parity. Current pass made NO changes to `shared/fsrs.js`. If sibling FamilyMedicine / InternalMedicine pipelines surface a hash mismatch, propagate from this repo's copy after a human review.

### Fixes this pass

None — no failing audits, no broken state. Pipeline used to **expand testing** at user explicit request.

### New tests added (+109 / +3 files)

| File | Tests | Risk surface |
|---|---|---|
| `tests/fsrsEdgeCases.test.js` | 41 | FSRS-4.5 boundary: lapse/relearn transitions, deadline-warp boundaries (exam-day = 0/1, weak/normal/strong fraction caps), NaN/null defensive paths in fsrsR/fsrsUpdate/fsrsMigrateFromSM2/isChronicFail/fsrsIntervalWithDeadline/fsrsScheduleWithDeadline |
| `tests/hebrewBidiSafety.test.js` | 25 | XSS payloads through `escapeHtml` + `sanitize` (mixed quotes, surrogate pairs, multi-byte coercion); `heDir()` direction picker on real mixed-content lines from the question bank (Hebrew + English drug name + lab values + acronyms — IgG4-RD / MEN1 / CT — that flip naive dir="auto" the wrong way) |
| `tests/pastExamCoverage.test.js` | 41 | Exam directory layout + tag taxonomy + cross-file integrity: required PDFs per dir (exam.pdf, answer_key*), required tagged Qs per dir, forbidden / pre-migration tag absence, schema regex (`YYYY-Mon-(Basic|Subspec|orphan)` or `YYYY-orphan`), no future-year tags, `c` index in range, within-session duplicate ceiling |

All three files use the project's established pattern of extracting source from `shlav-a-mega.html` via regex/line-prefix and evaling in a sandbox — same bytes that ship.

### Deploy

- Commit message: `v10.63.1 — expand testing: FSRS edge cases + Hebrew bidi safety + past-exam coverage (+109 tests)`
- No version bump (no shipping behaviour change — additive test-only commit).
- `git push origin main`. GitHub Pages auto-publishes; no Actions workflow that gates push.

### Topic-coverage gaps (snapshot)

Run from the project root:
```bash
node -e "const q=require('./data/questions.json'); const t=require('./data/topics.json'); const m={}; q.forEach(x=>m[x.ti]=(m[x.ti]||0)+1); for(let i=0;i<t.length;i++)if((m[i]||0)<5)console.log('ti='+i+' keywords='+t[i].slice(0,3).join(',')+' count='+(m[i]||0))"
```
Topics under 5 Qs are weak — flagged for next content pass.

### Next-pass open follow-ups

1. **Run RLS sanity pass** when an authenticated Supabase MCP session is available — the 4 queries from `audit-fix-deploy` skill § "RLS sanity pass". Document table count, policy count, any RLS-on-zero-policy surprises.
2. **Topic-coverage report** — re-run the topic-count snippet above and append weak-topic table here.
3. **Function-count delta watch** — current 210; previous skill-text figure was 219. Net `-9` since last audit-fix-deploy skill update. `_rc*` family removal in v10.62.1 + v10.62.0 explains most of that. No action; record.
4. **HTML size watch** — 524 KB, just past the 500 KB warn. Most of the bulk is the changelog `CHANGELOG = { ... }` literal. Consider extracting to a lazy-loaded `data/changelog.json` next pass if size keeps growing.
5. **`.claude/skills/geriatrics-dev/SKILL.md`** — proposed local skill file with current-state metrics + helper-prefix taxonomy + hard constraints. Could not be created in this pass (write-permission blocked on `.claude/skills/`); recorded for next pass to either land it after the permission gate is lifted, or to use the existing `.claude/skills/shlav-a-mega.md` (also write-blocked) as the carrier.
