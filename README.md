# 🩺 Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A (שלב א) Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 959 real IMA exam questions, textbook-sourced study notes, clinical calculators, and spaced repetition — all in one 600KB HTML file.

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 959 verified IMA questions (2022–2025) with answer keys |
| **Spaced Repetition** | SM-2 algorithm — wrong answers resurface automatically |
| **Exam Mode** | 150 questions, 3-hour timer, simulates real exam |
| **Topic Auto-Tagging** | All 959 questions mapped to 40 syllabus topics |
| **Per-Topic Stats** | Accuracy bars by topic — find weak areas |
| **Study Notes** | 40 topics from Hazzard's 8e, GRS 8e, Washington Manual |
| **Flashcards** | 39 high-yield cards with שוב/קשה/קל SR rating |
| **Drug Lookup** | 30 drugs — Beers + ACB score + risk descriptions |
| **Calculators** | CrCl, CHA₂DS₂-VASc, CURB-65, GDS-15 |
| **OSCE Simulator** | 4 timed stations with scored checklists |
| **Full-Text Search** | Search questions, notes, and drugs |
| **Dark Mode** | Toggle, persists to localStorage |
| **Bookmarks** | Flag questions for review |
| **Share/Export** | Copy to clipboard, JSON backup |
| **IMA Archive** | Direct S3 links for all exam PDFs 2022–2025 |
| **PWA Offline** | Service worker for offline use |

## Quick Start

**GitHub Pages:** `https://eiasash.github.io/Geriatrics/`

**Local:** Download `shlav-a-mega.html`, open in browser.

**Install:** Chrome → Menu → "Add to Home Screen"

## Data Sources

- **Questions:** 959 MCQs from official IMA Shlav A exams with verified answer keys
- **Study Notes:** Hazzard's 8e, GRS 8e, Washington Manual, SZMC DAG
- **Drugs:** Beers Criteria 2023 + ACB Scale
- **Regulations:** Patient Rights Law, Dying Patient Act, Continuing POA, Takanah 12b

## Files

```
shlav-a-mega.html  — Complete app (598KB)
index.html         — Redirect for GitHub Pages
manifest.json      — PWA manifest
sw.js              — Service worker
.nojekyll          — Bypass Jekyll on GitHub Pages
```

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.
