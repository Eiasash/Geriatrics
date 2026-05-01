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

---

## 2026-05-01 — v10.63.2 audit pass (Round 2 — deeper dig)

### R1 open items resolution

| R1 item | R2 outcome |
|---|---|
| Skill file `.claude/skills/geriatrics-dev/SKILL.md` | Directory created (`mkdir -p` succeeded), but file `Write` was permission-blocked. Full content drafted inline below — drop into the file once the gate is lifted. |
| RLS sanity pass via Supabase MCP | Still requires interactive OAuth — deferred to R3 cross-repo pass on `krmlzwwelqvlfslwltol` (covers § B / C / D / E in one query batch). |
| 2 ungated `console.log` lines (1254-1255) | **FIXED**. Gated behind `DEBUG_BOOT` flag — true on `localhost` / `127.0.0.1` / `0.0.0.0` / `?debug=1`, false in production. Pure diagnostic; no behaviour change for end-users. New tests pin the gate logic against accidental ungating. |
| HTML 524 KB CHANGELOG extraction | **DEFERRED with proposal**. CHANGELOG block is lines 6559-7013 (≈108 KB literal of `~456` entries). Extracting to `data/CHANGELOG.json` (boot-fetch in About modal) would drop HTML below 500 KB but requires (a) JSON-encoding ~456 entries with embedded backslashes / RTL quotes / emoji safely, (b) async-loading + caching in SW, (c) updating the help-overlay render around line 7211, (d) integrity-guard updates. Estimated effort 45-60 min — over the 30-min quick-win budget. **R3 candidate** with full plan ready. |

### R2 deeper findings

| Surface | Finding | Action |
|---|---|---|
| Topic coverage | All 46 topics have ≥9 Qs. Weakest: ti=45 (Interdisciplinary Care, n=9), ti=43 (Andropause, n=21). **Zero topics under the 5-Q threshold.** | None — content team can target ti=43-45 next, but no audit gap. |
| Past-exam tag taxonomy | All 7 exam dirs (`2020_al`, `2021_dec_al`, `2022_jun_al`, `2023_jun_al`, `2024_may_al`, `2024_sep_al`, `2025_jun_al`) have matching tagged Qs. 1,549 Qs with year tags across 17 distinct tag values (Basic / Subspec / orphan splits). | None. |
| Harrison/Hazzard chapter mapping | `data/question_chapters.json` has **3,833 entries** mapping every Q-index → `{haz: N, grs: N}`. **0 orphaned haz refs** (haz keys all in 1-108) and **0 orphaned har refs**. Hazzard 108 chapters / Harrison 69 chapters available. | None — clean. |
| Function-count trajectory | Current 210. History: ~270 (early v9.x) → 219 (v10.46+ decomposition) → 210 (v10.62.0 dropped renderDrugs + renderCalc shim). The drop is intentional. | Documented here so future auditors don't panic at the delta. |
| Coverage gaps (uncalled functions) | Cross-ref `tests/*.test.js` calls vs 210 named functions in HTML: ~165 not directly invoked from any test. Most are render helpers (`_rc*` / `_rl*` / `_rqm*`) that return HTML strings — single-file PWA prevents direct unit testing. Indirect coverage via integration tests (`migrationWiring`, `trackViewMarkup`, `appLogic`). | No action — known architectural limit. |
| `npm outdated` / `npm audit` | Skipped this pass (devDeps only — `vitest`, `acorn`, `cross-env`, `@vitest/coverage-v8`). Last audit pass cleared all known vulns. | Recheck at R3. |

### `shared/fsrs.js` dual hash record (R2)

| Hash type | Value |
|---|---|
| Git blob (SHA1, what `git hash-object` reports) | `9f91faaf4f814c5747318f8f6bcf2157b883582d` |
| MD5 of LF-normalized content (canonical, per workspace `CLAUDE.md`) | `cea66a0435be626eda9c1bf120d2625c` |

The MD5 figure matches the canonical `cea66a0435…` from the skill — sibling parity intact. **No edit to `shared/fsrs.js` from this repo** (R3 cross-repo will sync if drift surfaces).

### New tests added in R2 (+30 tests / +1 file → 1077 / 46)

| File | Tests | Risk surface |
|---|---|---|
| `tests/calcAndQuizBoundaries.test.js` | 41 | DEBUG_BOOT gate logic + accidental-ungating regression; CrCl Cockcroft-Gault boundary math (sex multiplier 0.85 mutation pin, age=140 floor, weight/Cr extremes, mutation pins on (140-age) numerator and (72×Cr) denominator); CFS 1..9 bucket math + ≥5 frail boundary; MNA-SF score thresholds (0-7 / 8-11 / 12-14 boundaries); escapeHtml hardening (round-trip, surrogate pairs, ZWJ sequences, mixed RTL+LTR injection, control chars, 10K-char stress); sacred localStorage key contract (positive + rogue-rename negatives); FSRS deadline math under DST + leap year (Mar 8 2026 spring-forward, Feb 27 2024 leap, Feb 27 2025 non-leap, year rollover); shared/fsrs.js mutation pins (isChronicFail tot≥4 + acc<0.35 boundary, fsrsD≥8 + tot≥3 high-difficulty path, fsrsR strict monotonicity in stability AND time, fsrsInitNew returns fresh instances, fsrsR(0,s)=1.0 always-1-at-t=0 contract). |

41 added (file plan was +30; useful expansion came naturally). All tests use the established `new Function(extracted_source + 'return {...}')` sandbox pattern.

### Skill file content (drop into `.claude/skills/geriatrics-dev/SKILL.md` once write permission is restored)

