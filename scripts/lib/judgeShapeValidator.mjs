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

import { extractJson } from './extractJson.mjs';

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
  maxTokens = 400,
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

  // Exactly ONE corrective retry (cap=1 — feedback_validator_before_prompt:
  // beyond 1 you are masking a prompt problem, not fixing shape adherence).
  let resp2;
  try {
    resp2 = await callJudge(
      system, correctivePrompt(userPrompt, resp.text), { maxTokens },
    );
  } catch (e) {
    log.bugs.push({
      at: stamp(), type: 'ai-error', context: 'judge', message: e.message,
    });
    return {};
  }

  const obj2 = extractJson(resp2.text);
  if (validateJudgeShape(obj2).ok) return obj2;

  // Still no boolean verdict. Close the silent-failure gap: emit a typed
  // parse-error mirroring the pick channel (chaos-doctor-bot-v4.mjs:462) so
  // B5 is observable post-run instead of vanishing into `{}`.
  log.bugs.push({
    at: stamp(),
    type: 'ai-parse-error',
    context: 'judge',
    text: String(resp2.text || '').slice(0, 200),
  });
  return {};
}
