# Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 1,434 real IMA exam questions, textbook-sourced study notes, clinical calculators, and spaced repetition — all in one HTML file.

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 1,434 verified IMA questions (2021-2025) with answer keys |
| **Spaced Repetition** | SM-2 algorithm (ID-based) — wrong answers resurface automatically |
| **Exam Mode** | Configurable N/time, topic breakdown, + wrong-answer re-drill after exam |
| **Mock Exam 100q** | Proportionally sampled from 9-year topic distribution with post-exam analytics |
| **On-call Mode** | Flip-card study for 3 AM — tap to reveal, one-touch rate, AI explain on demand |
| **Sudden Death** | One wrong answer ends the session — builds high-stakes exam pressure |
| **Priority Matrix** | Ranks all 40 topics by exam frequency x accuracy gap |
| **Weak Topic Drill** | Auto-targets weakest topics for focused practice |
| **Due Review** | Filter to only SR-due questions |
| **Timed Mode** | 90-second countdown per question with auto-advance |
| **Blind Recall** | Hides answer choices — forces free recall before seeing options |
| **Distractor Autopsy** | AI explains why each wrong option is wrong |
| **Teach-Back Mode** | Type your own explanation, AI grades it on a 3-axis rubric |
| **Study Notes** | 40 topics from Hazzard's 8e, Harrison's 22e |
| **Library** | Consolidated textbook browser — Hazzard's in-app reader, Harrison's PDFs, Laws, Articles, Exams |
| **Flashcards** | 159 high-yield cards with SR rating |
| **AI Explain** | On-demand AI explanations via shared proxy (no API key required) |
| **AI Chat** | Claude-powered geriatrics Q&A — board prep focus |
| **Drug Lookup** | 53 drugs — Beers + ACB score + risk descriptions |
| **Med Basket** | Build a drug list, check STOPP/START interactions + ACB burden |
| **EOL Decision Tree** | Interactive end-of-life legal/ethical decision flowchart |
| **Calculators** | 13 tools: CrCl, CHA₂DS₂-VASc, CURB-65, GDS-15, Braden, PADUA VTE, Katz ADL, Lawton IADL, 4AT, MNA-SF, CFS, Norton, Morse Fall |
| **Cloud Sync** | Supabase backup/restore — sync progress across devices |
| **PWA Offline** | Service worker for offline use + install prompt |
| **Pomodoro Timer** | 25min focus / 5min break study timer |

## Quick Start

**GitHub Pages:** `https://eiasash.github.io/Geriatrics/`

**Local:** Download `shlav-a-mega.html`, open in browser.

**Install:** Chrome > Menu > "Add to Home Screen"

## Project Structure

```
shlav-a-mega.html         # Complete app (v9.14, single-file PWA)
index.html                # GitHub Pages redirect
manifest.json             # PWA manifest
sw.js                     # Service worker (v9.14)
data/                     # All runtime JSON data (single source of truth)
  questions.json           # 1,434 exam questions
  notes.json               # 40 study topics
  drugs.json               # 53 Beers/ACB drugs
  flashcards.json          # 159 high-yield flashcards
  topics.json              # 40 topic keyword mappings
  tabs.json                # App tab definitions
harrison_chapters.json    # Harrison's 22e chapter content (structured JSON)
questions/images/          # Exam question images (PNGs)
harrison/                  # Harrison's 22e chapter PDFs
hazzard_part*.pdf          # Hazzard's 8e original PDFs
hazzard_marked/            # Hazzard's 8e annotated PDFs
laws/                      # Israeli legal/regulatory documents
article_*.pdf              # 6 mandatory clinical reference articles
scripts/                   # Build scripts (explanation generator, exam parser)
tests/                     # Vitest test suite (103 tests)
skill/                     # Claude Projects skill package
```

## Development

```bash
# Start dev server
python -m http.server 3737
# Open http://localhost:3737/shlav-a-mega.html

# Run tests
npm test
```

No build step needed. Edit `shlav-a-mega.html` and refresh.

## Data Sources

- **Questions:** 1,434 MCQs from official IMA Shlav A exams (2021-2025) with verified answer keys
- **Study Notes:** Hazzard's 8e, Harrison's 22e
- **Drugs:** Beers Criteria 2023 + ACB Scale (53 drugs)
- **Regulations:** Patient Rights Law, Dying Patient Act, Continuing POA, and more

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.
