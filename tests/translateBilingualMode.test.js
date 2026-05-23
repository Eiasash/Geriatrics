/**
 * Unit tests for translate_questions_to_hebrew.cjs bilingual write helpers.
 *
 * Regression coverage for Codex P2 on PR #257: in --mode bilingual,
 * `e_en` was only set when source `target.e` was a non-empty string. Records
 * with missing/empty source e left `e_en` undefined, violating the schema
 * contract enforced by tests/bilingualToggle.test.js
 * ("every q_en is paired with o_en and e_en", typeof check).
 *
 * The 80 SZMC-Rescue MCQs all had non-empty e so this didn't surface in PR #257
 * staging output. But data/questions.json still contains untranslated English
 * candidates with missing e, so any future run would have generated the broken
 * state. Fix: applyBilingual always initializes e_en to a string (source e if
 * present, else empty string).
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { applyBilingual, applyInPlace } = require(
  resolve(import.meta.dirname, '..', 'scripts', 'translate_questions_to_hebrew.cjs')
);

describe('applyBilingual — v10.64.60 schema', () => {
  it('preserves English source in q_en/o_en/e_en when source e is non-empty', () => {
    const target = { q: 'EN q', o: ['A','B','C','D'], c: 0, e: 'EN explanation' };
    applyBilingual(target, { q: 'HE q', o: ['א','ב','ג','ד'], e: 'HE explanation' });

    expect(target.q).toBe('HE q');
    expect(target.q_en).toBe('EN q');
    expect(target.o_en).toEqual(['A','B','C','D']);
    expect(target.e).toBe('HE explanation');
    expect(target.e_en).toBe('EN explanation');
  });

  it('initializes e_en to empty string when source has no `e` field (Codex P2 PR #257 regression)', () => {
    // The bug: previously this would leave e_en undefined, violating
    // tests/bilingualToggle.test.js's "every q_en is paired with e_en" check.
    const target = { q: 'EN q', o: ['A','B'], c: 0 };  // no e
    applyBilingual(target, { q: 'HE q', o: ['א','ב'], e: '' });

    expect(target.q_en).toBe('EN q');
    expect(typeof target.e_en).toBe('string');  // MUST be string, not undefined
    expect(target.e_en).toBe('');
  });

  it('initializes e_en to empty string when source e is empty string', () => {
    const target = { q: 'EN q', o: ['A'], c: 0, e: '' };
    applyBilingual(target, { q: 'HE q', o: ['א'], e: 'HE explanation' });

    expect(typeof target.e_en).toBe('string');
    expect(target.e_en).toBe('');
  });

  it('does NOT overwrite target.e when translated.e is empty (preserves source-asymmetric translation)', () => {
    // If translation produced no Hebrew explanation, don't blow away any
    // existing Hebrew explanation already on the target (defensive).
    const target = { q: 'EN q', o: ['A'], c: 0, e: 'pre-existing HE' };
    applyBilingual(target, { q: 'HE q', o: ['א'], e: '' });

    expect(target.e).toBe('pre-existing HE');
  });
});

describe('applyInPlace — pre-v10.64.60 mode', () => {
  it('overwrites q/o/e with Hebrew translation, does NOT introduce q_en/o_en/e_en', () => {
    const target = { q: 'EN q', o: ['A','B'], c: 0, e: 'EN explanation' };
    applyInPlace(target, { q: 'HE q', o: ['א','ב'], e: 'HE explanation' });

    expect(target.q).toBe('HE q');
    expect(target.e).toBe('HE explanation');
    expect(target.q_en).toBeUndefined();
    expect(target.o_en).toBeUndefined();
    expect(target.e_en).toBeUndefined();
  });

  it('does NOT overwrite target.e when translated.e is empty', () => {
    const target = { q: 'EN q', o: ['A'], c: 0, e: 'pre-existing' };
    applyInPlace(target, { q: 'HE q', o: ['א'], e: '' });
    expect(target.e).toBe('pre-existing');
  });
});

describe('applyBilingual + applyInPlace — option array length preservation', () => {
  it('bilingual preserves o.length === o_en.length (test bilingualToggle dependency)', () => {
    const target = { q: 'EN', o: ['A','B','C','D','E'], c: 2 };
    applyBilingual(target, { q: 'HE', o: ['א','ב','ג','ד','ה'], e: '' });

    expect(target.o.length).toBe(target.o_en.length);
    expect(target.o.length).toBe(5);
  });
});
