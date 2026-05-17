// Audit-5 (2026-05-17) — B5 judge JSON-shape-failure guard.
//
// WHAT THIS PINS
// --------------
// Audit-3 produced 22/86 `disagrees:true` rows where `judge.app_answer_correct`
// was non-boolean. Root cause (evidence, not hypothesis): for all 22,
// `extractJson(judgeResp.text)` returned null at chaos-doctor-bot-v4.mjs:560,
// `|| {}` silently substituted `{}`, and the judge channel had NO parse-error
// log + NO corrective retry (the pick channel logs this at :462). 0 thrown
// judge errors; explain on the same Q succeeded 22/22 -> the failure is
// judge-call-specific, not an API outage. See
// docs/AUDIT5_PRE_REGISTERED_GATE.md (the gate, committed BEFORE this test).
//
// The audit-3 ledger keeps only the post-extract judge OBJECT, not the raw
// failing TEXT, so the literal 22 strings are unrecoverable. This guard
// replays the failure SHAPES via tests/fixtures/judgeShapeFailures.json
// (git-tracked deterministic-replay corpus) + an injected `callJudge` stub
// (no API, no playwright).
//
// THE THREE PRE-REGISTERED PREDICATES (literal targets — do not loosen)
//   P1 detection      : fixture splits exactly 6 nonconforming / 2 conforming.
//   P2 retry wiring   : cap=1; {conforming-stub -> 0/22 residual, 0 logs} |
//                        {nonconforming-stub -> 22/22 stays-{}, 22 typed
//                        ai-parse-error logs} | {throw -> 0 shape-retry,
//                        1 ai-error}; callJudge invoked exactly 2x in BOTH
//                        shape branches (symmetric; never 3 — shape-cap=1 is
//                        layered ABOVE callClaude's orthogonal network retry).
//   P3 regression     : enforced by the 3 baseline suites + the carried-
//                        forward c_accept-AWARE oracle (run in the gate doc),
//                        not here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractJson } from '../scripts/lib/extractJson.mjs';
import {
  validateJudgeShape,
  judgeWithShapeRetry,
} from '../scripts/lib/judgeShapeValidator.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(
  readFileSync(join(HERE, 'fixtures/judgeShapeFailures.json'), 'utf8'),
);

// raw model-output texts for the stub (NONCONF -> extractJson null).
const NONCONF = '{"app_answer_correct":tr';
const CONF =
  '{"app_answer_correct":false,"confidence":80,"issue":null,"correct_letter_if_app_wrong":"C"}';

