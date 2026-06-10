# AI-2026-hy high-yield bank — §3-style clinical answer-key sweep (2026-06-10)

**Result: 0 clean answer-key errors across all 474 questions. All KEEP. No edits.**
DOCUMENT-only audit record (no `q.c` flip, no rerun). Mirrors the 2026-06-01 §3 sweep
protocol and result (0 clean errors in 560 Qs).

## Cohort

The 474 `t="AI-2026-hy"` high-yield board MCQs (idx **3823–4296**, contiguous; appended to
`data/questions.json` by PR #331). All Harrison-22e/Hazzard-sourced, each carries a `ref`;
none bilingual; 12 carry `c_accept`; none `broken`. This batch postdated the 2026-05-31
content audit and had **never** had a §3-style clinical sweep — it had only the
generation-time blind opus key-audit (`audit_keys_blind.mjs`) + the `verify_questions.mjs`
key⟷explanation judge. This is the independent second pass.

## Method

8 parallel read-only Opus-tier adjudicators, ~60 Qs each (3823–3882, 3883–3942, 3943–4002,
4003–4062, 4063–4122, 4123–4182, 4183–4242, 4243–4296 — full coverage, no gaps/overlaps).
Each applied the §3 **strict clean-flip-only rubric** — recommend a flip ONLY if all four:
1. ≥90% confident the keyed `c` is medically wrong;
2. exactly one option unambiguously correct;
3. citable to a **verbatim** sentence in the repo's own corpora (`harrison_chapters.json`,
   `data/hazzard_chapters.json`, `data/notes.json`, `data/drugs.json`) — no paraphrase, no
   memory;
4. not in the curator-override registry (`.audit_logs/curator_overrides.json`, 110 entries,
   max idx 3684 — **zero** fall in 3823–4296).
Anything failing any condition → KEEP. The v9.81 fabricated-option incident is the reason the
bar is this conservative.

## Result

| batch | idx | reviewed | clean flips |
|---|---|---:|---:|
| 1 | 3823–3882 | 60 | 0 |
| 2 | 3883–3942 | 60 | 0 |
| 3 | 3943–4002 | 60 | 0 |
| 4 | 4003–4062 | 60 | 0 |
| 5 | 4063–4122 | 60 | 0 |
| 6 | 4123–4182 | 60 | 0 |
| 7 | 4183–4242 | 60 | 0 |
| 8 | 4243–4296 | 54 | 0 |
| **total** | **3823–4296** | **474** | **0** |

Where the corpora *do* speak, they **confirm** the keys (e.g. MoCA <26, TUG ≥12 s,
orthostatic ≥20 mmHg, haloperidol 0.25–0.5 mg, DLB neuroleptic sensitivity, DIAPPERS,
mirabegron-in-cognitive-risk, FRAX 20%/3%, denosumab rebound, Mg(OH)₂ contraindicated in CKD,
CBT-I first-line, ICD >40 d post-MI + EF ≤35%, PSP downgaze palsy). `c_accept` honored
throughout (RBD melatonin/clonazepam, lenient rate control, COPD escalation, etc.).

## HONEST CAVEAT — what "0 flips" does and does not mean

This is the load-bearing limitation, stated plainly (`feedback_claim_within_evidence`):

- **`data/hazzard_chapters.json` holds PARTIAL chapter extracts**, not full chapters — each
  ~1,300–2,200 words, frequently only the chapter tail (palliative sections + reference
  lists), several starting mid-sentence or bleeding into the next chapter. For a large
  fraction of questions the specific adjudicating fact (GOLD staging, LTOT PaO₂ criteria,
  RCRI scoring, MET thresholds, ASMI cutoffs, BP-target numbers, AABB transfusion numbers,
  screening thresholds, opioid conversions) is **not verbatim present**. For those, rubric
  condition 3 is **structurally unmeetable → mandatory KEEP regardless of the key's
  correctness.**
- **`data/notes.json` (board-pearl topic notes) partially mitigated this** — it verbatim-
  confirmed many keys the Hazzard extracts could not (delirium, incontinence, falls,
  osteoporosis, sleep). But it does not cover every topic.
- **Consequence:** "0 clean flips" = "no keyed answer was found medically wrong against
  *standard guideline medicine* AND refutable by a *verbatim in-repo source*, under a
  conservative rubric." It is **NOT** "every key independently verified against full
  Hazzard/Harrison." The agents did also sanity-check each key against standard board
  medicine (and flagged none as wrong), so the sweep is not purely corpus-gated — but a
  future sweep against a full-text textbook corpus could surface items this one could not
  source-adjudicate. This caveat is identical to the one inherent in the 2026-06-01 §3 sweep.

## Near-misses — flagged for physician eyeball, NOT auto-flipped (all multi-defensible)

None met the clean-flip bar; each is recorded for Eias's clinical judgment (the same way idx
2237 and 1273 were surfaced before he adjudicated them):

- **idx 4083 (transfusion threshold)** — strongest near-miss. Keyed [0] "Hgb<8, or <9 with
  CAD"; the *literal* Hazzard/AABB verbatim is [3] "7 g/dL general, 8 g/dL with end-organ
  ischemia." KEPT because the 8/9-with-cardiac convention is standard for comorbid geriatric
  patients and both are defensible (condition 2 fails) — but the keyed letter diverges from
  the literal number in the cited chapter.
- **idx 4033 / 4043 (BP targets)** — keyed 150 / <140 vs the corpus's stated AHA-2017 goal of
  130. Guideline-vintage difference; multi-defensible; KEPT. (Pattern worth noting per
  `feedback_medical_knowledge_prior_currency` — the AI-gen Qs may encode slightly older BP
  targets.)
- **idx 3845 (sarcopenia label)** — keyed calls grip<27-without-low-mass "confirmed"; EWGSOP2
  would call it "probable," but "probable" is **not among the options**, so no clean flip.
- Minor / non-actionable: **4136** (elder-abuse epidemiology figures plausible but not
  verbatim in-repo), **3954** (fiber RDA endpoint overlap), **3998** (NSAID eGFR<45 keyed vs
  corpus absolute-avoid <30 — direction still correct), **4223** (distractor-phrasing wrinkle:
  patient "refuses injections" but the keyed fallback fondaparinux is itself SC — key content
  correct, distractor phrasing only).

## DO-NOTs / scope

- No `q.c` flip applied; no `broken` change; no `c_accept` change; no rerun; no trinity bump
  (this is an audit record, no content changed).
- The partial-corpus limitation is a property of the in-repo textbook extracts, not a defect
  found in the bank. A full-text-corpus re-sweep is a separate future option, not warranted by
  any finding here.
- Don't re-run this 474-cohort — record, not queue (same status as the §3 560-cohort).
