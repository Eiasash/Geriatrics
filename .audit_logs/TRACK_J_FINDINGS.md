# Track J — c-conflict audit (5 pairs surfaced by Track H cross-PDF dup search)

**Date:** 2026-05-04
**Status:** Closed — all 5 canonicals verified correct, **no c-flips needed**.
**Stack:** v10.64.35 (post-Track H, broken=true metadata pointing at canonical duplicates)

## Background

Track H (v10.64.35, PR #156) discovered that 22 broken=true 2023-Sep entries are exact duplicates of canonical questions in the dataset (tagged 2020 / 2021-Dec / 2021-Jun / 2023-Jun-Basic). 13 were paired with canonicals via cross-PDF search; 9 remain broken without a found canonical match.

Of the 13 paired entries, **5 pairs had disagreeing `c` (correct-answer index)** between the broken duplicate and its canonical:

| Pair | Broken (2023-Sep) | Canonical | Disagreement |
|------|-------------------|-----------|--------------|
| 1 | idx 14 (c=2) | idx 2391 (t=2020, c=3) | ג vs ד |
| 2 | idx 50 (c=2) | idx 2393 (t=2020, c=3) | ג vs ד |
| 3 | idx 97 (c=1) | idx 2400 (t=2020, c=3) | ב vs ד |
| 4 | idx 132 (c=0) | idx 2404 (t=2021-Jun, c=1) | א vs ב |
| 5 | idx 2415 (c=1) | idx 2726 (t=2023-Jun-Basic, c=0, c_accept=[0,1,2,3]) | ב vs א (multi-accept) |

Because `broken=true` is filtered from the user-facing pool by `buildPool`, the disagreement was invisible to play UX but live in the data.

## Methodology

For each pair:
1. **Clinical-reasoning audit** of the canonical's q+options against current geriatric medicine guidelines (Hazzard 8e, Harrison 22e, IDSA, current pharmacology)
2. **IMA cross-check** against `final_answer_keys.csv` post-appeal answers — where the canonical's `t` mapped to a session in the dataset
3. **Track-A AI validator agreement check** — `track_a_disagreements.json` from prior session. The broken duplicates were already flagged here; their `ai_pick` was compared to the canonical's `c`.

## Per-pair findings

### Pair 1: idx 14 ↔ idx 2391 (2020 q#10) — pressure ulcer + sepsis

- **Question (canonical):** 78yo, advanced dementia, complex-nursing-care ward, stage 4 pressure ulcer at trochanter, fever 38.5, increased discharge, local erythema. Antibiotic approach?
- **Options:** [0] swab-guided, [1] anti-pseudomonas, [2] cefazolin, [3] empirical broad-spectrum
- **Canonical c=3** (broad-spectrum)
- **Broken c=2** (cefazolin)
- **IMA-published answer:** ג (idx 2 = cefazolin) — matches the broken
- **Track-A AI pick:** ד (idx 3) — matches the canonical
- **Clinical truth:** Stage 4 pressure ulcer with systemic infection (fever 38.5) in institutional setting is polymicrobial (gram+, gram-, anaerobes); narrow gram-positive coverage (cefazolin) is insufficient. Per Hazzard Ch 46, infected pressure ulcers with systemic signs require broad-spectrum empirical therapy.
- **Verdict:** ✅ **Canonical correct (curator override).** IMA's published answer is textbook-wrong. The broken duplicate accidentally matches IMA's wrong key.

### Pair 2: idx 50 ↔ idx 2393 (2020 q#25) — anemia in MRSA sepsis

- **Question (canonical):** 92yo, advanced dementia, 1mo in COVID ward, baseline Hgb 12.8, now stage 4 bilateral trochanter pressure ulcers + MRSA SEPSIS. Labs: WBC 12,800; Hgb 9.5; iron 32 (low); transferrin 152 (low, ref 220-400); ferritin 188 (high); B12 >1000; folate 3.6; albumin 26 (low). Diagnosis + treatment?
- **Options:** [0] MDS + erythropoietin, [1] IDA + IV iron, [2] can't diagnose without bone marrow, [3] ACD + treat infection
- **Canonical c=3** (ACD + treat infection)
- **Broken c=2** (can't diagnose without BMBx)
- **IMA-published answer:** ב (idx 1 = IDA) — neither pair-member matches
- **Track-A AI pick:** ד (idx 3) — matches the canonical
- **Clinical truth:** Lab pattern is textbook ACD: low iron + **low transferrin** + high ferritin (IDA would have **high transferrin** as compensatory upregulation). Treatment is treating the infection.
- **Verdict:** ✅ **Canonical correct (curator override).** IMA's IDA pick contradicts the labs (low transferrin rules out IDA). The broken's c=2 (BMBx requirement) is a third (also wrong) answer, likely an extraction error from the 2023-Sep PDF.

### Pair 3: idx 97 ↔ idx 2400 (2020 q#27) — fulminant CDI

- **Question (canonical):** 82yo, home with caregiver, advanced dementia, wheelchair, full-ADL-dependent, DM/HF/AFib. Recent prolonged abx for UTI. ER with deterioration: 5/day watery diarrhea + fever. BP 82/45 (hypotension), tachycardia, WBC 18,700, hyponatremia, K 3.2, Cr 2.0. Antibiotic of choice?
- **Options:** [0] PO metronidazole, [1] PO vancomycin, [2] PO metronidazole + loperamide, [3] PO vancomycin + IV metronidazole
- **Canonical c=3** (PO vanco + IV metronidazole)
- **Broken c=1** (PO vanco alone)
- **IMA-published answer:** א (idx 0 = PO metronidazole) — neither matches
- **Track-A AI pick:** (not in disagreements file for idx 97 — but canonical idx 2400 was not flagged either)
- **Clinical truth:** This is fulminant CDI (hypotension, profound leukocytosis, AKI, electrolyte derangement). Per IDSA 2017+ guidelines, fulminant CDI requires **PO vancomycin + IV metronidazole** (consider PR vanco if ileus suspected). PO metronidazole alone is no longer first-line for any CDI severity per IDSA 2017+.
- **Verdict:** ✅ **Canonical correct (curator override based on updated IDSA guidelines).** IMA's published answer predates the 2017 guideline update.

### Pair 4: idx 132 ↔ idx 2404 (2021-Jun q#23) — early amiodarone thyroid pattern

- **Question (canonical):** 82yo, no known PMHx, started anticoagulation + amiodarone for new-onset AFib. After 2 weeks: TSH 7.8 (high), FT4 2.3 (high), TT3 55 (low). Interpretation + intervention?
- **Options:** [0] thyrotoxicosis + add beta-blocker, [1] common side effect, observe only, [2] thyroiditis + methimazole, [3] rare life-threatening reaction; stop amiodarone, start levothyroxine
- **Canonical c=1** (common side effect, observe)
- **Broken c=0** (thyrotoxicosis + beta-blocker)
- **IMA cross-check:** 2021-Jun NOT in IMA CSV (only 2021-12-21 = December exam present). Not verifiable against IMA.
- **Track-A AI pick:** ב (idx 1) — matches the canonical
- **Clinical truth:** Within first weeks of amiodarone, the expected pattern is mildly elevated TSH + elevated FT4 + low T3 from Wolff-Chaikoff effect + impaired peripheral T4→T3 conversion (deiodinase inhibition). This is **expected, not pathologic**. Amiodarone-induced thyrotoxicosis (AIT) would have **suppressed TSH**, not elevated. Beta-blockers are inappropriate when TSH is high.
- **Verdict:** ✅ **Canonical correct on clinical grounds.** No IMA verification available, but Track-A AI agrees and the elevated-TSH interpretation rules out the broken's thyrotoxicosis pick.

### Pair 5: idx 2415 ↔ idx 2726 (2023-Jun-Basic q#24) — multi-cause AKI on rehab

- **Question (canonical):** 76yo post-hip-replacement on rehab, 75kg, baseline HTN with **bilateral renal artery stenosis**, on PO vanco for pseudomembranous colitis (resolved 2 days), on amikacin 500mg/d for UTI, on ibuprofen for pain. Cr 0.7→1.5. Most likely culprit?
- **Options:** [0] vancomycin, [1] amikacin, [2] ibuprofen, [3] dehydration
- **Canonical c=0** with **c_accept=[0,1,2,3]** (multi-accept)
- **Broken c=1** (amikacin)
- **IMA-published answer:** א (idx 0 = vanco) for 2023-06-13 Advanced q#24 — matches canonical primary
- **Clinical truth:** All four contribute (NSAIDs blocking prostaglandins in bilateral RAS = absolute contraindication; aminoglycoside nephrotoxicity; oral vanco minimal absorption normally but can absorb in colitic gut; volume depletion adds to all). The IMA appeal accepted all four answers, hence the curator's `c_accept=[0,1,2,3]`.
- **Verdict:** ✅ **Not a real conflict.** Multi-accept question; canonical c=0 matches IMA primary; broken c=1 is one of the accepted alternatives. The Track H broken_reason ("answer differs") is technically accurate but misleading — both answers are IMA-valid.

## Aggregate verdict

| Pair | Canonical c | Verdict | Action |
|------|-------------|---------|--------|
| 14 ↔ 2391 | c=3 | Curator override (IMA wrong) | Leave |
| 50 ↔ 2393 | c=3 | Curator override (IMA wrong) | Leave |
| 97 ↔ 2400 | c=3 | Curator override (IMA outdated) | Leave |
| 132 ↔ 2404 | c=1 | Clinically correct (no IMA cross-check) | Leave |
| 2415 ↔ 2726 | c=0 (c_accept all) | Multi-accept, not a real conflict | Leave |

**No questions.json content changes. No version bump. No release.**

## Why no release

- All 5 broken entries are filtered out of the user-facing pool by `buildPool` (broken=true gate, in place since v10.64.35).
- No user-facing answer keys change; the canonical `c` values were already correct.
- The disagreement was structural metadata noise — Track H surfaced it for audit, this audit confirms canonicals.

## Optional follow-up (not done in this session)

`broken_reason` on the 5 broken entries currently reads "canonical entry has same q+options but answer differs". Could be tightened to record the audit verdict — e.g.:

> "Duplicate of idx=2391 (t=2020); canonical c=3 verified correct (curator override; IMA's published ג is textbook-wrong for stage-4 pressure ulcer + sepsis per Hazzard Ch 46). See TRACK_J_FINDINGS.md."

Skipped because broken=true entries are user-invisible and metadata edits would require a release (questions.json content change → cache bust). Audit log here is the durable record.

## Open follow-ups (carried forward)

From `MEMORY.md` index, still pending after this session:

1. **Distractor regeneration** — 55.4% drift in distractors.json (Track I findings). Needs API budget. Deferred to user.
2. **9 broken=true without canonical match** — possible content gaps from incomplete IMA PDF ingestion of multi-part case stems. Investigation pending.
3. **Original 3 workstreams** from `.audit_logs/NEXT_SESSION_BRIEF.md` (OCR for 2021-Dec, CSV re-extract for 92 corrupted refs, hand-map 29 unmapped) — still open.

## Files

- This findings doc: `.audit_logs/TRACK_J_FINDINGS.md`
- Track-A disagreements (input): `.audit_logs/track_a_disagreements.json`
- IMA dataset (input): `.audit_logs/topic_analysis_2026-05-03/final_answer_keys.csv`
- v3 qnum mapping (input): `.audit_logs/dataset_to_qnum_mapping_v3.json`
