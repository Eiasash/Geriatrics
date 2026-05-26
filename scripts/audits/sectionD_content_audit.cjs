#!/usr/bin/env node
/**
 * Section D content-quality audit — produces a report; ZERO mutations.
 * Surfaces real prevalence numbers before any UI/data PR ships.
 *
 * Checks:
 *  D1. Syllabus-orphan refs: Hazzard ch 2-6, 34, 62 are EXCLUDED per P005-2026
 *  D2. c_accept redundancy: length 1 entries (functionally equivalent to plain `c`)
 *  D3. c_accept coverage: questions with c_accept (multi-correct prevalence)
 *  D4. e_en (English explanation) coverage gap
 *  D5. q_en (English question) coverage
 *  D6. Hazzard chapter histogram (which chapters get cited most)
 *  D7. Harrison chapter histogram (gap with harrison_chapters.json keys)
 *  D8. RTL/LTR mix: questions with embedded Latin characters in Hebrew stems
 *  D9. broken-flag (tis) usage — sanity check on 24 quarantined number from memory
 *  D10. ref-empty questions
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
const harrisonChapters = JSON.parse(fs.readFileSync(path.join(ROOT, 'harrison_chapters.json'), 'utf8'));
const hazzardChapters = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/hazzard_chapters.json'), 'utf8'));

const HAZZARD_EXCLUDED = new Set([2, 3, 4, 5, 6, 34, 62]);
const total = questions.length;

const rxHazzard = /Hazzard.*?(?:Ch|chapter|פרק)\s*(\d+)/i;
const rxHarrison = /Harrison.*?(?:Ch|chapter|פרק)\s*(\d+)/i;
const rxHebrew = /[\u0590-\u05FF]/;
const rxLatin = /[A-Za-z]/;

let syllabusOrphan = [];
let cAcceptRedundant = [];
let cAcceptMulti = 0;
let withCAccept = 0;
let withQEn = 0;
let withEEn = 0;  // explanations stored separately, check explanations.json
let hazzardCites = {};
let harrisonCites = {};
let mixedRTL = 0;
let refEmpty = 0;
let brokenFlag = 0;
let cAcceptLen1 = [];

// Load explanations.json for e_en check
let explanations = {};
try {
  explanations = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/explanations.json'), 'utf8'));
} catch (e) {
  console.error('explanations.json missing or invalid');
}

questions.forEach((q, idx) => {
  // D10: ref-empty
  if (!q.ref || !q.ref.trim()) refEmpty++;

  // D1: syllabus-orphan
  if (q.ref) {
    const m = q.ref.match(rxHazzard);
    if (m) {
      const ch = parseInt(m[1], 10);
      hazzardCites[ch] = (hazzardCites[ch] || 0) + 1;
      if (HAZZARD_EXCLUDED.has(ch)) {
        syllabusOrphan.push({ idx, ti: q.ti, ref: q.ref, ch });
      }
    }
    const h = q.ref.match(rxHarrison);
    if (h) {
      const ch = parseInt(h[1], 10);
      harrisonCites[ch] = (harrisonCites[ch] || 0) + 1;
    }
  }

  // D2/D3: c_accept
  if (Array.isArray(q.c_accept)) {
    withCAccept++;
    if (q.c_accept.length === 1) {
      cAcceptLen1.push({ idx, ti: q.ti, c_accept: q.c_accept, c: q.c });
    } else if (q.c_accept.length > 1) {
      cAcceptMulti++;
    }
  }

  // D5: q_en
  if (q.q_en && q.q_en.trim()) withQEn++;

  // D8: RTL/LTR mix in q
  if (q.q && rxHebrew.test(q.q) && rxLatin.test(q.q)) mixedRTL++;

  // D9: broken flag
  if (q.broken || q.broken_flag) brokenFlag++;
});

// D4: e_en lives INSIDE question objects (verified — 1947 / 3823 = 50.93%)
questions.forEach((q) => {
  if (q.e_en && String(q.e_en).trim()) withEEn++;
});

const out = {
  generated_at: new Date().toISOString(),
  total_questions: total,
  harrison_chapters_indexed: Object.keys(harrisonChapters).length,
  hazzard_chapters_indexed: Object.keys(hazzardChapters).length,
  explanations_count: Array.isArray(explanations) ? explanations.length : Object.keys(explanations).length,

  D1_syllabus_orphan_hazzard_excluded: {
    count: syllabusOrphan.length,
    pct: ((syllabusOrphan.length / total) * 100).toFixed(2) + '%',
    excluded_chs_with_cites: [...new Set(syllabusOrphan.map(s => s.ch))].sort((a,b) => a-b),
    sample: syllabusOrphan.slice(0, 5),
  },

  D2_cAccept_redundant_length_1: {
    count: cAcceptLen1.length,
    pct: ((cAcceptLen1.length / total) * 100).toFixed(2) + '%',
    sample: cAcceptLen1.slice(0, 5),
    note: 'c_accept with single element is functionally identical to just `c` — remove or merge',
  },

  D3_cAccept_multi_correct_actual: {
    questions_with_cAccept_field: withCAccept,
    multi_correct_pct: ((cAcceptMulti / total) * 100).toFixed(2) + '%',
    multi_count: cAcceptMulti,
    note: 'Memory said 50 still-multi-accept. Actual count is ' + cAcceptMulti,
  },

  D4_eEn_coverage_gap: {
    with_e_en: withEEn,
    without_e_en: total - withEEn,
    coverage_pct: ((withEEn / total) * 100).toFixed(2) + '%',
    gap_pct: (((total - withEEn) / total) * 100).toFixed(2) + '%',
    note: 'Memory said 49% lack e_en (~1876). Actual gap: ' + (total - withEEn),
  },

  D5_qEn_coverage: {
    with_q_en: withQEn,
    coverage_pct: ((withQEn / total) * 100).toFixed(2) + '%',
  },

  D6_hazzard_top_chapters: Object.entries(hazzardCites)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([ch, n]) => ({ ch: parseInt(ch), n })),

  D7_harrison_chapter_gap: (() => {
    const cited = Object.keys(harrisonCites).map(Number).sort((a, b) => a - b);
    const indexed = new Set(Object.keys(harrisonChapters).map(Number));
    const missing = cited.filter(c => !indexed.has(c));
    const missingWithCounts = missing.map(c => ({ ch: c, n: harrisonCites[c] }));
    const totalAffected = missing.reduce((s, c) => s + harrisonCites[c], 0);
    return {
      chapters_cited: cited.length,
      chapters_indexed: indexed.size,
      missing_chapter_count: missing.length,
      missing_chapters: missing,
      questions_affected: totalAffected,
      pct_questions_affected: ((totalAffected / total) * 100).toFixed(2) + '%',
      missing_with_counts: missingWithCounts,
    };
  })(),

  D8_rtl_ltr_mix: {
    count: mixedRTL,
    pct: ((mixedRTL / total) * 100).toFixed(2) + '%',
    note: 'Stems with both Hebrew and Latin chars — typographic-hierarchy candidates',
  },

  D9_broken_flag: {
    count: brokenFlag,
    note: 'Memory said 24 quarantined. Actual count: ' + brokenFlag,
  },

  D10_ref_empty: {
    count: refEmpty,
    pct: ((refEmpty / total) * 100).toFixed(2) + '%',
  },
};

const reportPath = path.join(ROOT, 'scripts/audits/sectionD_report.json');
fs.writeFileSync(reportPath, JSON.stringify(out, null, 2));
console.log('Report written:', reportPath);
console.log('\n=== HEADLINES ===');
console.log('Total Qs:', total);
console.log('D1 Hazzard-excluded-ch orphans:', out.D1_syllabus_orphan_hazzard_excluded.count, '(' + out.D1_syllabus_orphan_hazzard_excluded.pct + ')');
console.log('D2 c_accept length-1 redundant:', out.D2_cAccept_redundant_length_1.count);
console.log('D3 actual multi-correct c_accept:', out.D3_cAccept_multi_correct_actual.multi_count);
console.log('D4 e_en gap:', out.D4_eEn_coverage_gap.without_e_en, '(' + out.D4_eEn_coverage_gap.gap_pct + ')');
console.log('D5 q_en coverage:', out.D5_qEn_coverage.coverage_pct);
console.log('D7 Harrison missing chapters affecting Qs:', out.D7_harrison_chapter_gap.missing_chapter_count, 'chapters,', out.D7_harrison_chapter_gap.questions_affected, 'Qs');
console.log('D8 RTL/LTR mix:', out.D8_rtl_ltr_mix.count, '(' + out.D8_rtl_ltr_mix.pct + ')');
console.log('D9 broken-flag:', out.D9_broken_flag.count);
console.log('D10 ref-empty:', out.D10_ref_empty.count);
