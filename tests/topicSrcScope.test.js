/**
 * Tests for v10.9 topic-source scope feature.
 *
 * The 3-way pill (הכל / ממבחנים / ספרי לימוד) filters the topic dropdown by
 * source. A tag is classified as an exam tag iff it contains a 4-digit year
 * (\b20\d\d\b). All 16 current exam tag variants (2020, 2021-Jun, 2024-May-Subspec
 * etc.) match; all 4 non-exam tags (Hazzard, Hazzard-suppl, Harrison, Exam) do not.
 *
 * These tests extract the _isExamTag helper from the shipped HTML so we cover
 * the exact bytes that deploy, and then run it against the full question corpus
 * to pin down the exam/non-exam split.
 *
 * Invariants:
 *   1. _isExamTag is defined and exported via module-scope declaration.
 *   2. Every current exam-tag variant classifies as exam; every current
 *      textbook tag classifies as non-exam.
 *   3. The exam/textbook counts are stable (drift → intentional version bump).
 *   4. localStorage key `samega_topic_src` is declared and readable in init code.
 *   5. The setTopicSrc function rejects invalid values.
 *   6. The source-scope pills UI is present (3 onclick handlers for all/exams/books).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const questions = JSON.parse(readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'));

// Extract the helpers from the HTML — same bytes that ship.
function extractHelpers() {
  const marker = '// v10.9: Topic-source scope';
  const start = html.indexOf(marker);
  if (start < 0) throw new Error('v10.9 topicSrc block not found in shlav-a-mega.html');
  // Grab up to the "// Canonical exam-session tags" marker that follows.
  const end = html.indexOf('// Canonical exam-session tags', start);
  if (end < 0) throw new Error('block end marker not found');
  const block = html.slice(start, end);

  // Mock localStorage for topicSrc initialization.
  const store = {};
  const ctx = vm.createContext({
    localStorage: {
      getItem: (k) => store[k] ?? null,
      setItem: (k, v) => { store[k] = String(v); },
    },
    filt: 'all',
    buildPool: () => {},
    render: () => {},
  });
  vm.runInContext(block + '\n;({_isExamTag,_topicSrcMatch,setTopicSrc,getTopicSrc:()=>topicSrc});', ctx);
  // Re-run to grab the refs since runInContext returns the final expression.
  const exported = vm.runInContext('({_isExamTag,_topicSrcMatch,setTopicSrc,getTopicSrc:()=>topicSrc})', ctx);
  return { ...exported, store };
}

describe('v10.9 — topic source scope', () => {
  describe('_isExamTag classifier', () => {
    const { _isExamTag } = extractHelpers();

    it('classifies every current exam tag as exam', () => {
      const examTags = [
        '2020', '2021-Jun', '2021-Dec', '2022-Jun-Subspec', '2022-Jun-Basic',
        '2022-Jun-orphan', '2023-Jun-Subspec', '2023-Jun-Basic', '2023-Jun-orphan',
        '2023-Sep', '2024-May-Subspec', '2024-May-Basic', '2024-Sep-Subspec',
        '2024-Sep-Basic', '2024-orphan', '2025-Jun',
      ];
      for (const t of examTags) {
        expect(_isExamTag(t), `tag "${t}" should be exam`).toBe(true);
      }
    });

    it('classifies textbook/misc tags as non-exam', () => {
      for (const t of ['Hazzard', 'Hazzard-suppl', 'Harrison', 'Exam', '', null, undefined]) {
        expect(_isExamTag(t), `tag "${t}" should be non-exam`).toBe(false);
      }
    });

    it('does not misfire on numbers that are not years', () => {
      expect(_isExamTag('chapter-101')).toBe(false);
      expect(_isExamTag('Hazzard-v8e')).toBe(false);
      expect(_isExamTag('1999')).toBe(false);         // pre-2000
      expect(_isExamTag('2099')).toBe(true);          // in range
      expect(_isExamTag('20999')).toBe(false);        // 5 digits — \b boundary kills it
    });
  });

  describe('corpus split stability', () => {
    const { _isExamTag } = extractHelpers();
    const examQs = questions.filter((q) => _isExamTag(q.t));
    const bookQs = questions.filter((q) => !_isExamTag(q.t));

    it('total matches data/questions.json length', () => {
      expect(examQs.length + bookQs.length).toBe(questions.length);
    });

    it('exam bucket is ≥ 1100 Qs (count-lock — bump if you add exams)', () => {
      // Current exact count: 1195. Floor set to 1100 to absorb minor legitimate edits.
      // If it falls below, either a new year bucket broke the year regex or an
      // ingest regression. If it grows past 2000, the rule likely started catching
      // textbook tags — check _isExamTag.
      expect(examQs.length).toBeGreaterThanOrEqual(1100);
      expect(examQs.length).toBeLessThanOrEqual(2000);
    });

    it('textbook bucket is ≥ 2000 Qs (Hazzard alone is 1789)', () => {
      expect(bookQs.length).toBeGreaterThanOrEqual(2000);
    });

    it('no exam tag leaks into the textbook bucket', () => {
      const leaks = bookQs.filter((q) => /\b20\d\d\b/.test(q.t || ''));
      expect(leaks).toEqual([]);
    });
  });

  describe('setTopicSrc validation', () => {
    const { setTopicSrc, getTopicSrc, store } = extractHelpers();

    it('accepts the 3 valid values', () => {
      setTopicSrc('exams'); expect(getTopicSrc()).toBe('exams');
      setTopicSrc('books'); expect(getTopicSrc()).toBe('books');
      setTopicSrc('all'); expect(getTopicSrc()).toBe('all');
    });

    it('ignores invalid values', () => {
      setTopicSrc('exams');
      setTopicSrc('invalid');
      setTopicSrc(null);
      setTopicSrc(undefined);
      setTopicSrc('EXAMS');
      expect(getTopicSrc()).toBe('exams');
    });

    it('persists to localStorage under samega_topic_src', () => {
      setTopicSrc('books');
      expect(store.samega_topic_src).toBe('books');
    });
  });

  describe('_topicSrcMatch gate', () => {
    const { _topicSrcMatch, setTopicSrc } = extractHelpers();
    const examQ = { t: '2024-May-Subspec', ti: 0 };
    const bookQ = { t: 'Hazzard', ti: 0 };

    it('"all" passes everything', () => {
      setTopicSrc('all');
      expect(_topicSrcMatch(examQ)).toBe(true);
      expect(_topicSrcMatch(bookQ)).toBe(true);
      expect(_topicSrcMatch({ t: '' })).toBe(true);
    });

    it('"exams" passes only exam tags', () => {
      setTopicSrc('exams');
      expect(_topicSrcMatch(examQ)).toBe(true);
      expect(_topicSrcMatch(bookQ)).toBe(false);
    });

    it('"books" passes only non-exam tags', () => {
      setTopicSrc('books');
      expect(_topicSrcMatch(examQ)).toBe(false);
      expect(_topicSrcMatch(bookQ)).toBe(true);
    });
  });

  describe('UI wiring', () => {
    it('three pills are rendered with correct onclick handlers', () => {
      expect(html).toContain("setTopicSrc('all')");
      expect(html).toContain("setTopicSrc('exams')");
      expect(html).toContain("setTopicSrc('books')");
    });

    it('topic dropdown disables topics with 0 Qs in the selected source', () => {
      expect(html).toMatch(/_tc===0\?'\s*disabled'\s*:\s*''/);
    });

    it('buildPool topic branch gates by _topicSrcMatch', () => {
      expect(html).toContain("q.ti===topicFilt&&_topicSrcMatch(q)");
    });

    it('startTopicMiniExam gates by _topicSrcMatch', () => {
      expect(html).toContain("QZ[i].ti===ti&&_topicSrcMatch(QZ[i])");
    });

    it('empty-state reset button is wired when src filter caused the empty', () => {
      expect(html).toContain('הצג מכל המקורות');
      expect(html).toContain('_emptyDueToSrc');
    });
  });

  describe('version sync', () => {
    it('APP_VERSION bumped to 10.9', () => {
      expect(html).toContain("const APP_VERSION='10.9';");
    });

    it('CHANGELOG has 10.9 entry above 10.8', () => {
      const pos109 = html.indexOf("'10.9':[");
      const pos108 = html.indexOf("'10.8':[");
      expect(pos109).toBeGreaterThan(-1);
      expect(pos108).toBeGreaterThan(-1);
      expect(pos109).toBeLessThan(pos108);
    });
  });
});
