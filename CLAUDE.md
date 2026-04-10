# CLAUDE.md — Shlav A Mega: Israeli Geriatrics Board Exam App

## Project Overview

**Shlav A Mega** is a Progressive Web App (PWA) for Israeli geriatrics board exam preparation (שלב א גריאטריה, P005-2026). It is a single-file, no-build-step application deployed via GitHub Pages.

- **Live URL**: https://eiasash.github.io/Geriatrics/
- **Main file**: `shlav-a-mega.html` (95 KB, ~1,427 lines, self-contained HTML/CSS/JS)
- **App version**: v9.7
- **Data**: JSON files in `data/` directory, loaded lazily at runtime
- **Deployment**: Push to `main` → GitHub Actions validates → GitHub Pages live in ~60s

---

## Architecture

### Single-File PWA

All application logic lives in `shlav-a-mega.html` — no bundler, no framework, no build step. The file contains:
- All CSS (1,000+ lines, responsive, RTL-aware, dark/light/study modes)
- All JavaScript (ES6+, vanilla)
- HTML structure

Data is loaded at runtime from `data/*.json` files. The service worker (`sw.js`) caches all assets for offline use.

### Storage Layers

| Layer | Keys / Table | Purpose |
|-------|-------------|---------|
| `localStorage` | `samega`, `samega_ex`, `samega_apikey` | User preferences, exam state, API key |
| `IndexedDB` | (internal) | Study progress, spaced repetition state |
| Supabase PostgreSQL | `progress_state` (RLS) | Optional cloud sync across devices |

**Important**: localStorage keys `samega`, `samega_ex`, `samega_apikey` must not be renamed — they are stored in users' browsers.

---

## File Map

```
/
├── shlav-a-mega.html        # Main app (THE file — all HTML/CSS/JS, v9.7)
├── index.html               # GitHub Pages redirect → shlav-a-mega.html
├── sw.js                    # Service worker (offline caching + background sync)
├── manifest.json            # PWA manifest
│
├── data/                    # Lazy-loaded JSON data (v9.7+ split architecture)
│   ├── questions.json       # 1,031 MCQs (primary runtime source)
│   ├── notes.json           # 40 study topic notes
│   ├── drugs.json           # 53 Beers/ACB drugs database
│   ├── flashcards.json      # 159 high-yield flashcards
│   ├── osce.json            # 11 OSCE station scenarios
│   ├── tabs.json            # 10 tab definitions for app navigation
│   └── topics.json          # 40 topic keyword mappings for auto-tagging
│
├── questions.json           # 1,432 MCQs (root copy — includes all questions + explanations)
├── notes.json               # 40 study notes (root copy)
├── drugs.json               # 53 drugs (root copy)
├── flashcards.json          # 159 flashcards (root copy)
├── explanations_cache.json  # Pre-generated AI explanations (2.3 MB)
├── hazzard_chapters.json    # Hazzard's 8e textbook content (structured JSON)
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
├── .claude/
│   ├── launch.json          # Dev server: python -m http.server 3737
│   ├── agents/              # Agent workflow prompts (note-updater, question-explainer)
│   ├── commands/            # Slash command definitions (see Skills section)
│   └── skills/              # Skill files (shlav-a-mega.md)
│
├── .github/
│   └── workflows/ci.yml     # Validation CI (21 checks — JSON schema, duplicates, etc.)
│
├── supabase-setup.sql        # Supabase RLS schema
├── .mcp.json                 # MCP server config (Supabase)
│
├── harrison/                 # Harrison's 22e chapter PDFs (30 chapters)
├── article_*.pdf             # 6 mandatory clinical reference articles
└── hazzard_part*.pdf         # Hazzard's Geriatric Medicine 8e
```

### Data Architecture (v9.7)

In v9.7, data was split from the monolithic HTML into lazy-loaded JSON chunks in the `data/` directory. The root-level JSON files are the canonical complete copies (with all questions + explanations), while `data/` contains the runtime-loaded versions. The service worker caches from `data/`.

---

## Data Schemas

