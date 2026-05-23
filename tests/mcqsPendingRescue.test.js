import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import normalizer from '../scripts/normalize_rescue_mcqs.cjs';

/**
 * Schema guard for scripts/mcqs_pending_rescue_2026-05-21.json — the staging
 * file produced by scripts/normalize_rescue_mcqs.cjs from the four rescued MCQ
 * files (R7/R13/R19/R20) of the 2026-05-21 Phase-4 home-dir cleanup.
 *
 * This is a REVIEW STAGING file, not the live corpus. It is intentionally NOT
 * loaded by the app or by dataIntegrity.test.js. These checks pin the staging
 * shape so a future merge step has a known, valid input.
 */

const FILE = 'scripts/mcqs_pending_rescue_2026-05-21.json';
const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

describe('mcqs_pending_rescue_2026-05-21.json — rescued-MCQ staging file', () => {
  it('is a non-empty bare array (merge-compatible shape)', () => {
    expect(Array.isArray(data)).toBe(true);
    // 82 normalized - 2 dropped (R19#2, R19#5 — unsourceable Israeli regulatory
    // facts, dropped per the 2026-05-22 mcq-quality-auditor VERIFY findings).
    expect(data.length).toBe(80);
  });

  it('holds the expected per-source counts', () => {
    const bySrc = {};
    for (const r of data) bySrc[r._source] = (bySrc[r._source] || 0) + 1;
    // R19 is 4 (was 6): R19#2/#5 dropped — see length assertion above.
    expect(bySrc).toEqual({ R7: 20, R13: 16, R19: 4, R20: 40 });
  });

  it('every record carries the canonical questions.json fields', () => {
    for (const r of data) {
      const id = r._orig_id;
      expect(typeof r.q, id).toBe('string');
      expect(r.q.trim().length, id).toBeGreaterThan(0);
      expect(Array.isArray(r.o), id).toBe(true);
      expect(r.o.length, id).toBe(4);
      for (const opt of r.o) {
        expect(typeof opt, id).toBe('string');
        expect(opt.trim().length, id).toBeGreaterThan(0);
      }
      expect(Number.isInteger(r.c), id).toBe(true);
      expect(r.c, id).toBeGreaterThanOrEqual(0);
      expect(r.c, id).toBeLessThan(r.o.length);
      expect(r.t, id).toBe('SZMC-Rescue');
      expect(Number.isInteger(r.ti), id).toBe(true);
      expect(r.ti, id).toBeGreaterThanOrEqual(0);
      expect(r.ti, id).toBeLessThanOrEqual(45);
      expect(r.tis, id).toEqual([r.ti]);
      expect(typeof r.e, id).toBe('string');
      expect(r.e.trim().length, id).toBeGreaterThan(0);
      expect(typeof r.ref, id).toBe('string');
    }
  });

  it('carries provenance metadata on every record', () => {
    for (const r of data) {
      expect(['R7', 'R13', 'R19', 'R20']).toContain(r._source);
      expect(typeof r._orig_id).toBe('string');
      expect(r._orig_id.length).toBeGreaterThan(0);
      expect(['direct', 'exact', 'fuzzy', 'UNMATCHED']).toContain(r._c_resolved);
      expect(['high', 'med', 'low']).toContain(r._ti_confidence);
      expect(typeof r._dup_likely).toBe('boolean');
    }
  });

  it('has unique _orig_id provenance keys', () => {
    const ids = data.map(r => r._orig_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no leftover "A) " option-letter prefixes (R19 strip regression guard)', () => {
    const prefix = /^[A-Da-d][)\.]\s/;
    for (const r of data) {
      for (const opt of r.o) expect(prefix.test(opt), `${r._orig_id}: "${opt}"`).toBe(false);
    }
  });

  it('resolved every R20 free-text answer to a real option (no UNMATCHED)', () => {
    const r20 = data.filter(r => r._source === 'R20');
    expect(r20.length).toBe(40);
    expect(r20.every(r => r._c_resolved === 'exact' || r._c_resolved === 'fuzzy')).toBe(true);
    expect(data.filter(r => r._c_resolved === 'UNMATCHED')).toEqual([]);
  });

  it('has zero records flagged with schema problems', () => {
    expect(data.filter(r => r._needs_review).map(r => r._orig_id)).toEqual([]);
  });
});

describe('normalize_rescue_mcqs — resolveTextC free-text answer resolution', () => {
  const { resolveTextC } = normalizer;
  const OPTS = ['Apixaban 5mg BID', 'Warfarin', 'Aspirin 325mg', 'Dabigatran 150mg BID'];

  it('exports resolveTextC for unit testing', () => {
    expect(typeof resolveTextC).toBe('function');
  });

  it('resolves an exact text answer to its option index', () => {
    expect(resolveTextC('Warfarin', OPTS)).toEqual({ c: 1, how: 'exact' });
  });

  // Regression guard for Codex P2 (PR #254): an empty/whitespace correct_answer
  // must NOT silently fuzzy-match index 0 (`option.includes('')` is always true).
  it('surfaces an empty/whitespace correct_answer as UNMATCHED — never silently indexes 0', () => {
    for (const empty of ['', '   ', '\t\n', null, undefined]) {
      const r = resolveTextC(empty, OPTS);
      expect(r.how, JSON.stringify(empty)).toBe('UNMATCHED');
      expect(Number.isInteger(r.c), JSON.stringify(empty)).toBe(false);
    }
  });

  it('surfaces a genuinely-unmatched answer as UNMATCHED, not a fuzzy index-0 hit', () => {
    const r = resolveTextC('Clopidogrel is not one of these options', OPTS);
    expect(r.how).toBe('UNMATCHED');
    expect(Number.isInteger(r.c)).toBe(false);
  });
});
