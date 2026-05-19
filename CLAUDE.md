# CLAUDE.md — Shlav A Mega: Israeli Geriatrics Board Exam App

## Operating model — single lane (from 2026-05-19)

Development on this repo is done by Claude Code directly — design,
implementation, testing, and shipping all in one session. This **supersedes**
every "two-lane", "web-lane", or "terminal-lane" instruction in older docs and
skills (audit-fix-deploy and the per-repo skills included): there is no second
Claude lane, and no `claude/web-` vs `claude/term-` branch split.

Workflow: branch `claude/<slug>` -> PR -> CI green + Codex review -> Eias
merges -> post-merge `verify-deploy`. Codex is the independent automated
reviewer. Eias is the sole merge authority — no self-merge. All release,
version-trinity, and verification rules in the repo's skill still apply
unchanged.


<!-- working-rules-v1:start -->
## Working Rules (user-mandated, non-negotiable)

These four rules are the floor. They override any conflicting guidance later in this file. If a rule conflicts with what you're about to do, stop and surface it before proceeding.

1. **Don't assume. Don't hide confusion. Surface tradeoffs.**
2. **Minimum code that solves the problem. Nothing speculative.**
3. **Touch only what you must. Clean up only your own mess.**
4. **Define success criteria. Loop until verified.**
<!-- working-rules-v1:end -->

## Project Overview

**Shlav A Mega** is a Progressive Web App (PWA) for Israeli geriatrics board exam preparation (שלב א גריאטריה, P005-2026). It is a single-file, no-build-step application deployed via GitHub Pages.

- **Live URL**: https://eiasash.github.io/Geriatrics/
- **Main file**: `shlav-a-mega.html` (~636 KB, ~7,634 lines, 224 named functions)
- **App version**: v10.64.108 (as of 11/05/26) — 3,743 Qs across 46 topics. All 3,743 Qs carry `ref` (Hazzard / Harrison chapter + title) and pre-generated `e` explanation. Recent: v10.64.102-108 multi-accept reframe campaign — 143 questions with `c_accept` array (multi-correct semantic) reframed via Sonnet REFRAME/KEEP → Opus cold-validate revert 39 → Opus rescue 23/39 → lane-sync +1; v10.64.101 verify chain hardened (node --check on inline scripts, cp1252-safe); v10.64.93 split `e` field into `data/explanations.json` (-43% questions.json — mobile load 79s→24s); v10.64.87-92 a11y + mobile UI polish (skip-link mobile fix, header dark-on-dark, topic groups collapsed by default); v10.64.86 a11y issue #125 final close (4 amber-600 → amber-800 button fixes, white-on-amber 3.19:1 → 7.39:1 AAA) + 6 new integrity ratchet tests (`tests/integrityRatchet.test.js`); v10.64.82–85 a11y dir=rtl + skip-link + theme-aware dm-btn + slate hierarchy + 4 residual contrast clears; v10.64.81 cancer cluster wrong_textbook drain CLOSED (record-not-queue going forward); v10.64.61 search matches across Hebrew + English variants; v10.64.60 bilingual schema + Hebrew↔English toggle for AI-translated Qs (paired Heb/Eng `o[]` arrays — `c` index valid for both); v10.64.59 1,255 AI Qs translated to Hebrew (Sonnet 4.6 batch 2); v10.64.58 pre-emptive defensive guards (FM v1.21.13 chaos-pattern parity); v10.64.57 faceted pill counts (cross-axis filter narrowing); v10.64.56 year + topic INTERSECT (was mutually exclusive); v10.64.55 topic groups (12 clinical categories) + year presets; v10.64.54 622 AI Qs translated to Hebrew (Sonnet 4.6); v10.64.51 multi-select topic filter + dynamic year picker (was hiding 1,284 Qs); v10.64.48–50 cloud-sync API key with user account (cloudBackup _apikey + auth_login_user.api_key restore); v10.64.47 loading-skeleton stale count fix + STALE_COUNTS guard; v10.64.46 Track-I distractor regen — 75 drifted Qs regenerated; v10.64.45 Track-R 1547 Hazzard refs realigned; v10.64.42–44 Track-Q backup_set SECURITY DEFINER RPC + PDF externalization to GitHub Releases (-85% repo size); v10.64.30s–40 Tracks D/H/I/J/K/L/M/N/O/P — distractor regen + detector v3 + 110 curator overrides triangulated.
- **Data**: JSON files in `data/` directory, loaded lazily at runtime
- **Deployment**: Push to `main` → GitHub Actions validates → GitHub Pages live in ~60s

---

## Leaderboard RPC (v10.64.65)

`shlav_leaderboard_upsert(p_uid,p_answered,p_correct,p_streak,p_readiness,p_ts)` — SECURITY DEFINER RPC at `/rest/v1/rpc/shlav_leaderboard_upsert`. Replaces the prior direct `/rest/v1/shlav_leaderboard` POST. The 4 historical rows still exist in `public.shlav_leaderboard` (the schema-split migration `20260421120000_split_app_schema.sql` was apparently never applied to leaderboards — they remain in `public`). Migration: `supabase/migrations/20260508000000_leaderboard_upsert.sql`. RPC bypasses RLS via SECURITY DEFINER, future-proof against the sb_publishable_* key class. `accuracy` is GENERATED ALWAYS in the table — RPC must NOT assign it. Sibling-aligned with mishpacha/pnimit RPCs.

## Chaos bot infrastructure (2026-05-12)

Two bots coexist:

- **`scripts/chaos-live-bot.mjs`** (319 LOC) — lighter overnight smoke-runner against the live PWA. Production choice when you just want exercise + bug-surface, no judge contract.
- **`scripts/chaos-doctor-bot-v4.mjs`** (~810 LOC) — Geri-native v4 judge bot. Selectors confirmed against the monolith (`button.qo`, `button.qo.ok`, `[aria-label="Check answer"]`, `[aria-label="Next question"]`, `.heb`, `.explain-box`); enters via the default practice surface so `data-state="correct"` is on the actual answer key, not the user's pick (the failure mode that produced 100% appIdx=null in v3). JSONL ledger writes to `chaos-reports/v4/medical_findings_ai_v4.jsonl`. Helper libs at `scripts/lib/extractJson.mjs` + `scripts/lib/optionResolver.mjs`. Test suite: `tests/chaosBotV4ExtractJson.test.js`, `tests/chaosBotV4OptionResolver.test.js`, `tests/chaosBotV4Persona.test.js`, `tests/chaosBotV4ProxyMode.test.js`, `tests/chaosBotV4ModalDismiss.test.js` — 25 tests across the v4 pins.

**Running:** `CHAOS_USE_PROXY=1 CHAOS_USERS=N CHAOS_DURATION_MS=ms CHAOS_MODEL=claude-sonnet-4-6 CHAOS_REPORT_DIR=path node scripts/chaos-doctor-bot-v4.mjs`. Default direct-Anthropic mode requires `CLAUDE_API_KEY`; proxy mode (v10.64.114+) routes through `https://toranot.netlify.app/api/claude` using `TORANOT_API_SECRET` env (defaults to the documented `shlav-a-mega-1f97f311d307-2026` value). Proxy is the practical choice from CI / sandboxes / anywhere a personal Anthropic key isn't available.

