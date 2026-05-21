import { describe, it, expect } from 'vitest';
import merge from '../scripts/merge-questions.cjs';

/**
 * Regression tests for the v10.64.93 e-split awareness of merge-questions.cjs.
 * Before the fix the script required inline `q.e` and wrote `e` into
 * questions.json — which post-split would either reject modern inputs or
 * desync questions.json from the parallel-indexed explanations.json.
 */

const { mergeQuestions, cleanQuestion, appendToQuestionsText } = merge;

const EXISTING_QS = [{ q: 'old question about hearts', o: ['a', 'b', 'c', 'd'], c: 0, t: '2022', ti: 17 }];
const EXISTING_EXPS = ['explanation for the old question'];

describe('merge-questions — e-split aware merge', () => {
  it('exports the testable pure functions', () => {
    expect(typeof mergeQuestions).toBe('function');
    expect(typeof cleanQuestion).toBe('function');
    expect(typeof appendToQuestionsText).toBe('function');
  });

  it('extracts e into the parallel explanations array, NOT into the question', () => {
    const gen = [{ q: 'new q about falls in elderly', o: ['w', 'x', 'y', 'z'], c: 2, t: 'SZMC-Rescue', ti: 4, e: 'because balance' }];
    const { newQs, newExps } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(newQs).toHaveLength(1);
    expect(newExps).toEqual(['because balance']);
    expect('e' in newQs[0]).toBe(false);
    expect(newQs[0]).toEqual({ q: 'new q about falls in elderly', o: ['w', 'x', 'y', 'z'], c: 2, t: 'SZMC-Rescue', ti: 4 });
  });

  it('strips every _* provenance field from merged questions', () => {
    const gen = [{
      q: 'q carrying provenance', o: ['a', 'b', 'c', 'd'], c: 1, t: 'SZMC-Rescue', ti: 8, tis: [8], e: 'exp',
      _source: 'R7', _orig_id: 'SA001', _ti_confidence: 'high', _q_he: 'שאלה',
    }];
    const { newQs } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(Object.keys(newQs[0]).some(k => k.startsWith('_'))).toBe(false);
    expect(newQs[0]).toEqual({ q: 'q carrying provenance', o: ['a', 'b', 'c', 'd'], c: 1, t: 'SZMC-Rescue', ti: 8, tis: [8] });
  });

  it('keeps newQs and newExps parallel and equal-length', () => {
    const gen = [
      { q: 'falls question alpha', o: ['a', 'b', 'c', 'd'], c: 0, t: 'X', ti: 4, e: 'exp A' },
      { q: 'delirium question beta', o: ['a', 'b', 'c', 'd'], c: 1, t: 'X', ti: 5, e: 'exp B' },
    ];
    const { newQs, newExps } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(newQs).toHaveLength(2);
    expect(newExps).toEqual(['exp A', 'exp B']);
  });

  it('merges a question with NO e (gate no longer requires it) — explanation defaults to ""', () => {
    const gen = [{ q: 'question with no explanation', o: ['a', 'b', 'c', 'd'], c: 0, t: 'X', ti: 2 }];
    const { newQs, newExps, invalid, noExplanation } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(invalid).toBe(0);
    expect(noExplanation).toBe(1);
    expect(newQs).toHaveLength(1);
    expect(newExps).toEqual(['']);
  });

  it('dedups against existing questions by 80-char stem prefix', () => {
    const gen = [{ q: 'old question about hearts', o: ['a', 'b', 'c', 'd'], c: 0, t: 'X', ti: 17, e: 'dup' }];
    const { newQs, dupes } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(dupes).toBe(1);
    expect(newQs).toHaveLength(0);
  });

  it('skips invalid questions — wrong option count, out-of-range c', () => {
    const gen = [
      { q: 'three options only', o: ['a', 'b', 'c'], c: 0, t: 'X', ti: 1, e: 'e' },
      { q: 'c index out of range', o: ['a', 'b', 'c', 'd'], c: 9, t: 'X', ti: 1, e: 'e' },
    ];
    const { newQs, invalid } = mergeQuestions(EXISTING_QS, EXISTING_EXPS, gen);
    expect(invalid).toBe(2);
    expect(newQs).toHaveLength(0);
  });

  it('throws if the existing questions/explanations arrays are not parallel', () => {
    expect(() => mergeQuestions(EXISTING_QS, ['a', 'b'], [])).toThrow(/parallel/);
  });

  it('appendToQuestionsText preserves existing bytes and appends valid JSON', () => {
    const orig = '[\n{\n"q": "first",\n"o": [\n"a",\n"b",\n"c",\n"d"\n],\n"c": 0,\n"t": "X",\n"ti": 1\n}\n]';
    const head = orig.slice(0, orig.lastIndexOf(']')).replace(/\s+$/, '');
    const out = appendToQuestionsText(orig, [{ q: 'second', o: ['a', 'b', 'c', 'd'], c: 1, t: 'X', ti: 2 }]);
    expect(out.startsWith(head)).toBe(true);          // existing entry untouched
    const parsed = JSON.parse(out);                   // result is valid JSON
    expect(parsed).toHaveLength(2);
    expect(parsed[0].q).toBe('first');
    expect(parsed[1].q).toBe('second');
  });

  // Codex P2 (PR #255): appending into an empty corpus must not emit "[,…".
  it('appendToQuestionsText appends into an empty corpus without a leading comma', () => {
    for (const empty of ['[]', '[\n]', '[ ]']) {
      const out = appendToQuestionsText(empty, [{ q: 'first ever', o: ['a', 'b', 'c', 'd'], c: 0, t: 'X', ti: 1 }]);
      expect(out.includes('[,'), `input ${JSON.stringify(empty)}`).toBe(false);
      const parsed = JSON.parse(out);
      expect(parsed, JSON.stringify(empty)).toHaveLength(1);
      expect(parsed[0].q).toBe('first ever');
    }
  });
});
