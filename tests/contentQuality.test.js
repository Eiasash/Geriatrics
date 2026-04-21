/**
 * Content quality regression guards for Geriatrics.
 *
 * Ported from InternalMedicine's regressionGuards.test.js. Catches:
 *  - Hebrew mojibake (`ð` where נ should be — CP1255 0xF0 misread as Latin-1)
 *  - Latin-1 extended chars adjacent to Hebrew (encoding drift)
 *  - Question mark on wrong side of Hebrew stem (RTL mangling)
 *  - Duplicate questions by first-100-char stem match
 *  - Flashcards/notes containing the mojibake character
 *
 * `ð` and Latin-1 adjacency are asserted at a hard zero — those classes
 * are clean right now and must stay that way.
 *
 * `?א-ת` and first-100-char duplicates are asserted at budgeted maxima
 * matching the current baseline (128 and 8 respectively), so the test
 * guards against NEW regressions without blocking on a data-cleanup PR.
 * Those budgets SHOULD ratchet down as cleanup happens.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

function loadJSON(rel) {
  return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8'));
}

let questions, flashcards, notes;

beforeAll(() => {
  questions = loadJSON('data/questions.json');
  flashcards = loadJSON('data/flashcards.json');
  notes = loadJSON('data/notes.json');
});

describe('questions.json — encoding integrity (strict)', () => {
  it('no question contains the ð mojibake character', () => {
    const violations = [];
    questions.forEach((q, i) => {
      const all = [q.q, ...(q.o || []), q.e || ''].join('|');
      if (all.includes('\u00F0')) {
        violations.push({ i, tag: q.t, preview: (q.q || '').slice(0, 60) });
      }
    });
    expect(violations, `ð-mojibake in ${violations.length} questions (first 3: ${JSON.stringify(violations.slice(0, 3))})`).toEqual([]);
  });

  it('no Latin-1 extended chars adjacent to Hebrew letters (non-whitelisted)', () => {
    // Allow diacritics used in medical proper nouns (Guillain-Barré, São Paulo, Ørnsköld)
    const LEGIT = 'éèêëàâäîïôöûüñçÉÈÊÀÂÜÑÇøåÅ';
    const badAdjacent = /[\u0590-\u05FF][\u00C0-\u00FF]|[\u00C0-\u00FF][\u0590-\u05FF]/g;
    const violations = [];
    questions.forEach((q, i) => {
      const text = [q.q, ...(q.o || [])].join(' | ');
      const matches = [...text.matchAll(badAdjacent)];
      for (const m of matches) {
        const ch = m[0].split('').find(c => c.charCodeAt(0) >= 0xC0 && c.charCodeAt(0) <= 0xFF);
        if (ch && !LEGIT.includes(ch)) {
          violations.push({ i, tag: q.t, char: ch, context: text.slice(Math.max(0, m.index - 15), m.index + 15) });
          break;
        }
      }
    });
    expect(violations, `Latin-1 adjacency in ${violations.length} Qs (first 3: ${JSON.stringify(violations.slice(0, 3))})`).toEqual([]);
  });
});

describe('questions.json — formatting quality (ratchet at current baseline)', () => {
  // Exact ratchet: test fails on ANY change (up or down). Cleanup PRs must
  // bump this number as part of the diff — silent drift in either direction
  // is the failure mode we're trying to prevent.
  const QMARK_HEBREW_BASELINE = 0;

  it(`"?\u05d0-\u05ea" occurrences: exact ${QMARK_HEBREW_BASELINE}`, () => {
    const bad = [];
    questions.forEach((q, i) => {
      const text = [q.q, ...(q.o || [])].join(' | ');
      if (/\?[\u0590-\u05FF]/.test(text)) bad.push({ i, tag: q.t, preview: (q.q || '').slice(0, 60) });
    });
    const delta = bad.length - QMARK_HEBREW_BASELINE;
    if (delta !== 0) {
      const dir = delta > 0 ? 'rose' : 'dropped';
      console.error(`?[Hebrew] count ${dir} from ${QMARK_HEBREW_BASELINE} to ${bad.length} (delta ${delta > 0 ? '+' : ''}${delta}). Update QMARK_HEBREW_BASELINE. First 3: ${JSON.stringify(bad.slice(0, 3))}`);
    }
    expect(bad.length).toBe(QMARK_HEBREW_BASELINE);
  });
});

describe('questions.json — duplicates (ratchet at current baseline)', () => {
  // Exact ratchet. Current dupes: Q813/Q972, Q889/Q3324 (same Q in Jun/Dec 2021).
  // When a dedupe PR lands, test fails → update DUP_BASELINE to new count.
  const DUP_BASELINE = 2;

  it(`duplicates by first 100 chars of stem: exact ${DUP_BASELINE}`, () => {
    const seen = new Map();
    const dupes = [];
    questions.forEach((q, i) => {
      const key = (q.q || '').slice(0, 100).trim();
      if (!key) return;
      if (seen.has(key)) dupes.push({ first: seen.get(key), second: i, preview: key.slice(0, 50) });
      else seen.set(key, i);
    });
    const delta = dupes.length - DUP_BASELINE;
    if (delta !== 0) {
      const dir = delta > 0 ? 'rose' : 'dropped';
      console.error(`Duplicate count ${dir} from ${DUP_BASELINE} to ${dupes.length} (delta ${delta > 0 ? '+' : ''}${delta}). Update DUP_BASELINE. First 3: ${JSON.stringify(dupes.slice(0, 3))}`);
    }
    expect(dupes.length).toBe(DUP_BASELINE);
  });
});

describe('flashcards.json / notes.json — encoding integrity', () => {
  it('no flashcard contains the ð mojibake character', () => {
    const bad = [];
    flashcards.forEach((fc, i) => {
      if ((fc.f || '').includes('\u00F0') || (fc.b || '').includes('\u00F0')) {
        bad.push({ i, preview: (fc.f || '').slice(0, 40) });
      }
    });
    expect(bad).toEqual([]);
  });

  it('no note contains the ð mojibake character', () => {
    const bad = [];
    notes.forEach((n, i) => {
      if ((n.notes || '').includes('\u00F0') || (n.topic || '').includes('\u00F0')) {
        bad.push({ i, topic: n.topic });
      }
    });
    expect(bad).toEqual([]);
  });
});
