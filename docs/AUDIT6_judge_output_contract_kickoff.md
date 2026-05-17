# Audit-6 kickoff — chaos-doctor-bot v4: judge OUTPUT-CONTRACT hardening

Paste-ready next-session brief. **Distrust contract: do not trust the
numbers/paths/API-shapes below — brief, not ground truth. Verify them in
STEP 0.** Self-contained; no context from the audit-5 session required.

Lane: terminal. Repo: `Eiasash/Geriatrics`. Slug:
`claude/term-audit6-judge-output-contract`. **Branch+PR is MANDATORY even
solo** — the global always-PR guardrail is classifier-enforced and
overrides any solo-lane carve-out (CLAUDE.md corrected in PR #228). Do NOT
attempt `git push origin main`; it is denied.

## What this is

Audit-5 (CLOSED 2026-05-18, PR #227 → merge `deb335d`) fixed the **B5
silent-swallow**: 22/86 audit-3 disagreement rows where the judge emitted
no parseable boolean verdict, `extractJson(judgeResp.text)||{}` at
`chaos-doctor-bot-v4.mjs:560` silently substituted `{}`, with no log and
no retry. Audit-5 shipped **validator-before-prompt**:
`scripts/lib/judgeShapeValidator.mjs` (`validateJudgeShape` +
`judgeWithShapeRetry`, cap=1) + a typed `{type:'ai-parse-error',
context:'judge'}` log entry mirroring the pick channel `:462`.

**What audit-5 did NOT fix (its explicitly named successor horizon):** the
*underlying* judge JSON-malformation rate. Audit-3 saw ≈26% of
disagreement-channel judge calls emit non-conforming output. The cap=1
corrective retry mitigates it; **the residual is ≈7% IF the retry is an
independent draw — it is NOT (a schema-restated re-ask is correlated), so
the true residual could land either side. Audit-6 must MEASURE it, not
assume 7%.** This is a judge **output-contract** problem (force structured
output at the API layer), not bot plumbing. The audit-5 validator/retry
stays as the defense-in-depth floor; audit-6 attacks the *rate*.

**Key leverage B5 lacked:** the failure is now **observable** — every
unrecovered malformation emits a typed `ai-parse-error context:'judge'`
in the run's bug log. Audit-6 can MEASURE a real adherence delta off that
log (the `feedback_validator_before_prompt` discipline: "ship a
measurement," not a vibe).

## STEP 0 — distrust contract (verify, don't trust this brief)

1. `cd` Geriatrics. `git fetch --all && git log -8 --all --oneline`.
   Clean tree. Detect concurrent lane (`claude/web-*` or other live
   branch touching the bot / `scripts/lib/` / shared engine → STOP,
   report).
2. **Verify the audit-5 entry state (the floor you must NOT regress):**
   - HEAD descends from `7b87bfa` (#228 CLAUDE.md fix) ⊃ `deb335d`
     (#227 B5) ⊃ `8788f63` literal-RED pin.
   - `npx vitest run tests/chaosBotV4JudgeShapeValidator.test.js
     tests/chaosJudgeLetterFrame.test.js
     tests/extractAcceptedDisplayIdxSet.test.js
     tests/chaosCacceptRatchet.test.js` → **51 passed** (17 B5 + 34
     baseline).
   - Carried-forward c_accept-AWARE oracle still 0/0/0:
     `PYTHONUTF8=1 python
     chaos-reports/v4/audit5_b5_2026-05-17/classify_isok_fps.py
     chaos-reports/v4/audit3_caccept_fix_2026-05-17/medical_findings_ai_v4.jsonl`
     → `isOk_pick_FPs:0, any_isOk_FPs:0, unresolved_total:0`.
3. **Make-or-break pre-flight — proxy structured-output transparency.**
   The bot runs **proxy mode** in CI/sandbox (`CHAOS_USE_PROXY=1` →
   `https://toranot.netlify.app/api/claude`; `chaos-doctor-bot-v4.mjs`
   ~L108/118/119). `callClaude` (~L170) builds
   `{model,max_tokens,system,messages}` and reads `data.content[].text`.
   Forced structured output adds `tools`+`tool_choice` to the body and
   reads a `tool_use` block. **Verify the Toranot proxy forwards
   `tools`/`tool_choice` AND returns the `tool_use` content block.** If
   it strips them or returns text-only, forced tool-use is a no-op in the
   practical run mode → either a cross-repo Toranot proxy change
   (separate repo — surface as a BLOCKING decision, not silently
   in-scope) or fall back to strict-JSON prefill. Do NOT assume the proxy
   is transparent. Confirm the Anthropic mechanism via the `claude-api`
   skill — do not trust this brief's API description.
4. Read, don't assume: `docs/AUDIT5_B5_result_2026-05-17.md` +
   `docs/AUDIT5_PRE_REGISTERED_GATE.md` (audit-5 report of record + its
   append-only gate/RESULT); memories
   `project-geri-audit3-caccept-outcome` (the "CLOSED scoped only" +
   named horizon), `feedback_validator_before_prompt`,
   `feedback-cross-tab-not-derived-delta`,
   `feedback_global_always_pr_overrides_repo_solo_push`,
   `feedback_spec_provenance_append_only`.

## Scope (fix-class — leading hypothesis, NOT firmly pre-decided)

Lead: **force structured output on `SYS_DOCTOR_JUDGE`** via Anthropic
tool-use (`tools:[{name:'judge_verdict',input_schema:{…app_answer_correct:
boolean,confidence,issue,correct_letter_if_app_wrong}}]` +
`tool_choice:{type:'tool',name:'judge_verdict'}`), reading the `tool_use`
block's `input` as the schema-valid verdict — the model then *cannot*
emit prose/truncated-JSON for the verdict. Fallback if the proxy can't
carry tool-use: strict-JSON prefill / response-format constraint + the
existing validator. The next session **pre-registers the gate AFTER the
STEP-0 proxy verdict**, because the fix shape depends on it. Tracked-commit
session: API-shape change in `scripts/` + guard test in `tests/`. **No
trinity bump** (bot infra only). Keep `judgeWithShapeRetry` — structured
output lowers the rate, the validator catches the residual (defense in
depth; removing it re-opens B5).

## PRE-REGISTERED GATE (lock before the fix — literal numbers, append-only)

- **Measured adherence delta, not hypothesized.** Anchor primary to a
  **deterministic replay** (a fixture of representative judge prompts run
  through the forced path vs the current path; metric =
  `validateJudgeShape` OK on the FIRST call before any retry). State a
  literal pre/post first-call-conformance target and a literal target for
  the `judgeWithShapeRetry` corrective-retry fire-rate drop.
- A bounded, cost-capped, **N-pre-registered** live proxy smoke MAY be the
  secondary witness (judge `ai-parse-error` rate off the typed log,
  before vs after) — but a single stochastic run is NOT the gate (audit-4:
  "don't re-judge an already-clean judge"); deterministic replay is
  primary.
- **Regression (non-optional):** the 17 B5 tests + 3 baseline suites stay
  green; c_accept oracle stays 0/0/0; `judgeWithShapeRetry` cap=1 contract
  preserved; `npm run verify` green; trinity untouched.
- If the gate can't be met (proxy blocks tool-use AND the cross-repo
  Toranot fix is out of scope) → **STOP and report**. Premise-falsification
  / scope-blocked is a valid outcome (audit-4 precedent).

## OUT OF SCOPE

- **B4 content adjudication (37 distinct Qs — 4 real-IMA + 33
  AI-generated).** Different axis (content, not bot-reliability),
  un-pre-committed, PDF-verify per v9.81-idx-510 + curator-override
  cross-check. Still handed off untouched — NOT this kickoff, NOT a queue.
- Re-litigating audit-3/4/5 (c_accept FP, letter-frame, B5 — all
  closed/durable). Removing the audit-5 validator/retry (it is the
  defense-in-depth floor).
- Toranot proxy internals — UNLESS STEP-0 proves it is the blocker, then
  it is a *surfaced* cross-repo decision, not silently in-scope.

## KNOWN TRAPS (carried forward)

1. **Don't assume the ≈7% residual — measure it off the typed
   `ai-parse-error context:'judge'` log.** A correlated re-ask is not an
   independent draw; the real figure is read off source, not computed as
   0.26². `[[feedback-cross-tab-not-derived-delta]]`.
2. **Proxy transparency is not given.** Pre-flight the tool-use
   pass-through as a make-or-break check (audit-3 oracle-validation
   discipline) before designing the fix around it.
3. **Branch+PR mandatory even solo** (always-PR guardrail; CLAUDE.md #228).
   Never `git push origin main`. Ask the user to merge; don't self-merge
   substantive code.
4. **Keep the B5 validator/retry.** Structured output is the rate-reducer;
   the validator is the residual-catcher. Defense in depth.
5. Verdict-shaped outcome ("structured output cut malformation 26%→X%")
   routes through a filesystem-grounded fresh-eye before any CLOSED lock
   (workspace CLAUDE.md). Clean bug-fix-with-tests ship does not.
   Gate doc append-only `[[feedback_spec_provenance_append_only]]`.
6. Deterministic replay primary; bounded N-pre-registered live smoke
   secondary — never a lone fresh run as the gate.

## REPORT BACK

STEP 0 (HEAD; baseline 51 green; oracle 0/0/0; **proxy tool-use pre-flight
verdict**). Chosen mechanism (tool-use vs prefill) + why. **Measured**
pre/post judge-malformation rate off the typed log on the pre-registered
basis. Regressions green (17 B5 + 34 baseline + oracle 0/0/0). Guard test
name. Spend. Shipped SHAs + PR#. Whether a cross-repo Toranot change was
needed (+ disposition). B4 (37 Qs) still handed off untouched.