// callClaude-shaped stub: returns queued raw texts; records every call.
function makeStub(queue) {
  let i = 0;
  const calls = [];
  const fn = async (system, userPrompt, opts) => {
    calls.push({ system, userPrompt, opts });
    const r = queue[Math.min(i, queue.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return { text: r, inputTokens: 1, outputTokens: 1 };
  };
  fn.calls = calls;
  return fn;
}

describe('P1 — validateJudgeShape detection', () => {
  for (const s of FIX.samples) {
    it(`${s.name} -> ok:${s.expect_ok}`, () => {
      expect(validateJudgeShape(extractJson(s.raw)).ok).toBe(s.expect_ok);
    });
  }

  it('fixture splits exactly 6 nonconforming / 2 conforming (P1 target)', () => {
    const oks = FIX.samples.map((s) => validateJudgeShape(extractJson(s.raw)).ok);
    expect(oks.filter((x) => x === true).length).toBe(2);
    expect(oks.filter((x) => x === false).length).toBe(6);
  });

  it('only a boolean app_answer_correct is ok', () => {
    expect(validateJudgeShape(null).ok).toBe(false);
    expect(validateJudgeShape(undefined).ok).toBe(false);
    expect(validateJudgeShape('x').ok).toBe(false);
    expect(validateJudgeShape({}).ok).toBe(false);
    expect(validateJudgeShape({ app_answer_correct: 1 }).ok).toBe(false);
    expect(validateJudgeShape({ app_answer_correct: 'true' }).ok).toBe(false);
    expect(validateJudgeShape({ app_answer_correct: true }).ok).toBe(true);
    expect(validateJudgeShape({ app_answer_correct: false }).ok).toBe(true);
  });
});

describe('P2 — judgeWithShapeRetry wiring (cap=1, injected stub)', () => {
  it('conforming retry: 0/22 residual, exactly 2 calls/item, 0 parse-error logs', async () => {
    let residual = 0;
    let totalCalls = 0;
    const log = { bugs: [] };
    for (let k = 0; k < 22; k++) {
      const stub = makeStub([NONCONF, CONF]);
      const j = await judgeWithShapeRetry({
        system: 'S', userPrompt: 'U', maxTokens: 400,
        callJudge: stub, log, nowIso: () => 'T',
      });
      if (typeof j.app_answer_correct !== 'boolean') residual += 1;
      expect(stub.calls.length).toBe(2); // 1 original + 1 corrective (cap=1)
      totalCalls += stub.calls.length;
    }
    expect(residual).toBe(0);
    expect(totalCalls).toBe(44);
    expect(
      log.bugs.filter((b) => b.type === 'ai-parse-error' && b.context === 'judge').length,
    ).toBe(0);
  });

  it('nonconforming retry: 22/22 stays {}, exactly 2 calls/item (never 3), 22 typed logs', async () => {
    let residual = 0;
    const log = { bugs: [] };
    for (let k = 0; k < 22; k++) {
      // 3rd queued response WOULD conform — cap=1 must stop at 2 and never reach it.
      const stub = makeStub([NONCONF, NONCONF, CONF]);
      const j = await judgeWithShapeRetry({
        system: 'S', userPrompt: 'U', maxTokens: 400,
        callJudge: stub, log, nowIso: () => 'T',
      });
      if (typeof j.app_answer_correct !== 'boolean') residual += 1;
      expect(Object.keys(j).length).toBe(0); // judgeJson stays {}
      expect(stub.calls.length).toBe(2); // cap=1: no 2nd corrective retry
    }
    expect(residual).toBe(22);
    const pe = log.bugs.filter(
      (b) => b.type === 'ai-parse-error' && b.context === 'judge',
    );
    expect(pe.length).toBe(22); // silent-failure gap closed (mirrors pick :462)
    expect(pe[0]).toHaveProperty('text');
    expect(pe[0]).toHaveProperty('at');
  });

  it('hard throw: no shape retry, 1 ai-error, returns {}', async () => {
    const log = { bugs: [] };
    const stub = makeStub([new Error('Claude API 529: overloaded')]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(Object.keys(j).length).toBe(0);
    expect(stub.calls.length).toBe(1); // a throw is not a shape problem
    expect(
      log.bugs.filter((b) => b.type === 'ai-error' && b.context === 'judge').length,
    ).toBe(1);
    expect(log.bugs.filter((b) => b.type === 'ai-parse-error').length).toBe(0);
  });

  it('corrective retry is a validator-gated RE-ASK (not prompt-only)', async () => {
    const log = { bugs: [] };
    const stub = makeStub([NONCONF, CONF]);
    await judgeWithShapeRetry({
      system: 'S', userPrompt: 'ORIGINAL_PROMPT', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(stub.calls[0].userPrompt).toBe('ORIGINAL_PROMPT');
    expect(stub.calls[1].userPrompt).not.toBe('ORIGINAL_PROMPT');
    expect(stub.calls[1].userPrompt).toContain('app_answer_correct'); // schema restated
  });

  it('conforming on FIRST call fires no retry (1 call, 0 logs)', async () => {
    const log = { bugs: [] };
    const stub = makeStub([CONF]);
    const j = await judgeWithShapeRetry({
      system: 'S', userPrompt: 'U', maxTokens: 400,
      callJudge: stub, log, nowIso: () => 'T',
    });
    expect(typeof j.app_answer_correct).toBe('boolean');
    expect(stub.calls.length).toBe(1);
    expect(log.bugs.length).toBe(0);
  });
});

// Load-bearing RED pin: the P1 fixture proves the detector RED on the
// failure SHAPE FAMILY (truncation/prose/string-bool/missing-key). This
// block additionally pins it RED on the *literal observed* B5 input —
// proven, not assumed — without perturbing the pre-registered 6/2 fixture.
// Audit-3 `b5_rows_dump.json`: ALL 22 B5 rows had EXACTLY the post-explain-
// back-fill object `{confidence, explanation_sound}` (the judge itself
// contributed nothing). The PRODUCTION decision input at the replaced
// chaos-doctor-bot-v4.mjs:560 is `extractJson(rawJudgeText)` -> null (the
// judge text was unparseable). Both must be RED or the detector misses the
// real defect, not just its cousins.
describe('literal observed B5 input — RED pin (not just synthetic cousins)', () => {
  it('(A) production input: unparseable judge text -> extractJson null -> ok:false', () => {
    expect(extractJson('{"app_answer_correct":tr')).toBe(null); // truncated
    expect(extractJson('Yes, the app answer is correct per Hazzard 8e.')).toBe(null); // prose-only
    expect(validateJudgeShape(null).ok).toBe(false);
  });

  it('(B) literal 22x-observed ledger artifact {confidence, explanation_sound} -> ok:false', () => {
    expect(validateJudgeShape({ confidence: 97, explanation_sound: false }).ok).toBe(false);
    // key-order independent (the 22 rows appeared in both serializations)
    expect(validateJudgeShape({ explanation_sound: false, confidence: 90 }).ok).toBe(false);
  });
});
