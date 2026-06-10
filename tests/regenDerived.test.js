/**
 * Tests for scripts/regen_derived.cjs — the structural fix for the
 * "denominator-invalidates-all-ratios" bug class that bit PR #258.
 *
 * Two levels of coverage:
 *   1. Unit tests for the pure function regenSyllabusGeri (deterministic
 *      recompute of n_questions + frequency_pct + total_questions_analyzed,
 *      preserving weight/keywords/en/he/topic-order and Pnimit/Mishpacha).
 *   2. Integration gate: run the script in --check mode against the live
 *      repo state — must exit 0 (no drift). This is the CI gate that would
 *      have caught PR #258's stale syllabus_data.json before merge.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { withDerivedFilesLock } from './_helpers/derivedFilesLock.js';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '..');
const { regenSyllabusGeri, jsonContentEqual } = require(
  resolve(ROOT, 'scripts', 'regen_derived.cjs')
);

describe('regenSyllabusGeri — pure function', () => {
  // Minimal synthetic syllabus mimicking the live schema
  const baseSyllabus = () => ({
    Geri: {
      repo: 'Eiasash/Geriatrics',
      total_questions_analyzed: 100,
      total_topics: 3,
      topics: [
        { id: 8, en: 'Polypharm', he: 'פוליפרמסיה', keywords: ['Beers','STOPP'], n_questions: 40, frequency_pct: 40.0, weight: 3.82 },
        { id: 6, en: 'Dementia',  he: 'דמנציה',   keywords: ['MMSE'],          n_questions: 30, frequency_pct: 30.0, weight: 2.20 },
        { id: 5, en: 'Delirium',  he: 'דליריום',  keywords: ['CAM'],           n_questions: 30, frequency_pct: 30.0, weight: 2.11 },
      ],
    },
    Pnimit: { repo: 'Eiasash/InternalMedicine', total_questions_analyzed: 9999, topics: [{ id: 0, n_questions: 42 }] },
    Mishpacha: { repo: 'Eiasash/FamilyMedicine', total_questions_analyzed: 8888, topics: [{ id: 7, n_questions: 17 }] },
  });

  it('recomputes n_questions correctly by counting q.ti matches', () => {
    const qs = [
      ...Array(326).fill().map(() => ({ ti: 8 })),
      ...Array(188).fill().map(() => ({ ti: 6 })),
      ...Array(182).fill().map(() => ({ ti: 5 })),
    ];
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    expect(out.Geri.topics.find(t => t.id === 8).n_questions).toBe(326);
    expect(out.Geri.topics.find(t => t.id === 6).n_questions).toBe(188);
    expect(out.Geri.topics.find(t => t.id === 5).n_questions).toBe(182);
  });

  it('updates total_questions_analyzed to questions.length', () => {
    const qs = Array(3823).fill().map((_, i) => ({ ti: i % 3 ? 8 : 6 }));
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    expect(out.Geri.total_questions_analyzed).toBe(3823);
  });

  it('computes frequency_pct rounded to 2 decimals (n/total * 100)', () => {
    // 326 of 3823 = 8.526... rounds to 8.53; matches live syllabus value
    const qs = [
      ...Array(326).fill().map(() => ({ ti: 8 })),
      ...Array(3823 - 326).fill().map(() => ({ ti: 99 })),
    ];
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    expect(out.Geri.topics.find(t => t.id === 8).frequency_pct).toBe(8.53);
  });

  it('preserves weight, keywords, en, he, and topic order (no reshuffling)', () => {
    const qs = Array(50).fill().map(() => ({ ti: 8 }));
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    const topic8 = out.Geri.topics.find(t => t.id === 8);
    expect(topic8.weight).toBe(3.82);
    expect(topic8.keywords).toEqual(['Beers','STOPP']);
    expect(topic8.en).toBe('Polypharm');
    expect(topic8.he).toBe('פוליפרמסיה');
    // Topic order: id 8 first, then 6, then 5 (matches input order)
    expect(out.Geri.topics.map(t => t.id)).toEqual([8, 6, 5]);
  });

  it('does NOT touch Pnimit or Mishpacha sections (cross-repo data preserved)', () => {
    const qs = Array(5000).fill().map(() => ({ ti: 8 }));
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    expect(out.Pnimit.total_questions_analyzed).toBe(9999);
    expect(out.Pnimit.topics[0].n_questions).toBe(42);
    expect(out.Mishpacha.total_questions_analyzed).toBe(8888);
    expect(out.Mishpacha.topics[0].n_questions).toBe(17);
  });

  it('does not mutate the input syllabus (pure function discipline)', () => {
    const syl = baseSyllabus();
    const snapshot = JSON.stringify(syl);
    regenSyllabusGeri(syl, Array(100).fill({ ti: 8 }));
    expect(JSON.stringify(syl)).toBe(snapshot);
  });

  it('handles topic with zero matching questions (n=0, frequency_pct=0)', () => {
    const qs = [{ ti: 8 }, { ti: 8 }];  // only ti=8, none for 6 or 5
    const out = regenSyllabusGeri(baseSyllabus(), qs);
    expect(out.Geri.topics.find(t => t.id === 6).n_questions).toBe(0);
    expect(out.Geri.topics.find(t => t.id === 6).frequency_pct).toBe(0);
  });

  it('throws if Geri.topics is missing or not an array', () => {
    const bad = { Geri: { total_questions_analyzed: 0 } };
    expect(() => regenSyllabusGeri(bad, [])).toThrow(/Geri\.topics/);
  });

  it('throws if any topic lacks an integer id', () => {
    const bad = { Geri: { total_questions_analyzed: 0, topics: [{ en: 'Anon' }] } };
    expect(() => regenSyllabusGeri(bad, [])).toThrow(/id/);
  });
});

describe('jsonContentEqual — content-equal helper', () => {
  it('treats integer arrays as sets (order-independent)', () => {
    expect(jsonContentEqual([1, 2, 3], [3, 2, 1])).toBe(true);
    expect(jsonContentEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('deep-equals objects', () => {
    expect(jsonContentEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toBe(true);
    expect(jsonContentEqual({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } })).toBe(false);
  });

  it('compares primitives correctly', () => {
    expect(jsonContentEqual(5, 5)).toBe(true);
    expect(jsonContentEqual('x', 'x')).toBe(true);
    expect(jsonContentEqual(null, null)).toBe(true);
    expect(jsonContentEqual(5, '5')).toBe(false);
  });

  it('compares non-integer arrays positionally (not as sets)', () => {
    expect(jsonContentEqual([{ a: 1 }, { a: 2 }], [{ a: 1 }, { a: 2 }])).toBe(true);
    expect(jsonContentEqual([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(false);
  });
});

describe('regen_derived.cjs --check (integration gate)', () => {
  it('passes against current canonical state — no drift between canonical and derived', async () => {
    // This is the CI gate. If a future PR mutates data/questions.json without
    // regenerating syllabus_data.json + regulatory.json + question_chapters.json,
    // this test fails — exactly the safety net that would have caught PR #258's
    // shipped 19/46 stale denominators.
    //
    // execSync throws non-zero exit codes as exceptions; that's the assertion.
    await withDerivedFilesLock(ROOT, async () => {
      expect(() => {
        execSync('node scripts/regen_derived.cjs --check', {
          cwd: ROOT, stdio: 'pipe', timeout: 30000,
        });
      }).not.toThrow();
    });
  }, 35000);

  it('is non-mutating: deletes files the regen created when target was absent before (Codex P2 PR #259)', async () => {
    // Codex P2 catch: if a derived file is missing before --check runs, the
    // taggers will create one, and the finally block must delete it again so
    // the worktree is left in its pre-check state.
    await withDerivedFilesLock(ROOT, async () => {
    const fs = await import('node:fs');
    const REG_PATH = resolve(ROOT, 'data', 'regulatory.json');
    if (!fs.existsSync(REG_PATH)) {
      // Skip if the file genuinely doesn't exist — can't test the restore path
      return;
    }
    const snapshot = fs.readFileSync(REG_PATH);
    try {
      fs.unlinkSync(REG_PATH);
      expect(fs.existsSync(REG_PATH)).toBe(false);
      // --check should exit non-zero (drift: file was absent), AND should NOT
      // leave a regenerated file behind.
      let exitCode = 0;
      try {
        execSync('node scripts/regen_derived.cjs --check', {
          cwd: ROOT, stdio: 'pipe', timeout: 30000,
        });
      } catch (e) {
        exitCode = e.status;
      }
      expect(exitCode).toBe(1);
      expect(fs.existsSync(REG_PATH)).toBe(false);  // <- the P2 assertion
    } finally {
      fs.writeFileSync(REG_PATH, snapshot);
    }
    });
  }, 35000);
});
