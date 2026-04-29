# CLAUDE.md — Shlav A Mega: Israeli Geriatrics Board Exam App

## Project Overview

**Shlav A Mega** is a Progressive Web App (PWA) for Israeli geriatrics board exam preparation (שלב א גריאטריה, P005-2026). It is a single-file, no-build-step application deployed via GitHub Pages.

- **Live URL**: https://eiasash.github.io/Geriatrics/
- **Main file**: `shlav-a-mega.html` (~523 KB, ~7,150 lines, ~270 named functions)
- **App version**: v10.60.0 (as of 29/04/26) — 3,833 Qs across 46 topics. All 3,833 Qs carry `ref` (Hazzard / Harrison chapter + title) and pre-generated `e` explanation. Recent: v10.60 Track tab class-driven rebuild (zero inline styles on shells, mirrors FM Quiz PR #16); v10.59 backups RLS Phase 2 — RPC-mediated reads (cloudRestore via public.backup_get, public SELECT dropped); v10.58 Track tab visual consolidation; v10.57 Track tab cleanup; v10.56 hard-delete orphan calc code; v10.55 real fixes — exam-tags + priority matrix; v10.54 Learn+Library merge; v10.46 in-app Study Plan generator; v10.45 distractor autopsy data corruption fix (72% misaligned).
- **Data**: JSON files in `data/` directory, loaded lazily at runtime
- **Deployment**: Push to `main` → GitHub Actions validates → GitHub Pages live in ~60s

---

## Architecture

### Single-File PWA

All application logic lives in `shlav-a-mega.html` (~7,150 lines, ~270 named functions) — no bundler, no framework, no build step. The file contains:
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
├── shlav-a-mega.html        # Main app (THE file — all HTML/CSS/JS, v10.46.0)
├── index.html               # GitHub Pages redirect → shlav-a-mega.html
├── sw.js                    # Service worker (offline caching + background sync)
├── manifest.json            # PWA manifest
│
├── data/                    # Lazy-loaded JSON data — single source of truth
│   ├── questions.json       # 3,833 MCQs (primary runtime source, all carry `ref` + `e`)
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
├── tests/                          # 38 vitest files, ~756 tests (see Testing section)
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
  "e": "...",   // pre-generated AI explanation (populated on all 3,833 Qs)
  "ref": "..."  // Hazzard / Harrison chapter + title citation
}
```

### notes.json
```json
{
  "id": 0,
  "topic": "Biology of Aging",
  "ch": "Hazzard's Ch 3 (Biology of Aging)",  // MUST cite Hazzard's 8e or Harrison's 22e chapter — NO GRS
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
- Currently all three at `10.60.0` (sw.js cache key: `shlav-a-v10.60.0`)
- Update all three when making changes to ensure users get cache-busted (see workspace CLAUDE.md "version-trinity invariant")
- The trinity guard lives in two places: strict pairwise alignment in `tests/appIntegrity.test.js`, and a version-agnostic re-derivation from `package.json` in `tests/visualOverhaul2026.test.js` (refactored v10.60 — used to hard-code the literal version string and went stale every release)

### Testing
```bash
npm test             # Run all tests (vitest, ~905 tests across 40 files)
```

**~905 tests across 40 files (~22 tests per file avg)** — run `npm test` to see current count.

**Auto-expand rule:** Every feature, improvement, or bug fix MUST include new or updated tests:
- New data file or field → schema validation test
- Bug fix → regression test that reproduces the bug before the fix
- New app feature → integrity test for the feature's HTML/JS structure
- Modified data processing → edge case + boundary tests
- After adding tests, update the test count in this section

**Test file inventory (40 files, ~905 tests):**

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
- `notes.ch` must cite actual Hazzard's 8e chapter or Harrison's 22e chapter
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
3. Validate: exactly 4 options, `c` index in 0–3, valid `t` year string
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
| Main file | `shlav-a-mega.html` (~7,150 lines, ~523 KB) |
| Named functions | ~270 (273 incl. shared/*.js, the integrity-guard counting basis) |
| Questions | 3,833 (IMA past exams + Hazzard/Harrison AI-generated + GRS8 imports; all carry `ref` + `e`) |
| Topics | 46 |
| Drugs | 113 |
| Flashcards | 159 |
| Study notes | 46 |
| Hazzard chapters | 108 (in-app reader) |
| Harrison chapters | 69 (in-app reader) |
| Test suite | ~905 tests across 40 files (vitest) |
| Sibling repos | Mishpacha Mega (family med) + Pnimit Mega (internal med) — see workspace CLAUDE.md for shared invariants |
| CI workflows | 7 (ci.yml, claude.yml, claude-code-review.yml, distractor-autopsy.yml, distractor-merge-pr.yml, integrity-guard.yml, weekly-audit.yml) |
| Inline handlers | onclick=214, onchange=25, oninput=6 |
| App version | v10.60.0 |
| SW cache key | `shlav-a-v10.60.0` |


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
2. **Explanation quality checks** — Test that all 3,833 `e` fields are non-empty, >= 50 chars, contain no HTML injection, and are valid Hebrew/English text
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

### Medium Priority
- [ ] **Port features from sibling InternalMedicine/FamilyMedicine** — periodically sync rescue-drill, activity-tracking, and other fixes
- [ ] **Reinstate OSCE content** — `data/osce.json` was removed; if returning, recreate schema and stations covering all 46 topics

### Low Priority
- [ ] **PWA install prompt** — Add beforeinstallprompt handler for mobile install
- [ ] **Wire push-notification UI** — SW already implements `push` / `notificationclick`; add user-facing opt-in + daily-review scheduler
- [ ] **Supabase cloud sync UI** — Add user-facing sync status indicator and manual sync button
- [ ] **Performance monitoring** — Add basic performance metrics (load time, data fetch time) to help optimize

### Content Roadmap
- [ ] **2026-א exam questions** — Parse and add when the next IMA session releases
- [ ] **Flashcard expansion** — Target 200+ flashcards covering all 46 topics (currently 159)
- [ ] **Notes update** — Keep all 46 notes reflecting latest Hazzard's 8e + Harrison's 22e content
- [ ] **Image coverage** — Add question images for newer exam sessions

### Recently completed (kept here briefly for changelog context)
- ~~In-app Study Plan generator~~ — v10.46.0 (sibling-mirrored)
- ~~Distractor autopsy data~~ — `data/distractors.json` shipped, 4029/4029 entries; v10.45 fixed 72% misalignment
- ~~Username/password accounts~~ — v10.44.0
- ~~Per-topic study hub + tis[] multi-tag~~ — v10.41–v10.43 (kills EOL-tab fragmentation)
- ~~TOPICS expanded 40→46~~ — v10.41 (added Parkinson's, Arrhythmia, Dysphagia, Andropause, Prevention, Interdisciplinary Care)
- ~~Built-in debug console~~ — v10.38 (5-tap top-right corner activation)
- ~~GRS8 Book 3 selective import~~ — v10.37 (+77 Qs across 14 high-yield chapters)
- ~~`ref` field on every Q~~ — Hazzard/Harrison citation populated on all 3,833 Qs
- ~~Pre-generated `e` explanations~~ — present on all 3,833 Qs
- ~~Hazzard chapter JSON tests~~ — `textbookChapters.test.js` covers schemas
- ~~Add flashcard spaced repetition~~ — FSRS-4.5 wired with Due/Browse mode

---

## Branch Policy

- `main` — production branch, auto-deployed to GitHub Pages
- Feature branches: `claude/<description>-<id>` convention
- All PRs target `main`
- CI must pass before merging
