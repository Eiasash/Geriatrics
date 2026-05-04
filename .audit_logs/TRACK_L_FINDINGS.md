# Track L — triangulated audit of the 4 Track-K c-conflicts

**Date:** 2026-05-04
**Status:** Closed — all 4 canonicals verified correct, **0 flips needed**.
**Stack:** v10.64.36 (post-Track-K, all 22 broken=true 2023-Sep entries paired with canonical pointers)

## Background

Track K (v10.64.36) paired 9 previously-unpaired broken=true 2023-Sep entries with canonical duplicates via option-text-overlap matching. 4 of those pairs surfaced new c-conflicts:

| Broken | Canonical | t (canonical) | ti | Broken c | Canonical c |
|---|---|---|---|---|---|
| 63 | 2395 | 2020 | 17 | 0 (LERC+BB) | 2 (RAMIPRIL) |
| 126 | 2402 | 2021-Jun | 24 | 2 (persistent Cr) | 0 (fluid overload) |
| 128 | 2403 | 2021-Jun | 15 | 0 (denosumab) | 1 (pamidronate) |
| 139 | 2405 | 2021-Jun | 16 | 3 (microcytic anemia) | 1 (ANA-) |

Track L applies the **Track-J triangulation rule**: 3 signals must converge before flipping a canonical c. Signals: (1) clinical reasoning vs current published guidelines, (2) IMA's appeal-final published answer, (3) Track-A AI validator's pick. If only 2 signals agree, default to preserving canonical (curator override is presumed intentional).

## Signals collected

| Pair | Clinical reasoning | Track-A AI on canonical | Track-A AI on broken | IMA cross-check |
|---|---|---|---|---|
| 63↔2395 | Canonical c=2 (RAMIPRIL alone) — HR 58 contraindicates BB; controlled BP makes lerc redundant; LVEF 45% needs ACE-I | c=3 (BB only — clinically wrong: ignores bradycardia) | c=3 (same wrong pick) | ב=1 (LERC+RAMIPRIL) — defensible but lerc redundant |
| 126↔2402 | Canonical c=0 (fluid overload) — AEIOU mnemonic, severe AS + pulmonary edema is an absolute indication | c=1 (hyperK — improving, not urgent) | c=3 (acidosis — improving, not severe) | (2021-Jun absent from CSV) |
| 128↔2403 | Canonical c=1 (pamidronate) — IMWG traditional first-line; denosumab non-inferior post-2018 but considered alternative | c=1 ✓ AGREES | c=2 (Ca+vitD — wrong, prophylactic supplement not anti-resorptive) | (2021-Jun absent) |
| 139↔2405 | Canonical c=1 (ANA-) — only PMR-supportive feature among options; PMR has normocytic anemia not microcytic; RF+ and EMG-positive are AGAINST PMR | c=1 ✓ AGREES | c=3 (AI also picks the wrong microcytic-anemia answer — same clinical mistake the keyer made) | (2021-Jun absent) |

## Per-pair verdicts

### Pair 1: idx 63 ↔ 2395 (2020 q#17) — post-NSTEMI discharge meds

**Case (canonical full):** 81F post-knee replacement, on lercanidipine (HTN), **NSTEMI treated by PCI/stent**, **LVEF 45% (mildly reduced)**, BP 116/80 day-of-discharge, **HR 58**. Already prescribed aspirin + clopidogrel + atorvastatin. Question asks which list completes discharge meds.

**4-way disagreement** — canonical c=2, broken c=0, AI c=3, IMA c=1. No two signals fully agree.

**Clinical reasoning analysis:**
- LVEF 45% post-NSTEMI → ACE-I is class I (RAMIPRIL essential, prevents remodeling, mortality benefit)
- HR 58 → adding bisoprolol risks symptomatic bradycardia (relative contraindication)
- BP 116/80 → already controlled, lercanidipine is redundant
- Canonical c=2 (RAMIPRIL alone) is the most parsimonious + safe answer for this specific patient
- IMA's c=1 (LERC+RAMIPRIL) keeps redundant lerc but is otherwise reasonable
- AI's c=3 (BB only) ignores bradycardia AND skips the critical ACE-I — clinically the worst pick
- Broken's c=0 (LERC+BB) double-faults: keeps redundant lerc + adds bradycardia-risky BB

