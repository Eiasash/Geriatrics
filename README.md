# Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 3,314 questions (1,207 real IMA exam + 2,107 AI-generated textbook questions), study notes, clinical calculators, FSRS-4.5 spaced repetition, and AI-powered explanations — all in one HTML file.

**Live:** https://eiasash.github.io/Geriatrics/

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 3,314 questions with answer keys, topic tagging, and image support |
| **FSRS-4.5 Spaced Repetition** | Confidence-based rating (Again/Hard/Good/Easy) with optimized scheduling |
| **Mock Exam** | 100q or 150q realistic topic distribution from exam frequency weights, timed 3h |
| **Rescue Drill** | Auto-builds 21-question pool from 3 weakest topics |
| **Sudden Death** | One wrong answer ends the session |
| **Blind Recall** | Hides answer choices — forces free recall before seeing options |
| **Distractor Autopsy** | AI explains why each wrong option is wrong |
| **Teach-Back** | Type your own explanation, AI grades on mechanism/criteria/exception axes |
| **On-Call Flip Cards** | Clinical scenario cards with reveal and rating |
| **Pomodoro Timer** | 25min focus / 5min break |
| **Study Notes** | 40 topics from Hazzard's 8e, Harrison's 22e |
| **Flashcards** | 159 high-yield cards with SRS tracking |
| **Drug Lookup** | 114 drugs — Beers 2023 + ACB score + STOPP/START + risk descriptions |
| **Med Basket** | Build a drug list, check interactions + ACB burden |
| **Hazzard Reader** | 108 chapters, in-app structured text with AI question generation |
| **Harrison Reader** | 69 chapters, in-app structured text with AI question generation |
| **EOL Decision Tree** | Interactive end-of-life legal/ethical decision flowchart |
| **Calculators** | 13 tools: CrCl, CHA\u2082DS\u2082-VASc, CURB-65, GDS-15, Braden, PADUA VTE, Katz ADL, Lawton IADL, 4AT, MNA-SF, CFS, Norton, Morse Fall |
| **Lab Reference** | Geriatric lab ranges with frailty adjustment slider |
| **Aging Sheet** | Quick physiological aging reference |
| **AI Explain** | On-demand AI explanations via shared proxy (no API key required) |
| **AI Chat** | Claude-powered geriatrics Q&A |
| **Cloud Sync** | Supabase backup/restore across devices |
| **Leaderboard** | Anonymous Supabase-backed readiness ranking |
| **Analytics** | Estimated score, streak, heatmap, activity calendar, confidence matrix |
| **PWA Offline** | Service worker for full offline use + install prompt |

## Quick Start

**GitHub Pages:** https://eiasash.github.io/Geriatrics/

**Local:** `python -m http.server 3737` \u2192 open `http://localhost:3737/shlav-a-mega.html`

**Install:** Chrome \u2192 Menu \u2192 "Add to Home Screen"

## Architecture

Single-file monolith (`shlav-a-mega.html`, ~5,432 lines, 198 functions). No bundler, no framework, no build step. The four large render functions have been decomposed into 31 prefixed helper functions for readability while keeping everything in one file.

| Orchestrator | Helpers | Prefix | What it renders |
|---|---|---|---|
| `renderCalc` | 13 | `_rc*` | Clinical calculators (CrCl, CHA\u2082DS\u2082-VASc, Braden, etc.) |
| `renderQuiz` \u2192 `_rqMain` | 2 + 5 | `_rq*` / `_rqm*` | Quiz engine, controls, teach-back, explanations |
| `renderTrack` | 4 | `_rt*` | Analytics, progress, syllabus, settings |
| `renderLibrary` | 7 | `_rl*` | Textbook readers, laws, articles, exams |

## Project Structure

```
shlav-a-mega.html           # Complete app (v9.76, single-file PWA, ~336KB)
index.html                  # GitHub Pages redirect
manifest.json               # PWA manifest
sw.js                       # Service worker (shlav-a-v9.76)
shared/fsrs.js              # FSRS-4.5 spaced repetition engine (shared with Pnimit Mega)
data/
  questions.json             # 3,314 exam + AI questions
  notes.json                 # 40 study topics
  drugs.json                 # 114 Beers/ACB drugs
  flashcards.json            # 159 high-yield flashcards
  topics.json                # 40 topic definitions
  tabs.json                  # App tab definitions
  hazzard_chapters.json      # 108 Hazzard's 8e chapters (structured text)
harrison_chapters.json      # 69 Harrison's 22e chapters (structured text, root)
questions/images/            # Exam question images (PNGs)
harrison/                    # Harrison's 22e chapter PDFs
hazzard_part*.pdf            # Hazzard's 8e original PDFs
hazzard_marked/              # Hazzard's 8e annotated PDFs
laws/                        # Israeli legal/regulatory documents (15 items)
article_*.pdf                # 6 mandatory clinical reference articles
scripts/                     # Utility scripts (question generation, exam parsing)
tests/                       # Vitest test suite (678 tests, 21 files)
docs/MIGRATION.md            # Decomposition ledger and architecture notes
skill/                       # Claude Projects skill package
.github/workflows/           # CI: ci.yml + integrity-guard.yml (6 gates) + weekly-audit.yml + claude-code-review.yml
```

## Development

```bash
# Start dev server
python -m http.server 3737

# Run tests
npm install && npm test   # 678 tests across 21 files

# Syntax check before push
node --check <(sed -n '/<script>/,/<\/script>/p' shlav-a-mega.html | sed '1d;$d')
```

No build step. Edit `shlav-a-mega.html`, push to main \u2192 GitHub Pages auto-deploys (~60s).

## CI Pipeline

Four GitHub Actions workflows run on every push:

1. **ci.yml** \u2014 Data validation, schema checks, SW version sync, innerHTML audit, vitest
2. **integrity-guard.yml** \u2014 6 gates: JS syntax, critical function existence (37 functions), data loader integrity, function count regression (>5 removed = FAIL), truncated code patterns, SW file integrity
3. **weekly-audit.yml** \u2014 13 weekly health checks
4. **claude-code-review.yml** \u2014 Claude posts a PR review on every open/sync/reopen

## Data Sources

- **Questions:** 1,207 MCQs from official IMA Shlav A exams (2020\u20132025) + 2,107 AI-generated textbook questions
- **Textbooks:** Hazzard's Geriatric Medicine 8e (108 chapters), Harrison's Principles 22e (69 chapters)
- **Drugs:** Beers Criteria 2023 + ACB Scale (114 drugs)
- **Regulations:** 15 Israeli laws/regulations (Patient Rights, Dying Patient Act, POA, driving fitness, siud murkav, etc.)
- **Articles:** 6 mandatory geriatric clinical references + Brookdale 2024

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.
