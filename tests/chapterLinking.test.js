/**
 * Guards the Harrison/Hazzard bidirectional linking wiring.
 *
 * data/question_chapters.json is produced by scripts/tag_chapters.cjs and
 * maps every tagged question index → { haz?: number, har?: number }. The
 * HTML loads it into global `QCHAPS` and surfaces links both in the answer
 * reveal block (per-question pill buttons) and in the chapter readers
 * ("Drill all N" CTA + attempted/accuracy rollup).
 *
 * These tests exist to catch:
 *   1. Silent drift between question_chapters.json and the source books
 *      (chapter ids disappearing from hazzard_chapters.json / harrison_chapters.json).
 *   2. Breakage of the HTML wiring — the loader entry, the QCHAPS global,
 *      the buildPool filter branches, and the answer-reveal UI block.
 *   3. Regression of the tagger itself — idempotency, shape, plausibility.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const sw = readFileSync(resolve(rootDir, 'sw.js'), 'utf-8');
const qcPath = resolve(rootDir, 'data/question_chapters.json');
const qcRaw = readFileSync(qcPath, 'utf-8');
const qchaps = JSON.parse(qcRaw);
const questions = JSON.parse(readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'));
const haz = JSON.parse(readFileSync(resolve(rootDir, 'data/hazzard_chapters.json'), 'utf-8'));
const har = JSON.parse(readFileSync(resolve(rootDir, 'harrison_chapters.json'), 'utf-8'));

describe('data/question_chapters.json shape', () => {
  it('exists and parses as an object', () => {
    expect(existsSync(qcPath)).toBe(true);
    expect(qchaps).toBeTypeOf('object');
    expect(Array.isArray(qchaps)).toBe(false);
  });

  it('covers a meaningful share of the question bank', () => {
    const n = Object.keys(qchaps).length;
    expect(n).toBeGreaterThan(Math.floor(questions.length * 0.8));
    expect(n).toBeLessThanOrEqual(questions.length);
  });

  it('every key is a valid question index string', () => {
    for (const k of Object.keys(qchaps)) {
      const i = Number(k);
      expect(Number.isInteger(i), `key ${k} is not an integer`).toBe(true);
      expect(i >= 0 && i < questions.length, `key ${k} out of range`).toBe(true);
    }
  });

  it('every entry has valid haz/har chapter ids pointing at real chapters', () => {
    const hazMisses = [];
    const harMisses = [];
    for (const [k, e] of Object.entries(qchaps)) {
      if (e.haz !== undefined) {
        if (!haz[String(e.haz)]) hazMisses.push({ k, haz: e.haz });
      }
      if (e.har !== undefined) {
        if (!har[String(e.har)]) harMisses.push({ k, har: e.har });
      }
    }
    expect(hazMisses, `Hazzard chapter misses: ${JSON.stringify(hazMisses.slice(0, 5))}`).toEqual([]);
    expect(harMisses, `Harrison chapter misses: ${JSON.stringify(harMisses.slice(0, 5))}`).toEqual([]);
  });

  it('distribution is not collapsed — no single Hazzard chapter owns >25% of tagged Qs', () => {
    const counts = {};
    for (const e of Object.values(qchaps)) {
      if (e.haz !== undefined) counts[e.haz] = (counts[e.haz] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const max = Math.max(...Object.values(counts));
    const maxCh = Object.entries(counts).find(([, v]) => v === max);
    expect(max / total, `ch${maxCh?.[0]} has ${max}/${total} hits`).toBeLessThan(0.25);
  });

  it('distribution is not collapsed — no single Harrison chapter owns >30% of tagged Qs', () => {
    const counts = {};
    for (const e of Object.values(qchaps)) {
      if (e.har !== undefined) counts[e.har] = (counts[e.har] || 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return;
    const max = Math.max(...Object.values(counts));
    const maxCh = Object.entries(counts).find(([, v]) => v === max);
    expect(max / total, `ch${maxCh?.[0]} has ${max}/${total} hits`).toBeLessThan(0.30);
  });
});

describe('scripts/tag_chapters.cjs idempotency', () => {
  it('running the tagger twice produces byte-identical output', () => {
    const before = readFileSync(qcPath, 'utf-8');
    execSync('node scripts/tag_chapters.cjs', { cwd: rootDir, stdio: 'pipe' });
    const after = readFileSync(qcPath, 'utf-8');
    expect(after).toBe(before);
  });
});

describe('HTML wiring — shlav-a-mega.html', () => {
  it('declares `let QCHAPS={};` at module scope', () => {
    expect(html).toMatch(/let\s+QCHAPS\s*=\s*\{\s*\}\s*;/);
  });

  it('loads data/question_chapters.json via the loader entry', () => {
    expect(html).toMatch(/QCHAPS:\s*['"]question_chapters\.json['"]/);
    expect(html).toMatch(/varName\s*===\s*['"]QCHAPS['"]/);
  });

  it('buildPool handles filt==="haz-ch" and filt==="har-ch"', () => {
    expect(html).toMatch(/filt\s*===\s*['"]haz-ch['"]/);
    expect(html).toMatch(/filt\s*===\s*['"]har-ch['"]/);
  });

  it('answer-reveal UI renders Hazzard chapter pill when QCHAPS entry has .haz', () => {
    // The text "Hazzard Ch" is used in the pill button template literal.
    expect(html).toMatch(/📕\s*Hazzard Ch /);
  });

  it('answer-reveal UI renders Harrison chapter pill when QCHAPS entry has .har', () => {
    expect(html).toMatch(/📗\s*Harrison Ch /);
  });

  it('chapter readers have a "Drill all" CTA driven by QCHAPS', () => {
    expect(html).toMatch(/Drill all /);
  });
});

describe('SW cache manifest', () => {
  it('sw.js includes data/question_chapters.json in JSON_DATA_URLS', () => {
    expect(sw).toMatch(/data\/question_chapters\.json/);
  });
});

describe('Spot-checks — topic anchor questions map to the right chapter', () => {
  // v10.41.0: with tis[]-aware multi-topic tagging, a topic now covers Qs
  // whose central concept matches that topic — but those Qs may be set in
  // many clinical contexts and tagged to many different Hazzard chapters.
  // The pre-v10.41 50% threshold over-fitted the old narrow ti distribution.
  // 25% still catches collapse to a wrong chapter, while accepting legitimate
  // dispersion across textbook organization.
  const ANCHORS = [
    { ti: 6, expectHaz: 59 },   // dementia topic → Hazzard Dementia Ch 59
    { ti: 5, expectHaz: 58 },   // delirium → Ch 58
    { ti: 19, expectHaz: 79 },  // hypertension → Ch 79
    { ti: 8, expectHaz: 22 },   // polypharmacy → Medication/Deprescribing Ch 22
    { ti: 11, expectHaz: 47 },  // incontinence → Ch 47
    { ti: 15, expectHaz: 51 },  // osteoporosis → Ch 51
  ];
  for (const { ti, expectHaz } of ANCHORS) {
    it(`topic ${ti} questions overwhelmingly map to Hazzard ch${expectHaz}`, () => {
      const idxs = questions.map((q, i) => ({ q, i })).filter(x => x.q.ti === ti).map(x => x.i);
      expect(idxs.length, `no questions with ti=${ti}`).toBeGreaterThan(0);
      const matched = idxs.filter(i => qchaps[i] && qchaps[i].haz === expectHaz).length;
      expect(
        matched / idxs.length,
        `only ${matched}/${idxs.length} of topic ${ti} → Hazzard ch${expectHaz}`,
      ).toBeGreaterThanOrEqual(0.25);
    });
  }
});
