# Track N — manual mapping for the 25 non-2021-Dec unmapped questions

**Date:** 2026-05-04
**Status:** Closed — 24 of 25 mapped; 1 collision flagged for human review.
**Stack:** v10.64.40 (no version bump; audit-metadata only).

## Background

The v3 qnum-mapping (idx → [tag, qnum]) has 1261 of 1334 attempted mappings.
73 were unmapped: 47 from 2021-Dec (PDF OCR limitation) + 26 non-2021-Dec.
After filtering 1 stale idx (3789, predates a post-v3 deletion), **25 valid
non-2021-Dec unmapped** remained. Track N attempts to map them via PDF
content matching.

## Method

For each unmapped (idx, tag), open the corresponding tag's exam PDF, split
by Q-number patterns, score each chunk by token-overlap with the dataset
question's option text + q-stem. Token sources:

1. **English caps tokens** (≥4 chars ALLCAPS or ≥5 chars caps-leading) — drug
   names, ALLCAPS option codes
2. **Parens content** (3-40 chars) — drug brand names like "(VASODIP)"
3. **Hebrew fallback** — distinctive ≥6-char Hebrew words minus generic
   medical phrases (HEB_NOT_DISTINCTIVE list)

Then cross-check the candidate Q-num against IMA's published answer key in
`final_answer_keys.csv` (where the session is in the CSV — Basic Q150 exams
are not in the CSV).

Apply script: `.audit_logs/track_n_manual_match.py`.

## Results

**24 of 25 mapped.** 1 collision flagged.

| Confidence | Count | Notes |
|---|---|---|
| **High** | 13 | ≥3 hits with distinctive English term, OR ≥7 Hebrew hits, OR IMA agreement |
| **Medium** | 7 | 2-3 hits, no IMA cross-check available |
| **Low** | 4 | 1-hit weak match (single common term), accepted as best available |
| **Skipped** | 1 | idx 3286 — collides with idx 3285 at 2023-Jun-Subspec q#52 (24 vs 7 hits); 3285 is the real q#52, 3286's true qnum unknown |

### IMA cross-check (where available)

Of the 13 high-confidence mappings:
- **5 AGREE** with IMA (or IMA multi-accept covers dataset c) — strong corroboration of mapping correctness
- **3 disagree** with IMA → either curator override (per Track J/L pattern) or wrong mapping
- **5 no IMA data** (Basic Q150 not in CSV)

## Disagreement candidates (likely curator overrides, not flips)

Per the Track J/L triangulation rule, do NOT auto-flip when only 2 of 3 signals (clinical reasoning + IMA + AI) disagree with canonical. Of the new disagreements surfaced:

| idx | tag | qnum | dataset c | IMA | Hits | Verdict |
|---|---|---|---|---|---|---|
| 154 | 2020 | 58 | 2 | ב=1 | 3 eng | Likely curator override; mapping itself is solid (3 distinctive English hits) |
| 2442 | 2020 | 84 | 1 | א=0 | 2 heb | Lower confidence; could be wrong mapping or override |
| 2518 | 2022-Jun-Basic | 85 | 0 | ד=3 | 10 heb | Strong mapping; likely curator override (Brookdale demographic Q) |
| 2900 | 2024-May-Basic | 103 | 2 | "א ד" | 1 eng | Single hit (CPAP); mapping uncertain; IMA accepts only 0+3 not 2 |
| 3286 | 2023-Jun-Subspec | ? | 1 | — | — | Skipped — collides with 3285 at q#52 |
| 3509 | 2024-Sep-Subspec | 20 | 0 | ג=2 | 12 heb | Strong mapping; IMA disagrees — likely curator override |

These join the existing 94 c_wrong curator-override registry (per `project_geriatrics_94_c_wrong_curator_overrides.md`). NO FLIPS APPLIED in this session.

## Output

- `.audit_logs/dataset_to_qnum_mapping_v4.json` — extends v3 with 24 manual additions, confidence-tagged
- `.audit_logs/track_n_candidates.json` — raw matcher output (top-3 candidates per unmapped)
- `.audit_logs/track_n_verdicts.json` — IMA cross-check per top candidate
- `.audit_logs/track_n_manual_match.py` — re-runnable matcher
- `.audit_logs/track_n_build_v4.py` — v3 → v4 builder

## Open follow-ups

- **idx 3286** needs human inspection of the 2023-Jun-Subspec PDF to find its real q#. Token-overlap was inconclusive because the candidate options are common medical terms.
- **47 2021-Dec entries** still unmapped (per workstream OCR limitation; SUPERSEDED by v3 bundle parser per brief — low ROI to chase further).
- **The 5 IMA-disagreement entries** could be added to the c_wrong audit pile if the user wants to formally adjudicate them via the Track J/L triangulation method.

## Net dataset state

- Pre-Track-N: 1261 mapped / 73 unmapped
- Post-Track-N: 1285 mapped / 49 unmapped (47 of which are 2021-Dec, 1 is idx 3286 collision, 1 is the stale idx 3789 ignored)

The mapping is the audit-trail enabler — it lets future answer-key audits triangulate dataset c against IMA's published key for the 24 newly-mapped entries. The mapping itself doesn't change user-facing behavior.