### questions.json
```json
{
  "q": "Question text (Hebrew or English)",
  "o": ["Option A", "Option B", "Option C", "Option D"],
  "c": 0,       // correct answer index (0–3, integer)
  "t": "2022",  // exam year string
  "ti": 18,     // topic index (0–39, see TOPICS below)
  "e": "..."    // optional pre-generated AI explanation
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

### osce.json
```json
{
  "title": "Station title",
  "scenario": "Clinical scenario text",
  "tasks": ["Task 1", "Task 2", ...],
  "tips": ["Tip 1", "Tip 2", ...]
}
```

---

## Topic Index (ti field — 0 to 39)

```
0=Biology of Aging    1=Demography         2=CGA              3=Frailty
4=Falls               5=Delirium           6=Dementia         7=Depression
8=Polypharmacy/Beers  9=Nutrition          10=Pressure Injuries 11=Urinary Incontinence
12=Constipation       13=Sleep             14=Pain            15=Osteoporosis
16=OA                 17=CVD               18=HF              19=HTN
20=Stroke             21=COPD              22=DM              23=Thyroid
24=CKD                25=Anemia            26=Cancer          27=Infections
28=Palliative         29=Ethics            30=Elder Abuse     31=Fitness to Drive
32=Guardianship       33=Patient Rights    34=Advance Directives 35=Community Care
36=Rehab/FIM          37=Vision/Hearing    38=Perioperative   39=Geriatric Emergency
```

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
- `APP_VERSION` in `shlav-a-mega.html` must match the cache version in `sw.js`
- Currently both at version `9.10`
- Update both when making changes to ensure users get cache-busted

### Testing
```bash
npm test             # Run all tests (vitest, 41 tests)
```

Vitest test suite validates data integrity and app structure:
- `tests/dataIntegrity.test.js` — 30 tests: question schema/duplicates/topic coverage, notes, drugs, flashcards, OSCE, topics, cross-file referential integrity
- `tests/appIntegrity.test.js` — 11 tests: HTML structure (RTL, viewport, PWA), SW version sync, security checks (eval, innerHTML), manifest validation

---

## CI Pipeline (GitHub Actions)

Runs on push to `main` and all PRs. Python-based data validation + Vitest test suite.

| Check | Threshold |
|-------|-----------|
| JSON parse validity | questions, notes, drugs, flashcards |
| Question count | Must be > 900 |
| Question schema | `q` (string), `o` (array >= 2), `c` (valid index), `ti` (int >= 0) |
| Notes schema | `topic` and `notes` fields present; **NO GRS references** |
| Drugs schema | `name`, `heb`, `acb`, `beers`, `cat`, `risk` fields present |
| Flashcards schema | `f` and `b` fields present |
| Duplicate detection | First 80 chars of question text (conflicting answers flagged) |
| HTML syntax | Python HTMLParser |
| JS brace balance | Matching braces in shlav-a-mega.html |
| Service worker version sync | APP_VERSION matches sw.js CACHE version |
| innerHTML sanitization | Audit for unsanitized innerHTML usage |
| Topic coverage | >= 5 questions per topic (all 40 topics) |

**Vitest tests** (41 tests, 2 files) validate data schemas and app structure. Run `npm test` before pushing.

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
- **NO GRS references** — GRS was removed from the P005-2026 syllabus
- `notes.ch` must cite actual Hazzard's 8e chapter or Harrison's 22e chapter
- Hazzard's chapters **excluded** from syllabus: Ch 2–6, 34, 62
- Question `ti` must be an integer 0–39 from the topic list above
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

1. Read `questions.json` to understand existing format
2. Check topic index from the TOPICS list above — pick the most specific `ti`
3. Validate: exactly 4 options, `c` index in 0–3, valid `t` year string
4. Fuzzy-check for near-duplicates (first 80 chars)
5. Append to the JSON array (do not sort or reorder existing entries)
6. Update both `data/questions.json` and root `questions.json` if needed
7. Update question count in `README.md`

---

## Modifying the Main App (shlav-a-mega.html)

- The file is intentionally a single monolith — do not split it
- CSS is at the top, JS is at the bottom before `</body>`
- TOPICS array in JS must stay in sync with the 40-topic list (indices 0–39)
- All localStorage operations must use the established keys (`samega`, `samega_ex`, `samega_apikey`)
- `explainWithAI()` must handle errors gracefully and cache results in localStorage
- Data loads lazily from `data/*.json` — do not inline large data back into HTML

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
- Version prefix: `v9.7`, `v9.6.1`, etc.
- Imperative tense: `fix:`, `feat:`, `Add`, `Update`
- Clear scope describing the feature or issue

---

## Branch Policy

- `main` — production branch, auto-deployed to GitHub Pages
- Feature branches: `claude/<description>-<id>` convention
- All PRs target `main`
- CI must pass before merging
