import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadQuestionsHydrated } from './_helpers/loadQuestionsHydrated.js';

const ROOT = resolve(import.meta.dirname, '..');
const questions = loadQuestionsHydrated(ROOT);
const questionChapters = JSON.parse(
  readFileSync(resolve(ROOT, 'data/question_chapters.json'), 'utf8')
);

describe('Geri bot queue source-review guard', () => {
  it('pins source-adjudicated key corrections from the 2026-06-12 queue', () => {
    const expected = new Map([
      [1084, 1],
      [1322, 0],
      [1403, 1],
      [1452, 1],
      [1501, 3],
      [1580, 1],
      [1582, 3],
      [1786, 2],
      [2173, 0],
      [4043, 3],
    ]);

    for (const [idx, c] of expected) {
      expect(questions[idx].c, `idx ${idx} key drifted`).toBe(c);
      expect(questions[idx].broken, `idx ${idx} should remain active`).not.toBe(true);
    }
  });

  it('keeps PSP cholinesterase-inhibitor item multi-accepted and aligned to its explanation', () => {
    const q = questions[1580];
    expect(q.c).toBe(1);
    expect(q.c_accept).toEqual([1, 3]);
    expect(q.e).toContain('Donepezil');
    expect(q.e).toContain('rivastigmine');
    expect(q.e).toContain('levodopa');
  });

  it('keeps the hypertension target item keyed to less than 130 with matching rationale', () => {
    const q = questions[4043];
    expect(q.c).toBe(3);
    expect(q.o[q.c]).toContain('130');
    expect(q.e).toContain('130 mmHg');
    expect(q.e).toContain('ACC-AHA');
  });

  it('quarantines internally broken or parser-contaminated items instead of guessing keys', () => {
    const expectedBroken = new Map([
      [1828, 'laryngospasm'],
      [1886, 'tramadol 50 mg QID = 200 mg/day'],
      [2327, 'GCA'],
      [2477, 'idx=3149'],
    ]);

    for (const [idx, marker] of expectedBroken) {
      expect(questions[idx].broken, `idx ${idx} should be quarantined`).toBe(true);
      expect(questions[idx].broken_reason).toContain('QUARANTINED 2026-06-12');
      expect(questions[idx].broken_reason).toContain(marker);
    }
  });

  it('keeps the remaining image-dependent smear item answerable without a figure', () => {
    const q = questions[3696];
    expect(q.c).toBe(1);
    expect(q.o[q.c]).toContain('ברזל');
    expect(q.q).toContain('מיקרוציטיות');
    expect(q.q).toContain('היפוכרומיות');
    expect(q.q).toContain('שונות ניכרת בגודל ובצורה');
    expect(q.ref).toBe('Harrison Ch 66 — Anemia and Polycythemia');
    expect(questionChapters['3696'].har).toBe(66);
    expect(q.broken).not.toBe(true);
  });
});