**v10.64.113 prompt re-skin:** the v4 bot was originally adapted from the FM sibling and the three `SYS_DOCTOR_*` prompts plus the citation regex were left FM-framed (`family-medicine physician`, `family-medicine attending`, citation examples `Goroll פרק 19 / Nelson 22e`, regex `(Goroll|Harrison|Nelson|Lerner|הר['"]י|AFP)`). Two consequences: (1) the FM persona was deferring on geri-board calls a geriatrician would catch; (2) the citation regex did NOT match `Hazzard`, so source-check fired zero times on Geri data — silent feature outage. Fixed in v10.64.113: persona → board-certified geriatrician + geri-medicine attending; citation examples → `Hazzard's Ch 43 / Harrison 22e Ch 437 / GRS8 פרק 19 / Brookdale 2024`; regex → `(Hazzard|Harrison|GRS\s*8?|Brookdale|הזרד|הריסון)`.

**v10.64.114 operability + modal-dismiss fix:** the v113 smoke against the live site reproduced a 100% `appIdx-null` rate on the first question. Diagnosis: `showHelp()` (line 8196, autoshow at line 1431) puts a `#help-overlay` div at z-index:9999 over the quiz card. Every `button.qo` click times out with "intercepts pointer events" — same class as the v10.64.0 browser-chaos-tester incident that originally added Escape-key dismissal. Fix: `ensureOnPracticeQuiz` dismisses `#help-overlay` + the 9 v10.64.49 deferred-help-guard modal IDs BEFORE the optsCount/checkVisible check, via `closeTopModal()` with DOM-removal fallback. Empirical re-smoke after the fix: 0% methodology rate, and the first source-check verdict ever recorded in a Geri chaos run (citation="Hazzard Ch 34", plausible=true conf=85). Same release added the `CHAOS_USE_PROXY=1` toggle described above.

---

## Authority Sources (do not invert)

These five fields/files are load-bearing truths. The arrows mark dependency direction
— never auto-flip the right side to match the left, even if they appear to disagree.