```markdown
---
name: geriatrics-dev
description: Reference for working on the Shlav A Mega (Israeli geriatrics board) PWA — version pins, Q-bank shape, function-count bounds, exam directories, helper-prefix conventions, integrity-guard gates, sacred localStorage keys.
---

# geriatrics-dev — Shlav A Mega Working Reference

Last updated: 2026-05-01 (Round 2 audit, v10.63.2).

## Version trinity (must always match)
| File | Field | Current |
|---|---|---|
| shlav-a-mega.html | const APP_VERSION='X.Y.Z' | 10.63.2 |
| sw.js | const CACHE='shlav-a-vX.Y.Z' | shlav-a-v10.63.2 |
| package.json | "version": "X.Y.Z" | 10.63.2 |

## Codebase metrics
- shlav-a-mega.html: 7,322 lines / 524 KB / **210 named functions**
- Questions: **3,833** in data/questions.json (all carry ref + e)
- Topics: 46 (ti 0..45)
- Tests: **1,077** across **46** files
- Brace pairs: 3,386
- Hazzard chapters: 108 / Harrison chapters: 69

## Exam directories (7)
2020_al, 2021_dec_al, 2022_jun_al, 2023_jun_al, 2024_may_al, 2024_sep_al, 2025_jun_al

## Render-helper naming (v9.76 decomposition)
| Orchestrator | Prefix | Count |
|---|---|---|
| renderCalc | _rc* | 13 |
| renderQuiz | _rq* | 2 |
| _rqMain | _rqm* | 5 |
| renderTrack | _rt* | 4 |
| renderLibrary | _rl* | 7 |

## Integrity-guard (npm run verify)
1. node --check src/sw-update.js
2. python3 scripts/check-version-sync.py
3. python3 scripts/check-brace-balance.py
4. python3 scripts/check-innerhtml.py
5. python3 scripts/check-innerhtml-pieces.py
6. cross-env HARRISON_HEBREW_BASELINE=0 node scripts/harrison-hebrew-baseline.cjs --strict
7. vitest run

**GATE 4**: never remove >5 named functions per commit (CI blocks).

## Sacred localStorage keys (NEVER rename)
- samega (state)
- samega_ex (exam state)
- samega_apikey
- shlav_q_images

## Sibling files
- shared/fsrs.js: byte-identical with InternalMedicine + FamilyMedicine.
  Canonical content md5: cea66a0435… (LF). Git SHA1: 9f91faaf….
  Edit in one place, propagate to all three.
- harrison_chapters.json: shared across the three medical PWAs.

## Hard constraints
- No build step. New deps: vendor or CDN with SRI.
- Hebrew RTL: dir="auto" + unicode-bidi: plaintext. Never force dir="rtl".
- Supabase project: krmlzwwelqvlfslwltol (NEVER cross-wire to oaojkanozbfpofbewtfq).
- progress_state lives in public schema.

## Deploy
No build. Push to main → Pages live in ~60s. CHANGELOG entry must be added to the
CHANGELOG object in shlav-a-mega.html (around line 6559) for every version bump.
```

### CHANGELOG-extraction proposal (deferred to R3)

**Goal**: Drop HTML below 500 KB by moving the CHANGELOG literal (lines 6559-7013, ~108 KB) to `data/CHANGELOG.json` and rendering it on demand in the About modal.

**Plan**:
1. Add a Node script `scripts/extract-changelog.cjs` — parses the inline `const CHANGELOG={...}` object, writes `data/CHANGELOG.json` (newest-first array of `{version, entries[]}`).
2. Replace the inline literal with `const CHANGELOG = window.__CHANGELOG_CACHE || {};`
3. Boot-time: lazy fetch via `fetch('data/CHANGELOG.json').then(r => r.json()).then(j => { window.__CHANGELOG_CACHE = j; })` — non-blocking; About modal handler waits for the promise.
4. Add `data/CHANGELOG.json` to `sw.js` `JSON_DATA_URLS` for offline cache.
5. Update help-overlay render (around line 7211) to show "loading…" if cache miss.
6. New `tests/changelogJson.test.js` — schema validation + version-tag uniqueness.

**Risks**:
- Embedded backslashes / RTL quotes / emoji require careful JSON escaping. The existing CHANGELOG already has known stress points (v10.43.1 hotfix proves this — string termination bug).
- Help-overlay currently renders synchronously. Moving to async needs a loading-state placeholder.
- Adds one more network round-trip on About-modal first open (acceptable).

**Estimated effort**: 45-60 min including test coverage. **Skipped this pass** because R2 mandate was the 30-min quick-win budget for HTML-size work.

### Next-pass open follow-ups (R3+)

1. **Run RLS sanity pass on `krmlzwwelqvlfslwltol`** — share with InternalMedicine, FamilyMedicine, Toranot, ward-helper. One auth, four-repo coverage.
2. **CHANGELOG-extraction** — execute the proposal above. Drops HTML below 500 KB.
3. **Sibling fsrs.js sync** — coordinated cross-repo change if drift surfaces.
4. **Skill file land** — `.claude/skills/geriatrics-dev/SKILL.md` content above is ready; needs Write permission to land.
5. **Topic ti=43-45 content expansion** — Andropause / Prevention / Interdisciplinary Care all under 35 Qs; not failing audit, but thinnest of the 46.
6. **Coverage instrumentation** — currently no way to see which named functions are exercised at runtime. Adding a minimal per-fn counter (gated behind DEBUG_BOOT) would convert the 165-untested figure from "may not be tested" to "verifiably exercised in integration".
