// Audit-5 (2026-05-17) — judge JSON-shape validator + corrective retry.
//
// ROOT CAUSE (B5, evidence-established): for 22/86 audit-3 disagreement
// rows `extractJson(judgeResp.text)` returned null at
// chaos-doctor-bot-v4.mjs:560; `|| {}` silently substituted `{}`;
// `app_answer_correct` -> undefined; the judge channel had NO parse-error
// log + NO corrective retry (the pick channel logs at :462). 0 thrown
// judge errors and explain on the same Q succeeded 22/22 -> the failure
// is judge-call-specific, not an API outage.
//
// FIX CLASS (pre-decided, locked): validator-before-prompt
// (feedback_validator_before_prompt) — post-generate shape check + exactly
// ONE corrective re-ask, layered ABOVE callClaude's orthogonal internal
// network-retry. Composes THROUGH the existing extractJson.mjs
// (grep-existing-utility: do not re-implement JSON parsing).
//
// See docs/AUDIT5_PRE_REGISTERED_GATE.md (committed before this module).
// Unit contract: tests/chaosBotV4JudgeShapeValidator.test.js.

import { extractJson, classifyExtractFailure } from './extractJson.mjs';

// The SYS_DOCTOR_JUDGE contract is satisfied iff there is a boolean
// app_answer_correct verdict. Everything else (null/extract-fail,
// missing key, string "true", number 1) is a B5 shape failure.
export function validateJudgeShape(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, reason: 'not-an-object' };
  }
  if (typeof obj.app_answer_correct !== 'boolean') {
    return { ok: false, reason: 'app_answer_correct-not-boolean' };
  }
  return { ok: true, reason: 'ok' };
}

// One corrective re-ask appended to the original prompt: restate the strict
// schema and demand JSON-only (directly attacks the prose-overflow
// truncation sub-cause without speculating which sub-cause it was). Gated on
// validator detection -> validator-before-prompt, NOT a prompt-only tweak.
function correctivePrompt(userPrompt, badText) {
  return `${userPrompt}

[RETRY] Your previous response did not contain a valid JSON verdict.
Respond with ONLY this JSON object on a single line — no prose, no markdown, no code fence:
{"app_answer_correct":true|false,"confidence":0..100,"issue":"<=300 chars or null","correct_letter_if_app_wrong":"A"|"B"|"C"|"D"|null}
Your previous (rejected) output started: ${String(badText || '').slice(0, 120)}`;
}

// Drop-in replacement for the bare
//   `judgeResp ? (extractJson(judgeResp.text) || {}) : {}`
// at chaos-doctor-bot-v4.mjs:560. `callJudge` is injected (= callClaude in
// production) so this is unit-testable with a stub — no API, no playwright.
// Returns the validated judge object, or `{}` when no boolean verdict could
// be obtained after exactly one corrective retry (cap=1).
export async function judgeWithShapeRetry({
  system,
  userPrompt,
  // audit-7: was 400. Default raised so the corrective retry also clears the
  // preamble-truncation class (see the judge call in chaos-doctor-bot-v4.mjs).
  maxTokens = 1024,
  callJudge,
  log,
  nowIso,
}) {
  const stamp =
    typeof nowIso === 'function' ? nowIso : () => new Date().toISOString();

  let resp;
  try {
    resp = await callJudge(system, userPrompt, { maxTokens });
  } catch (e) {
    // A throw means callJudge's own (network) retries already failed — an
    // API problem, not a shape problem. Preserve pre-audit-5 behavior:
    // log ai-error, NO shape retry, empty verdict.
    log.bugs.push({
      at: stamp(), type: 'ai-error', context: 'judge', message: e.message,
    });
    return {};
  }

  let obj = extractJson(resp.text);
  if (validateJudgeShape(obj).ok) return obj;

  // FIRST ATTEMPT FAILED. Audit-6 Option-0: the target is the UNDERLYING
  // first-attempt failure composition (~26%), NOT the double-failure
  // residual (~7%) that the terminal ai-parse-error log below samples.
  // The corrective retry is a schema-restated re-ask with the SAME
  // maxTokens budget — its recovery is class-dependent, so conditioning
  // the (stop_reason, branch) sample on "retry also failed" is a biased
  // estimator of the population the audit-6 decision tree consumes.
  // Capture the first-failure signal NOW, unconditionally. `recovered`
  // (set after the retry resolves) lets the bucketer derive BOTH the
  // underlying population (all rows) and the residual (recovered:false).
  const first_branch = classifyExtractFailure(resp.text);
  const first_stop_reason = resp.stopReason ?? null;

  // Exactly ONE corrective retry (cap=1 — feedback_validator_before_prompt:
  // beyond 1 you are masking a prompt problem, not fixing shape adherence).
  let resp2;
  try {
    resp2 = await callJudge(
      system, correctivePrompt(userPrompt, resp.text), { maxTokens },
    );
  } catch (e) {
    // Retry threw (network/API). The first-attempt failure still occurred
    // and is part of the measured population — emit it (recovered:false),
    // then preserve audit-5's ai-error behavior (no shape retry, {}).
    log.bugs.push({
      at: stamp(), type: 'judge-shape-firstfail', context: 'judge',
      first_branch, first_stop_reason, recovered: false,
    });
    log.bugs.push({
      at: stamp(), type: 'ai-error', context: 'judge', message: e.message,
    });
    return {};
  }

  const obj2 = extractJson(resp2.text);
  const recovered = validateJudgeShape(obj2).ok;

  // Un-conditioned first-attempt-failure telemetry. Fires for EVERY first
  // failure (the audit-6 ~26% underlying population), recovered or not.
  // DISTINCT type from ai-parse-error — so audit-5's B5 double-failure
  // contract and the 15-pin suite are byte-stable. recovered:true rows
  // are telemetry (the validator+retry worked), NOT defects; downstream
  // consumers discriminate by `type` (as audit-5 already does).
  log.bugs.push({
    at: stamp(), type: 'judge-shape-firstfail', context: 'judge',
    first_branch, first_stop_reason, recovered,
  });

  if (recovered) return obj2;

  // Both failed → audit-5 B5 terminal, mirroring the pick channel
  // (chaos-doctor-bot-v4.mjs:462) so B5 stays observable. Shape
  // UNCHANGED (text/at preserved); first_* kept for residual-view
  // continuity. Zero raw-text retention beyond the 200-char slice.
  log.bugs.push({
    at: stamp(),
    type: 'ai-parse-error',
    context: 'judge',
    text: String(resp2.text || '').slice(0, 200),
    first_branch,
    first_stop_reason,
  });
  return {};
}
