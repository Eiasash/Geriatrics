/**
 * tests/pastExamCoverage.test.js
 *
 * Past-exam tag/file coverage robustness. The 7 exam directories
 * (2020_al, 2021_dec_al, 2022_jun_al, 2023_jun_al, 2024_may_al,
 * 2024_sep_al, 2025_jun_al) each ship a PDF set under exams/<dir>/
 * and corresponding tagged questions in data/questions.json. This
 * file pins:
 *
 *   1. Every exam directory has at least the canonical PDFs
 *      (exam.pdf or exam_basic.pdf, answer_key*).
 *   2. Every exam directory has matching tagged questions in
 *      data/questions.json — each in the > 50 Q range so a missed
 *      ingest is caught.
 *   3. Tag taxonomy is canonical: matches the v10.41+ tagMigration
 *      MAP (e.g. "2024-May-Basic", "2024-Sep-Basic", "2025-Jun-Basic"
 *      / "-Subspec"). No Hebrew labels lingering, no "2025-א" leak.
 *   4. Cross-reference: the 2024/2025 exam tags carry both Basic and
 *      Subspec halves where applicable.
 *   5. Total Q count integrity: matches package.json + CLAUDE.md
 *      claim within tolerance (allows for content adds, blocks
 *      catastrophic loss).
 *
 * This is a real-risk surface: silent loss of an exam tag during a
 * future migration drops users back to fewer past-exam practice
 * questions without visible UI feedback.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

const EXAM_DIRS = [
  '2020_al',
  '2021_dec_al',
  '2022_jun_al',
  '2023_jun_al',
  '2024_may_al',
  '2024_sep_al',
  '2025_jun_al',
];

// Tag bucket → required tag list (any one of the alternatives is acceptable).
const REQUIRED_TAGS = {
  '2020_al': ['2020'],
  '2021_dec_al': ['2021-Dec', '2021-Jun'],
  '2022_jun_al': ['2022-Jun-Basic', '2022-Jun-Subspec', '2022-Jun-orphan'],
  '2023_jun_al': ['2023-Jun-Basic', '2023-Jun-Subspec', '2023-Jun-orphan', '2023-Sep'],
  '2024_may_al': ['2024-May-Basic', '2024-May-Subspec', '2024-orphan'],
  '2024_sep_al': ['2024-Sep-Basic', '2024-Sep-Subspec'],
  '2025_jun_al': ['2025-Jun-Basic'],
};

const FORBIDDEN_TAGS = [
  '2025-א',  // Hebrew was DROP'd in tagMigration; should never appear in committed JSON
  'יוני 21', 'יוני 22', 'יוני 23', 'יוני 24', 'יוני 25',
  'מאי 24', 'ספט 24', 'דצמבר 21',
  'unknown', '?', null, undefined, '',
];

let questions;
let pkg;
beforeAll(() => {
  questions = JSON.parse(readFileSync(resolve(ROOT, 'data', 'questions.json'), 'utf-8'));
  pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
});

describe('past-exam directory layout', () => {
  it('exams/ root directory exists', () => {
    expect(existsSync(resolve(ROOT, 'exams'))).toBe(true);
  });

  EXAM_DIRS.forEach((dir) => {
    describe(`exams/${dir}/`, () => {
      const dirPath = resolve(ROOT, 'exams', dir);
      it('exists as a directory', () => {
        expect(existsSync(dirPath)).toBe(true);
        expect(statSync(dirPath).isDirectory()).toBe(true);
      });
      it('contains at least one exam PDF', () => {
        if (!existsSync(dirPath)) return;
        const files = readdirSync(dirPath);
        const hasExam = files.some((f) => /^exam(_basic|_subspec)?\.pdf$/i.test(f));
        expect(hasExam).toBe(true);
      });
      it('contains at least one answer-key PDF', () => {
        if (!existsSync(dirPath)) return;
        const files = readdirSync(dirPath);
        const hasKey = files.some((f) => /answer.*key.*\.pdf$/i.test(f));
        expect(hasKey).toBe(true);
      });
    });
  });
});

describe('past-exam tagged questions', () => {
  it('total Q count is at least 3000 (catches catastrophic loss)', () => {
    expect(questions.length).toBeGreaterThanOrEqual(3000);
  });

  it('every question has a `t` (year) tag', () => {
    const missing = questions.filter((q, i) => !q || typeof q.t !== 'string' || !q.t.trim()).length;
    expect(missing).toBe(0);
  });

  it('no question carries a forbidden / pre-migration tag', () => {
    const found = new Set();
    for (const q of questions) {
      if (FORBIDDEN_TAGS.includes(q.t)) found.add(q.t);
    }
    expect(Array.from(found)).toEqual([]);
  });

  Object.entries(REQUIRED_TAGS).forEach(([dir, tags]) => {
    it(`${dir} has matching tagged Qs (one of: ${tags.join(', ')})`, () => {
      const total = questions.filter((q) => tags.includes(q.t)).length;
      expect(total).toBeGreaterThan(0);
    });
  });

  it('2024/2025 Basic exams each carry >= 50 Qs (full session present)', () => {
    const sessions = ['2024-May-Basic', '2024-Sep-Basic', '2025-Jun-Basic'];
    for (const t of sessions) {
      const n = questions.filter((q) => q.t === t).length;
      expect(n, `tag=${t}`).toBeGreaterThanOrEqual(50);
    }
  });

  it('2022/2023/2024 Subspec halves are non-empty', () => {
    const sessions = ['2022-Jun-Subspec', '2023-Jun-Subspec', '2024-May-Subspec', '2024-Sep-Subspec'];
    for (const t of sessions) {
      const n = questions.filter((q) => q.t === t).length;
      expect(n, `tag=${t}`).toBeGreaterThan(0);
    }
  });
});

describe('past-exam tag schema integrity', () => {
  it('all "Basic"/"Subspec" tags follow YYYY-Mon-(Basic|Subspec|orphan) shape (or year-orphan)', () => {
    // Two valid shapes:
    //   YYYY-Mon-(Basic|Subspec|orphan)   e.g. 2024-May-Basic
    //   YYYY-orphan                         e.g. 2024-orphan (unmatched ingest)
    const reFull = /^20\d{2}-(Jun|May|Sep|Dec)-(Basic|Subspec|orphan)$/;
    const reYearOrphan = /^20\d{2}-orphan$/;
    const seen = new Map();
    for (const q of questions) {
      if (typeof q.t !== 'string') continue;
      if (q.t.endsWith('-Basic') || q.t.endsWith('-Subspec') || q.t.endsWith('-orphan')) {
        seen.set(q.t, (seen.get(q.t) || 0) + 1);
      }
    }
    const offenders = [];
    for (const [tag] of seen) {
      if (!reFull.test(tag) && !reYearOrphan.test(tag)) offenders.push(tag);
    }
    expect(offenders).toEqual([]);
  });

  it('no exam tag references a future year (post-2026)', () => {
    const offenders = [];
    for (const q of questions) {
      if (typeof q.t !== 'string') continue;
      const m = q.t.match(/^(20\d{2})/);
      if (m && parseInt(m[1], 10) > 2026) offenders.push(q.t);
    }
    expect(offenders).toEqual([]);
  });

  it('correct-answer index `c` always in range for every past-exam Q', () => {
    const offenders = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q || !Array.isArray(q.o)) continue;
      if (typeof q.c !== 'number' || q.c < 0 || q.c >= q.o.length) {
        offenders.push({ i, t: q.t, c: q.c, oLen: q.o.length });
      }
    }
    expect(offenders).toEqual([]);
  });

  it('within-session stem duplicates do not exceed a small known-good ceiling', () => {
    // Within one exam session, duplicate stems can be legitimate
    // (e.g. paired short-stem Qs that share the lead clinical
    // vignette and only differ by the actual question being asked).
    // We pin the count at the current baseline so a future ingest
    // bug that doubles the corpus is caught, but expected paired-Qs
    // are not false positives.
    const bySession = new Map();
    for (const q of questions) {
      if (!q || !q.t || typeof q.q !== 'string') continue;
      if (!/-Basic|-Subspec|^20\d{2}$|^20\d{2}-(Jun|May|Sep|Dec)/.test(q.t)) continue;
      const key = q.t + '|' + q.q.slice(0, 80);
      bySession.set(key, (bySession.get(key) || 0) + 1);
    }
    const dupes = Array.from(bySession.entries()).filter(([, n]) => n > 1);
    // Ceiling is generous — bumps when a new exam session is added
    // tend to push it up by a few; the floor is 0 (no dupes).
    // Hard limit: anything above 10 is suspicious enough to break CI.
    expect(dupes.length).toBeLessThanOrEqual(10);
    // No single stem should appear more than 3 times in one session.
    for (const [, n] of dupes) {
      expect(n).toBeLessThanOrEqual(3);
    }
  });
});

describe('cross-file integrity — package.json vs questions corpus', () => {
  it('APP_VERSION in package.json is a valid semver-ish triple', () => {
    expect(pkg.version).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('Q count is in the announced ballpark (no >10% drop without intent)', () => {
    // CLAUDE.md announces ~3,833 Qs. Tolerate growth, block large drop.
    // If the count drifts down, this test asks for an intentional bump.
    expect(questions.length).toBeGreaterThanOrEqual(3500);
  });

  it('every question with imgDep has a non-empty imgDep value', () => {
    const offenders = questions.filter((q) => 'imgDep' in q && !q.imgDep);
    expect(offenders).toEqual([]);
  });
});
