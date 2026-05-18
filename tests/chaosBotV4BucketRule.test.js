// Audit-6 Option-0 (2026-05-18) — judge parse-failure BUCKETING RULE.
//
// This is the anti-drift guard. The rule below was re-derived/corrected
// TWICE in review; pin it executably so a third drift can't happen:
//
//   TRUNCATION  == first_stop_reason === 'max_tokens'  (ANY branch).
//                  The single direct length-cut signal. Fix: Geri-side
//                  max_tokens bump / verdict-schema trim. ZERO Toranot.
//   Within NOT-max_tokens (end_turn / null / other — a real adherence
//   failure, not a length cut), branch refines:
//     no_brace    -> 'genuine_prose'  (ONLY structured-output/Toranot leaf)
//     parsed      -> 'wrong_shape'    (string-bool/missing-key -> prompt/schema)
//     unbalanced  -> 'ambiguous'      (malformed-JSON | prose w/ stray '{')
//     parse_threw -> 'ambiguous'      (malformed-complete | prose w/ {...})
//     empty       -> 'empty'          (no text — degenerate/throw-adjacent)
//
// branch is NEVER a standalone truncation signal: (end_turn, unbalanced)
// is NOT truncation — letting it sit in the truncation bucket inflates
// the exact count that decides whether Toranot gets touched. The
// bounded-sample raw-text eyeball set is the TWO non-no_brace end_turn
// cells (both -> 'ambiguous'), NOT parse_threw alone.
import { describe, it, expect } from 'vitest';
import {
  bucketJudgeFailure,
  summarizeLedger,
  EYEBALL_CATEGORY,
} from '../scripts/lib/bucketParseFailures.mjs';

const b = (first_stop_reason, first_branch) =>
  bucketJudgeFailure({ first_stop_reason, first_branch });

describe('truncation is keyed off stop_reason==max_tokens (ANY branch)', () => {
  it('max_tokens + any branch -> truncation', () => {
    for (const br of ['unbalanced', 'no_brace', 'parse_threw', 'parsed', 'empty']) {
      expect(b('max_tokens', br)).toBe('truncation');
    }
  });

  it('(end_turn, unbalanced) is NOT truncation -> ambiguous (the corrected cell)', () => {
    // The regression the review caught: unbalanced@end_turn is malformed/
    // prose, not a length-cut. Counting it as truncation inflates the
    // Toranot-gating number.
    expect(b('end_turn', 'unbalanced')).toBe('ambiguous');
    expect(b('end_turn', 'unbalanced')).not.toBe('truncation');
  });

  it('null / unknown stop_reason is NOT truncation (no cut signal -> do not guess)', () => {
    expect(b(null, 'unbalanced')).toBe('ambiguous');
    expect(b(undefined, 'parse_threw')).toBe('ambiguous');
    expect(b('refusal', 'no_brace')).toBe('genuine_prose');
    expect(b(null, 'unbalanced')).not.toBe('truncation');
  });
});

describe('branch refines the non-max_tokens rows', () => {
  it('end_turn + no_brace -> genuine_prose (only Toranot leaf)', () => {
    expect(b('end_turn', 'no_brace')).toBe('genuine_prose');
  });
  it('end_turn + parsed -> wrong_shape (prompt/schema, not Toranot)', () => {
    expect(b('end_turn', 'parsed')).toBe('wrong_shape');
  });
  it('end_turn + parse_threw -> ambiguous', () => {
    expect(b('end_turn', 'parse_threw')).toBe('ambiguous');
  });
  it('end_turn + empty -> empty', () => {
    expect(b('end_turn', 'empty')).toBe('empty');
  });
});

