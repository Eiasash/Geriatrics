# Audit-5 — chaos-doctor-bot v4 B5 (judge JSON-shape failure) — PRE-REGISTERED GATE

Written **before** the validator code. Append-only; do not retro-edit
(`feedback_spec_provenance_append_only`). Lane: terminal, solo. Trinity:
untouched (scripts/tests/docs only — correctly **no bump**, mirrors audit-4).

## STEP 0 (distrust contract) — results

- **0.1** `HEAD == 3170e35` on `main`, clean tree (`git status --porcelain`
  empty: only `## main...origin/main`). HEAD is the kickoff-doc commit;
  parent `79b15ed` → **HEAD descends from 79b15ed ✅**. Audit-4 chain
  present in exact asserted order: `1c8e656`(fix) → `bbc2cd8`(test) →
  `3225d11`/`a086d43`/`79b15ed`(docs). ✅ CONFIRMED.
- **0.2** Concurrent lane: no `claude/web-*` branch exists; only non-main
  branches are 4-day-old remote-only `claude/term-*regen*`; `main` ==
  `origin/main` == HEAD `3170e35`. No live branch touching the bot or the
  shared engine within 24h. → **SOLO → direct push to main is the release
  path** (still as separate fix-commit + test-commit). ✅
- **0.3** Audit-4 baseline green: `npx vitest run
  tests/chaosJudgeLetterFrame.test.js tests/extractAcceptedDisplayIdxSet.test.js
  tests/chaosCacceptRatchet.test.js` → **3 files / 34 tests passed.** ✅
- **0.4** Cross-tab **independently re-derived** from the raw ledger
  `chaos-reports/v4/audit3_caccept_fix_2026-05-17/medical_findings_ai_v4.jsonl`
  (592 rows) — every cell read off the source, **no subtraction**
  (`feedback-cross-tab-not-derived-delta`); script
  `chaos-reports/v4/audit5_b5_2026-05-17/rederive_crosstab.py`:

  | | aac=True (B1) | aac=False (B4) | aac non-bool (B5) | row tot |
  |---|---|---|---|---|
  | **has letter** | 0 | **61** | 0 | 61 |
  | **no letter** | **3** | 0 | **22** | 25 |
  | **col tot** | 3 | 61 | 22 | **86** |

  Σ all 6 cells = 86 == `disagrees:true`. **Exactly matches** the brief's
  expected table and the audit-4 doc table (trap #4: audit-4's numbers
  *verified*, not laundered). B2=B3=0 (no override/broken rows within
  aac=False, per audit-4 triage). ✅

## Root cause (systematic-debugging Phase 1 — established by evidence)

`scripts/chaos-doctor-bot-v4.mjs:560`:
`const judgeJson = judgeResp ? (extractJson(judgeResp.text) || {}) : {};`

For **all 22** B5 rows:

1. `ai-error context=judge` count across the whole run = **0** → the judge
   `callClaude` never threw; `judgeResp` was never null from an exception.
2. The separate explain `callClaude` on the same question succeeded
   **22/22** (boolean `sound`) → API healthy; failure is judge-call-specific,
   not an outage.
3. ⇒ `extractJson(judgeResp.text)` returned **null** (judge output not a
   parseable brace-balanced JSON object) → `|| {}` silently substituted
   `{}` → `judgeJson.app_answer_correct` = `undefined` (non-boolean) = B5.
4. Every B5 judge object has the exact key-shape `{confidence,
   explanation_sound}` — both injected from the unrelated explain channel
   (lines 654-658); the judge contributed nothing.
5. The judge channel has **no `ai-parse-error` log** (the pick channel does,
   at line 462) and **no corrective retry** — the failure is silent and
   un-retried *by design omission*. This silent-failure gap is in-scope to
   close (parity with the pick channel; non-speculative — the failure mode
   demonstrably occurs 22/86, unlike the audit-4 cut validator).

**Constraint:** the ledger preserves only the post-`extractJson` `judge`
object, **not** the raw failing judge text. The literal 22 failing strings
are unrecoverable. The deterministic-replay gate therefore anchors to a
**git-tracked constructed fixture** of the failure shapes (the brief
explicitly permits "or a captured fixture"). This refines *what* the gate
anchors to; it does not weaken it (a fresh chaos re-judge is the wrong gate
anyway — audit-4: "don't re-judge an already-clean judge").

## Fix class (pre-decided, locked) — validator-before-prompt

