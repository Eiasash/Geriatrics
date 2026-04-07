# 🩺 Shlav A Mega — Geriatrics Board Prep

**Israeli Shlav A (שלב א) Geriatric Medicine Board Exam Preparation Tool**

Standalone, offline-capable PWA with 1,148 real IMA exam questions, textbook-sourced study notes, clinical calculators, and spaced repetition — all in one HTML file.

## Features

| Feature | Details |
|---|---|
| **Quiz Engine** | 1,148 verified IMA questions (2021–2024) with answer keys |
| **Spaced Repetition** | SM-2 algorithm — wrong answers resurface automatically |
| **Exam Mode** | Configurable N/time, topic breakdown, + wrong-answer re-drill after exam |
| **Post-Exam Re-Drill** | One-click drill on wrong answers only after any mock exam |
| **Weak Topic Drill** | Auto-targets weakest topics for focused practice |
| **Due Review** | Filter to only SR-due questions |
| **Topic Auto-Tagging** | All questions mapped to 40 syllabus topics |
| **Per-Topic Stats** | Accuracy bars by topic — find weak areas |
| **Study Notes** | 40 topics from Hazzard's 8e, Harrison's 22e, Washington Manual |
| **Flashcards** | 159 high-yield cards with שוב/קשה/קל SR rating |
| **AI Explain** | 15 pre-baked expert explanations + on-demand AI with API key |
| **Drug Lookup** | 53 drugs — Beers + ACB score + risk descriptions |
| **STOPP/START v.3** | Full O'Mahony 2023 criteria — all 13 STOPP sections + 12 START sections, searchable |
| **Israeli Law Tab ⚖️** | 13 MOH/MoJ documents: EOL law, PEG dementia, ייפוי כוח, מקבל החלטות זמני, סיעוד מורכב, התעמרות, נהיגה — with exam traps |
| **Calculators** | 13 tools: CrCl, CHA₂DS₂-VASc, CURB-65, GDS-15, Braden, PADUA VTE, Katz ADL, Lawton IADL, 4AT Delirium, MNA-SF, Clinical Frailty Scale, Norton, Morse Fall |
| **OSCE Simulator** | 10 timed stations with scored checklists |
| **Full-Text Search** | Search questions, notes, and drugs |
| **Dark Mode** | Toggle, persists to localStorage |
| **Bookmarks** | Flag questions for review |
| **Share/Export/Import** | Copy to clipboard, JSON backup & restore |
| **IMA Archive** | Direct S3 links for all exam PDFs 2022–2025 |
| **PWA Offline** | Service worker for offline use |

## Recent Changes (April 2026)

- **⚖️ Israeli Law tab**: All 13 legal documents with exam-critical bullet points, exam traps, category filter, search, and quick-link to related quiz topics
- **🚫✅ STOPP/START v.3**: Full O'Mahony 2023 criteria integrated into Drug Reference tab — all sections searchable
- **🔁 Post-exam re-drill**: After any mock exam, drill wrong answers only with one tap
- **💡 Baked-in AI explanations**: 15 expert explanations pre-loaded — no API key needed for those questions
- **📝 Skill file updated**: SKILLshlava.md updated with all new indexed documents

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

- **Questions:** 1,131 MCQs from official IMA Shlav A exams with verified answer keys
- **Study Notes:** Hazzard's 8e, GRS 8e, Washington Manual, SZMC DAG
- **Drugs:** Beers Criteria 2023 + ACB Scale (53 drugs)
- **Regulations:** Patient Rights Law, Dying Patient Act, Continuing POA, Takanah 12b

## Files

```
shlav-a-mega.html  — Complete app (~665KB)
index.html         — Redirect for GitHub Pages
manifest.json      — PWA manifest
sw.js              — Service worker (v9)
.nojekyll          — Bypass Jekyll on GitHub Pages
```

## License

Personal study tool. IMA exam questions are property of the Israeli Medical Association.

---

## Claude Skill (`skill/`)

A Claude Projects skill for Shlav A board exam prep — AI-assisted question explanation,
distractor analysis, and high-yield review.

```
skill/
├── SKILL.md                    — Main skill: triggers, workflow, high-yield facts, exam traps
└── references/
    ├── legal-ethics.md         — Israeli law: dying patient act, POA, guardianship, capacity
    ├── exam-patterns.md        — Repeating question stems, frequency ranking, key numbers
    └── high-yield-by-topic.md  — (planned) distilled pearls per topic
```

**How to use:** Add to Claude Project → paste any Shlav A question → get structured
explanation with correct answer, distractor analysis, board pearl, topic tag, source.
