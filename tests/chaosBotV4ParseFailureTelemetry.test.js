// Audit-6 Option-0 (2026-05-18) — judge parse-failure TELEMETRY.
//
// Audit-5 closed the silent-swallow (failures now logged + retried).
// Audit-6 STEP-0 established the fix-class depends on the UNMEASURED
// failure-mode composition. This pins the persistent instrument
// (stop_reason, first_branch) that makes the next bounded chaos run
// bucketable.
//
// BUCKETING RULE — keyed off stop_reason FIRST; branch is a refinement
// of the end_turn rows ONLY and is NEVER a standalone truncation signal
// (unbalanced@end_turn is NOT truncation — a model can finish normally
// and still emit an unmatched '{'; a max_tokens bump won't touch it):
//   stop_reason == max_tokens             -> (a) TRUNCATION, any branch  -> Geri max_tokens bump / schema trim
//   end_turn + no_brace                   -> (b) clean genuine prose     -> structured output (ONLY Toranot leaf)
//   end_turn + unbalanced                 -> AMBIGUOUS (malformed-JSON | prose w/ stray '{') -> bounded-sample eyeball
//   end_turn + parse_threw                -> AMBIGUOUS (malformed-complete | prose w/ {...})  -> bounded-sample eyeball
//   end_turn + parsed                     -> wrong-shape (string-bool / missing-key) -> prompt/schema fix
// Eyeball set = the TWO non-no_brace end_turn cells, not parse_threw alone.
//
// Two contracts:
//  1. judgeWithShapeRetry enriches the final ai-parse-error judge log
//     with first_branch (classifyExtractFailure of the FIRST response)
//     and first_stop_reason (the FIRST response's stop_reason) — derived
//     from the ORIGINAL failure, not the corrective re-ask. Zero raw-text
//     retention beyond the audit-5 200-char `text` slice (unchanged).
//  2. callClaude surfaces data.stop_reason (source-assertion — same way
//     chaosBotV4ProxyMode.test.js verifies callClaude's header plumbing,
//     since callClaude does a real fetch and is not unit-isolatable).
//
// MUST NOT regress: cap=1, exactly-2-calls symmetry, residual-{}, and the
// existing `text`/`at` fields (the 15-test pinned suite stays byte-stable;
// these are additive fields, asserted in a SEPARATE file).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { judgeWithShapeRetry } from '../scripts/lib/judgeShapeValidator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOT_SRC = readFileSync(
  join(HERE, '../scripts/chaos-doctor-bot-v4.mjs'),
  'utf8',
);

// callClaude-shaped stub that ALSO carries stopReason (the new contract).
function makeStub(queue) {
  let i = 0;
  const calls = [];
  const fn = async (system, userPrompt, opts) => {
    calls.push({ system, userPrompt, opts });
    const r = queue[Math.min(i, queue.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    // queue items: { text, stopReason } | string (legacy, no stopReason)
    if (typeof r === 'string') return { text: r, inputTokens: 1, outputTokens: 1 };
    return { text: r.text, stopReason: r.stopReason, inputTokens: 1, outputTokens: 1 };
  };
  fn.calls = calls;
  return fn;
}

const judgePE = (log) =>
  log.bugs.filter((b) => b.type === 'ai-parse-error' && b.context === 'judge');

describe('judge parse-failure log carries first_branch + first_stop_reason', () => {
  it('(a) truncated first response -> first_branch=unbalanced, first_stop_reason=max_tokens', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct":tr', stopReason: 'max_tokens' },
      { text: 'still {"app_answer_correct":fa', stopReason: 'max_tokens' },
    ]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(Object.keys(j).length).toBe(0);          // residual {} unchanged
    expect(stub.calls.length).toBe(2);              // cap=1 unchanged
    const pe = judgePE(log);
    expect(pe.length).toBe(1);
    expect(pe[0].first_branch).toBe('unbalanced');  // (a) truncation class
    expect(pe[0].first_stop_reason).toBe('max_tokens');
    expect(pe[0]).toHaveProperty('text');           // audit-5 field preserved
    expect(pe[0]).toHaveProperty('at');
  });

  it('(b) genuine prose first response -> first_branch=no_brace, first_stop_reason=end_turn', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: 'No — per Hazzard 8e the app answer is wrong.', stopReason: 'end_turn' },
      { text: 'Still prose, no JSON here.', stopReason: 'end_turn' },
    ]);
    await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    const pe = judgePE(log);
    expect(pe.length).toBe(1);
    expect(pe[0].first_branch).toBe('no_brace');    // (b) genuine prose
    expect(pe[0].first_stop_reason).toBe('end_turn');
  });

  it('(c) malformed-but-complete first response -> first_branch=parse_threw', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct": True}', stopReason: 'end_turn' },
      { text: '{still:bad,}', stopReason: 'end_turn' },
    ]);
    await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    const pe = judgePE(log);
    expect(pe.length).toBe(1);
    expect(pe[0].first_branch).toBe('parse_threw'); // (c) + ambiguous bucket
    expect(pe[0].first_stop_reason).toBe('end_turn');
  });

  it('legacy stub without stopReason -> first_stop_reason is null, no throw (backward compat)', async () => {
    const log = { bugs: [] };
    const stub = makeStub(['{"app_answer_correct":tr', 'still bad']); // strings = no stopReason
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(Object.keys(j).length).toBe(0);
    const pe = judgePE(log);
    expect(pe.length).toBe(1);
    expect(pe[0].first_branch).toBe('unbalanced');
    expect(pe[0].first_stop_reason).toBe(null);     // absent -> null, never undefined/throw
  });

  it('conforming-on-first fires no log (telemetry only on real failure)', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct":false,"confidence":80,"issue":null,"correct_letter_if_app_wrong":"C"}', stopReason: 'end_turn' },
    ]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(typeof j.app_answer_correct).toBe('boolean');
    expect(stub.calls.length).toBe(1);
    expect(log.bugs.length).toBe(0);
  });
});