describe('eyeball set = exactly the two non-no_brace end_turn cells', () => {
  it('only unbalanced/parse_threw at non-max_tokens map to the eyeball category', () => {
    expect(EYEBALL_CATEGORY).toBe('ambiguous');
    const eyeballPairs = [];
    for (const sr of ['end_turn', null, 'refusal', 'max_tokens']) {
      for (const br of ['no_brace', 'unbalanced', 'parse_threw', 'parsed', 'empty']) {
        if (bucketJudgeFailure({ first_stop_reason: sr, first_branch: br }) === EYEBALL_CATEGORY) {
          eyeballPairs.push(`${sr}|${br}`);
        }
      }
    }
    // exactly the non-max_tokens × {unbalanced,parse_threw} cells; never any max_tokens cell
    expect(eyeballPairs.sort()).toEqual([
      'end_turn|parse_threw', 'end_turn|unbalanced',
      'null|parse_threw', 'null|unbalanced',
      'refusal|parse_threw', 'refusal|unbalanced',
    ].sort());
    expect(eyeballPairs.some((p) => p.startsWith('max_tokens'))).toBe(false);
  });
});

describe('summarizeLedger — UNDERLYING population (judge-shape-firstfail), not the residual', () => {
  it('buckets the un-conditioned first-attempt failures; residual + reconciliation are secondary', () => {
    const rows = [
      // The UNDERLYING population — every first-attempt failure, recovered or not.
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'max_tokens', first_branch: 'unbalanced', recovered: true },
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'max_tokens', first_branch: 'parse_threw', recovered: false },
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'no_brace', recovered: true },
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'unbalanced', recovered: false },
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'parse_threw', recovered: false },
      { type: 'judge-shape-firstfail', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'parsed', recovered: true },
      // The 3 terminal double-failures (audit-5 B5 log) — reconcile 1:1 with recovered:false above.
      { type: 'ai-parse-error', context: 'judge', first_stop_reason: 'max_tokens', first_branch: 'parse_threw' },
      { type: 'ai-parse-error', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'unbalanced' },
      { type: 'ai-parse-error', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'parse_threw' },
      // Excluded noise.
      { type: 'judge-shape-firstfail', context: 'pick', first_stop_reason: 'max_tokens', first_branch: 'unbalanced', recovered: false }, // pick, not judge
      { type: 'ai-error', context: 'judge', message: 'x' },
      { type: 'ai-judge', app_answer_correct: true },
    ];
    const s = summarizeLedger(rows);

    // PRIMARY = the audit-6 decision input = ALL first-attempt failures.
    expect(s.total).toBe(6);
    expect(s.counts).toEqual({
      truncation: 2, genuine_prose: 1, wrong_shape: 1, ambiguous: 2, empty: 0, unknown: 0,
    });
    expect(s.eyeball_total).toBe(2);

    // SECONDARY (diagnostic) = the residual = recovered:false subset
    // (≡ the audit-5 double-failure population — quantifies the retry's
    // class-dependent recovery, the bias the reviewer flagged).
    expect(s.residual_counts).toEqual({
      truncation: 1, genuine_prose: 0, wrong_shape: 0, ambiguous: 2, empty: 0, unknown: 0,
    });

    // RECONCILIATION invariant: residual (recovered:false) must equal the
    // independent terminal ai-parse-error/judge count, or the instrument
    // drifted.
    expect(s.reconciliation).toEqual({
      firstfail_unrecovered: 3, ai_parse_error: 3, match: true,
    });

    expect(s.fix_routing.truncation).toMatch(/max_tokens/i);
    expect(s.fix_routing.genuine_prose).toMatch(/structured output|Toranot/i);
  });

  it('old ai-parse-error-only ledger -> underlying total 0 (cannot reconstruct; reviewer: no shortcut)', () => {
    const s = summarizeLedger([
      { type: 'ai-parse-error', context: 'judge', first_stop_reason: 'end_turn', first_branch: 'no_brace' },
    ]);
    expect(s.total).toBe(0);                           // no firstfail rows -> underlying unmeasurable
    expect(s.reconciliation).toEqual({ firstfail_unrecovered: 0, ai_parse_error: 1, match: false });
  });

  it('empty ledger -> all-zero, no throw', () => {
    const s = summarizeLedger([]);
    expect(s.total).toBe(0);
    expect(s.eyeball_total).toBe(0);
    expect(s.reconciliation.match).toBe(true); // 0 === 0
  });
});
