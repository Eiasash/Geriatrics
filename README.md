# Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 1,419 real IMA exam questions, textbook-sourced study notes, clinical calculators, and spaced repetition — all in one HTML file.

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 1,419 verified IMA questions (2021-2025) with answer keys |
| **Spaced Repetition** | SM-2 algorithm (ID-based) — wrong answers resurface automatically |
| **Exam Mode** | Configurable N/time, topic breakdown, + wrong-answer re-drill after exam |
| **Mock Exam 100q** | Proportionally sampled from 9-year topic distribution with post-exam analytics |
| **On-call Mode** | Flip-card study for 3 AM — tap to reveal, one-touch rate, AI explain on demand |
| **Priority Matrix** | Ranks all 40 topics by exam frequency x accuracy gap |
| **Weak Topic Drill** | Auto-targets weakest topics for focused practice |
| **Due Review** | Filter to only SR-due questions |
| **Topic Auto-Tagging** | All questions mapped to 40 syllabus topics |
| **Per-Topic Stats** | Accuracy bars by topic — find weak areas |
| **Study Notes** | 40 topics from Hazzard's 8e, Harrison's 22e |
| **Library** | Consolidated textbook browser — Hazzard's in-app chapter reader, Harrison's PDFs, Laws, Articles, Exams |
| **Hazzard Reader** | Required chapters extracted with section headers, reading time estimates |
| **Flashcards** | 159 high-yield cards with SR rating |
| **AI Explain** | Pre-baked expert explanations + on-demand AI with API key |
| **Drug Lookup** | 53 drugs — Beers + ACB score + risk descriptions |
| **STOPP/START v.3** | Full O'Mahony 2023 criteria — all 13 STOPP + 12 START sections, searchable |
| **Israeli Law Tab** | 13 MOH/MoJ documents with exam traps |
| **Calculators** | 13 tools: CrCl, CHA2DS2-VASc, CURB-65, GDS-15, Braden, PADUA VTE, Katz ADL, Lawton IADL, 4AT, MNA-SF, CFS, Norton, Morse Fall |
| **OSCE Simulator** | Timed stations with scored checklists |
| **Full-Text Search** | Search questions, notes, and drugs |
| **Dark Mode / Study Mode** | Multiple themes, persists to localStorage |
| **Bookmarks** | Flag questions for review; named bookmark collections |
| **Share/Export/Import** | JSON backup & restore, markdown export of weaknesses |
| **Cloud Sync** | Supabase backup/restore — sync progress across devices |
| **PWA Offline** | Service worker for offline use + install prompt |
| **Teach-Back Mode** | Answer without seeing choices — active recall with 3-axis rubric |
| **Progress Charts** | Line chart + topic radar chart in Track tab |
| **Quiz me on Chapter** | AI-generated MCQs from Hazzard chapter content |

## Quick Start

**GitHub Pages:** `https://eiasash.github.io/Geriatrics/`

**Local:** Download `shlav-a-mega.html`, open in browser.

**Install:** Chrome > Menu > "Add to Home Screen"

## Project Structure

```
shlav-a-mega.html         # Complete app (v9.10, single-file PWA)
index.html                # GitHub Pages redirect
manifest.json             # PWA manifest
sw.js                     # Service worker (v9.10)
data/                     # All runtime JSON data (single source of truth)
  questions.json           # 1,419 exam questions
  notes.json               # 40 study topics
  drugs.json               # 53 Beers/ACB drugs
  flashcards.json          # 159 high-yield flashcards
  osce.json                # OSCE station scenarios
  topics.json              # 40 topic keyword mappings
  tabs.json                # App tab definitions
explanations_cache.json   # Pre-generated AI explanations
hazzard_chapters.json     # Hazzard's 8e chapter content (structured JSON)
questions/images/          # Exam question images (PNGs)
harrison/                  # Harrison's 22e chapter PDFs
hazzard_part*.pdf          # Hazzard's 8e original PDFs
hazzard_marked/            # Hazzard's 8e annotated PDFs
laws/                      # Israeli legal/regulatory documents
article_*.pdf              # 6 mandatory clinical reference articles
scripts/                   # Build scripts (explanation generator, exam parser)
tests/                     # Vitest test suite (41 tests)
skill/                     # Claude Projects skill package
.nojekyll                  # Bypass Jekyll on GitHub Pages
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

- **Questions:** 1,419 MCQs from official IMA Shlav A exams (2021-2025) with verified answer keys
- **Study Notes:** Hazzard's 8e, Harrison's 22e
- **Drugs:** Beers Criteria 2023 + ACB Scale (53 drugs)
- **Regulations:** Patient Rights Law, Dying Patient Act, Continuing POA, and more

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.