Post-generate JSON-shape validator on the `SYS_DOCTOR_JUDGE` response +
**exactly one** corrective retry (cap=1 per `feedback_validator_before_prompt`).
Wires *through* the existing `scripts/lib/extractJson.mjs` (grep-existing-utility:
the helper is already imported+used at line 49/560 — compose, do not
re-implement JSON parsing). New module `scripts/lib/judgeShapeValidator.mjs`
(sibling to `extractJson.mjs` / `optionResolver.mjs`); bot lines 558-560
refactor into an injectable `judgeWithShapeRetry({...,callJudge,log})` pure
function (same dependency-injection shape audit-4 gave `resolveJudgeLetter`).

## THE THREE DETERMINISTIC PREDICATES (registered before code — literal targets)

### P1 — Detection
`validateJudgeShape(obj)` ⇒ `{ok:true}` **iff** `obj` is a non-null object
AND `typeof obj.app_answer_correct === 'boolean'`. Fixture
`tests/fixtures/judgeShapeFailures.json` = **8** raw model-output text
samples; each piped through `extractJson` then `validateJudgeShape`:

- **6 nonconforming → ok:false**: `truncated_json`, `prose_then_truncated`,
  `prose_only_no_json`, `fenced_then_truncated`, `json_string_bool`
  (`"app_answer_correct":"true"`), `json_missing_aac`.
- **2 conforming → ok:true**: `bare_valid_json`, `fenced_valid_json`.

**TARGET (literal): exactly 6 flagged, 2 pass. 0 false-negatives on the
missing/non-boolean-`app_answer_correct` axis.**

### P2 — Retry wiring (cap=1; injected stub `callJudge`, no API/playwright)
Replay over a 22-element array modelling the empirical B5 corpus (all
initially nonconforming):

- **Stub-conforming 2nd response** → residual non-boolean = **0/22**
  (all recovered); `callJudge` invoked **exactly 2× per item** (1 original
  + 1 corrective; never 3 — shape-cap=1 layered above `callClaude`'s
  orthogonal internal network-retry); `ai-parse-error` log entries = **0**.
- **Stub-nonconforming 2nd response** → residual = **22/22** (`judgeJson`
  stays `{}`); `callJudge` invoked **exactly 2× per item** (cap holds —
  never a 2nd corrective retry); typed `{type:'ai-parse-error',
  context:'judge'}` in `log.bugs` = **22/22** (silent-gap closed; mirrors
  line 462).
- **Stub throws (API-outage class)** → **no** shape retry; one
  `{type:'ai-error',context:'judge'}`; returns `{}` (preserves current
  behavior — a throw is not a shape problem).

**TARGET (literal): {0/22 recovered, 0 log, 2 calls} | {22/22 stays-{}, 22
log, 2 calls} | {throw → 0 shape-retry, 1 ai-error}. Invocation count
symmetric (2) across both shape branches.**

### P3 — Regression integrity (additive-change proof)
- 3 STEP-0 baseline tests stay green (34 tests).
- c_accept-AWARE oracle `classify_isok_fps.py` **carried forward** into
  `chaos-reports/v4/audit5_b5_2026-05-17/` (not trusted in place — copied +
  re-run; its own pre-fix contract self-validates it isn't c_accept-blind),
  run over the audit-3 ledger ⇒ `isOk_pick_FPs:0, any_isOk_FPs:0,
  unresolved_total:0` (== audit-4 Regression B — the validator change must
  not perturb `disagrees`/scoring).
- Full `npm run verify` green; trinity untouched.

## TRIP CONDITION
If P1 ≠ 6/2, **or** P2 ≠ the literal targets with cap=1, **or** P3 regresses
(any baseline test red, or oracle ≠ 0/0/0, or `npm run verify` red) →
**STOP and report. Premise-falsification is a valid outcome** (as audit-4
showed). Do not ship a partial; do not loosen a predicate post-hoc.

## OUT OF SCOPE (do NOT pre-commit / do NOT touch)
- Content adjudication of the clean B4 (37 distinct Qs) — separate,
  un-pre-committed, PDF-verified-per-v9.81-idx-510 decision. Handed off
  untouched. No `q.c` flip, no `broken` change, no distractor regen.
- Re-litigating audit-4's letter↔index gate (CLOSED by falsification).
- The 3 B1 no-letter rows (judge confirmed app; benign — not B5).
- `stop_reason` capture in `callClaude` — would disambiguate truncation
  vs prose-only on *future* runs, but the fix does not depend on it and
  the brief is tight. **Explicitly cut** (non-speculative scope discipline,
  mirrors audit-4's cut of the speculative live validator).
