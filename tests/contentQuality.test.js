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
 * Unlike the InternalMedicine version, these checks run across ALL tags —
 * `ð` is never a legitimate character in any tag, and the checks are cheap.
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

describe('questions.json — encoding integrity', () => {
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

describe('questions.json — formatting quality', () => {
  it('no question mark immediately before a Hebrew letter (wrong-side punct, budget 3)', () => {
    // RTL mangling artifact: `?גבוהה` instead of `גבוהה?`
    const bad = [];
    questions.forEach((q, i) => {
      const text = [q.q, ...(q.o || [])].join(' | ');
      if (/\?[\u0590-\u05FF]/.test(text)) bad.push({ i, tag: q.t, preview: (q.q || '').slice(0, 60) });
    });
    expect(bad.length, `?[Hebrew] in ${bad.length} Qs (budget 3; first 3: ${JSON.stringify(bad.slice(0, 3))})`).toBeLessThanOrEqual(3);
  });
});

describe('questions.json — duplicates', () => {
  it('no duplicate questions by first 100 chars of stem (across all tags)', () => {
    const seen = new Map();
    const dupes = [];
    questions.forEach((q, i) => {
      const key = (q.q || '').slice(0, 100).trim();
      if (!key) return;
      if (seen.has(key)) dupes.push({ first: seen.get(key), second: i, preview: key.slice(0, 50) });
      else seen.set(key, i);
    });
    expect(dupes, `Duplicates: ${JSON.stringify(dupes.slice(0, 3))}`).toEqual([]);
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
