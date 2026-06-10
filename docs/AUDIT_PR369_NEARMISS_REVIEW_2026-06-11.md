# PR #369 near-miss key review (2026-06-11)

PR #369 says "6" near-misses, but `docs/AUDIT_AI2026HY_CLINICAL_SWEEP_2026-06-10.md`
names eight indices across the near-miss section. This review covers every named index:
3845, 3954, 3998, 4033, 4043, 4083, 4136, and 4223.

Flip standard applied: flip only when the current key is medically wrong, exactly one
offered option is unambiguously correct, and the decision is supported by verbatim in-repo
source text.

## Decisions

| idx | decision | source text | rationale |
|---:|---|---|---|
| 3845 | KEEP | `data/notes.json` Frailty & Sarcopenia: "Diagnostic pathway: SARC-F screen -> grip strength (case-finding) -> DXA/BIA muscle mass (confirmation) -> gait speed or SPPB (severity grading)." | Keyed "confirmed sarcopenia" is not EWGSOP2-clean because mass is normal, but the correct label would be probable sarcopenia and no option says that. Option 3 uses the obsolete/near label "Pre-sarcopenia." No single clean option. |
| 3954 | KEEP | `data/notes.json` Constipation: "Step 1 -- Lifestyle: adequate hydration (1.5-2 L/day), dietary fibre 25-30 g/day..." | The source gives 25-30 g/day. Keyed 20-25 and distractor 30-38 each overlap only one endpoint; no verbatim-backed single best flip. |
| 3998 | KEEP | `data/hazzard_chapters.json` Ch 52: "Patients with chronic kidney disease (CKD) stage IV or V (estimated glomerular filtration rate < 30 cc/min) should avoid NSAIDs." Same section: "Patients with cardiovascular disease are also at increased risk for cardiovascular adverse events..." | The keyed option overstates a hard eGFR <45 contraindication, but this patient has CKD 3b plus HF/HTN and all other options endorse oral NSAID use. Direction remains correct; no alternative is better. |
| 4033 | KEEP | `data/hazzard_chapters.json` Ch 79: "Its recommendation for ambulatory, community-living older adults is a SBP goal of 130 mm Hg." `data/notes.json` Hypertension: "Isolated systolic HTN (SBP >=160, DBP <90) is the dominant pattern..." | The source supports a treatment goal, not a verbatim initiation threshold for ISH. Several lower thresholds would imply treatment at SBP 158. Not a clean flip from keyed 150. |
| 4043 | FLIP `c:0 -> 3` | `data/hazzard_chapters.json` Ch 79: "Its recommendation for ambulatory, community-living older adults is a SBP goal of 130 mm Hg." `data/notes.json` Hypertension: "Target BP: <130/80 for most elderly..." | The stem is a 78-year-old community clinic patient with HTN, T2D, and MCI, without frailty or limited life expectancy. Source-backed target is <130, so option 3 is uniquely best over current <140. |
| 4083 | KEEP | `data/hazzard_chapters.json` Ch 94: "AABB--7 g/dL for the general population and 8 g/dL for patients with symptoms of end-organ ischemia." `data/notes.json` Anemia: "restrictive strategy (transfuse if Hgb <7-8 g/dL) preferred in stable elderly; higher threshold in acute MI, angina, or major surgery." | The keyed 8/9-CAD convention diverges from the literal AABB 7/8 wording, but the stem includes fatigue/dyspnea and Hazzard says thresholds differ case-by-case in older adults. Option 3 says stable/asymptomatic <7 and is not uniquely better. |
| 4136 | KEEP | `data/notes.json` Elder abuse: "Prevalence: up to 10% of community elderly experience some form annually, but only 1 in 14 cases reported." | This directly confirms the keyed option. |
| 4223 | KEEP | `data/notes.json` Perioperative care: "DVT prophylaxis: mandatory (LMWH or fondaparinux)." Same note: "pharmacologic (enoxaparin SC, warfarin, fondaparinux, rivaroxaban) depending on surgery type and bleeding risk." | Repo source supports pharmacologic prophylaxis and includes rivaroxaban/fondaparinux, but does not verbatim source the 35-day hip-replacement protocol. The "refuses injections" / fallback-SC wording is awkward, not a key flip. |

Net change: one answer-key flip, idx 4043, with trinity bump 10.64.163 -> 10.64.164.
