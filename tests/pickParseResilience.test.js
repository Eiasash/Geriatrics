// AUDIT8 G5(a) — pick-parser resilience harness.
// Pre-registration: docs/AUDIT8_G5a_REPAIR_GATE.md (committed in the same PR).
//
// The CERT RESULT (docs/AUDIT8_G5_REPAIR_GATE.md §VERDICT) found the bounded
// run's `ai-parse-error/pick` DROP channel `BIASED` on covariate `t`
// (question provenance / exam-era). This harness pins the G5(a) fix:
//   - RED-proof: the OLD inline parse (extractJson || {} →
//     LETTER_TO_IDX[pick.slice(0,1)]) genuinely DROPS each recoverable
//     fixture bucket — so the harness is trusted (the old path really fails).
//   - GREEN: parsePickLetter / pickWithShapeRetry recover a valid in-range
//     idx for every recoverable bucket, exercise the corrective retry via an
//     injected fake callClaude, and correctly route numeric/empty to retry.
//   - Schema-invariance (§3.1): the terminal ai-parse-error/pick drop row is
//     pinned byte-stable by tests/chaosBotV4PickIdentityInstrument.test.js
//     (unchanged); here we assert the drop fires only AFTER the retry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extractJson } from '../scripts/lib/extractJson.mjs';
import {
  parsePickLetter,
  pickWithShapeRetry,
  letterFor,
} from '../scripts/lib/pickParse.mjs';

// ── The OLD parse logic, replicated verbatim for the RED-proof. This is the
//    chaos-doctor-bot-v4.mjs:498-505 path being replaced. If this ever stops
//    dropping the known-bad fixtures, the harness is not testing a real fix.
const OLD_LETTER_TO_IDX = {
  A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3,
  'א': 0, 'ב': 1, 'ג': 2, 'ד': 3,
};
function oldParse(text, optCount) {
  const obj = extractJson(text) || {};
  const aiLetter = String(obj.pick || '').trim().slice(0, 1);
  const aiIdx = OLD_LETTER_TO_IDX[aiLetter];
  if (aiIdx == null || aiIdx < 0 || aiIdx >= optCount) return null; // DROP
  return aiIdx;
}

// ── Fixture buckets (STEP-1 diagnostic; real audit8cert rows absent on disk
//    → synthesized per the gate §2 FALLBACK, one representative per class the
//    pick channel can emit at maxTokens:250).
const RECOVERABLE = [
  { bucket: 'unbalanced',           text: '{"pick":"C","confidence":8',     optCount: 4, idx: 2 },
  { bucket: 'parse_threw',          text: '{"pick": C, "confidence": 80}',  optCount: 4, idx: 2 },
  { bucket: 'no_brace-keyed',       text: 'pick: B — heart failure',        optCount: 4, idx: 1 },
  { bucket: 'no_brace-bare',        text: 'C',                              optCount: 4, idx: 2 },
  { bucket: 'parsed-but-bad-field-E',   text: '{"pick":"E","confidence":70}', optCount: 5, idx: 4 },
  { bucket: 'parsed-but-bad-field-heb', text: '{"pick":"ה"}',                optCount: 5, idx: 4 },
];

const UNRECOVERABLE_BY_PARSER = [
  { bucket: 'numeric-number', text: '{"pick":3}',    optCount: 4 },
  { bucket: 'numeric-string', text: '{"pick":"3"}',  optCount: 4 },
  { bucket: 'empty',          text: '',              optCount: 4 },
  { bucket: 'prose-ambiguous', text: 'The answer could be A or B', optCount: 4 },
  { bucket: 'out-of-range-E-on-4opt', text: '{"pick":"E"}', optCount: 4 },
];

const BOT = readFileSync(
  fileURLToPath(new URL('../scripts/chaos-doctor-bot-v4.mjs', import.meta.url)),
  'utf8',
);

describe('G5(a) RED-proof: the OLD pick parse drops the recoverable buckets', () => {
  // The unbalanced case is the gate's named RED anchor.
  it('OLD parse returns null (DROP) on the unbalanced/truncation fixture', () => {
    expect(oldParse('{"pick":"C","confidence":8', 4)).toBeNull();
  });
  it('OLD parse drops EVERY recoverable bucket (so the fix is genuinely RED→GREEN)', () => {
    for (const f of RECOVERABLE) {
      expect(oldParse(f.text, f.optCount), `old should drop ${f.bucket}`).toBeNull();
    }
  });
});

describe('G5(a) GREEN: parsePickLetter recovers every recoverable bucket in-range', () => {
  for (const f of RECOVERABLE) {
    it(`recovers ${f.bucket} → idx ${f.idx}`, () => {
      const r = parsePickLetter(f.text, f.optCount);
      expect(r, `${f.bucket} should parse`).not.toBeNull();
      expect(r.idx).toBe(f.idx);
      expect(r.idx).toBeGreaterThanOrEqual(0);
      expect(r.idx).toBeLessThan(f.optCount); // always in-range
    });
  }
  it('clean and markdown-fenced JSON still parse (no regression)', () => {
    expect(parsePickLetter('{"pick":"C"}', 4).idx).toBe(2);
    expect(parsePickLetter('```json\n{"pick":"D"}\n```', 4).idx).toBe(3);
  });
  it('answer/choice aliases parse via the structured JSON layer', () => {
    expect(parsePickLetter('{"answer":"B"}', 4).idx).toBe(1);
    expect(parsePickLetter('{"choice":"d"}', 4).idx).toBe(3);
  });
});

describe('G5(a) numeric picks are NOT coerced (routed to retry)', () => {
  for (const f of UNRECOVERABLE_BY_PARSER) {
    it(`${f.bucket} → null (parser declines, caller retries)`, () => {
      expect(parsePickLetter(f.text, f.optCount)).toBeNull();
    });
  }
});