| Source | Authority | Anti-pattern |
|---|---|---|
| `q.c` (correct-answer index) | IMA published key + 110 curator overrides | Auto-correct from a textbook search-hit |
| `q.ref` (free-form text) | Free-form, may be vague | Rebuild toward `question_chapters.json`, not vice versa[*](#qref-rebuild-caveat-2026-05-13) |
| `data/question_chapters.json` (`.haz` / `.har`) | Audited truth, schema-guarded | Hand-edit in flight; only the audit pipeline writes this |
| `data/distractors.json` `DIS[k]` empty slot | Must equal `Q[k].c` (3-layer guard: UI render + `tests/distractorsDrift.test.js` + auto-audit probe) | Auto-pad an empty slot at index ≠ c |
| `data/notes.json` `notes[i].ch` | Hazzard 8e or Harrison 22e (legal ids 29-35 may cite Israeli law); NO legacy GRS, GRS8 fine | Cite a paper, blog, or legacy GRS edition |

### `q.ref` rebuild caveat (2026-05-13)

The "rebuild toward `question_chapters.json`" arrow in the authority-sources
table is correct as a direction but NOT safe as a one-way bulk overwrite.
`question_chapters.json` is produced by `scripts/tag_chapters.cjs` — a
rule-based topic-keyword-and-default mapping. It is reliable as a floor
(every question gets a default chapter from its `ti`), but it does NOT
carry per-Q curatorial specificity. A hand-curated `q.ref` like
`Hazzard Ch 91 — LUNG CANCER` is legitimately more specific than the
topic-default `Hazzard Ch 88 — CANCER AND AGING: GENERAL PRINCIPLES`
even though `question_chapters.json` would map a `ti=26` Q to Ch 88.

Two rules for `q.ref` edits in light of this:

1. **Rebuild only where current ref is verifiably worse.** Verifiable
   from the question content itself (e.g., a Harrison STEMI ref on a
   hematologic-malignancy Q — the Q content is the witness that the
   STEMI chapter cannot be right, regardless of source-PDF access).
2. **ADD-not-OVERWRITE for cases where current ref has curatorial
   specificity beyond the topic-default.** If `question_chapters.json`
   says one chapter and current `q.ref` cites a more specific chapter
   in the same book, the current ref wins. The audit mapping is the
   floor, not the ceiling.

Motivating finding: 2026-05-13 chaos-doctor v4 long-run produced 14
cite-implausible flags. Per-stem triage found 1 was an unambiguous fix
(STEMI on a heme-malig Q), 0 were ref-currency drift fixable via
overwrite from `question_chapters.json`, and the remaining 13 were a
mix of false positives, regen-would-regress-specificity, and Israeli-law
refs the bot's regex couldn't match. See
`.audit_logs/followup_chaos_audit_prompt_redesigns.md` for the audit-2
prompt redesign that addresses the root cause at the bot layer.

### 110 Curator Overrides — DO NOT AUTO-FIX

Tracks J/L/N/O/P triangulated 110 questions where IMA's published answer key is
medically wrong but our dataset (`q.c`) is right. Evidence is filed at
`.audit_logs/review/{tag}.md`. In spot-checks, ~70% of IMA-vs-textbook conflicts
favor the textbook — IMA's key is not infallible.

`tests/curatorOverridesRatchet.test.js` (7 tests) pins the registry. Never
suggest "fixing" a c-disagreement before checking the registry; if a question
is in there, the disagreement is **intentional** and an auto-flip would
re-introduce the bug.

### Content edits (mandatory rule)

Any change to `o[]`, `c`, or `e` MUST quote the source PDF (Hazzard 8e / Harrison
22e / GRS8) verbatim in chat or commit message. Never paraphrase. The v9.81 idx
510 incident — fabricated option, required v9.82 hotfix — is the cautionary tale.

---

## Architecture

### Single-File PWA

All application logic lives in `shlav-a-mega.html` (~7,634 lines, 224 named functions) — no bundler, no framework, no build step. The file contains:
- All CSS (1,000+ lines, responsive, RTL-aware, dark/light/study modes)
- All JavaScript (ES6+, vanilla)
- HTML structure

Data is loaded at runtime from `data/*.json` files. The service worker (`sw.js`) caches all assets for offline use.

### Storage Layers

| Layer | Keys / Table | Purpose |
|-------|-------------|---------|
| `localStorage` | `samega`, `samega_ex`, `samega_apikey`, `shlav_q_images` | User preferences, exam state, API key, user-attached question images |
| `IndexedDB` | (internal) | Study progress, spaced repetition state |
| Supabase PostgreSQL | `progress_state` (RLS) | Optional cloud sync across devices |

**Important**: localStorage keys `samega`, `samega_ex`, `samega_apikey`, `shlav_q_images` must not be renamed — they are stored in users' browsers.

`samega_apikey` is cloud-synced (v10.64.48-50): the value is round-tripped via
`cloudBackup._apikey` and restored from `auth_login_user.api_key` on login.
Pinned by `tests/apiKeyLoginRestore.test.js` (11 tests). Don't add a fifth key
without a sync-path plan.

---


### Render Function Decomposition (v9.76)

The four large render functions have been decomposed into 31 prefixed helper functions.
Each helper returns an HTML string; the orchestrator concatenates them. No behavior change,
no event handler migration — purely a readability refactor.

| Orchestrator | Prefix | Count | Helpers |
|---|---|---|---|
| `renderCalc` | `_rc*` | 13 | CrCl, Chads, Curb, Gds, Braden, Padua, Katz, Lawton, 4at, Mna, Cfs, Norton, Morse |
| `renderQuiz` | `_rq*` | 2 | SuddenDeath, Main |
| `_rqMain` | `_rqm*` | 5 | Question, Controls, TeachBack, Explain, Footer |
| `renderTrack` | `_rt*` | 4 | Top, Mid, Progress, Footer |
| `renderLibrary` | `_rl*` | 7 | Header, Hazzard, Harrison, Laws, Articles, Exams, Footer |

**Naming convention:** `_` prefix = private helper. Second+third letters = parent function
(`rc` = renderCalc, `rq` = renderQuiz, `rt` = renderTrack, `rl` = renderLibrary, `rqm` = _rqMain).

**Rules:** Never remove >5 functions per commit (integrity-guard GATE 4 blocks it).
Always run `node --check` on extracted JS before pushing. See `docs/MIGRATION.md` for
the full decomposition ledger and safe-next-steps list.


## File Map

```
/
├── shlav-a-mega.html        # Main app (THE file — all HTML/CSS/JS, v10.64.108)
├── index.html               # GitHub Pages redirect → shlav-a-mega.html
├── sw.js                    # Service worker (offline caching + background sync)
├── manifest.json            # PWA manifest
│
├── data/                    # Lazy-loaded JSON data — single source of truth
│   ├── questions.json       # 3,743 MCQs (primary runtime source, all carry `ref` + `e`)
│   ├── notes.json           # 46 study topic notes
│   ├── drugs.json           # 113 Beers/ACB drugs database
│   ├── flashcards.json      # 159 high-yield flashcards
│   ├── tabs.json            # Tab definitions for app navigation
│   ├── topics.json          # 46 topic keyword mappings for auto-tagging
│   ├── distractors.json     # Distractor autopsy data (~6.7 MB, per-Q wrong-answer analysis)
│   ├── question_chapters.json  # Per-Q chapter assignments
│   ├── hazzard_chapters.json   # Hazzard's 8e textbook content (108 chapters, structured)
│   ├── grs8_chapters.json      # GRS8 chapter index
│   ├── grs8_question_pages.json # GRS8 Q-to-PDF-page anchors
│   ├── regulatory.json      # Regulatory tag definitions
│   └── syllabus_data.json   # P005-2026 syllabus structure
│
├── questions/               # Question images for exams with figures
│   ├── image_map.json       # Maps question IDs to image files
│   └── images/              # PNG images referenced by exam questions
│
├── scripts/
│   ├── generate_explanations.cjs   # Bulk explanation generator (Claude API)
│   └── parse_2025_exam.cjs         # PDF → JSON question parser
│
├── skill/
│   ├── SKILL.md             # Geriatrics knowledge skill package for Claude Projects
│   └── references/
│       ├── exam-patterns.md # Repeating question stems and frequencies
│       └── legal-ethics.md  # Israeli law summaries
│
├── laws/                    # Israeli legal/regulatory documents
│   ├── P005-2026-syllabus.pdf
│   ├── dying_patient_law.html
│   ├── driving_report_form.docx
│   └── ...                  # MOH/MoJ PDFs and legal references
│
├── .claude/
│   ├── launch.json          # Dev server: python -m http.server 3737
│   ├── agents/              # Agent workflow prompts (note-updater, question-explainer)
│   ├── commands/            # Slash command definitions (see Skills section)
│   └── skills/              # Skill files (shlav-a-mega.md, supabase)
│
├── .github/
│   └── workflows/ci.yml     # Validation CI — JSON schema, duplicates, version sync, etc.
│
├── tests/                          # 61 vitest files, 1,270 tests + 7 skipped (see Testing section)
│
├── supabase-setup.sql        # Supabase RLS schema
├── .mcp.json                 # MCP server config (Supabase)
│
├── harrison/                 # Harrison's 22e chapter PDFs (~48 chapters)
├── hazzard_marked/           # Hazzard's 8e annotated/marked chapter PDFs
├── article_*.pdf             # 6 mandatory clinical reference articles
└── hazzard_part*.pdf         # Hazzard's Geriatric Medicine 8e (original PDFs)
```

### Data Architecture (v9.76)

All runtime data lives in `data/`. The app and service worker load exclusively from `data/*.json`. Build scripts (`scripts/`) also read/write `data/questions.json` directly. There are no root-level JSON duplicates — `data/` is the single source of truth.

---

## Data Schemas

### questions.json
```json
{
  "q": "Question text (Hebrew or English)",
  "o": ["Option A", "Option B", "Option C", "Option D"],
  "c": 0,       // correct answer index (0–3, integer)
  "t": "2022",  // exam year string
  "ti": 18,     // primary topic index (0–45, see TOPICS below)
  "tis": [18, 19],  // multi-tag topic indices (v10.41+)
  "e": "...",   // pre-generated AI explanation (populated on all 3,743 Qs)
  "ref": "..."  // Hazzard / Harrison chapter + title citation
}
```

#### Bilingual schema (v10.64.59-61)

1,867 of 3,743 Qs (as of v10.64.108) are AI-generated from English
textbooks (Hazzard 1852, Harrison 294, GRS8 90 baseline; the count grew
as more translations shipped). They carry paired Hebrew↔English variants:

```json
{
  "q": "...",          // primary Hebrew text (after translation)
  "o": ["...", ...],   // primary Hebrew options
  "q_en": "...",       // paired English variant (v10.64.60+)
  "o_en": ["...", ...],// paired English options — SAME ORDER AS o[]
  "c": 0,              // single correct index, valid for BOTH o[] and o_en[]
  "c_accept": [0, 2]   // OPTIONAL — additional accepted indices for
                       // multi-accept questions (48 Qs). When present,
                       // ANY index in c_accept is correct alongside c.
                       // Output of v10.64.102-108 reframe campaign.
                       // Don't collapse to single c.
  // also: q.broken=true + q.broken_reason="..." flags 22 questions as
  // intentionally suppressed. Don't auto-clear; resolve underlying issue.
}
```

**Edit rules:**
- Both `o[]` and `o_en[]` must preserve order — `c` is one index for both
- Search matches across both variants (v10.64.61)
- Never reorder one without the other; never translate on the fly
- Use `scripts/translate_questions_to_hebrew.cjs` to add/regenerate Hebrew
  variants — preserves `c`, keeps drug names + lab abbreviations + scoring
  tools in English per Israeli clinical convention, supports
  `--dry-run/--tag/--limit/--mode (in-place|bilingual)/--delay` flags,
  auto-backups `questions.json`, periodic checkpointing every 25 translations
- Cost ≈ $20 Sonnet / $60 Opus for full Hazzard batch (Sonnet quality is fine
  — edit `MODEL` constant to switch)
- Run: `ANTHROPIC_API_KEY=sk-ant-... node scripts/translate_questions_to_hebrew.cjs --tag Hazzard --limit 9999 --mode in-place`

`tests/bilingualToggle.test.js` (25 tests) and `tests/renderSiteAudit.test.js`
(6 tests) enforce these invariants.

### notes.json
```json
{
  "id": 0,
  "topic": "Biology of Aging",
  "ch": "Hazzard's Ch 3 (Biology of Aging)",  // MUST cite Hazzard's 8e or Harrison's 22e chapter — NO GRS. EXCEPTION: legal topics (ids 29-35: Ethics, Elder Abuse, Driving, Guardianship, Patient Rights, Advance Directives, Community/LTC) may cite Israeli law sources (e.g. חוק זכויות החולה 1996, חוק החולה הנוטה למות 2005). See tests/dataIntegrity.test.js:124 for the exemption rule.
  "notes": "Dense board-pearl text with key facts, numbers, mechanisms, exam traps"
}
```

### drugs.json
```json
{
  "name": "Oxybutynin",
  "heb": "דיטרופן",
  "acb": 3,          // Anticholinergic Cognitive Burden score (1–3)
  "beers": true,     // Beers Criteria 2023 flag
  "cat": "Anticholinergic/Bladder",
  "risk": "Cognitive decline, delirium, falls..."
}
```

### flashcards.json
```json
{
  "f": "Front (question/prompt)",
  "b": "Back (answer)"
}
```

**Note:** `data/osce.json` no longer exists — OSCE content was removed; only stale references remain in older test inventories.

---

## Topic Index (ti field — 0 to 45)

```
0=Biology of Aging   1=Demography        2=CGA                3=Frailty
4=Falls              5=Delirium          6=Dementia           7=Depression
8=Polypharmacy       9=Nutrition         10=Pressure Injuries 11=Incontinence
12=Constipation      13=Sleep            14=Pain              15=Osteoporosis
16=OA                17=CV Disease       18=Heart Failure     19=HTN
20=Stroke            21=COPD             22=Diabetes          23=Thyroid
24=CKD               25=Anemia           26=Cancer            27=Infections
28=Palliative        29=Ethics           30=Elder Abuse       31=Driving
32=Guardianship      33=Patient Rights   34=Advance Directives 35=Community/LTC
36=Rehab             37=Vision/Hearing   38=Periop            39=Geri EM
40=Parkinson's       41=Arrhythmia       42=Dysphagia         43=Andropause
44=Prevention        45=Interdisciplinary Care
```

`tis[]` (v10.41+) is a multi-tag array — questions can belong to multiple topics for the per-topic study hub.

---

## Development Workflow

### Local Dev Server
```bash
python -m http.server 3737
# Then open http://localhost:3737/shlav-a-mega.html
```
No build step needed. Edit and refresh.

### Making Changes
1. Edit `shlav-a-mega.html` for app logic, UI, or features
2. Edit JSON files in `data/` for content changes (update root copies too if needed)
3. Run local server to test
4. Commit and push to `main` — CI validates, Pages deploys

### Service Worker Versioning
- `APP_VERSION` in `shlav-a-mega.html` must match the cache version in `sw.js` and `package.json` `version`
- Currently all three at `10.64.108` (sw.js cache key: `shlav-a-v10.64.108`)
- Update all three when making changes to ensure users get cache-busted (see workspace CLAUDE.md "version-trinity invariant")
- The trinity guard lives in two places: strict pairwise alignment in `tests/appIntegrity.test.js`, and a version-agnostic re-derivation from `package.json` in `tests/visualOverhaul2026.test.js` (refactored v10.60 — used to hard-code the literal version string and went stale every release)

### Release Invariants (run before declaring "shipped")
1. **Local trinity** — `python3 scripts/check-version-sync.py` (HTML APP_VERSION + sw.js CACHE + package.json all aligned). Already part of `npm run verify`.
2. **Tests + guards** — `npm run verify` (vitest + innerHTML safety + brace balance + Harrison hebrew baseline).
3. **Live witness** — after `git push` lands and Pages rebuilds (~60–90s), `bash scripts/verify-deploy.sh` curls the live URL and asserts the new version actually appears in deployed `shlav-a-mega.html` and `sw.js`. **Don't claim "deployed" until this passes** — local trinity match ≠ live deploy match (Pages can silently fail to publish, or CDN can serve stale).
4. **Question content edits** — any change to `data/questions.json` `o[]` text, `c` index, or `e` explanation must quote the source PDF (Hazzard 8e / Harrison 22e / GRS8) in the chat or commit message before the edit lands. Never paraphrase or fabricate option text — the v9.81 idx 510 incident was caught only by manual sanity check and required a v9.82 hotfix.

### Testing
```bash
npm test             # Run all tests (vitest, 1,270 tests across 61 files + 7 skipped)
npm run verify       # Pre-push gate (see below) — runs 7 checks in series
```

**1,270 tests across 61 files (~21 tests per file avg)** — run `npm test` to see current count.

#### Pre-push gate: `npm run verify`

Runs 7 checks in series. Failure of any blocks the deploy:

1. `node --check src/sw-update.js` — JS syntax check on the SW bridge module
2. `python3 scripts/check-version-sync.py` — trinity (HTML APP_VERSION + sw.js CACHE + package.json `version` all match)
3. `python3 scripts/check-brace-balance.py` — `{}` matching in shlav-a-mega.html (catches accidental block truncation)
4. `python3 scripts/check-innerhtml.py` — unsanitized innerHTML audit
5. `python3 scripts/check-innerhtml-pieces.py` — fragment-level innerHTML audit (catches concatenation patterns)
6. `cross-env HARRISON_HEBREW_BASELINE=0 node scripts/harrison-hebrew-baseline.cjs --strict` — Harrison Hebrew baseline ratchet (chapter-coverage regression guard)
7. `vitest run` — full test suite (1,270 tests, ~19s)

Run before every push. Step 7 dominates runtime. **Always run `npm run verify`,
not just `npm test`** — the 6 non-vitest checks catch deploy-time bugs that the
test suite alone misses.

**Auto-expand rule:** Every feature, improvement, or bug fix MUST include new or updated tests:
- New data file or field → schema validation test
- Bug fix → regression test that reproduces the bug before the fix
- New app feature → integrity test for the feature's HTML/JS structure
- Modified data processing → edge case + boundary tests
- After adding tests, update the test count in this section

**Test file inventory (61 files, 1,270 tests + 7 skipped — 2026-05-10 added `integrityRatchet.test.js` +6 tests + a11y v10.64.86 sub-suite +4 tests):**

| File | Tests | Description |
|------|-------|-------------|
| `tests/dataIntegrity.test.js` | 21 | Question schema/duplicates/topic coverage, notes, drugs, flashcards, topics, cross-file referential integrity |
| `tests/expandedDataIntegrity.test.js` | 59 | Deeper validation: answer integrity, option bounds, whitespace, year field, topic distribution, drugs ACB/Beers cross-checks, flashcard length, tabs schema, image map integrity |
| `tests/appIntegrity.test.js` | 17 | HTML structure (RTL, viewport, PWA), SW version sync, package.json version alignment, security checks (eval, innerHTML), manifest validation |
| `tests/serviceWorker.test.js` | 34 | SW cache configuration, URL lists, version sync, fetch strategy routing, file existence checks |
| `tests/appLogic.test.js` | 97 | Quiz engine, FSRS spaced repetition, sanitization, AI integration, study plan logic |
| `tests/appLogicExpanded.test.js` | 67 | Extended quiz/logic scenarios, edge cases, FSRS boundary conditions |
| `tests/migrationWiring.test.js` | 22 | Data migration checks, field wiring, schema evolution guards |
| `tests/regressionGuards.test.js` | 34 | Regression tests for previously-fixed bugs |
| `tests/polypharmacyRules.test.js` | 48 | Polypharmacy rules engine, drug interaction checks |
| `tests/auditPhases.test.js` | 39 | Audit phase logic, CI validation rules |
| `tests/chapterLinking.test.js` | 15 | Hazzard/Harrison chapter cross-references and linking |
| `tests/regulatoryTags.test.js` | 11 | Regulatory/legal tag validation |
| `tests/syncIndicator.test.js` | 19 | Supabase sync indicator and status logic |
| `tests/contentQuality.test.js` | 7 | Content quality checks (Hebrew, length, format) |
| `tests/sharedFsrs.test.js` | 31 | Shared FSRS-4.5 spaced repetition engine |
| `tests/flashcardFsrs.test.js` | 7 | Flashcard FSRS scheduling |
| `tests/tagMigration.test.js` | 11 | Question tag migration and backward compatibility |
| `tests/timeSignals.test.js` | 16 | Time-based signals, streak and schedule logic |
| `tests/coverageGaps.test.js` | 33 | Coverage gap detection for undertested areas |
| `tests/aiAutopsyXss.test.js` | 12 | AI autopsy XSS sanitization checks |
| `tests/topicRefCoverage.test.js` | 5 | Topic reference coverage across question bank |
| `tests/topicSrcScope.test.js` | 21 | Topic source-scope validation |
| `tests/tisSchema.test.js` | 8 | `tis[]` multi-tag schema (v10.41+) |
| `tests/topicHub.test.js` | 6 | Per-topic study hub routing (v10.43+) |
| `tests/topicIntentRouting.test.js` | 13 | Chat topic-intent routing |
| `tests/textbookChapters.test.js` | 16 | Hazzard/Harrison chapter JSON schemas |
| `tests/grs8ChapterCoverage.test.js` | 6 | GRS8 chapter coverage |
| `tests/grs8QuestionMapping.test.js` | 4 | GRS8 question→page mapping |
| `tests/grs8RowBindingFormat.test.js` | 5 | GRS8 reading-view row format |
| `tests/distractorsDrift.test.js` | 7 | Distractor autopsy drift detection |
| `tests/debugConsole.test.js` | 7 | In-app debug console (v10.38+) |
| `tests/debugConsoleFetchWrap.test.js` | 4 | Debug console fetch instrumentation |
| `tests/onclickClosureLeakGuard.test.js` | 4 | Onclick closure-leak guard (v10.38.4 fix) |
| `tests/parserBleedGuard.test.js` | 4 | Parser-bleed guard for question imports |
| `tests/jsonExtractRegex.test.js` | 3 | JSON extraction regex for AI outputs |
| `tests/storage.test.js` | 8 | localStorage/IndexedDB persistence |
| `tests/studyPlanAlgorithm.test.js` | 17 | Study Plan generator algorithm (v10.46+) |
| `tests/fsrsDeadline.test.js` | 18 | FSRS deadline logic |
| `tests/trackViewMarkup.test.js` | 51 | Track tab class taxonomy + zero-inline-style guard on outer shells (v10.60+, mirrors FM Quiz markup test) |
| `tests/visualOverhaul2026.test.js` | varies | Editorial-overhaul markup pins + version-trinity guard (auto-derived from package.json) |
| `tests/multiSelectFilters.test.js` | 41 | Multi-axis filter system (v10.64.51-57): TOPIC_GROUPS, year presets, INTERSECT semantics, faceted pill counts, toggleTopicGroup symmetry |
| `tests/apiKeyLoginRestore.test.js` | 11 | API key cloud sync (v10.64.48-50): cloudBackup _apikey payload, applyRestorePayload typeof guard, _doLogin reads r.api_key after setAuthSession, samega_apikey localStorage parity |
| `tests/postLoginRestore.test.js` | 19 | v10.63.0 auto-restore-on-login feature: suppress-key namespace, fresh-state heuristic, prototype-pollution guards, IIFE wiring |
| `tests/bilingualToggle.test.js` | 25 | v10.64.60 bilingual schema — paired Heb/Eng `o[]` arrays, `c` index validity across both variants, Heb↔Eng UI toggle |
| `tests/renderSiteAudit.test.js` | 6 | v10.64.60 render-site audit ratchet — pin DOM call sites that read bilingual fields |
| `tests/changelogDrift.test.js` | 3 | CHANGELOG drift regression guard (post v10.64.47-57 backfill) — entries match version trinity |
| `tests/authUnmountRaceGuard.test.js` | 2 | setAuthSession unmount-race contract (#164) — guards against post-unmount state writes |
| `tests/preemptiveDefensive.test.js` | 7 | v10.64.58 pre-emptive defensive guards — FM v1.21.13 chaos-pattern parity |
| `tests/curatorOverridesRatchet.test.js` | 7 | 110-curator-override ratchet — pins Track J/L/O fresh overrides (#159), prevents accidental c-flips |
| `tests/calcAndQuizBoundaries.test.js` | 41 | v10.63.2 boundary tests — calculator domains + quiz edge cases |
| `tests/fsrsEdgeCases.test.js` | 43 | v10.63.1 FSRS edge cases — leech, lapse cascades, retention-rate boundaries |
| `tests/hebrewBidiSafety.test.js` | 25 | v10.63.1 Hebrew RTL bidi safety — U+200F LRM, mixed Hebrew/English in option text |
| `tests/pastExamCoverage.test.js` | 14 | v10.63.1 past-exam coverage — every IMA session 2021-Dec→2025-Jun present in dataset |
| `tests/remapExplanationLetters.test.js` | 10 | v10.64.22 — `remapExplanationLetters` fix for bare label refs ("א' שגויה") (#144) |
| `tests/honestStats.test.js` | 17 | honestStats CI guard (sibling-synced with Pnimit + FM) — accuracy denominator must include skips correctly |

**Test coverage by area:**

| Area | Coverage | Notes |
|------|----------|-------|
| Question data schema | Strong (24+ tests) | Schema, duplicates, topic coverage, bounds |
| Answer integrity | Strong (48+ tests) | Options count, index bounds, whitespace, year tags |
| Notes/drugs/flashcards | Good (15+ tests) | Schema, GRS exclusion, ACB distribution |
| OSCE stations | Moderate (5+ tests) | Schema, null detection |
| Cross-file referential integrity | Good (2+ tests) | Topic indices match topics array |
| HTML structure | Good (6+ tests) | RTL, viewport, PWA manifest |
| Service worker | Good (20+ tests) | Cache config, URL lists, version sync |
| Security | Moderate (3+ tests) | eval, innerHTML, sanitization audit |
| Image map | Moderate (2+ tests) | References valid image files |

**Gaps — components not tested:**
- App runtime behavior (quiz engine, spaced repetition, UI interactions) — monolith prevents unit testing
- localStorage/IndexedDB persistence — runtime-only
- AI explanation generation — requires API key
- Supabase cloud sync — requires credentials

---

## CI Pipeline (GitHub Actions)

Runs on push to `main` and all PRs. Python-based data validation + Vitest test suite.

| Check | Threshold |
|-------|-----------|
| JSON parse validity | questions, notes, drugs, flashcards |
| Question count | Must be > 1400 |
| Question schema | `q` (string), `o` (array >= 2), `c` (valid index), `ti` (int >= 0) |
| Notes schema | `topic` and `notes` fields present; **NO GRS references** |
| Drugs schema | `name`, `heb`, `acb`, `beers`, `cat`, `risk` fields present |
| Flashcards schema | `f` and `b` fields present |
| Duplicate detection | First 80 chars of question text (conflicting answers flagged) |
| HTML syntax | Python HTMLParser |
| JS brace balance | Matching braces in shlav-a-mega.html |
| Service worker version sync | APP_VERSION matches sw.js CACHE version |
| innerHTML sanitization | Audit for unsanitized innerHTML usage |
| Topic coverage | >= 5 questions per topic across the 46 buckets (some newer ti=43–45 may be exempted) |

**Vitest tests** (~905 tests, 40 files) validate data schemas, app structure, and service worker integrity. Run `npm test` before pushing.

---

## Skills / Slash Commands

### Claude Code Slash Commands (`.claude/commands/`)

| Command | Description |
|---------|-------------|
| `/audit` | Full audit of shlav-a-mega.html — bugs, wrong answers, UX issues |
| `/audit-fix-deploy` | Full audit → fix → push cycle |
| `/add-questions` | Add new questions to questions.json with validation and topic tagging |
| `/update-notes` | Update notes.json from Hazzard's/Harrison's/articles |
| `/explain-batch` | Pre-generate AI explanations via Claude API |

### Claude Code Agents (`.claude/agents/`)

| Agent | Purpose |
|-------|---------|
| `note-updater` | Workflow for updating study notes from textbooks |
| `question-explainer` | Workflow for generating AI explanations for questions |

---

## AI Explanations (scripts/generate_explanations.cjs)

Bulk-generates explanations for questions using the Anthropic API.

```bash
# Dry run (no API calls)
node scripts/generate_explanations.cjs --dry-run --limit 10

# Generate for a specific topic
node scripts/generate_explanations.cjs --topic 6 --delay 500

# Full batch
node scripts/generate_explanations.cjs
```

- API key: `ANTHROPIC_API_KEY` env var, or `config.json` (gitignored)
- Model: `claude-opus-4-6`
- Output written into `questions.json` (`e` field) and `explanations_cache.json`

**Never commit `config.json`** — it is gitignored and contains the API key.

---

## Supabase Cloud Sync

Optional cloud sync via Supabase. The schema is in `supabase-setup.sql`.

- Table: `progress_state` with RLS (row-level security per `user_id`)
- MCP configured in `.mcp.json` for Claude Code integration
- The `x-user-id` header must be sent on all Supabase requests for RLS to function
- Background sync via service worker (tag: `supabase-backup`)

---

## Key Conventions

### Content Integrity
- **NO GRS-1/legacy GRS references** — but GRS8 imports are explicitly allowed (see v10.25/v10.37 imports; CI exempts ti=43–45 buckets)
- `notes.ch` must cite actual Hazzard's 8e chapter or Harrison's 22e chapter (legal-topic notes ids 29-35 may cite Israeli law sources instead)
- Hazzard's chapters **excluded** from syllabus: Ch 2–6, 34, 62
- Question `ti` must be an integer 0–45 from the topic list above
- `c` (correct answer index) must be 0-based and valid (< length of `o` array)

### Code Style
- Vanilla JavaScript ES6+ — no transpilation, no framework
- Functional style with module-like structure
- Global state object `S` (localStorage-backed via `samega` key)
- Global question array `QZ` (loaded at runtime from JSON)
- CamelCase for functions, UPPERCASE for constants
- CSS custom properties: `--sky`, `--em`, `--sl8`, `--red`, `--amb`

### Localization
- App supports Hebrew (RTL) and English
- Hebrew text uses `dir="rtl"` and `unicode-bidi: plaintext` CSS
- Fonts: Inter (English), Heebo (Hebrew) via Google Fonts
- Do not break RTL layout when adding new UI elements

### Accessibility / Mobile
- Touch targets must be >= 44px
- Dark mode, study mode, and light mode must all be tested for new UI
- Haptic feedback (`navigator.vibrate`) is used on mobile — do not remove
- Mobile-first responsive design (max-width: 640px container)

### Keyboard Shortcuts
- `1–4`: select answer options
- `Enter`: check answer
- `B`: bookmark question
- `?`: help overlay
- Do not reuse these keys for new features

---

## Adding New Questions — Checklist

1. Read `data/questions.json` to understand existing format
2. Check topic index from the TOPICS list above — pick the most specific `ti`
3. Validate: 4 options is standard for IMA exam Qs (`c` index in 0–3); GRS8 imports may have 5 options (`c` index in 0–4). The hard rule is `0 ≤ c < q.o.length` — `expandedDataIntegrity.test.js` enforces this.
4. Fuzzy-check for near-duplicates (first 80 chars)
5. Append to the JSON array (do not sort or reorder existing entries)
6. Run `npm test` to validate schema and detect duplicates
7. Update question count in `README.md`

---

## Modifying the Main App (shlav-a-mega.html)

- The file is intentionally a single monolith — do not split it
- CSS is at the top, JS is at the bottom before `</body>`
- TOPICS array in JS must stay in sync with the 46-topic list (indices 0–45)
- Questions also carry a `tis[]` multi-tag array (v10.41+) — preserve when migrating
- All localStorage operations must use the established keys (`samega`, `samega_ex`, `samega_apikey`, `shlav_q_images`)
- `explainWithAI()` must handle errors gracefully and cache results in localStorage
- Data loads lazily from `data/*.json` — do not inline large data back into HTML
- `data/` is the single source of truth for all JSON data — no root-level copies

---

## Known Traps (live-bug classes)

Recurring failure modes worth checking before declaring a fix complete.

### Stale-count trap

The pre-load skeleton at `shlav-a-mega.html:3271` hardcodes the question count
because `_SYLLABUS` is module-private inside `src/study_plan.js` and the
skeleton renders before the JSON fetch. Currently `'3,743'` per the v10.64.41
fallback.

The 12 occurrences of `3,833` at lines ≥6688 are CHANGELOG audit-trail quotes
referencing the historical number — DO NOT touch them. The STALE_COUNTS guard
in `tests/dataIntegrity.test.js` slices at `const CHANGELOG=` and scans only
the live prefix, which is why both numbers can coexist without test failure.

### Trinity drift

Three places must always match: `package.json` `version`, `APP_VERSION` constant
in `shlav-a-mega.html`, `CACHE` in `sw.js`. The trinity guard
(`tests/visualOverhaul2026.test.js`) is version-agnostic since v10.60 — derives
from `package.json` at test time. Bumping any one without the other two will
fail `check-version-sync.py` before push.

### Curator-override re-flip

Running an automated "fix wrong answers" pass over `data/questions.json` will
re-flip the 110 curator overrides back to IMA's wrong key. Always check
`tests/curatorOverridesRatchet.test.js` and `.audit_logs/review/{tag}.md`
before touching `c` values.

### Bilingual `o[]` desync

Editing `o[]` or `o_en[]` independently silently breaks `c`. The bilingual
toggle test catches schema mismatch but not order-only reorders. Edit both
arrays together or use `scripts/translate_questions_to_hebrew.cjs` (which
preserves `c`).

### Distractor-alignment drift

`data/distractors.json` `DIS[k]` empty slot must equal `Q[k].c`. Drift is
caught by three layers — UI render, `tests/distractorsDrift.test.js`, and the
auto-audit probe. v10.45 was a 72%-misalignment regression caught by the test
layer; v10.64.46 regenerated 75 drifted Qs after detector v3.

### Two-Claude race

The user runs Claude Code (terminal) and claude.ai (web) in parallel.
**Neither lane pushes to `main` directly** — the global `~/.claude/CLAUDE.md`
"never push main directly — always PR" rule is hard-enforced by the
auto-mode permission classifier and overrides any repo-level solo-lane
carve-out. Lane discipline:

- **Both lanes active**: branch first — `claude/web-<slug>` for web Claude,
  `claude/term-<slug>` for terminal Claude — and PR to main. Avoid touching
  the other lane's known files mid-session.
- **Solo lane**: still branch `claude/term-<slug>` + PR (no extra two-Claude
  coordination ceremony, but the PR is mandatory — a `git push origin main`
  is denied by the classifier regardless of a correct solo-lane
  self-justification). CI gates, then ask the user to merge. Geri audit-5
  (2026-05-17) hit this: direct push denied → resolved via PR #227.
- **Session start**: `git log --all --since="1 day ago" --oneline` to detect
  parallel work before editing shared surfaces (`questions.json`, `sw.js`,
  version files, `shared/fsrs.js`, `harrison_chapters.json`).
- **Detection**: SW `CACHE` version drifting mid-session = the other lane just
  shipped — pull before pushing.

### `render()` is async (v10.64.88+)

The body of `render()` (line 6808 in `shlav-a-mega.html`) is wrapped in
`setTimeout(()=>{...},0)` to defer DOM rebuild past the current event loop
tick (Option A from PR #195 audit, fixes the chaos-bot's 953 click-timeouts/h
on idless `onclick="…render()"` sites). This means:

- **Any code that does `render(); document.getElementById(...)` synchronously
  reads stale DOM** — capture before render, or chain via setTimeout/
  queueMicrotask. `tests/renderMicrotaskDefer.test.js` ratchets against this
  pattern in `shlav-a-mega.html`.
- The 6 internal recursive `render()` calls in switch dispatch (lines
  6848-6874 for #study/#flash/#meds/#calc/#search/#chat/#book/#syl deep-link
  reroutes) self-defer through the same wrapper — adds one extra tick but
  works correctly.
- Focus capture (`document.activeElement?.id`) and input-value capture
  (`#srchi`/`#nfilt`) now run inside the deferred callback. For idless click
  targets this is moot (memo §3); for the one id-bearing oninput site
  (`#srchi`), focus is preserved because the user is still on the search box
  when setTimeout(0) fires.
- Reverting the wrap re-introduces the click-event-during-rebuild race.

### Hebrew bidi corruption

Editing Hebrew `.html` / `.tsx` files via `str_replace` can silently fail when
U+200F LRM marks are present in the haystack. Workaround: drop to a Python
subprocess for Hebrew-heavy edits. Drug names + lab abbreviations should stay
in English per Israeli clinical convention; mixing in option text increases
bidi flip risk.

### Chaos-bot judge letter is DISPLAY-frame

`chaos-doctor-bot-v4` `judge.correct_letter_if_app_wrong` is a **display-frame**
letter (the judge sees served options A..D in shuffled display order). **Never
map it against canonical `q.o[]`** — that fabricates a spurious prose↔index
"artifact" on every shuffled Q (~67% of rows). Audit-4 (2026-05-17) proved the
Geri judge is 0/61 inconsistent in display frame; the audit-3 §4 "3/5 artifact"
was a frame-confused manual sample, not a judge defect. The bot now emits
`judge.correct_display_idx` / `correct_canonical_idx` at capture — use those,
never hand-map. Distinct from the real 2026-05-08 FM/IM served↔canonical *bot*
bug (a no-op for Geri). See `docs/AUDIT4_judge_letter_frame_2026-05-17.md`.

---

## Deployment

```bash
git add <files>
git commit -m "descriptive message"
git push origin main
```

GitHub Actions runs CI → on pass, GitHub Pages updates within ~60 seconds.

**No manual deployment steps needed.**

### Commit Conventions
- Version prefix: `v9.7`, `v9.76`, etc.
- Imperative tense: `fix:`, `feat:`, `Add`, `Update`
- Clear scope describing the feature or issue

---

## Codebase Metrics

| Metric | Value |
|---|---|
| Main file | `shlav-a-mega.html` (~7,631 lines, ~580 KB) |
| Named functions | 224 (228 incl. shared/*.js, the integrity-guard counting basis) |
| Questions | 3,743 (IMA past exams + Hazzard/Harrison AI-generated + GRS8 imports; all carry `ref` + `e`) |
| Topics | 46 |
| Drugs | 113 |
| Flashcards | 159 |
| Study notes | 46 |
| Hazzard chapters | 108 (in-app reader) |
| Harrison chapters | 69 (in-app reader) |
| Test suite | 1,270 tests across 61 files + 7 skipped (vitest) |
| Sibling repos | Mishpacha Mega (family med) + Pnimit Mega (internal med) — see workspace CLAUDE.md for shared invariants |
| CI workflows | 7 (ci.yml, claude.yml, claude-code-review.yml, distractor-autopsy.yml, distractor-merge-pr.yml, integrity-guard.yml, weekly-audit.yml) |
| Inline handlers | onclick=214, onchange=25, oninput=6 |
| App version | v10.64.86 |
| SW cache key | `shlav-a-v10.64.86` |


## Test Coverage Recommendations

### Current Coverage Summary

| Area | Status | Tests |
|------|--------|-------|
| Question schema & duplicates | Strong | 25+ |
| Answer integrity & bounds | Strong | 50+ |
| Notes/drugs/flashcards/OSCE schema | Good | 15+ |
| Cross-file referential integrity | Good | 2+ |
| HTML structure & PWA | Good | 16 |
| Service worker config & sync | Good | 25 |
| FSRS spaced repetition | Good | 20+ |
| Quiz engine logic | Good | 30+ |
| Security (eval/innerHTML) | Moderate | 3+ |
| Image map integrity | Moderate | 2+ |

### Recommended Additions (Priority Order)

1. **OSCE station validation** — Currently no OSCE data file; if reintroduced, validate scenario completeness, task arrays, tip arrays, and cross-reference with topic index
2. **Explanation quality checks** — Test that all 3,743 `e` fields are non-empty, >= 50 chars, contain no HTML injection, and are valid Hebrew/English text
3. **Hazzard chapter JSON** — Validate `hazzard_chapters.json` structure, chapter numbering, and cross-reference with notes.json `ch` field
4. **Exam year tag consistency** — Validate that each `t` field matches known exam sessions, test distribution balance across years
5. **Topic distribution balance** — Add quantitative tests: no single topic should have >15% or <1% of total questions
6. **Drug interaction cross-checks** — Test ACB score ranges (0-3), Beers flag consistency, category string validity
7. **Study plan logic** — Test `STUDY_PLAN` structure, topic ordering, and weekly schedule generation
8. **AI proxy routing** — Mock tests for `callAI()` proxy-first/fallback routing logic
9. **Service worker background sync** — Test `supabase-backup` sync tag registration and retry logic
10. **Accessibility audit** — Automated check that all interactive elements have >= 44px touch targets in CSS

### Long-Term Goal
Reach **1,000+ tests** with coverage of every data file, every engine function, and every CI validation rule having a corresponding Vitest test (currently ~756, well past the original 300 target).

---

## TODO / Improvement Roadmap

> Last audited: 2026-05-10 against v10.64.88. Five entries were dropped here because they were already shipped — see "Recently completed" below for the receipts. OSCE reinstate was dropped by user direction. Verify against live code before re-adding any.

### Low Priority
- [ ] **Surface perf metrics in UI** — fetch instrumentation already captures `{url, status, ms}` into `buffer.network` (`shlav-a-mega.html:736`); gap is a user-facing surface (slow-fetch banner, debug-console panel, or perf row in Settings). Raw instrumentation is done; only the surface is missing.

### Content Roadmap
- [ ] **2026-א exam questions** — Parse and add when the next IMA session releases
- [ ] **Flashcard expansion** — Target 200+ flashcards covering all 46 topics (currently 159)
- [ ] **Notes update** — Keep all 46 notes reflecting latest Hazzard's 8e + Harrison's 22e content
- [ ] **Image coverage** — Add question images for newer exam sessions

### Recently completed (kept here briefly for changelog context)
- ~~Sibling rescue-drill / activity-tracking port~~ — already shipped before 2026-05-10 audit. `buildRescuePool` at `shlav-a-mega.html:2123`; `.track-rescue` panel + `GO` CTA at `:5581-5587` (`onclick="buildRescuePool();tab='quiz';render()"`); `.track-activity*` CSS at `:624-633`. The "port from siblings" framing was misleading — the work was already done in the monolith.
- ~~PWA install prompt~~ — `shared/install-promo.js` (canonical from `.shared/install-promo.js`) wired at `shlav-a-mega.html:8086-8087` with inline `PWA_INSTALL_CONFIG = { appName: 'Shlav A Mega', minSessions: 2, minEngagedSec: 60 }`. Captures `beforeinstallprompt` inside the shared module.
- ~~Wire push-notification UI~~ — `Notification.requestPermission()` at `:6153`; `reg.active.postMessage({type:'schedule-notification', dueCount})` at `:8053`; SW listener at `sw.js:184-198` showing local "Daily Review" notification when `dueCount > 0`. Local-notification path only (not server push); no VAPID required.
- ~~Supabase cloud sync UI~~ — `#syncPill` status indicator at `:859`; sync modal with Backup-now / Restore-from-cloud CTAs at `:1146-1147`; standalone Backup/Restore buttons at `:6121-6122`; `cloudBackup()` and `cloudRestore()` at `:6602` / `:6646`. Covered by `tests/syncIndicator.test.js` (19 tests).
- ~~In-app Study Plan generator~~ — v10.46.0 (sibling-mirrored)
- ~~Distractor autopsy data~~ — `data/distractors.json` shipped, 4029/4029 entries; v10.45 fixed 72% misalignment
- ~~Username/password accounts~~ — v10.44.0
- ~~Per-topic study hub + tis[] multi-tag~~ — v10.41–v10.43 (kills EOL-tab fragmentation)
- ~~TOPICS expanded 40→46~~ — v10.41 (added Parkinson's, Arrhythmia, Dysphagia, Andropause, Prevention, Interdisciplinary Care)
- ~~Built-in debug console~~ — v10.38 (5-tap top-right corner activation)
- ~~GRS8 Book 3 selective import~~ — v10.37 (+77 Qs across 14 high-yield chapters)
- ~~`ref` field on every Q~~ — Hazzard/Harrison citation populated on all 3,743 Qs
- ~~Pre-generated `e` explanations~~ — present on all 3,743 Qs
- ~~Hazzard chapter JSON tests~~ — `textbookChapters.test.js` covers schemas
- ~~Add flashcard spaced repetition~~ — FSRS-4.5 wired with Due/Browse mode

---

## Branch Policy

- `main` — production branch, auto-deployed to GitHub Pages
- Feature branches: `claude/web-<slug>` (web Claude), `claude/term-<slug>` (terminal Claude), `claude/<description>-<id>` (other)
- Solo lane: branch `claude/term-<slug>` + PR (the global always-PR guardrail overrides repo-level solo carve-outs — the auto-mode classifier denies direct `main` pushes; see "Two-Claude race" under Known Traps)
- Both lanes active: branch first + PR — see "Two-Claude race" under Known Traps
- All PRs target `main`
- CI must pass before merging
