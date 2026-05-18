// Audit-6 Option-0 (2026-05-18) — extractJson failure-class classifier.
//
// WHY THIS EXISTS
// ---------------
// Audit-5 closed the B5 *silent-swallow* (judge JSON-parse failures now
// logged + retried). Audit-6 STEP-0 (docs/AUDIT6_STEP0_scope_blocked...)
// established the brief's "force structured output" frame is unsafe
// UNTIL the failure-mode composition is measured: extractJson() returns
// null on THREE structurally distinct branches, and only one of them
// (genuine prose) is a cross-repo / structured-output conversation —
// the other two are cheap Geri-side fixes:
//
//   unbalanced  -> (a) truncated mid-object        -> max_tokens bump
//   parse_threw -> (c) complete-but-invalid JSON   -> lenient parse / prompt
//   no_brace    -> (b) genuine prose, no JSON      -> structured output
//
// A single stop_reason boolean separates (a) from {(b),(c)} but cannot
// split (b) from (c). classifyExtractFailure() exposes WHICH of
// extractJson()'s `return null` branches fired — a free enum derived
// from the SAME scan (no duplicated parser; DRY / audit-5
// grep-existing-utility), so the next bounded chaos run emits
// bucketable telemetry with zero raw-text retention.
//
// LOAD-BEARING REGRESSION: the refactor that adds the classifier MUST
// NOT change extractJson()'s return value for ANY input — that return
// contract is the audit-5 floor (tests/chaosBotV4JudgeShapeValidator
// + the carried-forward c_accept oracle depend on it). The consistency
// invariant test below pins exactly that.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractJson,
  classifyExtractFailure,
} from '../scripts/lib/extractJson.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(
  readFileSync(join(HERE, 'fixtures/judgeShapeFailures.json'), 'utf8'),
);

describe('classifyExtractFailure — branch enum', () => {
  it('empty / falsy input -> "empty", extractJson null', () => {
    for (const x of ['', null, undefined, 0, false]) {
      expect(classifyExtractFailure(x)).toBe('empty');
      expect(extractJson(x)).toBe(null);
    }
  });

  it('genuine prose, no brace -> "no_brace" (class b)', () => {
    const prose = 'Yes, the app answer is correct per Hazzard 8e.';
    expect(classifyExtractFailure(prose)).toBe('no_brace');
    expect(extractJson(prose)).toBe(null);
  });

  it('truncated mid-object (the literal B5 pin) -> "unbalanced" (class a)', () => {
    expect(classifyExtractFailure('{"app_answer_correct":tr')).toBe('unbalanced');
    expect(extractJson('{"app_answer_correct":tr')).toBe(null);
    // longer truncation, braces still never close
    expect(
      classifyExtractFailure('{"app_answer_correct":true,"confidence":8'),
    ).toBe('unbalanced');
  });

  it('complete-but-invalid JSON -> "parse_threw" (class c)', () => {
    for (const bad of [
      '{"app_answer_correct": True}',          // python bool
      '{"app_answer_correct":false,}',         // trailing comma
      '{app_answer_correct:false}',            // unquoted key
      "{'app_answer_correct':false}",          // single quotes
    ]) {
      expect(classifyExtractFailure(bad)).toBe('parse_threw');
      expect(extractJson(bad)).toBe(null);
    }
  });

  it('valid / recoverable JSON -> "parsed", extractJson non-null', () => {
    for (const good of [
      '{"app_answer_correct":false,"confidence":80}',
      '```json\n{"app_answer_correct":true}\n```',
      'Verdict: {"app_answer_correct":true}',           // prose-then-json (recovered)
      '{"app_answer_correct":"true"}',                  // valid JSON, wrong SHAPE (validator's job, not classifier's)
      '[1,2,3]',                                        // valid non-object
    ]) {
      expect(classifyExtractFailure(good)).toBe('parsed');
      expect(extractJson(good)).not.toBe(null);
    }
  });
});

describe('consistency invariant (refactor must not fork behavior)', () => {
  it('classify==="parsed" iff extractJson!==null, across the audit-5 fixture', () => {
    for (const s of FIX.samples) {
      const parsedByClass = classifyExtractFailure(s.raw) === 'parsed';
      const parsedByExtract = extractJson(s.raw) !== null;
      expect(parsedByClass).toBe(parsedByExtract);
    }
  });

  it('audit-5 literal pins preserved through the refactor', () => {
    // Re-pinned here so a refactor regression is caught even if the
    // sibling pinned suite is edited. Mirrors
    // chaosBotV4JudgeShapeValidator.test.js:188-189.
    expect(extractJson('{"app_answer_correct":tr')).toBe(null);
    expect(
      extractJson('Yes, the app answer is correct per Hazzard 8e.'),
    ).toBe(null);
  });
});
