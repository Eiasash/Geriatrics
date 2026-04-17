---
name: question-schema
description: Authoritative schema reference for data/questions.json, data/notes.json, data/drugs.json. Claude must load this whenever editing any of those files. Contains the exact field names, allowed values, syllabus constraints (Hazzard excluded chapters, Harrison allowed chapters, no GRS), and the auto-tagging topic map. Complements the existing /add-questions command — doesn't replace it.
---

# Data Schema — Shlav A Mega

When editing `data/questions.json`, `data/notes.json`, or `data/drugs.json`, follow this schema exactly. Field names are compact. Do not invent verbose aliases.

## questions.json — array of objects

| Field | Type | Allowed | Notes |
|---|---|---|---|
| `q` | string | Hebrew or English | Question stem. Preserve literal line breaks. |
| `o` | array | **exactly 4 strings** | MCQ options in Hebrew. No markdown. |
| `c` | integer | 0..3 | Index into `o` of the correct answer. |
| `t` | **string** | "2022", "2023", etc. | Year as string. NEVER as integer. |
| `ti` | integer | 0..39 | Topic index per the topic map below. |

**Not on the question:** there is NO `id`, `explanation`, `source`, `year` (numeric), `correct`, `options`, `topic`, or `text` field. AI explanations live in `explanations_cache.json` — separate file.

## notes.json — array of objects

| Field | Type | Allowed | Notes |
|---|---|---|---|
| `id` | integer | 0..39 | Matches the topic index. Exactly 40 notes, one per topic. |
| `topic` | string | Human-readable topic name (e.g. "Biology of Aging") | Must match the canonical topic name for that index. |
| `ch` | string | Citation | Format: `Hazzard's Ch X`, `Harrison's Ch Y`, `Article: <name>`, or combinations like `Hazzard's Ch 2,4, Brookdale 2024`. |
| `notes` | string | Dense board-pearl prose | Uses `▸` section markers and `📖 HAZZARD'S 8e BOARD PEARLS:` trailing summary. Never reference GRS. |

## drugs.json — array of objects

| Field | Type | Allowed | Notes |
|---|---|---|---|
| `name` | string | INN (generic) | English. |
| `heb` | string | Hebrew brand or transliteration | Primary Israeli name. |
| `acb` | integer | 0..3 | Anticholinergic Burden (Boustani). 3 = highest. |
| `beers` | boolean | true/false | Beers 2023 criteria flag. |
| `cat` | string | Category label (free-form short) | e.g. "Anticholinergic/Bladder", "Antihistamine". |
| `risk` | string | One-line risk summary | e.g. "Sedation, delirium, falls". |

## Syllabus constraints (P005-2026)

- **Hazzard 8e allowed**: all chapters EXCEPT 2–6, 34, 62. If a citation references any of those, flag it as excluded.
- **Harrison 22e allowed**: chapters 26, 382, 387, 433, 436–439, 458–459. Plus base residency content is OK to reference in notes but citations in `ch` should target these.
- **Mandatory articles**: Beers 2023, VasCog-2, Alzheimer IWG, AA 2024, Dementia Prevention, Hearing Loss. Format as `Article: <name>`.
- **Israeli legal docs**: 13 sources (in `laws/`). Cite by filename if used.
- **GRS (Geriatric Review Syllabus)**: REMOVED from 2026 syllabus. Zero references anywhere.

## Topic map (ti → keyword set)

Source of truth is `data/topics.json` — an array of 40 keyword strings. Use it for auto-tagging. Topic name (for `notes.json.topic`) is separate and lives inside `notes.json` itself. Key mapping:

```
 0 Biology of Aging              20 Stroke/TIA
 1 Demography & Epidemiology     21 COPD/Pulmonary
 2 CGA (comp. assessment)        22 Diabetes
 3 Frailty/Sarcopenia            23 Thyroid
 4 Falls                         24 Kidney/CKD
 5 Delirium                      25 Anemia
 6 Dementia                      26 Cancer/Oncology
 7 Depression                    27 Infections
 8 Polypharmacy/Beers/STOPP      28 Palliative/EOL
 9 Nutrition/Malnutrition        29 Ethics
10 Pressure ulcers               30 Elder abuse
11 Incontinence                  31 Driving (מרב״ד)
12 Constipation                  32 Guardianship/ייפוי כוח
13 Sleep                         33 Patient rights
14 Pain                          34 Advance directives
15 Osteoporosis                  35 Community/LTC
16 Osteoarthritis                36 Rehabilitation
17 Cardiovascular (non-HF)       37 Vision/Hearing
18 Heart failure                 38 Perioperative
19 Hypertension                  39 Geriatric emergency
```

## Rules when editing

1. **Never change field names.** The CI integrity-guard hashes specific keys.
2. **Preserve ordering in `questions.json`.** Insert at the end unless specifically asked to reorder. The quiz engine uses array indices as canonical question IDs.
3. **`t` is a string.** Writing `"t": 2022` (integer) will break the year filter.
4. **`c` must be 0..3.** Writing `"c": 4` with only 4 options means no correct answer.
5. **Exactly 4 options in `o`.** Not 3, not 5. Never.
6. **`ti` in 0..39.** Writing 40+ will break the topic filter and analytics.
7. **Dual-file update (questions only).** Some legacy scripts update both `questions.json` at the root and `data/questions.json`. Check the existing `/add-questions` command for the canonical write path.
8. **Hebrew RTL.** Preserve original whitespace and punctuation. Never normalize with Unicode NFC without checking — it changes how some IMEs render.

## Duplicate detection

Questions are de-duplicated by fuzzy match on the first 80 chars of `q`. When adding a new question, grep for a 30-char unique substring of your stem first.
