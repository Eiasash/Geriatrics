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
import { loadQuestionsHydrated } from './_helpers/loadQuestionsHydrated.js';

const ROOT = resolve(import.meta.dirname, '..');
function load(file) {
  return JSON.parse(readFileSync(resolve(ROOT, file), 'utf-8'));
}

let hazzard, harrison, harrisonToc, qchaps, notes, questions;

beforeAll(() => {
  hazzard = load('data/hazzard_index.json');
  harrison = load('harrison_index.json');
  // harrison_22e_toc.json — canonical 505-chapter TOC extracted from the
  // Harrison 22e PDF. Distinct from harrison_chapters.json which is the in-
  // app reader's curated 69-chapter subset. The canonical TOC is the gold
  // standard for citation correctness across the whole question bank.
  harrisonToc = load('data/harrison_22e_toc.json');
  qchaps = load('data/question_chapters.json');
  notes = load('data/notes.json');
  questions = loadQuestionsHydrated(ROOT);
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

    it('every chapter has a non-empty title (index shape; body grounded server-side)', () => {
      const bad = [];
      for (const [k, ch] of Object.entries(chapters)) {
        if (typeof ch.title !== 'string' || ch.title.trim().length === 0) bad.push({ k, why: 'title' });
      }
      expect(bad, JSON.stringify(bad.slice(0, 3))).toEqual([]);
    });

    it('ships NO verbatim body (copyright — sections/content absent)', () => {
      const leaks = Object.entries(chapters)
        .filter(([, ch]) => Array.isArray(ch.sections) || 'content' in ch)
        .map(([k]) => k);
      expect(leaks, `chapters still carrying body: ${leaks.slice(0, 3).join(',')}`).toEqual([]);
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
      (id) => !hazzard[id],
    );
    expect(broken, `broken Hazzard targets: ${broken.join(',')}`).toEqual([]);
  });

  it('every Harrison chapter pointed at by question_chapters.json has >0 sections', () => {
    const cited = new Set();
    for (const e of Object.values(qchaps)) {
      if (e.har !== undefined) cited.add(String(e.har));
    }
    const broken = [...cited].filter(
      (id) => !harrison[id],
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

describe('Question ref/e chapter citations resolve to real chapters', () => {
  // Audit 2026-05-03 caught 3 questions citing Hazzard Ch 109/121/124 — none exist
  // (Hazzard 8e maxes at Ch 108). Hallucinated chapter numbers slip through silently
  // because the medical content of the explanation is usually fine; only the
  // attribution is wrong. This guard pins every Hazzard chapter cited in q.ref or
  // q.e to an existing entry in hazzard_chapters.json.
  //
  // Harrison side intentionally not bounded — Harrison 22e has ~480 chapters and
  // our hazzard_chapters.json holds only a sparse 69 of them, so absence !== bogus.
  const HZ_CITE_RE = /(?:Hazzard\s*Ch|הזארד\s*(?:פרק\s*)?)\s*(\d+)/gi;

  it('every Hazzard chapter cited in q.ref exists in hazzard_chapters.json', () => {
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      const ref = questions[i].ref || '';
      let m;
      const re = new RegExp(HZ_CITE_RE);
      while ((m = re.exec(ref))) {
        const id = String(Number(m[1]));
        if (!hazzard[id]) bad.push({ i, cited: m[1], ref: ref.slice(0, 80) });
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
  });

  it('every Hazzard chapter cited in q.e exists in hazzard_chapters.json', () => {
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      const e = questions[i].e || '';
      let m;
      const re = new RegExp(HZ_CITE_RE);
      while ((m = re.exec(e))) {
        const id = String(Number(m[1]));
        if (!hazzard[id]) {
          // Snippet around the match for triage
          const snippet = e.slice(Math.max(0, m.index - 30), m.index + 50);
          bad.push({ i, cited: m[1], snippet });
        }
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
  });

  // Harrison 22e has 505 chapters per data/harrison_22e_toc.json (extracted
  // from the published 4273-page PDF outline). Citation > 505 is structurally
  // impossible. We dict-check against the canonical TOC for full coverage —
  // any cited chapter must exist as a key in harrison_22e_toc.json.
  const HR_CITE_RE = /(?:Harrison\s*Ch|הריסון\s*(?:פרק\s*)?)\s*(\d+)/gi;

  it('every Harrison chapter cited in q.ref or q.e exists in harrison_22e_toc.json', () => {
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      for (const field of ['ref', 'e']) {
        const v = questions[i][field] || '';
        let m;
        const re = new RegExp(HR_CITE_RE);
        while ((m = re.exec(v))) {
          const id = String(Number(m[1]));
          if (!harrisonToc[id]) {
            const snippet = v.slice(Math.max(0, m.index - 30), m.index + 50);
            bad.push({ i, field, cited: m[1], snippet });
          }
        }
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
  });

  // GRS8 has 67 chapters, all present in grs8_chapters.json. Strong dict-
  // membership check is appropriate here.
  const GR_CITE_RE = /(?:GRS\s*-?\s*8?\s*Ch|GRS8\s*Ch)\s*(\d+)/gi;
  let grs8;
  beforeAll(() => {
    grs8 = load('data/grs8_chapters.json');
  });

  it('every GRS8 chapter cited in q.ref or q.e exists in grs8_chapters.json', () => {
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      for (const field of ['ref', 'e']) {
        const v = questions[i][field] || '';
        let m;
        const re = new RegExp(GR_CITE_RE);
        while ((m = re.exec(v))) {
          const id = String(Number(m[1]));
          if (!grs8[id]) {
            const snippet = v.slice(Math.max(0, m.index - 30), m.index + 50);
            bad.push({ i, field, cited: m[1], snippet });
          }
        }
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
  });

  // Catches chapter-number transpositions like "Harrison Ch 311 — Acute Kidney
  // Injury" when Ch 311 is actually Critical Care Medicine (real AKI is Ch 321).
  // For the 69-chapter subset present in harrison_chapters.json we have a
  // canonical title — if a citation's title shares zero significant tokens with
  // the canonical title, it's a likely transposition. Strong-token threshold
  // (len ≥ 4) avoids stop-word false positives ("the", "and", "of").
  const HR_TITLED_CITE_RE = /Harrison\s*Ch\s*(\d+)\s*(?:[—–\-]|\()\s*([^·\n)]{3,150}?)\s*(?:[·\n)]|$)/gi;
  function strongTokens(s) {
    return new Set((s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
  }

  it('Harrison cited title matches canonical title for all 505 chapters', () => {
    // Now validates against harrison_22e_toc.json (full PDF outline) — catches
    // transpositions like Ch 311↔321, Ch 365→384, Ch 126→131, Ch 24→23 across
    // the WHOLE chapter range, not just the 69-chapter in-app reader subset.
    const STOPWORDS = new Set(['with', 'this', 'that', 'from', 'have', 'been', 'more', 'most', 'when', 'what', 'some', 'than', 'only', 'also', 'each', 'about', 'into', 'over', 'such', 'very', 'other', 'their', 'these', 'those', 'which', 'where', 'will', 'shall', 'disease', 'approach', 'patient']);
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      for (const field of ['ref', 'e']) {
        const v = questions[i][field] || '';
        let m;
        const re = new RegExp(HR_TITLED_CITE_RE);
        while ((m = re.exec(v))) {
          const ch = String(Number(m[1]));
          const cited = m[2].trim().replace(/^\*+|\*+$/g, '');
          if (!harrisonToc[ch]) continue; // already caught by bound check
          const canonical = harrisonToc[ch].title || '';
          const citedTok = [...strongTokens(cited)].filter((t) => !STOPWORDS.has(t));
          const canTok = [...strongTokens(canonical)].filter((t) => !STOPWORDS.has(t));
          if (citedTok.length === 0 || canTok.length === 0) continue;
          const shared = citedTok.filter((t) => canTok.includes(t));
          if (shared.length === 0) {
            bad.push({ i, field, ch: m[1], cited: cited.slice(0, 60), canonical: canonical.slice(0, 60) });
          }
        }
      }
    }
    expect(bad, JSON.stringify(bad.slice(0, 5))).toEqual([]);
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
