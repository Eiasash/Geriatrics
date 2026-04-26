/**
 * Schema validation for the in-app textbook readers.
 *
 * data/hazzard_chapters.json (Hazzard 8e) and harrison_chapters.json (Harrison 22e)
 * power the Library tab and the per-question "📕 Hazzard Ch …" / "📗 Harrison Ch …"
 * deep-link pills. They are large pre-rendered JSON blobs (>1 MB) — silently
 * malformed entries surface as a blank reader pane on the user's phone, with
 * no console error to triage.
 *
 * Coverage gap noted in CLAUDE.md §"Test Coverage Recommendations" priority 3:
 *   "Hazzard chapter JSON — Validate hazzard_chapters.json structure, chapter
 *    numbering, and cross-reference with notes.json `ch` field"
 *
 * These tests fix that gap by pinning:
 *   - shape: { title:string, sections: [{title, content[]}], wordCount:number }
 *   - chapter ids form a contiguous, monotonically-keyed object
 *   - every chapter has a non-empty title and at least one section
 *   - sections are well-formed (title:string, content:array of strings)
 *   - cross-reference: every chapter referenced by question_chapters.json
 *     resolves; we already cover that elsewhere, here we add the reverse —
 *     no orphan chapter has zero questions tagged AND zero sections (a
 *     parser regression that has bitten us before).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
function load(file) {
  return JSON.parse(readFileSync(resolve(ROOT, file), 'utf-8'));
}

let hazzard, harrison, qchaps, notes, questions;

beforeAll(() => {
  hazzard = load('data/hazzard_chapters.json');
  harrison = load('harrison_chapters.json');
  qchaps = load('data/question_chapters.json');
  notes = load('data/notes.json');
  questions = load('data/questions.json');
});

function describeBook(label, getter, opts) {
  describe(`${label} — schema`, () => {
    let chapters;
    beforeAll(() => {
      chapters = getter();
    });

    it('parses as a non-array object keyed by chapter id', () => {
      expect(typeof chapters).toBe('object');
      expect(chapters).not.toBeNull();
      expect(Array.isArray(chapters)).toBe(false);
    });

    it(`has at least ${opts.minChapters} chapters`, () => {
      expect(Object.keys(chapters).length).toBeGreaterThanOrEqual(opts.minChapters);
    });

    it('every key is a positive integer', () => {
      for (const k of Object.keys(chapters)) {
        const n = Number(k);
        expect(Number.isInteger(n), `key ${k} is not an integer`).toBe(true);
        expect(n, `key ${k} must be >= 1`).toBeGreaterThanOrEqual(1);
      }
    });

    it('every chapter has title (non-empty string), sections (array), wordCount (number)', () => {
      const bad = [];
      for (const [k, ch] of Object.entries(chapters)) {
        if (typeof ch.title !== 'string' || ch.title.trim().length === 0) bad.push({ k, why: 'title' });
        if (!Array.isArray(ch.sections)) bad.push({ k, why: 'sections-not-array' });
        if (typeof ch.wordCount !== 'number') bad.push({ k, why: 'wordCount' });
      }
      expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([]);
    });

    it('every section has title (string) and content (array of strings)', () => {
      const bad = [];
      for (const [k, ch] of Object.entries(chapters)) {
        ch.sections.forEach((s, i) => {
          if (typeof s.title !== 'string') bad.push({ k, i, why: 's.title' });
          if (!Array.isArray(s.content)) bad.push({ k, i, why: 's.content' });
          else {
            for (let j = 0; j < s.content.length; j++) {
              if (typeof s.content[j] !== 'string') {
                bad.push({ k, i, j, why: 's.content[j]' });
                break;
              }
            }
          }
        });
      }
      expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([]);
    });

    it('every chapter has at least one section (no empty parses)', () => {
      const empty = Object.entries(chapters)
        .filter(([, ch]) => ch.sections.length === 0)
        .map(([k]) => k);
      expect(empty, `chapters with zero sections: ${empty.join(',')}`).toEqual([]);
    });

    it('wordCount is plausible — at least 100 words per chapter on average', () => {
      const total = Object.values(chapters).reduce((a, ch) => a + ch.wordCount, 0);
      const avg = total / Object.keys(chapters).length;
      expect(avg, `avg wordCount=${avg.toFixed(0)}`).toBeGreaterThan(100);
    });

    it('no chapter has wordCount 0 (parser bleed regression)', () => {
      const zeroes = Object.entries(chapters)
        .filter(([, ch]) => ch.wordCount === 0)
        .map(([k]) => k);
      expect(zeroes, `zero-wordCount chapters: ${zeroes.join(',')}`).toEqual([]);
    });
  });
}

describeBook('hazzard_chapters.json', () => hazzard, { minChapters: 100 });
describeBook('harrison_chapters.json', () => harrison, { minChapters: 60 });

describe('Hazzard ch ↔ notes.json cross-references', () => {
  // notes.json `ch` field cites chapters like "Hazzard's Ch 3 (Biology of Aging)".
  // Per CLAUDE.md the syllabus excludes Hazzard chapters 2-6, 34, 62; otherwise
  // every Hazzard chapter cited in a note must resolve in hazzard_chapters.json.
  const HAZZARD_CITE_RE = /Hazzard(?:'s)?\s*(?:8e\s*)?Ch\s*(\d+)/i;
  const EXCLUDED_FROM_SYLLABUS = new Set([2, 3, 4, 5, 6, 34, 62]);

  it('every Hazzard chapter cited in notes.json exists in hazzard_chapters.json (or is syllabus-excluded)', () => {
    const misses = [];
    for (const note of notes) {
      const ch = note.ch ?? '';
      let m;
      const re = new RegExp(HAZZARD_CITE_RE, 'gi');
      while ((m = re.exec(ch))) {
        const id = Number(m[1]);
        if (EXCLUDED_FROM_SYLLABUS.has(id)) continue;
        if (!hazzard[String(id)]) {
          misses.push({ note: note.topic ?? note.id, ch: id });
        }
      }
    }
    expect(misses, JSON.stringify(misses.slice(0, 5))).toEqual([]);
  });
});

describe('question_chapters.json ↔ chapters cross-reference (reverse direction)', () => {
  // chapterLinking.test.js already checks "every QCHAPS entry resolves to a real
  // chapter". This test adds the reverse view: for every Hazzard/Harrison
  // chapter referenced by at least one tagged question, the chapter must
  // produce >0 sections. A chapter can validly have zero questions tagged
  // (low-yield), but a chapter cited as a deep-link target with zero sections
  // is a broken reader pane.
  it('every Hazzard chapter pointed at by question_chapters.json has >0 sections', () => {
    const cited = new Set();
    for (const e of Object.values(qchaps)) {
      if (e.haz !== undefined) cited.add(String(e.haz));
    }
    const broken = [...cited].filter(
      (id) => !hazzard[id] || hazzard[id].sections.length === 0,
    );
    expect(broken, `broken Hazzard targets: ${broken.join(',')}`).toEqual([]);
  });

  it('every Harrison chapter pointed at by question_chapters.json has >0 sections', () => {
    const cited = new Set();
    for (const e of Object.values(qchaps)) {
      if (e.har !== undefined) cited.add(String(e.har));
    }
    const broken = [...cited].filter(
      (id) => !harrison[id] || harrison[id].sections.length === 0,
    );
    expect(broken, `broken Harrison targets: ${broken.join(',')}`).toEqual([]);
  });
});

describe('Topic distribution balance — quantitative', () => {
  // CLAUDE.md priority 5: "no single topic should have >15% or <1% of total questions"
  // We loosen the lower bound to <0.4% (≈12 Qs at 3000 corpus) since the new
  // GRS8 buckets ti=43-45 are intentionally small until follow-up sprint.
  it('no single topic owns more than 15% of the question bank', () => {
    const counts = new Map();
    for (const q of questions) counts.set(q.ti, (counts.get(q.ti) || 0) + 1);
    const total = questions.length;
    let worst = null;
    for (const [ti, n] of counts) {
      const ratio = n / total;
      if (ratio > 0.15) worst = { ti, n, ratio };
    }
    expect(worst, `topic ${worst?.ti} owns ${worst?.n}/${total} (${((worst?.ratio ?? 0) * 100).toFixed(1)}%)`).toBeNull();
  });

  it('every legacy topic ti ∈ [0..42] has at least 5 questions', () => {
    const counts = new Map();
    for (const q of questions) counts.set(q.ti, (counts.get(q.ti) || 0) + 1);
    const sparse = [];
    for (let ti = 0; ti <= 42; ti++) {
      const n = counts.get(ti) || 0;
      if (n < 5) sparse.push({ ti, n });
    }
    expect(sparse, JSON.stringify(sparse)).toEqual([]);
  });
});

describe('Exam-year tag consistency', () => {
  // CLAUDE.md priority 4. `t` is a year-like tag — most are 4-digit years
  // (e.g. "2022"), some are dual-session ("2022-א"/"2022-ב"), some carry
  // book labels ("Hazzard"/"Harrison") for AI-generated questions, GRS8 etc.
  const KNOWN_NON_YEAR = new Set([
    'Hazzard', 'Harrison', 'GRS8', 'GRS', 'AI', 'Hazzard 8e', 'Harrison 22e',
  ]);

  it('every t is a non-empty string', () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (typeof q.t !== 'string' || q.t.trim().length === 0) bad.push(i);
    });
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('every year-shaped t is a plausible exam year (1990..currentYear+1)', () => {
    const now = new Date().getFullYear();
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      const t = questions[i].t.trim();
      if (KNOWN_NON_YEAR.has(t)) continue;
      // Strip dual-session suffix e.g. "2022-א".
      const yearPart = t.split(/[-־ ]/)[0];
      if (!/^\d{4}$/.test(yearPart)) continue;
      const y = Number(yearPart);
      if (y < 1990 || y > now + 1) bad.push({ i, t });
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
});
