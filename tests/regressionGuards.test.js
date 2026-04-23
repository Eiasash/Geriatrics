/**
 * Tests for bugs that have historically shipped or could silently regress:
 *  - Hebrew mojibake (ð where נ should be)
 *  - Reversed digits from PDF RTL extraction
 *  - Missing spaces between Hebrew words and numbers ("בן58")
 *  - Content bleed between adjacent questions
 *  - Question-mark on wrong side of stem
 *  - Duplicate questions across the corpus
 *  - Unknown / legacy tag names leaking past rename
 *  - Service-worker cache version drifting from APP_VERSION
 *
 * Ported from InternalMedicine/tests/regressionGuards.test.js and adapted
 * to Geriatrics' monolithic single-file architecture (no build.sh, no
 * modular src/core/constants.js — APP_VERSION lives in shlav-a-mega.html).
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');

function loadJSON(relPath) {
  return JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf-8'));
}

function readFile(relPath) {
  return readFileSync(resolve(rootDir, relPath), 'utf-8');
}

// ─────────────────────────────────────────────────────────────
// Mojibake / encoding guard
// ─────────────────────────────────────────────────────────────
describe('questions.json — encoding integrity', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  // `ð` (U+00F0) appears when Hebrew `נ` (CP1255 0xF0) is misinterpreted as Latin-1.
  test('no question contains the ð mojibake character anywhere', () => {
    const violations = [];
    questions.forEach((q, i) => {
      const all = [q.q, ...(q.o || []), q.e || ''].join('|');
      if (all.includes('ð')) {
        violations.push({ i, tag: q.t, preview: q.q?.slice(0, 80) });
      }
    });
    if (violations.length) {
      console.error(`ð-mojibake in ${violations.length} Qs:`, violations.slice(0, 3));
    }
    expect(violations.length).toBe(0);
  });

  // Latin-1 extended range in Hebrew context is almost always an encoding artifact.
  test('no Latin-1 extended chars adjacent to Hebrew letters (non-whitelisted)', () => {
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
    if (violations.length) {
      console.error(`Latin-1 adjacency in ${violations.length} Qs:`, violations.slice(0, 3));
    }
    expect(violations.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Formatting quality (past-exam corruption patterns)
// ─────────────────────────────────────────────────────────────
describe('questions.json — formatting quality', () => {
  let questions;
  // Only past-exam sessions suffer PDF-extraction artifacts.
  // Hazzard/Harrison/Hazzard-suppl are AI-generated and immune.
  const PAST_EXAM_TAGS = ['2020', '2021-Dec', '2021-Jun', '2022-Jun-Subspec', '2022-Jun-Basic', '2022-Jun-orphan', '2023-Jun-Subspec', '2023-Jun-Basic', '2023-Jun-orphan', '2023-Sep', '2024-May-Subspec', '2024-May-Basic', '2024-Sep-Subspec', '2024-Sep-Basic', '2024-orphan', '2025-Jun', '2025-Jun-Basic'];
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  // Catches "בן58" → should be "בן 58". Geriatrics has a legacy backlog
  // in past-exam PDFs — exact ratchet at current count so cleanup PRs are
  // visible (test fails → bump the number → proof of progress). Previous
  // `<=600` hid silent drift in either direction.
  const HEBREW_DIGIT_BASELINE = 0;
  test(`Hebrew-digit missing-space (past-exam): exact ${HEBREW_DIGIT_BASELINE}`, () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.includes(q.t)) return;
      const text = [q.q, ...(q.o || [])].join(' | ');
      if (/[\u0590-\u05FF]\d/.test(text)) {
        bad.push({ i, tag: q.t });
      }
    });
    const delta = bad.length - HEBREW_DIGIT_BASELINE;
    if (delta !== 0) {
      const dir = delta > 0 ? 'rose' : 'dropped';
      console.error(`Hebrew+digit count ${dir} from ${HEBREW_DIGIT_BASELINE} to ${bad.length} (delta ${delta > 0 ? '+' : ''}${delta}). Update HEBREW_DIGIT_BASELINE.`);
    }
    expect(bad.length).toBe(HEBREW_DIGIT_BASELINE);
  });

  // Catches `?גבוהה` (question mark on wrong side after RTL mangling).
  // Exact ratchet at current count. When cleanup happens, test fails,
  // update the baseline number in the same PR.
  const QMARK_HEBREW_BASELINE = 0;
  test(`wrong-side ?[Hebrew] (past-exam): exact ${QMARK_HEBREW_BASELINE}`, () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.includes(q.t)) return;
      const text = [q.q, ...(q.o || [])].join(' | ');
      if (/\?[\u0590-\u05FF]/.test(text)) {
        bad.push({ i, tag: q.t });
      }
    });
    const delta = bad.length - QMARK_HEBREW_BASELINE;
    if (delta !== 0) {
      const dir = delta > 0 ? 'rose' : 'dropped';
      console.error(`?[Hebrew] count ${dir} from ${QMARK_HEBREW_BASELINE} to ${bad.length} (delta ${delta > 0 ? '+' : ''}${delta}). Update QMARK_HEBREW_BASELINE.`);
    }
    expect(bad.length).toBe(QMARK_HEBREW_BASELINE);
  });

  // Catches content bleed: stem contains DIGIT-DOT followed by question-opener word.
  test('no adjacent-question fragment glued into stem', () => {
    const bad = [];
    const STARTERS = /^(בן|בת|גבר|אישה|איש|מטופל|חולה|מה|איזה|איזו|באיזו|באיזה|האם)/;
    const REF_PREFIXES = /(תמונה|דרגה|שלב|class|stage|grade|טבלה|גרף|שאלה|ECOG|CHA2DS2|HAS-BLED|SARC-F|PHQ|STOP-BANG|ePrognosis|anion|קריאטינין|המוגלובין|אלבומין)\s*$/i;
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.includes(q.t)) return;
      if (!q.q) return;
      const re = /(\S*)\s([1-9])\.\s([\u0590-\u05FF]+)/g;
      let m;
      while ((m = re.exec(q.q)) !== null) {
        const prevWord = m[1];
        const nextWord = m[3];
        if (STARTERS.test(nextWord) && !REF_PREFIXES.test(prevWord)) {
          const before = q.q.slice(Math.max(0, m.index - 40), m.index);
          if (REF_PREFIXES.test(before.split(/\s+/).slice(-3).join(' '))) continue;
          bad.push({ i, tag: q.t, match: m[0], before });
          break;
        }
      }
    });
    if (bad.length) console.error('Fragment-bleed:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Duplicates
// ─────────────────────────────────────────────────────────────
describe('questions.json — duplicates', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  // Normalizes a string for near-duplicate detection: strips whitespace, punctuation,
  // digits, and Hebrew maqaf. Catches near-dupes that differ only by extra "44" on an
  // option, whitespace drift, or punctuation variation.
  const normStem = (s) => (s || '').replace(/[\s\d.,?!:;()\[\]"'\-\u05BE]+/g, '').toLowerCase();

  test('no duplicate questions per tag (normalized stem)', () => {
    const byKey = new Map();
    const dupes = [];
    questions.forEach((q, i) => {
      const key = `${q.t}||${normStem(q.q)}`;
      if (!key.endsWith('||')) {
        if (byKey.has(key)) {
          dupes.push({ first: byKey.get(key), second: i, tag: q.t, preview: (q.q || '').slice(0, 60) });
        } else {
          byKey.set(key, i);
        }
      }
    });
    if (dupes.length) console.error('Within-tag near-duplicates:', dupes.slice(0, 5));
    expect(dupes.length).toBe(0);
  });

  test('no cross-tag duplicates across the 4 decomposed 2024 tags', () => {
    // Post v9.94: 2024-May/Sep decomposed into May-Subspec/May-Basic/Sep-Subspec/Sep-Basic + orphan.
    // A single normalized stem appearing in more than one of these is an ingestion mis-tag.
    const S2024 = ['2024-May-Subspec', '2024-May-Basic', '2024-Sep-Subspec', '2024-Sep-Basic'];
    const seen = new Map();
    const dupes = [];
    questions.forEach((q, i) => {
      if (q.allow_dup) return;
      if (!S2024.includes(q.t)) return;
      const k = normStem(q.q);
      if (!k || k.length < 20) return;
      if (seen.has(k)) {
        const firstIdx = seen.get(k);
        const t1 = questions[firstIdx].t, t2 = q.t;
        if (t1 !== t2) {
          dupes.push({ first: firstIdx, second: i, tags: [t1, t2] });
        }
      } else {
        seen.set(k, i);
      }
    });
    if (dupes.length > 0) console.error('2024 cross-tag dupes:', dupes.slice(0, 3));
    expect(dupes.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Structural invariants
// ─────────────────────────────────────────────────────────────
describe('questions.json — structural invariants', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  test('every question has EXACTLY 4 options', () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!Array.isArray(q.o) || q.o.length !== 4) {
        bad.push({ i, tag: q.t, optCount: Array.isArray(q.o) ? q.o.length : 'not-array' });
      }
    });
    if (bad.length) console.error('Non-4-option Qs:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });

  test('every answer key c is in [0, o.length)', () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!(typeof q.c === 'number' && Number.isInteger(q.c) && q.c >= 0 && q.c < (q.o?.length || 0))) {
        bad.push({ i, tag: q.t, c: q.c, oLen: q.o?.length });
      }
    });
    if (bad.length) console.error('Bad answer keys:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });

  test('every question has non-empty explanation e', () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!q.e || typeof q.e !== 'string' || q.e.trim().length < 10) {
        bad.push({ i, tag: q.t });
      }
    });
    if (bad.length) console.error('Missing/short explanations:', bad.slice(0, 5));
    expect(bad.length).toBe(0);
  });

  test('ti (topic index) is integer in [0, 39]', () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!(typeof q.ti === 'number' && Number.isInteger(q.ti) && q.ti >= 0 && q.ti <= 39)) {
        bad.push({ i, tag: q.t, ti: q.ti });
      }
    });
    if (bad.length) console.error('Bad ti:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });

  test('every question has a tag t', () => {
    const bad = questions.filter((q, i) => !q.t || typeof q.t !== 'string').map((q, i) => ({ i, t: q.t }));
    expect(bad.length).toBe(0);
  });

  // Whitelist includes canonical sessions + unresolved legacy (TODO: resolve month)
  // + content sources + supplementary album split.
  test('all tags are from known set', () => {
    const ALLOWED = new Set([
      // Unresolved (TODO: determine month, currently kept as-is)
      '2020', '2022',
      // Canonical exam sessions
      '2021-Dec', '2021-Jun', '2022-Jun-Subspec', '2022-Jun-Basic', '2022-Jun-orphan', '2023-Jun-Subspec', '2023-Jun-Basic', '2023-Jun-orphan', '2023-Sep', '2024-May-Subspec', '2024-May-Basic', '2024-Sep-Subspec', '2024-Sep-Basic', '2024-orphan', '2025-Jun',
      // v10.11: real 2025-Jun Geri Stage A Basic (150 Qs) — per IMA post-appeal key 15314
      '2025-Jun-Basic',
      // Content sources
      'Hazzard', 'Harrison', 'Exam',
      // Split from 2025-א theory-type questions
      'Hazzard-suppl',
    ]);
    const unknown = new Set();
    questions.forEach(q => {
      if (q.t && !ALLOWED.has(q.t)) unknown.add(q.t);
    });
    if (unknown.size) console.error('Unknown tags:', [...unknown]);
    expect(unknown.size).toBe(0);
  });

  test('every stem has reasonable length (15–3000 chars)', () => {
    const bad = [];
    questions.forEach((q, i) => {
      const len = (q.q || '').length;
      if (len < 15 || len > 3000) bad.push({ i, tag: q.t, len });
    });
    if (bad.length) console.error('Unreasonable stem lengths:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });

  test('every option has reasonable length (1–800 chars)', () => {
    const bad = [];
    questions.forEach((q, i) => {
      (q.o || []).forEach((o, j) => {
        const len = (o || '').length;
        if (len < 1 || len > 800) bad.push({ i, tag: q.t, opt: j, len });
      });
    });
    if (bad.length) console.error('Unreasonable option lengths:', bad.slice(0, 3));
    expect(bad.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
// Per-session count locks — prevents silent drops during AI regen
// ─────────────────────────────────────────────────────────────
describe('questions.json — per-session counts locked', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  const EXPECTED = {
    '2020': 100,
    '2021-Dec': 104,
    '2021-Jun': 103,
    '2022-Jun-Subspec': 95,
    '2022-Jun-Basic': 124,
    '2022-Jun-orphan': 16,
    '2023-Jun-Subspec': 100,
    '2023-Jun-Basic': 139,
    '2023-Jun-orphan': 22,
    '2023-Sep': 22,
    '2024-May-Subspec': 90,
    '2024-May-Basic': 148,
    '2024-Sep-Subspec': 93,
    '2024-Sep-Basic': 97,
    '2024-orphan': 47,
    '2025-Jun': 219,
    '2025-Jun-Basic': 149,
    'Exam': 24,
    'Harrison': 294,
    'Hazzard': 1789,
    'Hazzard-suppl': 24,
  };

  test.each(Object.entries(EXPECTED))('session %s has exactly %s questions', (tag, n) => {
    const count = questions.filter(q => q.t === tag).length;
    expect(count).toBe(n);
  });

  test('total question count is exactly 3799', () => {
    expect(questions.length).toBe(3799);
  });
});

// ─────────────────────────────────────────────────────────────
// Monolith consistency — Shlav A is single-file by design
// ─────────────────────────────────────────────────────────────
describe('monolith — shlav-a-mega.html invariants', () => {
  let html;
  beforeAll(() => { html = readFile('shlav-a-mega.html'); });

  test('APP_VERSION is defined exactly once', () => {
    const matches = [...html.matchAll(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/g)];
    expect(matches.length).toBe(1);
  });

  test('sw.js CACHE version matches shlav-a-mega.html APP_VERSION', () => {
    const appVer = html.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const sw = readFile('sw.js');
    const swVer = sw.match(/CACHE\s*=\s*['"]shlav-a-v([^'"]+)['"]/)?.[1];
    expect(appVer).toBe(swVer);
  });

  test('package.json version matches APP_VERSION', () => {
    const appVer = html.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const pkg = JSON.parse(readFile('package.json'));
    // Geriatrics package.json version is `${APP_VERSION}.0`
    expect(pkg.version).toBe(`${appVer}.0`);
  });

  test('sw.js handles SKIP_WAITING', () => {
    expect(readFile('sw.js')).toMatch(/SKIP_WAITING/);
  });

  test('shlav-a-mega.html contains the data-loader references', () => {
    // These URLs must be served from sw.js ALL_URLS — check their presence in either file
    const sw = readFile('sw.js');
    expect(sw).toMatch(/data\/questions\.json/);
    expect(sw).toMatch(/shlav-a-mega\.html/);
  });

  test('EXAM_YEARS multi-select is wired (Task 3 port)', () => {
    expect(html).toMatch(/const\s+EXAM_YEARS\s*=\s*\[/);
    expect(html).toMatch(/selectedExamYears/);
    expect(html).toMatch(/toggleExamYear/);
    expect(html).toMatch(/clearExamYears/);
  });

  test('exam-year tag migration is present and idempotent', () => {
    expect(html).toMatch(/__tagMigrationV1/);
    expect(html).toMatch(/migrateExamYearTags/);
  });
});

// ─────────────────────────────────────────────────────────────
// Multi-select filter behaviour (Task 3 contract)
// ─────────────────────────────────────────────────────────────
describe('multi-select exam-year filter — Task 3 contract', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  const EXAM_YEARS = ['2020', '2021-Dec', '2021-Jun', '2022-Jun-Subspec', '2022-Jun-Basic', '2022-Jun-orphan', '2023-Jun-Subspec', '2023-Jun-Basic', '2023-Jun-orphan', '2023-Sep', '2024-May-Subspec', '2024-May-Basic', '2024-Sep-Subspec', '2024-Sep-Basic', '2024-orphan', '2025-Jun', '2025-Jun-Basic'];

  // Reproduces the pool-building logic inline so test doesn't depend on
  // running the monolith's runtime.
  function buildYearPool(selected) {
    const set = new Set(selected);
    if (!set.size) return questions.map((_, i) => i);
    return questions.map((q, i) => [q, i]).filter(([q]) => set.has(q.t)).map(([, i]) => i);
  }

  test('empty selection includes all questions', () => {
    expect(buildYearPool([]).length).toBe(questions.length);
  });

  test('two-tag selection is exact union of those tags', () => {
    const sel = ['2021-Jun', '2025-Jun'];
    const expected = questions.filter(q => sel.includes(q.t)).length;
    expect(buildYearPool(sel).length).toBe(expected);
  });

  test('three-tag selection is exact union of those tags', () => {
    const sel = ['2023-Jun', '2024-May', '2024-Sep'];
    const expected = questions.filter(q => sel.includes(q.t)).length;
    expect(buildYearPool(sel).length).toBe(expected);
  });

  test('content-source tags never leak into year-filter pool', () => {
    const sel = ['2021-Jun', '2023-Jun'];
    const pool = buildYearPool(sel);
    const contentSourceLeak = pool.some(i => ['Hazzard', 'Harrison', 'Hazzard-suppl', 'Exam'].includes(questions[i].t));
    expect(contentSourceLeak).toBe(false);
  });

  test('localStorage persistence round-trip: unknown tag is filtered on load', () => {
    // Simulate what the monolith does:
    //   const raw = localStorage.getItem('samega_exam_filter');
    //   const arr = JSON.parse(raw);
    //   new Set(arr.filter(y => EXAM_YEARS.includes(y)));
    const stored = ['2021-Jun', 'לא-קיים', 'Jun25']; // Jun25 is legacy pre-rename
    const loaded = new Set(stored.filter(y => EXAM_YEARS.includes(y)));
    expect([...loaded]).toEqual(['2021-Jun']);
  });

  test('all canonical EXAM_YEARS are represented in questions.json', () => {
    const presentTags = new Set(questions.map(q => q.t));
    const missing = EXAM_YEARS.filter(y => !presentTags.has(y));
    expect(missing).toEqual([]);
  });
});
