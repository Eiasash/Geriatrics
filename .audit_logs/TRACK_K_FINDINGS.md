# Track K — pair the 9 unpaired broken=true entries via option-text overlap

**Date:** 2026-05-04
**Status:** Closed — all 9 entries paired with canonicals, metadata updated, shipped v10.64.36.
**Outcome:** 0 broken=true entries without canonical pointer remain. 4 new c-conflicts surfaced for follow-up audit.

## Background

Track H (v10.64.35, PR #156) discovered that 22 broken=true 2023-Sep entries are duplicates of canonical questions in the dataset. The Track H matcher used q-stem n-gram overlap and successfully paired 13 of 22 entries. The remaining 9 had truncated q-stems — the parser dropped the multi-part case body, leaving only "<lab values> + <bare question>" as the q field. With nothing to bite on at the q-stem layer, Track H fell through to "no canonical match" and Track J recommended these be carried forward as possible content gaps.

Track K finishes the job using **option-text overlap as the matching signal**. Rationale: when one column of a record is truncated, the surviving column becomes the high-signal field. Option text survives stem truncation in this dataset.

## Method

For each of the 9 unpaired brokens, scored every non-broken candidate by:
1. **Match count:** how many of the broken's 4 options have a matching candidate option (Jaccard ≥ 0.5 OR ≥ 2 shared tokens of length ≥ 3)
2. **Score sum:** total Jaccard score across the 4 option positions
3. **Tie-break:** prefer earliest-year canonical (oldest is original)

Threshold for declaring a match: ≥ 3 of 4 options aligned, score sum > 2.5.

Algorithm in `.audit_logs/TRACK_K_FINDINGS.md` body; apply script at `.audit_logs/track_k_apply.py`.

## Findings

All 9 entries paired:

| Broken | Canonical | t (canonical) | ti | Score | Conflict? |
|--------|-----------|---------------|-----|-------|-----------|
| 63  | 2395 | 2020      | 17 | 4/4, sum 3.67 | **YES** (c=0 vs c=2) |
| 66  | 2396 | 2020      | 22 | 4/4, sum 4.00 | no  (c=1 = c=1) |
| 85  | 2399 | 2020      |  4 | 4/4, sum 3.88 | no  (c=2 = c=2) |
| 126 | 2402 | 2021-Jun  | 24 | 4/4, sum 4.00 | **YES** (c=2 vs c=0) |
| 128 | 2403 | 2021-Jun  | 15 | 4/4, sum 4.00 | **YES** (c=0 vs c=1) |
| 139 | 2405 | 2021-Jun  | 16 | 4/4, sum 4.00 | **YES** (c=3 vs c=1) |
| 140 | 2406 | 2021-Jun  | 38 | 4/4, sum 4.00 | no  (c=2 = c=2) |
| 179 | 2408 | 2021-Jun  |  8 | 4/4, sum 4.00 | no  (c=1 = c=1) |
| 183 | 2409 | 2021-Jun  |  5 | 4/4, sum 4.00 | no  (c=3 = c=3) |

**5/9 are clean duplicates** (broken c matches canonical c) — same drug, same diagnosis, same answer, just truncated stem.
**4/9 are c-conflicts** — Track J pattern repeats: broken duplicate has different answer key than canonical.

## Side-finding: tertiary duplicates in 2021-Dec

The matcher surfaced several non-broken 2021-Dec entries that are also condensed/abbreviated forms of the 2021-Jun originals (idx 285, 287, 299, 347). These are **non-broken** (still in user pool) and appear to be intentional curator-condensed summaries, not parser truncations. Out of scope for this track — flag for separate audit if dataset wants to standardize on full-stem versions.

## What shipped (v10.64.36)

`broken_reason` metadata updated on all 9 entries:

- Clean duplicates (5): `"Duplicate of idx=N (t=X, ti=Y) — canonical entry has same options and same answer (c=Z); broken stem is truncated case-fragment from 2023-Sep PDF, flagged broken to keep canonical authoritative. Found via Track K option-text-overlap match (Track H q-stem matcher missed). See TRACK_K_FINDINGS.md."`

- c-conflicts (4): `"Duplicate of idx=N (t=X, ti=Y) — canonical entry has same options but answer differs (broken c=B vs canonical c=C); flagged broken to keep canonical authoritative. Found via Track K option-text-overlap match (Track H q-stem matcher missed: truncated stem). c-conflict logged for separate audit; see TRACK_K_FINDINGS.md."`

**No q/o/c/e/ref/t/ti changes. broken=true unchanged. Canonicals unchanged.** The user-facing pool is identical to v10.64.35; only internal metadata is more accurate now.

## Open: 4 new c-conflicts for future audit

These join the Track J registry. Same triangulation rule applies before any flips: clinical reasoning + IMA cross-check + Track-A AI validator agreement.

### Conflict 1: idx 63 ↔ 2395 (2020 q#17) — post-vascular discharge meds

- Canonical c=2 (RAMIPRIL only)
- Broken c=0 (LERCANIDIPINE + BISOPROLOL)
- Case: 81F post-knee-replacement, on lerc for HTN, discharged on aspirin + clopidogrel + atorvastatin (suggests vascular event during admission). Question: which list completes the recommended discharge meds?
- Tradeoff: both ACE-I and BB are guideline-directed for post-MI/post-stent; canonical's RAMIPRIL-only suggests switching CCB→ACE-I; broken's LERC+BB keeps CCB and adds BB. Worth IMA cross-check.

### Conflict 2: idx 126 ↔ 2402 (2021-Jun q#24) — urgent dialysis indication

- Canonical c=0 (fluid overload)
- Broken c=2 (creatinine elevated, not decreasing)
- Case: 72M severe AS + 5d diarrhea + AKI + post-fluid-resus pulmonary edema (per condensed 285 version: "למחרת גודש ריאתי")
- Clinical truth: AEIOU mnemonic — fluid overload is a classic absolute indication; persistent creatinine alone is not. Canonical c=0 likely correct.

### Conflict 3: idx 128 ↔ 2403 (2021-Jun q#15) — MM bone-event prophylaxis

- Canonical c=1 (pamidronate)
- Broken c=0 (denosumab)
- Case: 70F with multiple myeloma, T8 fracture, multiple lytic lesions, on chemo (DEXA+BORTEZOMIB per condensed 287 version)
- Clinical truth: MM bone-event prophylaxis traditionally bisphosphonates (pamidronate, zoledronic acid). Denosumab is non-inferior in modern data and may be preferred in CKD. Either could be defensible; depends on era of guidelines and renal function. Worth IMA cross-check.

### Conflict 4: idx 139 ↔ 2405 (2021-Jun q#16) — PMR diagnostic feature

- Canonical c=1 (negative ANA)
- Broken c=3 (microcytic anemia)
- Case: 84M, weakness 2 months, shoulder pain mornings, HB 10.1 MCV 65, CRP 65, RF+, ANA-, EMG: inflammatory myopathy
- Clinical truth: PMR diagnosis criteria — elevated ESR/CRP, age > 50, morning stiffness > 45 min, bilateral shoulder pain. Negative ANA helps exclude SLE/connective tissue disease overlap. Microcytic anemia (low MCV) is NOT a PMR criterion (PMR usually has normocytic anemia of chronic inflammation). Canonical c=1 likely correct on clinical grounds; needs IMA verification.

## Files

- This findings doc: `.audit_logs/TRACK_K_FINDINGS.md`
- Apply script: `.audit_logs/track_k_apply.py`
- Backup: `data/questions.json.bak-20260504T070653Z`
- Sister track: `.audit_logs/TRACK_J_FINDINGS.md` (5 c-conflicts from Track H, all verdicted "canonical correct")

## Stop & converge

After v10.64.36, the broken=true investigation is **structurally complete** — all 22 entries surfaced by Track H now have canonical pointers in their `broken_reason` metadata. What remains:

- **8 c-conflicts total** awaiting triangulated audit (5 from Track J kept "canonical correct" via spot-check; 4 from Track K not yet audited)
- Original 3 workstreams from `.audit_logs/NEXT_SESSION_BRIEF.md` (OCR for 2021-Dec, CSV re-extract 92 refs, hand-map 29 unmapped)
- Distractor regeneration ($$$ — deferred to user)

Decision rule for the c-conflicts: do not auto-flip. Apply the Track J rule — three signals must converge (clinical reasoning + IMA + Track-A) before declaring a flip warranted.
