/**
 * GRS8 v10.36 integration locks.
 *
 * Four guarantees:
 *   (a) All 42 IMA syllabus topics (from Geriatrics2024version3forpublication.pdf)
 *       have ≥1 GRS8 chapter with matching `syllabus_topic`.
 *   (b) Every grs8_chapters.json entry has: valid `part` filename, `pages`
 *       length 2 (start ≤ end, both ≥ 1), `ti` length ≥ 1 with values 0..46.
 *   (c) All bank Qs with t='GRS8' have a non-empty `ref` field that contains
 *       the substring "GRS8".
 *   (d) Every grs8_chapters.json `part` value references a file that exists
 *       in the repo root.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const grs = JSON.parse(readFileSync(resolve(rootDir, 'data/grs8_chapters.json'), 'utf-8'));
const questions = JSON.parse(readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'));

// 42 IMA syllabus topics from Geriatrics2024version3forpublication.pdf "נושאי הבחינה".
// This list is the canonical authority — keep in sync with build_grs8_chapters.py.
const IMA_TOPICS = [
  'Alzheimer and other Dementias',
  'Andropausa',
  'Anemias',
  'Arrhythmia',
  'Auditory and visual issues',
  'Biology of aging',
  'Confusional states/ Delirium',
  'Congestive heart failure',
  'Constipation',
  'Comprehensive geriatric assessment',
  'Dementia and cognitive impairment',
  'Demography of aging',
  'Depression',
  'Diabetes',
  'Dysphagia',
  'End of life care',
  'Ethics',
  'Falls',
  'Fractures',
  'Frailty',
  'Geriatrics in Israel – local aspects',
  'Hypertension',
  'Hypothermia',
  'Incontinence – urinary and fecal',
  'Infections in the elderly',
  'Ischemic heart disease – peripheral vascular disease',
  'Nutrition and enteral feeding',
  'Osteoarthritis, Osteoporosis',
  'Parkinson’s disease and Extrapyramidal syndrome',
  'Physical activity and exercise',
  'Postural instability',
  'Pressure sores',
  'Prevention and health promotion',
  'Problems of polypharmacy',
  'Pulmonary embolism',
  'Quality of life',
  'Rehabilitation',
  'Sarcopenia',
  'Sensory deprivation',
  'Stroke and related disorders',
  'The geriatric team – team-work',
  'Urinary tract infection – renal failure',
];

describe('GRS8 v10.36 — IMA syllabus coverage (lock A)', () => {
  it('every IMA topic has ≥1 GRS8 chapter mapped to it', () => {
    const mapped = new Set(
      Object.values(grs)
        .map(ch => ch.syllabus_topic)
        .filter(Boolean)
    );
    const missing = IMA_TOPICS.filter(t => !mapped.has(t));
    expect(missing).toEqual([]);
  });

  it('every chapter syllabus_topic is either null or in the IMA list', () => {
    for (const [id, ch] of Object.entries(grs)) {
      if (ch.syllabus_topic === null || ch.syllabus_topic === undefined) continue;
      expect(IMA_TOPICS, `Ch ${id} (${ch.title}) syllabus_topic="${ch.syllabus_topic}" not in IMA list`).toContain(ch.syllabus_topic);
    }
  });
});

describe('GRS8 chapter schema (lock B)', () => {
  it('has at least 60 chapter entries', () => {
    expect(Object.keys(grs).length).toBeGreaterThanOrEqual(60);
  });

  it('every entry has valid part / pages / ti fields', () => {
    for (const [id, ch] of Object.entries(grs)) {
      // part must be a grs8_partNN.pdf string
      expect(typeof ch.part, `Ch ${id} part must be string`).toBe('string');
      expect(ch.part, `Ch ${id} part must match grs8_partNN.pdf`).toMatch(/^grs8_part\d{2}\.pdf$/);

      // pages must be [start, end], both >= 1, start <= end
      expect(Array.isArray(ch.pages), `Ch ${id} pages must be array`).toBe(true);
      expect(ch.pages.length, `Ch ${id} pages length`).toBe(2);
      const [start, end] = ch.pages;
      expect(start, `Ch ${id} pages[0]`).toBeGreaterThanOrEqual(1);
      expect(end, `Ch ${id} pages[1]`).toBeGreaterThanOrEqual(start);

      // ti must be a non-empty array of integers 0..46
      expect(Array.isArray(ch.ti), `Ch ${id} ti must be array`).toBe(true);
      expect(ch.ti.length, `Ch ${id} ti must have ≥1 entry`).toBeGreaterThanOrEqual(1);
      for (const ti of ch.ti) {
        expect(Number.isInteger(ti), `Ch ${id} ti=${ti} must be int`).toBe(true);
        expect(ti, `Ch ${id} ti=${ti} must be in 0..46`).toBeGreaterThanOrEqual(0);
        expect(ti, `Ch ${id} ti=${ti} must be in 0..46`).toBeLessThanOrEqual(46);
      }

      // title + id must be present
      expect(typeof ch.title, `Ch ${id} title`).toBe('string');
      expect(ch.title.length, `Ch ${id} title non-empty`).toBeGreaterThan(0);
      expect(typeof ch.id, `Ch ${id} id field`).toBe('string');
      expect(ch.id, `Ch ${id} id format`).toMatch(/^grs8-ch\d{2}$/);
    }
  });
});

describe('GRS8 question refs (lock C)', () => {
  it('every t=GRS8 question has a non-empty ref containing "GRS8"', () => {
    const grsQs = questions.filter(q => q.t === 'GRS8');
    expect(grsQs.length, 'expected ≥1 t=GRS8 question in bank').toBeGreaterThanOrEqual(13);
    for (const q of grsQs) {
      expect(typeof q.ref, `Q "${(q.q || '').slice(0, 40)}..." must have a ref`).toBe('string');
      expect(q.ref.length, 'ref must be non-empty').toBeGreaterThan(0);
      expect(q.ref, 'ref must contain "GRS8"').toMatch(/GRS8/);
    }
  });
});

describe('GRS8 part files on disk (lock D)', () => {
  it('every chapter.part references a file that exists in the repo root', () => {
    const parts = new Set(Object.values(grs).map(ch => ch.part));
    for (const part of parts) {
      expect(existsSync(resolve(rootDir, part)), `${part} must exist on disk`).toBe(true);
    }
  });
});
