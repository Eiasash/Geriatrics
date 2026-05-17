# Audit-4 — chaos-doctor-bot v4 — judge letter↔index "artifact"

**Date:** 2026-05-17 · **Branch:** `main` · **Spend:** $0 (no chaos run — the
defect was diagnosable from the existing audit-3 ledger) · **Trinity:** untouched
(scripts/tests/docs only — correctly no bump).

Tracked report of record (the gitignored `chaos-reports/v4/audit3_caccept_fix_2026-05-17/`
working artifacts are fresh-eye-invisible; this is the clone-visible version).

## Verdict

**There was no bug in the Geri judge or bot.** The audit-3 §4 "judge letter↔index
artifact (3/5 sampled)" was a **frame-confusion measurement error in the manual
5-row sample**, not a defect in the judge's output. The pre-registered gate's
*premise* (a defect to eliminate, prove post-fix == 0) is **falsified**: pre-fix
disagreement in the correct frame was already 0.

Audit-4 therefore shipped a **recurrence guard + audit-trail correction**, not a
bug fix — scope confirmed with the user after STOP-and-report.

## Evidence (STEP 1)

`correct_letter_if_app_wrong` is a **DISPLAY-frame** letter — the judge only ever
sees served options labeled A..D in display order (`chaos-doctor-bot-v4.mjs:546`).

1. **No conversion path existed to be buggy.** The bot records `judge` raw
   (`:672`); `disagrees` (`:511`) keys off the AI *pick*, not the judge letter.
   `triage_genuine.py:73` is raw passthrough; B4 membership (`:86`) keys off the
   boolean `app_answer_correct==False`. Nothing maps the letter to an index.

2. **Judge is internally consistent in display frame** — verified verbatim:
   - **idx 3255**: prose *"Option D (hydrocortisone+fludrocortisone)… answer is
     D"*; letter `D`; **display pos D = that exact option**.
   - **idx 1584**: prose *"Board-level answer is B"*; letter `B`; display pos B =
     the named option.
   - **idx 1273**: prose names "history of treated prostate cancer"; letter `C`;
     display pos C = that option.

3. **Full 86-row rigorous detector**: 0 explicit inconsistencies, 0 text
   inconsistencies across all 61 checkable rows. 25 rows carry no clean judge
   letter (the B5 class). **Pre-fix prose↔index disagreement, correct frame = 0.**

4. **§4 frame-error is reproducible**: reading the display letter as a *canonical*
   index (the §4 hand-method) fabricates a spurious mismatch on **41/61 rows**.
   3/5 sampled is exactly that ~67% base rate within sampling noise.

5. **"Twice-confirmed" was a conflation.** 2026-05-08 "32/241" was an **FM/IM**
   bot *judge-prompt* served↔canonical bug (smoking gun "FM idx 84", genuine
   drift "IM idx 1535"; fixed in `optionResolver.mjs`, **no-op for Geri** per its
   header). Different root cause, different repos. The memory wording was
   corrected (see CLOSE).

## STEP 2 — B4 revalidation

Re-run after the de-noise: **identical** — B1=3, B2=0, B3=0, **B4=61 rows / 37
distinct Qs (36 conf≥80)**, B5=22, B5_unresolved=0, source_implausible=15. **No
re-sort, no category shift** — the de-noise is a frame annotation; triage never
mapped the letter and B4 keys off the boolean, so nothing moved.

- **Clean B4 = the existing B4 = 37 distinct Qs** (4 real-IMA + 33 AI-generated
  per the audit-3 §4 split). The audit-3 §4 conclusion *"B4 is
  bot-artifact-contaminated; fix the bot first"* is **RETRACTED** — the
  contamination was in the §4 sample, never in the queue.

### ⚠ B4 is clean but **INCOMPLETE** (lossless — carry forward)

The 25 B5 "no clean judge letter / boolean" rows were excluded from the
61-checkable set. B4's 37 Qs therefore **exclude 25 rows of potential genuine
disagreement signal**. B4 is *not artifact-contaminated*, but content
adjudication is **not fully unblocked** until the 25 B5 rows are assessed.
**B5 (the ~29% judge-JSON-shape failure) is the named IMMEDIATE next session**,
not a someday-item — it is the real, actionable bot-reliability defect (separate
from the non-existent letter↔index artifact). Addressable by the
validator-before-prompt pattern (post-generate shape check + corrective retry on
`SYS_DOCTOR_JUDGE`).

**Content adjudication of the clean B4** (PDF-verified per v9.81-idx-510;
curator-override cross-check for the 4 real-IMA Qs) remains a SEPARATE,
un-pre-committed decision — handed off, not done here.

## Shipped (recurrence prevention — non-speculative)

| Artifact | What |
|---|---|
| `scripts/lib/optionResolver.mjs` | `resolveJudgeLetter()` — pure, shape-robust (live `{idx,text}` and ledger `string[]`), frame-annotated |
| `scripts/chaos-doctor-bot-v4.mjs` | emits `judge.correct_letter_frame='display'` + `correct_display_idx` + `correct_display_text` + `correct_canonical_idx` (null for Geri/no-data-i, per the `:667` doctrine) at capture |
| `scripts/backfill_judge_letter_frame.py` | tracked, self-contained, **c_accept-aware** offline canonical resolver + ledger backfill (also the carried-forward oracle the audit-3 memory requires) |
| `tests/chaosJudgeLetterFrame.test.js` + fixture | unit contract + the 3 §4-cited rows pinned display-consistent (the audit trail) + 86-row 0-inconsistency drift snapshot |

**Cut deliberately** (user scope): a runtime `proseLetterConsistent` validator —
the rigorous detector proved the failure mode does not occur, so live code would
be speculative. Prose-consistency lives only as the test-only drift snapshot.

## Regressions

- **A (consistent rows unbroken):** change is purely additive (new `judge.*`
  fields, new helper; zero change to `disagrees`/scoring). 86-row snapshot: 0
  inconsistent, 18 consistent, pinned.
- **B (c_accept stays 0/0, c_accept-AWARE oracle):** c_accept guard tests 22/22
  green; carried-forward c_accept-aware oracle over the audit-3 ledger =
  **isOk-pick FP 0/0, any-isOk 0/0, unresolved 0**. No reinherited blindness.
- **Full gate `npm run verify`:** 71 files / 1381 passed + 7 skipped; trinity
  aligned at 10.64.130 (untouched).

## Fresh-eye note

This is a verdict-shaped reframe. Per workspace CLAUDE.md it should route through
a filesystem-grounded fresh-eye instance before the memory `CLOSED` lock is
treated as final. This report is at a git-tracked path precisely so a cloned
fresh-eye instance can read the actual evidence, not the session narrative.