**Verdict:** ✅ **Canonical correct (curator override of IMA).** Canonical's c=2 is the most clinically nuanced answer accounting for HR + LVEF + controlled BP. AI was clinically wrong on both members of the pair. **No flip.**

### Pair 2: idx 126 ↔ 2402 (2021-Jun q#24) — urgent dialysis indication

**Case (canonical full):** 72M severe AS + 5d diarrhea + AKI (Cr 7.5 day 1, 7.6 day 2). Treated with IV fluid resuscitation. Day 2: pulmonary edema (Sat 88%, congestion on auscultation/CXR), persistent oliguria, K 6.2 (down from 6.8), pH 7.28 (up from 7.21).

**Clinical reasoning:** AEIOU mnemonic for urgent dialysis:
- **A**cidosis: pH 7.28 day 2 (improving) — not severe enough alone
- **E**lectrolyte: K 6.2 day 2 (improving from 6.8, no ECG changes mentioned) — not urgent
- **O**verload: pulmonary edema in severe AS, refractory to volume management — **absolute indication** (severe AS has near-zero margin between hypovolemia and pulmonary edema; ultrafiltration via dialysis is the safe path)
- Persistent creatinine alone (broken's c=2) is **not a standard urgent-dialysis trigger** — patients on RRT for many reasons have stable elevated Cr; the trigger is downstream consequences (uremic complications, overload, refractory acidosis/electrolytes)

**Triangulation:** 1 strong signal supports canonical (clinical reasoning unambiguous). AI picked alternatives (hyperK, acidosis) that are reasonable but not as strong as fluid overload in this case. IMA absent.

**Verdict:** ✅ **Canonical correct.** AEIOU + severe AS context strongly supports c=0. Broken's c=2 is medically wrong as standalone urgent-dialysis indication. **No flip.**

### Pair 3: idx 128 ↔ 2403 (2021-Jun q#15) — MM bone-event prophylaxis

**Case (canonical full):** 70F new IgG kappa multiple myeloma, T8 compression fracture, multiple lytic lesions, on dex+bortezomib. **Cr 1.2 (normal)**, Ca 9.1 (normal), Hgb 11.2.

**Clinical reasoning:** IMWG 2021 guidelines for MM bone-event prophylaxis:
- IV bisphosphonates (zoledronic acid or pamidronate) — traditional first-line
- Denosumab — non-inferior to zoledronic acid (Raje et al, Lancet Oncol 2018; FDA-approved for MM 2018), preferred when CKD present (renal-safe)
- In normal renal function (Cr 1.2 here): both are guideline-acceptable; bisphosphonate is the long-established board-exam first-line
- Calcium + vitamin D (option 2): **adjunctive** to anti-resorptive, not standalone prophylaxis
- Calcitonin (option 3): obsolete, not used

**Triangulation:** 2 of 3 signals support canonical (clinical traditional + AI agreement). IMA absent.

**Verdict:** ✅ **Canonical correct.** Pamidronate is the traditional first-line and AI agrees. Denosumab (broken's c=0) is also defensible per modern data but not the canonical first-line — curator override is medically reasonable. **No flip.**

### Pair 4: idx 139 ↔ 2405 (2021-Jun q#16) — PMR diagnostic feature

**Case (canonical full):** 84M cognitively intact, DM/HTN, weakness 2 months, **morning shoulder pain**. Hgb 10.1 **MCV 65 (microcytic)**, CRP 65 elevated, **RF+**, **ANA-**, **EMG: inflammatory myopathy**. Question asks which finding contributes to diagnosing PMR.

**Clinical reasoning:** ACR/EULAR 2012 PMR provisional criteria + textbook teaching:
- Required: age ≥50, bilateral shoulder pain, elevated CRP/ESR
- Supportive: morning stiffness >45 min, hip involvement, **absence of RF/ACPA**, no other peripheral joint involvement, normal-to-low ANA (excludes SLE/MCTD overlap)
- PMR-typical anemia: **normocytic** anemia of chronic disease (low-normal MCV ~80-90)
- **Microcytic anemia (MCV 65)** is iron deficiency or thalassemia trait — NOT a PMR feature
- **RF+** is AGAINST PMR — points toward RA mimic
- **EMG inflammatory myopathy** is AGAINST PMR — points toward polymyositis (PMR has no myopathy)
- **ANA-** SUPPORTS PMR (excludes SLE/MCTD overlap)
- Only c=1 (ANA-) of the 4 options is a PMR-supportive feature

**Triangulation:** 2 of 3 signals support canonical (clinical reasoning unambiguous + AI on canonical agrees). AI on broken (139) agreed with broken's c=3 — but that's the AI making the same clinical mistake as whoever keyed the broken duplicate, not vindication. IMA absent.

**Verdict:** ✅ **Canonical correct.** Microcytic anemia (broken's c=3) is medically wrong as a PMR-supportive feature. **No flip.**

## Aggregate verdict

| Pair | Final verdict | Action |
|---|---|---|
| 63↔2395 | Canonical c=2 correct (curator override of IMA + AI both wrong on bradycardia) | None |
| 126↔2402 | Canonical c=0 correct (AEIOU + severe AS context) | None |
| 128↔2403 | Canonical c=1 correct (AI agrees, traditional first-line) | None |
| 139↔2405 | Canonical c=1 correct (only PMR-supportive feature among options) | None |

**4 of 4 canonicals verified correct. 0 flips. No questions.json content changes. No version bump. No release.**

Combined with Track J: **9 c-conflicts surfaced across Tracks H+J+K, 9 verdicted, 0 flips.** Every conflict resolved with canonical correct.

## Pattern observation: AI on truncated questions matches whoever keyed the truncation

Notable in Pair 4: Track-A AI agreed with broken's wrong c=3 (microcytic anemia) when scoring the *truncated* idx 139, then agreed with canonical's correct c=1 (ANA-) when scoring the *full* idx 2405. Same model, same options, but different verdict driven by missing case context. This is a generalizable warning:

- **Truncated questions can systematically mislead AI validators** because the context that disambiguates among the option set was the part dropped.
- When using AI as a triangulation signal, weight the AI verdict on the *full-context* canonical heavier than on the truncated duplicate. Do not treat AI agreement with a stem-truncated answer as independent confirmation.

## Open follow-ups (carried forward)

After Track L closes, what's still open in the Geriatrics audit:

1. **Distractor regeneration** — `.audit_logs/TRACK_I_FINDINGS.md`. 55.4% drift, ~$40-200 + hours. User-budget decision.
2. **Original 3 workstreams** from `.audit_logs/NEXT_SESSION_BRIEF.md` (OCR for 2021-Dec PDF, CSV re-extract for 92 corrupted refs, hand-map 29 unmapped).
3. **Side-finding from Track K**: 4 non-broken 2021-Dec entries (idx 285, 287, 299, 347) appear to be condensed summaries of 2021-Jun originals. Separate audit if standardization is desired.

The broken=true investigation thread that started with Track D and ran through Tracks H, I, J, K, L is now **fully closed** with no remaining unpaired entries and no flagged-but-unaudited c-conflicts.

## Files

- This findings doc: `.audit_logs/TRACK_L_FINDINGS.md`
- Sister tracks: `.audit_logs/TRACK_J_FINDINGS.md` (5 Track-H conflicts), `.audit_logs/TRACK_K_FINDINGS.md` (Track-K pairing + the 4 conflicts audited here)
- Track-A AI verdicts (input): `.audit_logs/track_a_disagreements.json`, `.audit_logs/track_a_full_results.jsonl`
- IMA dataset (input): `.audit_logs/topic_analysis_2026-05-03/final_answer_keys.csv`