describe('G5(a) pickWithShapeRetry: exactly-one corrective retry via injected callClaude', () => {
  it('recovers on the retry when the first response is unparseable', async () => {
    let calls = 0;
    const fake = async () => {
      calls += 1;
      return calls === 1
        ? { text: 'Hmm, let me think about this carefully without any json' }
        : { text: '{"pick":"D"}' };
    };
    const r = await pickWithShapeRetry({
      system: 's', userPrompt: 'u', callClaude: fake, maxTokens: 250, optCount: 4,
    });
    expect(calls).toBe(2); // exactly one retry
    expect(r.idx).toBe(3);
    expect(r.letter).toBe('D');
    expect(r.recovered).toBe(true);
    expect(r.obj).toEqual({ pick: 'D' });
  });

  it('no retry when the first response parses (cap respected from the other side)', async () => {
    let calls = 0;
    const fake = async () => { calls += 1; return { text: '{"pick":"A","confidence":90}' }; };
    const r = await pickWithShapeRetry({
      system: 's', userPrompt: 'u', callClaude: fake, maxTokens: 250, optCount: 4,
    });
    expect(calls).toBe(1);
    expect(r.idx).toBe(0);
    expect(r.recovered).toBe(false);
    expect(r.obj.confidence).toBe(90);
  });

  it('first-call throw → reason:api-error, NO retry (mirrors judgeWithShapeRetry)', async () => {
    let calls = 0;
    const thrower = async () => { calls += 1; throw new Error('net down'); };
    const r = await pickWithShapeRetry({
      system: 's', userPrompt: 'u', callClaude: thrower, maxTokens: 250, optCount: 4,
    });
    expect(calls).toBe(1);
    expect(r.failed).toBe(true);
    expect(r.reason).toBe('api-error');
    expect(r.message).toBe('net down');
  });

  it('both attempts unparseable → reason:parse hard-fail (the terminal drop)', async () => {
    let calls = 0;
    const garbage = 'completely unparseable model response';
    const both = async () => { calls += 1; return { text: garbage }; };
    const r = await pickWithShapeRetry({
      system: 's', userPrompt: 'u', callClaude: both, maxTokens: 250, optCount: 4,
    });
    expect(calls).toBe(2);
    expect(r.failed).toBe(true);
    expect(r.reason).toBe('parse');
    expect(r.raw).toBe(garbage);
  });

  it('numeric pick on the first call triggers the retry (not coerced to an idx)', async () => {
    let calls = 0;
    const fake = async () => {
      calls += 1;
      return calls === 1 ? { text: '{"pick":3}' } : { text: '{"pick":"C"}' };
    };
    const r = await pickWithShapeRetry({
      system: 's', userPrompt: 'u', callClaude: fake, maxTokens: 250, optCount: 4,
    });
    expect(calls).toBe(2);
    expect(r.idx).toBe(2);
    expect(r.recovered).toBe(true);
  });
});

describe('G5(a) letterFor: 5-option label space (the optCount lever)', () => {
  it('renders A..E (the hardcoded "ABCD"[i] returned undefined for i=4)', () => {
    expect([0, 1, 2, 3, 4].map(letterFor)).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
});

describe('G5(a) bot wiring: drop fires only AFTER the retry; schema-invariant', () => {
  it('the bot routes the pick through pickWithShapeRetry (no inline LETTER_TO_IDX)', () => {
    expect(BOT).toMatch(/pickWithShapeRetry\(\{/);
    expect(BOT).toMatch(/import\s*\{[^}]*\bpickWithShapeRetry\b[^}]*\bletterFor\b[^}]*\}\s*from\s*'\.\/lib\/pickParse\.mjs'/);
    // the old inline lookup table is gone (it would re-introduce the bug)
    expect(/const LETTER_TO_IDX =/.test(BOT)).toBe(false);
    // option lists use letterFor in template position, never the hardcoded
    // 4-letter slice `${'ABCD'[i]}` (prose mentions in comments are fine)
    expect(/\$\{'ABCD'\[i\]\}/.test(BOT)).toBe(false);
    expect(BOT).toMatch(/\$\{letterFor\(i\)\}/);
  });

  it('the terminal ai-parse-error/pick row keeps its byte-stable schema (§3.1)', () => {
    const m = BOT.match(/type:\s*'ai-parse-error'\s*,\s*context:\s*'pick'[^}]*}/);
    expect(m, 'ai-parse-error/pick push not found').toBeTruthy();
    expect(m[0]).toMatch(/dropCtx:\s*'pick-parse-error'/);
    expect(m[0]).toMatch(/\bstemHash\b/);
    expect(m[0]).toMatch(/qIdx:\s*q\.qIdx/);
    expect(m[0]).toMatch(/stem:\s*q\.stem\.slice\(\s*0\s*,\s*300\s*\)/);
    expect(m[0]).toMatch(/optCount:\s*q\.options\.length/);
    // it now reads from the retry result's raw text, post-retry
    expect(m[0]).toMatch(/text:\s*\(pickResult\.raw\s*\|\|\s*''\)\.slice\(\s*0\s*,\s*200\s*\)/);
  });

  it('the ai-error/pick row is preserved for the api-error branch', () => {
    const m = BOT.match(/type:\s*'ai-error'\s*,\s*context:\s*'pick'[^}]*}/);
    expect(m, 'ai-error/pick push not found').toBeTruthy();
    expect(m[0]).toMatch(/dropCtx:\s*'pick-ai-error'/);
    expect(m[0]).toMatch(/\bstemHash\b/);
  });
});
