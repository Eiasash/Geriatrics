# 🩺 Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A (שלב א) Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 959 real IMA exam questions, textbook-sourced study notes, clinical calculators, and spaced repetition — all in one HTML file.

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 959 verified IMA questions (2022–2025) with answer keys |
| **Spaced Repetition** | SM-2 algorithm — wrong answers resurface automatically |
| **Exam Mode** | 150 questions, 3-hour timer, simulates real exam |
| **Weak Topic Drill** | Auto-targets your 10 weakest topics for focused practice |
| **Due Review** | Filter to only SR-due questions |
| **Topic Auto-Tagging** | All 959 questions mapped to 40 syllabus topics |
| **Per-Topic Stats** | Accuracy bars by topic — find weak areas |
| **Study Notes** | 40 topics from Hazzard's 8e, GRS 8e, Washington Manual |
| **Flashcards** | 39 high-yield cards with שוב/קשה/קל SR rating |
| **Drug Lookup** | 52 drugs — Beers + ACB score + risk descriptions |
| **Calculators** | 13 tools: CrCl, CHA₂DS₂-VASc, CURB-65, GDS-15, Braden, PADUA VTE, Katz ADL, Lawton IADL, 4AT Delirium, MNA-SF, Clinical Frailty Scale, Norton, Morse Fall |
| **OSCE Simulator** | 10 timed stations with scored checklists |
| **Full-Text Search** | Search questions, notes, and drugs |
| **Dark Mode** | Toggle, persists to localStorage |
| **Bookmarks** | Flag questions for review |
| **Share/Export/Import** | Copy to clipboard, JSON backup & restore |
| **IMA Archive** | Direct S3 links for all exam PDFs 2022–2025 |
| **PWA Offline** | Service worker for offline use |

## Calculators

- **CrCl** (Cockcroft-Gault)
- **CHA₂DS₂-VASc** (AF stroke risk)
- **CURB-65** (Pneumonia severity)
- **GDS-15** (Depression screen)
- **Braden Scale** (Pressure injury risk)
- **PADUA VTE** (Thromboembolism risk)
- **Katz ADL** (Basic activities of daily living)
- **Lawton IADL** (Instrumental ADLs)
- **4AT** (Rapid delirium screen)
- **MNA-SF** (Mini Nutritional Assessment)
- **Clinical Frailty Scale** (CFS 1-9)
- **Norton Scale** (Pressure injury risk — alternative)
- **Morse Fall Scale** (Fall risk assessment)

## OSCE Stations

1. Cognitive Assessment
2. Falls Assessment
3. Goals of Care
4. Deprescribing
5. Delirium Assessment
6. Urinary Incontinence
7. Nutritional Assessment
8. Pain Assessment in Dementia
9. Discharge Planning
10. Breaking Bad News

## Quick Start

**GitHub Pages:** `https://eiasash.github.io/Geriatrics/`

**Local:** Download `shlav-a-mega.html`, open in browser.

**Install:** Chrome → Menu → "Add to Home Screen"

## Data Sources

- **Questions:** 959 MCQs from official IMA Shlav A exams with verified answer keys
- **Study Notes:** Hazzard's 8e, GRS 8e, Washington Manual, SZMC DAG
- **Drugs:** Beers Criteria 2023 + ACB Scale (52 drugs)
- **Regulations:** Patient Rights Law, Dying Patient Act, Continuing POA, Takanah 12b

## Files

```
shlav-a-mega.html  — Complete app (~665KB)
index.html         — Redirect for GitHub Pages
manifest.json      — PWA manifest
sw.js              — Service worker (v3)
.nojekyll          — Bypass Jekyll on GitHub Pages
```

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.
