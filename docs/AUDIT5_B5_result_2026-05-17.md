# Audit-5 — chaos-doctor-bot v4 B5 (judge JSON-shape failure) — RESULT

**Date:** 2026-05-17 · **Branch:** `main` (solo lane) · **Spend:** $0 (no
chaos run — diagnosable + gateable from the existing audit-3 ledger + a
deterministic fixture; a fresh chaos re-judge is the wrong gate per
audit-4) · **Trinity:** untouched at v10.64.130 (scripts/tests/docs only —
correctly no bump).

Tracked report of record (clone-visible). Pre-registered gate +
append-only RESULT: `docs/AUDIT5_PRE_REGISTERED_GATE.md`. Gitignored
working artifacts: `chaos-reports/v4/audit5_b5_2026-05-17/`.

## Defect

B5 = the 22/86 audit-3 `disagrees:true` rows where
`judge.app_answer_correct` was non-boolean — a `SYS_DOCTOR_JUDGE`
structured-output discipline failure (≈26% of the disagreement rows),
distinct from the (non-existent) audit-4 letter↔index artifact.

## Root cause (Phase 1 — established by evidence, not hypothesis)

`scripts/chaos-doctor-bot-v4.mjs:560`
(`judgeResp ? (extractJson(judgeResp.text) || {}) : {}`):

1. `ai-error context=judge` across the whole run = **0** → the judge
   `callClaude` never threw; `judgeResp` never null from an exception.
2. The separate explain `callClaude` on the same question succeeded
   **22/22** (boolean `sound`) → API healthy; failure judge-call-specific.
3. ⇒ `extractJson(judgeResp.text)` returned **null** → `|| {}` silently
   substituted `{}` → `app_answer_correct` undefined = B5. Every B5 judge
   object is exactly `{confidence, explanation_sound}` — both injected by
   the unrelated explain channel (`:654-658`); the judge contributed
   nothing.
4. The judge channel had **no `ai-parse-error` log** (the pick channel
   logs at `:462`) and **no corrective retry** — the failure was silent
   and un-retried by design omission.

Cross-tab independently re-derived from the raw ledger (every cell read
off source, no subtraction — `feedback-cross-tab-not-derived-delta`):
`has-letter×aac-False=61`, `no-letter×aac-True=3` (B1, benign),
`no-letter×aac-non-bool=22` (B5), B2=B3=0, Σ=86. Matches the brief and the
audit-4 doc (audit-4's numbers *verified*, not laundered).

The raw failing judge **text** was never persisted (ledger keeps only the
post-`extractJson` object), so the literal 22 strings are unrecoverable.
The gate therefore anchors to a git-tracked constructed fixture of the
failure shapes (the brief explicitly permits "or a captured fixture").

## Fix (validator-before-prompt — pre-decided class)

| Artifact | What |
|---|---|
| `scripts/lib/judgeShapeValidator.mjs` | `validateJudgeShape(obj)` (ok iff `typeof obj.app_answer_correct==='boolean'`) + `judgeWithShapeRetry({...,callJudge,log})` — post-extract shape check + **exactly one** corrective re-ask (cap=1), composed THROUGH the existing `extractJson.mjs`; closes the silent-gap with a typed `ai-parse-error context:'judge'` mirroring pick `:462` |
| `scripts/chaos-doctor-bot-v4.mjs` | bare `extractJson(...)||{}` at `:560` → injectable `judgeWithShapeRetry` (callClaude injected → unit-testable, no API/playwright) |
| `tests/chaosBotV4JudgeShapeValidator.test.js` (15) + `tests/fixtures/judgeShapeFailures.json` | the deterministic-replay guard (P1 detection + P2 cap=1 symmetric wiring); git-tracked fixture = fresh-eye-visible replay corpus |

`callClaude`'s internal 3-attempt **network** retry is orthogonal; the
shape-cap=1 is layered above it → at most 2 model responses per judge turn
(verified: stub invoked exactly 2× in both shape branches, never 3).

## Gate result — all 3 predicates MET, TRIP NOT met

- **P1**: fixture splits exactly **6 nonconforming / 2 conforming**;
  0 false-negatives on the verdict axis.
- **P2**: conforming-stub → **0/22** residual, 0 logs, 2 calls/item;
  nonconforming-stub → **22/22** stays `{}`, **22/22** typed-logged,
  2 calls/item (cap holds — never 3); throw → 0 shape-retry + 1
  `ai-error`. Corrective is a validator-gated re-ask.
- **P3**: 3 baseline suites green (34); carried-forward c_accept-AWARE
  oracle over the audit-3 ledger = `0/0/0` (== audit-4 Regression B);
  `npm run verify` = **72 files / 1396 + 7 skipped**; trinity untouched.

Pre→post (deterministic replay): pre-fix 22/22 non-boolean **silently**
(0 logs/0 retries); post-fix 6/6 shapes flagged, conforming-corrective ⇒
**22/22 → 0/22**, failing-corrective ⇒ 22/22 but now **22/22
typed-logged** (B5 observable). Recovery conditional on the retry
conforming — the honest framing.

## Out of scope (handed off untouched)

Content adjudication of the clean **B4 (37 distinct Qs)** — separate,
un-pre-committed, PDF-verified-per-v9.81-idx-510 decision. **No `q.c`
flip, no `broken` change, no distractor regen.** Audit-4 letter-frame
gate stays CLOSED; the 3 B1 no-letter rows are benign; `stop_reason`
capture explicitly cut (non-speculative).
