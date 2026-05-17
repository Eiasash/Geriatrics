# Audit-5 kickoff — chaos-doctor-bot v4 B5 (judge JSON-shape failure)

Paste-ready next-session brief. **Distrust contract: do not trust the numbers/
paths below — brief, not ground truth. Verify them in STEP 0.**

Lane: terminal. Repo: `Eiasash/Geriatrics`. Slug: `claude/term-audit5-b5-jsonshape`.

## What this is

Audit-4 (CLOSED 2026-05-17) proved the "judge letter↔index artifact" was a
frame-confused manual sample, not a defect — gate closed by falsification.
It surfaced the **one real, actionable bot-reliability defect: B5.**

**B5 = the 22 `disagrees:true` rows where `judge.app_answer_correct` is
non-boolean** (judge emitted no clean JSON verdict at all). ≈26% of the 86
audit-3 disagreement rows. This is a `SYS_DOCTOR_JUDGE` structured-output
discipline failure, not a content problem.

## STEP 0 — distrust contract (verify, don't trust this brief)

1. `cd` Geriatrics. `git fetch --all && git log -8 --all --oneline`. Clean tree.
   Detect concurrent lane (`claude/web-*` / other live branch touching the bot
   or shared engine → STOP, report).
2. **Verify the audit-4 entry state** (the fixed baseline you must NOT regress):
   - HEAD should descend from `79b15ed`; audit-4 chain `1c8e656` (fix) →
     `bbc2cd8` (test) → `3225d11`/`a086d43`/`79b15ed` (docs).
   - `npx vitest run tests/chaosJudgeLetterFrame.test.js
     tests/extractAcceptedDisplayIdxSet.test.js tests/chaosCacceptRatchet.test.js`
     → all green (frame guard + c_accept baseline).
   - Re-derive the cross-tab from the ledger (do NOT trust this table):
     expected `has-letter×aac-False=61` (B4=37 Qs), `no-letter×aac-True=3`
     (B1, benign), `no-letter×aac-non-bool=22` (B5), B2=B3=0.
3. Read, don't assume: `docs/AUDIT4_judge_letter_frame_2026-05-17.md`;
   memories `project-geri-audit3-caccept-outcome`,
   `feedback-cross-tab-not-derived-delta`,
   `feedback-chaos-judge-letter-index-artifact`,
   `feedback_validator_before_prompt`.

## Scope

- **Fix class is pre-decided: validator-before-prompt.** Post-generate
  JSON-shape validator on the `SYS_DOCTOR_JUDGE` response + corrective retry —
  NOT a prompt-only tweak (see `feedback_validator_before_prompt`). The judge
  must return `{app_answer_correct:bool, confidence, issue, correct_letter_if_
  app_wrong}`; ~26% currently don't parse to a boolean verdict.
- Tracked-commit session: validator (`scripts/`) + guard test (`tests/`),
  fix-commit + test-commit pattern. **No trinity bump** (scripts/tests only).
  Solo lane → direct push to main; concurrent → branch + PR.
- Reuse `scripts/backfill_judge_letter_frame.py` patterns / the carried-forward
  c_accept-aware resolver; the audit-3 oracle (`classify_isok_fps.py`,
  `triage_genuine.py`) is gitignored — re-derive/copy forward, do not let it
  reinherit c_accept blindness.

## PRE-REGISTERED GATE (lock before the fix)

- **Anchor success to a deterministic replay, not a fresh stochastic run.**
  Define the metric on the existing 86-row corpus (or a captured fixture):
  non-boolean-verdict rate must drop from 22/86 to ≤ a pre-stated target with
  the corrective-retry path simulated/replayed. A live re-run alone is not the
  gate (stochastic; cf. audit-4's "don't re-judge an already-clean judge").
- **Regression (non-optional — same files as audit-4 + the c_accept fix):**
  `chaosJudgeLetterFrame` + `extractAcceptedDisplayIdxSet` +
  `chaosCacceptRatchet` stay green; c_accept FP stays **0/0** via the
  c_accept-AWARE oracle. Frame fields still emitted correctly.
- Locked budget (state $ ceiling). Guard test ratchets the JSON-shape contract.
- If the gate cannot be met → STOP and report (premise-falsification is a valid
  outcome, as audit-4 showed).

## OUT OF SCOPE

- **Content adjudication of the clean B4 (37 Qs)** — separate, un-pre-committed
  decision (PDF-verify per v9.81-idx-510; curator-override cross-check for the
  4 real-IMA). Audit-5 flips no `q.c`, no broken flag, regens no distractor.
- **Re-litigating audit-4.** The letter↔index gate is CLOSED by falsification;
  the judge is display-frame-consistent. Do not reopen it.
- The 3 no-letter B1 rows — benign (judge confirmed the app; no alternative
  letter is *correct*). Not B5, not in scope.

## KNOWN TRAPS (hard-won — audit-4)

1. **Cross-tab from source, never a derived delta.** Reconcile bucket counts
   by the full contingency table read off the ledger; a subtracted delta
   absorbs the dimension you didn't condition on (cost 5 correction passes in
   audit-4). A count is read off source, not rounded. `[[feedback-cross-tab-not-
   derived-delta]]`.
2. `judge.correct_letter_if_app_wrong` is **display-frame** — never map vs
   canonical `q.o[]`. Use the emitted `correct_display_idx`/`canonical_idx`.
3. Verdict-shaped reframes route through a filesystem-grounded fresh-eye
   instance before the CLOSED lock is final (workspace CLAUDE.md).
4. Verify a reviewer's proposed reconciliation/number too — don't launder an
   unanchored figure into a durable surface (incl. counts of your own errors).
5. Geri bot loads `data/questions.json` at startup; `q.options[i].idx === i`
   (no data-i — display frame). canonical is offline-only.

## REPORT BACK

STEP 0 (HEAD, baseline-green, cross-tab re-derived). Root cause of the JSON-
shape failure (where in the judge call path). Pre/post non-boolean rate on the
deterministic replay. Both regressions green (frame guard + c_accept 0/0).
Guard test name. Spend. Shipped SHAs. Clean B4 (37) still handed off untouched.
