# CLAUDE.md — Shlav A Mega: Israeli Geriatrics Board Exam App

## Project Overview

**Shlav A Mega** is a Progressive Web App (PWA) for Israeli geriatrics board exam preparation (שלב א גריאטריה, P005-2026). It is a single-file, no-build-step application deployed via GitHub Pages.

- **Live URL**: https://eiasash.github.io/Geriatrics/
- **Main file**: `shlav-a-mega.html` (669 KB, self-contained HTML/CSS/JS)
- **Data**: JSON files loaded lazily at runtime
- **Deployment**: Push to `main` → GitHub Actions validates → GitHub Pages live in ~60s

---

## Architecture

### Single-File PWA

All application logic lives in `shlav-a-mega.html` — no bundler, no framework, no build step. The file contains:
- All CSS (1000+ lines, responsive, RTL-aware, dark/light/study modes)
- All JavaScript (ES6+, vanilla)
- HTML structure

Data is loaded at runtime from separate JSON files. The service worker (`sw.js`) caches all assets for offline use.

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
├── shlav-a-mega.html        # Main app (THE file — all HTML/CSS/JS)
├── index.html               # GitHub Pages redirect
├── sw.js                    # Service worker (offline caching + background sync)
├── manifest.json            # PWA manifest
│
├── questions.json           # 1,241 MCQs — primary data source
├── notes.json               # 40 study topic notes
├── flashcards.json          # 159 high-yield flashcards
├── drugs.json               # 53 Beers/ACB drugs database
├── explanations_cache.json  # Pre-generated AI explanations (700 KB)
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
│   ├── agents/              # Agent workflow prompts
│   └── commands/            # Slash command definitions (see Skills section)
│
├── .github/
│   └── workflows/ci.yml     # Validation CI (JSON schema, question count, duplicates)
│
├── supabase-setup.sql        # Supabase RLS schema
├── .mcp.json                 # MCP server config (Supabase)
│
├── harrison/                 # Harrison's 22e chapter PDFs (30 chapters)
├── article_*.pdf             # 6 mandatory clinical reference articles
└── hazzard_part*.pdf         # Hazzard's Geriatric Medicine 8e
```

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
2. Edit JSON files for content changes
3. Run local server to test
4. Commit and push to `main` — CI validates, Pages deploys

### Service Worker Versioning
When making changes to `shlav-a-mega.html`, update the version constant in `sw.js` so existing users get cache-busted. Check current version before editing.

---

## CI Pipeline (GitHub Actions)

Runs on push to `main` and all PRs. Uses Python only (no Node.js in CI).

| Check | Threshold |
|-------|-----------|
| JSON parse validity | questions, notes, drugs, flashcards |
| Question count | Must be > 900 |
| Question schema | `q` (string), `o` (array ≥2), `c` (valid index), `ti` (int ≥0) |
| Notes schema | `topic` and `notes` fields present |
| Drugs schema | `name` field present |
| Duplicate detection | First 80 chars of question text |
| HTML syntax | Python HTMLParser |

**CI never runs Node.js.** Scripts in `scripts/` are run locally only.

---

## Skills / Slash Commands

These are Claude Code slash commands defined in `.claude/commands/`:

| Command | Description |
|---------|-------------|
| `/audit` | Full audit of shlav-a-mega.html — bugs, wrong answers, UX issues |
| `/audit-fix-deploy` | Full audit → fix → push cycle |
| `/add-questions` | Add new questions to questions.json with validation and topic tagging |
| `/update-notes` | Update notes.json from Hazzard's/Harrison's/articles |
| `/explain-batch` | Pre-generate AI explanations via Claude API |

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

---

## Key Conventions

### Content Integrity
- **NO GRS references** — GRS was removed from the P005-2026 syllabus
- `notes.ch` must cite actual Hazzard's 8e chapter or Harrison's 22e chapter
- Hazzard's chapters **excluded** from syllabus: Ch 2–6, 34, 62
- Question `ti` must be an integer 0–39 from the topic list above
- `c` (correct answer index) must be 0-based and valid (< length of `o` array)

### Localization
- App supports Hebrew (RTL) and English
- Hebrew text uses `dir="rtl"` and `unicode-bidi` CSS
- Do not break RTL layout when adding new UI elements

### Accessibility / Mobile
- Touch targets must be ≥44px
- Dark mode, study mode, and light mode must all be tested for new UI
- Haptic feedback (navigator.vibrate) is used on mobile — do not remove

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
6. Update question count in `README.md`

---

## Modifying the Main App (shlav-a-mega.html)

- The file is intentionally a single monolith — do not split it
- CSS is at the top, JS is at the bottom before `</body>`
- TOPICS array in JS must stay in sync with the 40-topic list (indices 0–39)
- All localStorage operations must use the established keys (`samega`, `samega_ex`, `samega_apikey`)
- explainWithAI() must handle errors gracefully and cache results in localStorage

---

## Deployment

```bash
git add <files>
git commit -m "descriptive message"
git push origin main
```

GitHub Actions runs CI → on pass, GitHub Pages updates within ~60 seconds.

**No manual deployment steps needed.**

---

## Branch Policy

- `main` — production branch, auto-deployed to GitHub Pages
- Feature branches: `claude/<description>-<id>` convention
- All PRs target `main`
- CI must pass before merging
