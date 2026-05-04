# Next-session brief — Geriatrics audit, current state

_Last updated 2026-05-04 at end of session that shipped v10.64.18 → v10.64.37._

## Where we are

Live: **v10.64.37** (verified live 55s post-push). Tests at 1110/1110 pass. Trinity verified.

Cumulative state:
- 3743 questions total (3721 user-pool, 22 broken=true filtered)
- 145 questions have `c_accept` populated (multi-accept)
- 486 questions have page-specific Hebrew canonical refs
- 0 multi-pipe refs left (was 484 at start of v10.64.15)
- All 22 broken=true 2023-Sep entries paired with canonical idx pointers in `broken_reason` metadata
- 0 broken=true entries without canonical pointer remain

## What was closed since the prior brief (v10.64.17)

| Track | Release | Action |
|---|---|---|
| 18+ | v10.64.18–v10.64.30 | Various sibling-fork fixes, ref backfills, SW critical-shell, syllabus drift guard, lsSet migration, debug console, 16 imgs[]→img normalization (see CHANGELOG) |
| 21 | v10.64.21 | Closed Workstream 2: final 2 multi-pipe refs (idx 2694, 2758) hand-cleaned. **Workstream 2 is now 100% done** (was reported 99.6% in prior brief). |
| H | v10.64.35 (PR #156) | 22 broken=true 2023-Sep entries flagged. 13 of 22 paired to canonicals via q-stem n-gram matching. |
| I | (no release, audit-only) | Distractor drift documented — 55.4% of Qs (2074/3743) have ≥1 drifted distractor; 23.2% (870) have all 3 wrong-option slots wrong. Root cause: ~90 deletions across v10.64.2/4/7/8/11 shifted indices, distractors.json wasn't regenerated. Findings at `.audit_logs/TRACK_I_FINDINGS.md`. |
| J | (no release, audit-only) | Triangulated audit of 5 Track-H c-conflicts. All 5 canonicals verified correct (3 curator overrides where IMA was textbook-wrong; 1 clinically correct without IMA cross-check; 1 multi-accept question, no real conflict). 0 flips. Findings at `.audit_logs/TRACK_J_FINDINGS.md`. |
| K | v10.64.36 | Paired the remaining 9 unpaired brokens via option-text-overlap matching. All 9 paired. 5 clean duplicates, 4 new c-conflicts surfaced. Apply at `.audit_logs/track_k_apply.py`; findings at `.audit_logs/TRACK_K_FINDINGS.md`. |
| L | (no release, audit-only) | Triangulated audit of 4 Track-K c-conflicts. All 4 canonicals verified correct. 0 flips. Findings at `.audit_logs/TRACK_L_FINDINGS.md`. |
| M | v10.64.37 | Investigated Track-K side-finding: 4 condensed 2021-Dec entries verdicted as intentional curator second-editions (not parser by-products). Fixed 1 mis-routed ref on idx 347 (Ch 44 SLEEP → Ch 22 MEDICATION PRESCRIBING). Apply at `.audit_logs/track_m_apply.py`; findings at `.audit_logs/TRACK_M_FINDINGS.md`. |

**broken=true investigation thread is fully closed.** All 22 entries paired. All 9 surfaced c-conflicts triangulated. 0 flips applied across the entire investigation.

## Authoritative artifacts (do not rebuild from scratch)

| File | Purpose | Contains |
|---|---|---|
| `.audit_logs/dataset_to_qnum_mapping_v3.json` | **Authoritative** mapping (v2 + augmentations) | 1261 mappings |
| `.audit_logs/track_a_disagreements.json` | AI validator picks vs canonical c | Used for triangulation in Tracks J+L |
| `.audit_logs/track_a_full_results.jsonl` | Full track-A AI results | Includes idx-to-ai-pick mapping for non-disagreements too |
| `.audit_logs/topic_analysis_2026-05-03/final_answer_keys.csv` | IMA appeal-final answers | 950 Geri rows; missing 2021-Jun and 2023-Sep sessions |
| `.audit_logs/TRACK_J_FINDINGS.md` | Triangulation rule + 5-pair audit | Reference for any future c-conflict audit |
| `.audit_logs/TRACK_K_FINDINGS.md` | 9-pair option-overlap pairing | Apply script reusable for future broken-pairing |
| `.audit_logs/TRACK_L_FINDINGS.md` | 4-pair triangulation + AI-on-truncated-questions warning | Reference |
| `.audit_logs/TRACK_M_FINDINGS.md` | 4 condensed 2021-Dec entries verdicted | Reference for intentional vs parser distinction |

## Open workstreams (re-prioritized as of v10.64.37)

### Workstream A — Distractor regeneration ($$$, deferred)

`distractors.json` content drift documented at `.audit_logs/TRACK_I_FINDINGS.md` and `.audit_logs/track_i_drift_findings.json`. 55.4% drift; 23.2% (870 Qs) have all 3 wrong-option slots wrong. Fix = re-run `scripts/generate_distractors.cjs` (Claude API per question, ~$40-200, hours of runtime).

**Decision needed from user:** API budget approval to regenerate.

### Workstream B — Hand-map 24 non-2021-Dec unmapped questions (low ROI)

After v3 augmentation, 24 of original 29 non-2021-Dec unmapped remain. These are hard cases — image-only Qs, very short stems, or curator-rewrites with no token overlap. Estimated 10-15 are recoverable via manual visual matching against `exam_pdfs/`. Marginal vs time cost.

### Optional — verify auto-audit ↔ Geri-repo syllabus parity

**Verified 2026-05-04:** No drift. Cross-language algorithm alignment is preserved (Python `allocate_hours` byte-identical to JS test fixture when given same syllabus). All 3 PWA slices (Geri/Pnimit/Mishpacha) in `auto-audit/scripts/syllabus_data.json` match their respective live `data/questions.json` `ti` distributions exactly.

An earlier finding in this brief claimed drift; that was a methodology error (position-zipped two arrays sorted slightly differently — looked like value swaps but was just sort-order). Nothing to fix.

### CLOSED workstreams (do not reopen unless reason changed)

- **Workstream 1 — OCR for 2021-Dec PDF.** SUPERSEDED by v3 bundle parser (already used; 13 of original 60 picked up via augmentation). 47 still unmapped, low ROI.
- **Workstream 2 — Source CSV re-extraction.** **CLOSED** (482/484 done in v10.64.15+16; final 2 done in v10.64.21).
- **Workstream 3 (formerly "Workstream 4") — `syllabus_data.json` refresh.** **CLOSED** (done in v10.64.18 with CI guard; per-topic n_questions match live `ti` distribution exactly with broken=true counted in dataset analytics; user-pool delta of 22 is the broken=true count). The brief's "Cross-repo dependency on auto-audit" framing was wrong — this was a local-only fix.
- **Workstream — auto-audit syllabus parity.** **NO ACTION NEEDED.** Verified 2026-05-04 that all 3 PWA slices in auto-audit's syllabus match their live questions.json data. Earlier "drift" finding in this brief was a position-zip diff false-positive (real-data drift was zero; arrays were just sorted differently).
- **broken=true investigation thread (Tracks D/H/J/K/L/M).** Fully closed as of v10.64.37.

## What NOT to do

- **DO NOT** auto-flip any of the 94 c_wrong cases — they're curator overrides per `project_geriatrics_94_c_wrong_curator_overrides.md`. If user wants UI transparency, ADD `c_accept` (let users pick either) rather than flip `c`.
- **DO NOT** rebuild the v2/v3 mapping from scratch. v3 is authoritative; augment it (with future OCR or new bundle parses) rather than replace.
- **DO NOT** auto-flip the 9 c-conflicts surfaced by Tracks H+K. All 9 audited (Tracks J+L). 0 should be flipped per the triangulation rule.
- **DO NOT** treat the 4 condensed 2021-Dec entries (idx 285, 287, 299, 347) as parser by-products. They're intentional curator second-editions per Track M.
- **DO NOT** flag the 22 broken=true entries' pairs without preserving the `broken_reason` metadata Track H/K wrote — future automation depends on those canonical pointers.

## Decision rules established this session

### Triangulation rule (Track J / Track L)

Before flipping any canonical `c`, three signals must converge:
1. **Clinical reasoning** vs current published guidelines (Hazzard 8e, Harrison 22e, IDSA, ACR/EULAR, etc.)
2. **IMA cross-check** in `final_answer_keys.csv` post-appeal answers (where session is in CSV)
3. **Track-A AI validator agreement** (in `track_a_disagreements.json` or `track_a_full_results.jsonl`)

If only 2 signals agree, default to preserving canonical (curator override is presumed intentional).

### AI-on-truncated-questions warning (Track L finding)

Track-A AI agreed with the **wrong** answer on truncated idx 139, then with the **right** answer on full-context idx 2405. Same model, same options, 100% verdict swing driven entirely by which case-stem context was present. **AI agreement on a context-stripped record is not independent confirmation — it's recapitulation of whatever the data-prep pipeline did.** Weight AI verdicts on the full-context canonical heavier than on any truncated duplicate.

## Quick-start commands for new thread

```bash
cd C:/Users/User/repos/Geriatrics

# Verify current state
git log --oneline -10  # should show v10.64.37 at top
PYTHONUTF8=1 python3 scripts/check-version-sync.py  # all aligned at 10.64.37
npx vitest run 2>&1 | tail -3  # 1110/1110

# See full audit log
ls .audit_logs/
cat .audit_logs/NEXT_SESSION_BRIEF.md  # this file

# Read the current state of the broken=true thread
cat .audit_logs/TRACK_M_FINDINGS.md
```

## Memory pointers (auto-loaded by future sessions)

- `project_geriatrics_track_h_i_outcomes.md` — Tracks D/H/I/J/K/L/M closure summary
- `project_geriatrics_qnum_matcher_unreliable.md` — full v1→v2→v3 history + technique
- `project_geriatrics_94_c_wrong_curator_overrides.md` — why no auto-flips
- `project_geriatrics_pdf_dataset.md` — original CSV dataset description
- `project_im_fm_pdf_datasets.md` — sibling repos' first datasets