// The audit-6 target is the UNDERLYING first-attempt failure rate
// (~26%), NOT the double-failure residual (~7%) that audit-5's terminal
// ai-parse-error log samples. The retry is a schema-restated re-ask with
// the SAME 400-token budget — its recovery is class-dependent, so the
// double-failure histogram is a biased estimator of the underlying
// composition. The instrument must emit on EVERY first-attempt failure
// (recovered or not), via a distinct type so audit-5's B5 contract +
// the 15-pin suite stay byte-stable.
const judgeFF = (log) =>
  log.bugs.filter((b) => b.type === 'judge-shape-firstfail' && b.context === 'judge');

describe('un-conditioned first-attempt-failure population (the audit-6 target)', () => {
  it('recovered-first-fail STILL leaves a firstfail trace (recovered:true), 0 ai-parse-error', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct":tr', stopReason: 'max_tokens' },              // first fails
      { text: '{"app_answer_correct":false,"confidence":80,"issue":null,"correct_letter_if_app_wrong":"C"}', stopReason: 'end_turn' }, // retry recovers
    ]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(typeof j.app_answer_correct).toBe('boolean'); // retry recovered
    expect(stub.calls.length).toBe(2);                   // cap=1 unchanged
    expect(judgePE(log).length).toBe(0);                 // residual view: nothing (the bug this fixes)
    const ff = judgeFF(log);
    expect(ff.length).toBe(1);                           // underlying view: the first failure IS recorded
    expect(ff[0].first_branch).toBe('unbalanced');
    expect(ff[0].first_stop_reason).toBe('max_tokens');
    expect(ff[0].recovered).toBe(true);
  });

  it('double-fail emits firstfail(recovered:false) AND ai-parse-error; they reconcile 1:1', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: 'No — the app answer is wrong per Hazzard 8e.', stopReason: 'end_turn' },
      { text: 'Still prose, no JSON.', stopReason: 'end_turn' },
    ]);
    await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    const ff = judgeFF(log);
    const pe = judgePE(log);
    expect(ff.length).toBe(1);
    expect(ff[0]).toMatchObject({ first_branch: 'no_brace', first_stop_reason: 'end_turn', recovered: false });
    expect(pe.length).toBe(1);
    // reconciliation invariant: residual == firstfail with recovered:false
    expect(ff.filter((r) => r.recovered === false).length).toBe(pe.length);
  });

  it('conforming-on-first emits NO firstfail (success is not the population)', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct":true,"confidence":90,"issue":null,"correct_letter_if_app_wrong":null}', stopReason: 'end_turn' },
    ]);
    await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(judgeFF(log).length).toBe(0);
  });

  it('retry-throw: first failure still recorded (recovered:false) + ai-error, returns {}', async () => {
    const log = { bugs: [] };
    const stub = makeStub([
      { text: '{"app_answer_correct": True}', stopReason: 'end_turn' },   // first fails (parse_threw)
      new Error('Claude API 529: overloaded'),                            // retry throws
    ]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(Object.keys(j).length).toBe(0);
    const ff = judgeFF(log);
    expect(ff.length).toBe(1);
    expect(ff[0]).toMatchObject({ first_branch: 'parse_threw', first_stop_reason: 'end_turn', recovered: false });
    expect(log.bugs.filter((b) => b.type === 'ai-error' && b.context === 'judge').length).toBe(1);
    expect(judgePE(log).length).toBe(0); // retry never produced resp2 -> no terminal ai-parse-error
  });
});

describe('callClaude surfaces stop_reason (source-assertion)', () => {
  it('callClaude return reads data.stop_reason and exposes it', () => {
    // Same verification style as chaosBotV4ProxyMode.test.js (callClaude
    // does a real fetch; the contract is pinned by source inspection).
    expect(BOT_SRC).toMatch(/data\.stop_reason/);
    // surfaced on the returned object alongside text/tokens
    expect(BOT_SRC).toMatch(/return \{ text, inputTokens: inT, outputTokens: outT, stopReason/);
  });
});
