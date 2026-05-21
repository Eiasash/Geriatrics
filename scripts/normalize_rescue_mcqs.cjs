#!/usr/bin/env node
'use strict';
/**
 * normalize_rescue_mcqs.cjs — one-shot rescued-MCQ normalizer.
 *
 * Normalizes the four rescued MCQ files from the 2026-05-21 Phase-4 home-dir
 * cleanup into the canonical questions.json schema, written to a STAGING file:
 *
 *   scripts/mcqs_pending_rescue_2026-05-21.json   (bare array, merge-shaped)
 *
 * Sources (staged outside the repo in the rescue dir — override with --src):
 *   R7  R7_shlavAlefQuestions.js                export const shlavAlefQuestions = [...]
 *   R13 R13_quizSystem.js                       export const quizDatabase = { boardReview:[...], ... }
 *   R19 R19_geriatrics.html                     inline  const questionBank = [...]
 *   R20 R20_geriatrics_training_questions.json  { questions:[...] }
 *
 * IMPORTANT — this produces a REVIEW STAGING file, NOT the live corpus:
 *   - The Qs are author/AI-keyed, NOT textbook- or IMA-verified. They require an
 *     mcq-quality-auditor pass before any merge into data/questions.json.
 *   - Schema-normalized but NOT translated — q/o/e stay in source language
 *     (mostly English). Translation is downstream (translate_questions_to_hebrew.cjs).
 *   - scripts/merge-questions.cjs is STALE vs the v10.64.93 explanations split —
 *     do NOT feed this file to it until that script is fixed (see PR description).
 *
 * Run:  node scripts/normalize_rescue_mcqs.cjs [--src <dir>]
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const vm   = require('vm');

const argv   = process.argv.slice(2);
const argVal = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const SRC_DIR        = argVal('--src', path.join(os.homedir(), 'archive', 'geriatrics-content-rescue-2026-05-21'));
const REPO           = path.resolve(__dirname, '..');
const OUT_PATH       = path.join(REPO, 'scripts', 'mcqs_pending_rescue_2026-05-21.json');
const TOPICS_PATH    = path.join(REPO, 'data', 'topics.json');
const QUESTIONS_PATH = path.join(REPO, 'data', 'questions.json');

const SOURCE_TAG = 'SZMC-Rescue';   // q.t value — a provenance tag, NOT an IMA exam year
const STAMP      = '2026-05-22';

// ── file loaders ─────────────────────────────────────────────────────────────

function readText(f) { return fs.readFileSync(f, 'utf-8'); }

/** Eval an ES-module file in a sandbox and return one top-level binding. */
function loadJsBinding(file, bindingName) {
  const text = readText(file)
    .replace(/\bexport\s+default\s+/g, 'var __default__ = ')
    .replace(/\bexport\s+(const|let|var|function|class)\s+/g, '$1 ')
    .replace(/\bexport\s*\{[^}]*\}\s*;?/g, '');
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(`${text}\n;__OUT__ = ${bindingName};`, ctx, { filename: path.basename(file) });
  return ctx.__OUT__;
}

/** Extract a `const <name> = [ ... ];` array literal from an HTML inline script. */
function loadHtmlArray(file, varName) {
  const text = readText(file);
  const m = text.match(new RegExp(`const\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*?\\n\\s*\\]);`));
  if (!m) throw new Error(`array "${varName}" not found in ${path.basename(file)}`);
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`__OUT__ = ${m[1]};`, ctx, { filename: path.basename(file) });
  return ctx.__OUT__;
}

// ── per-source extraction → uniform {q,o,c,cText,e,cat,origId,extra} ─────────

function extractAll() {
  const by = { R7: [], R13: [], R19: [], R20: [] };

  // R7 — flat exported array
  loadJsBinding(path.join(SRC_DIR, 'R7_shlavAlefQuestions.js'), 'shlavAlefQuestions')
    .forEach((it, i) => by.R7.push({
      q: it.question, o: it.options, c: it.correct, cText: null, e: it.explanation,
      cat: it.category || '', origId: it.id || `R7#${i}`, extra: {},
    }));

  // R13 — boardReview flat MCQs + clinicalCases staged MCQs. quickReview entries
  // have no options[] (free-text answer → flashcard-style) and osceScenarios are
  // OSCE stations — neither is an MCQ, both correctly skipped.
  const db = loadJsBinding(path.join(SRC_DIR, 'R13_quizSystem.js'), 'quizDatabase');
  for (const [key, val] of Object.entries(db)) {
    if (!Array.isArray(val)) continue;
    val.forEach((it, i) => {
      if (!it) return;
      // flat MCQ (boardReview)
      if (Array.isArray(it.options) &&
          (typeof it.correctAnswer === 'number' || typeof it.correct === 'number')) {
        by.R13.push({
          q: it.question, o: it.options,
          c: typeof it.correctAnswer === 'number' ? it.correctAnswer : it.correct,
          cText: null, e: it.explanation || '', cat: it.category || '',
          origId: it.id || `R13#${key}#${i}`,
          extra: {
            _r13_array: key,
            ...(it.questionHe    ? { _q_he: it.questionHe }    : {}),
            ...(it.explanationHe ? { _e_he: it.explanationHe } : {}),
            ...(Array.isArray(it.references) && it.references.length ? { _refs_orig: it.references } : {}),
          },
        });
      }
      // staged MCQs (clinicalCases) — each stage carries its own scenario; the
      // scenario is prepended so the extracted MCQ stands alone.
      if (Array.isArray(it.stages)) {
        it.stages.forEach((st, si) => {
          if (!st || !Array.isArray(st.options) || typeof st.correctAnswer !== 'number') return;
          const scen   = String(st.scenario   || '').trim();
          const qt     = String(st.question   || '').trim();
          const scenHe = String(st.scenarioHe || '').trim();
          const qtHe   = String(st.questionHe || '').trim();
          by.R13.push({
            q: scen ? `${scen} ${qt}` : qt,
            o: st.options, c: st.correctAnswer, cText: null,
            e: st.explanation || '', cat: it.category || '',
            origId: `R13#${key}#${it.id || `case${i}`}#stage${st.stage != null ? st.stage : si}`,
            extra: {
              _r13_array: key,
              _r13_case: it.id || `case${i}`,
              ...((scenHe || qtHe) ? { _q_he: [scenHe, qtHe].filter(Boolean).join(' ') } : {}),
            },
          });
        });
      }
    });
  }

  // R19 — inline questionBank; options carry "A) " letter prefixes
  loadHtmlArray(path.join(SRC_DIR, 'R19_geriatrics.html'), 'questionBank')
    .forEach((it, i) => by.R19.push({
      q: it.question, o: it.options, c: it.correct, cText: null, e: it.explanation || '',
      cat: it.category || '', origId: `R19#${i}`,
      extra: it.israeli_context ? { _israeli_context: it.israeli_context } : {},
    }));

  // R20 — JSON; correct_answer is option TEXT (resolved to an index below)
  const r20 = JSON.parse(readText(path.join(SRC_DIR, 'R20_geriatrics_training_questions.json')));
  (r20.questions || []).forEach((it, i) => by.R20.push({
    q: it.question_text, o: it.options, c: null, cText: it.correct_answer,
    e: it.explanation || '', cat: it.category || '',
    origId: it.id != null ? `R20#${it.id}` : `R20#${i}`,
    extra: it.difficulty != null ? { _difficulty: it.difficulty } : {},
  }));

  return by;
}

// ── normalization helpers ────────────────────────────────────────────────────

const TOPICS = JSON.parse(readText(TOPICS_PATH));   // 46 keyword arrays, index === ti

// Zero-keyword-hit fallback, derived from the canonical 46-topic vocabulary.
const CAT_FALLBACK_TI = {
  'pharmacology': 8, 'polypharmacy': 8,
  'cardiovascular': 17,
  'cognitive': 6,
  'ethics & end-of-life': 29, 'ethics & legal': 29, 'ethics': 29,
  'discharge planning': 35, 'israeli healthcare system': 35,
  'geriatric syndromes': 2,
  'musculoskeletal': 16,
};

function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().toLowerCase(); }

/** Best topic index by keyword hits against data/topics.json (canonical vocab). */
function computeTi(text) {
  const hay = String(text).toLowerCase();
  let bestTi = -1, bestScore = 0;
  TOPICS.forEach((kws, ti) => {
    let s = 0;
    for (const kw of kws) if (hay.includes(String(kw).toLowerCase())) s++;
    if (s > bestScore) { bestScore = s; bestTi = ti; }
  });
  return { ti: bestTi, score: bestScore };
}

const OPT_PREFIX = /^[A-Da-d][)\.]\s+/;
/** Strip "A) "/"B) " prefixes only when the whole option set is prefixed. */
function stripPrefixes(opts) {
  if (Array.isArray(opts) && opts.length >= 2 &&
      opts.every(o => typeof o === 'string' && OPT_PREFIX.test(o))) {
    return { o: opts.map(o => o.replace(OPT_PREFIX, '')), stripped: true };
  }
  return { o: opts, stripped: false };
}

/** Resolve a free-text correct answer (R20) to an option index. */
function resolveTextC(text, opts) {
  const t = norm(text);
  let idx = opts.findIndex(o => norm(o) === t);
  if (idx >= 0) return { c: idx, how: 'exact' };
  idx = opts.findIndex(o => norm(o) && (norm(o).includes(t) || t.includes(norm(o))));
  if (idx >= 0) return { c: idx, how: 'fuzzy' };
  return { c: 0, how: 'UNMATCHED' };
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  const by = extractAll();

  let livePrefixes = new Set();
  try {
    livePrefixes = new Set(JSON.parse(readText(QUESTIONS_PATH))
      .map(q => String(q.q || '').substring(0, 80).toLowerCase()));
  } catch (e) {
    console.warn(`warn: dup-check skipped (could not read questions.json: ${e.message})`);
  }

  const out = [];
  const flags = [];
  const tiDist = {};
  const cDist = { direct: 0, exact: 0, fuzzy: 0, UNMATCHED: 0 };

  for (const src of ['R7', 'R13', 'R19', 'R20']) {
    for (const raw of by[src]) {
      const issues = [];

      const q = String(raw.q == null ? '' : raw.q).trim();
      if (!q) issues.push('empty q');

      let { o, stripped } = stripPrefixes(Array.isArray(raw.o) ? raw.o.slice() : []);
      o = o.map(x => String(x == null ? '' : x).trim());
      if (o.length !== 4) issues.push(`option count ${o.length} (expected 4)`);
      if (o.some(x => !x)) issues.push('blank option text');

      let c, how;
      if (raw.cText != null) ({ c, how } = resolveTextC(raw.cText, o));
      else { c = raw.c; how = 'direct'; }
      cDist[how] = (cDist[how] || 0) + 1;
      if (how === 'UNMATCHED') issues.push(`correct_answer not matched to an option: "${String(raw.cText).slice(0, 70)}"`);
      if (!Number.isInteger(c) || c < 0 || c >= o.length) issues.push(`c out of range (c=${c}, n=${o.length})`);

      const e = String(raw.e == null ? '' : raw.e).trim();
      if (!e) issues.push('empty explanation');

      const { ti: kTi, score } = computeTi(`${q} ${o.join(' ')} ${raw.cat}`);
      let ti, tiConf;
      if (kTi < 0) {
        ti = CAT_FALLBACK_TI[norm(raw.cat)] ?? 2;   // 2 = CGA, generic geriatrics
        tiConf = 'low';
      } else {
        ti = kTi;
        tiConf = score >= 2 ? 'high' : 'med';
      }
      tiDist[ti] = (tiDist[ti] || 0) + 1;

      const rec = {
        q, o, c,
        t: SOURCE_TAG, ti, tis: [ti],
        e, ref: '',
        _source: src,
        _orig_id: raw.origId,
        _category: raw.cat,
        _lang: 'en',
        _ti_confidence: tiConf,
        _c_resolved: how,
        _dup_likely: livePrefixes.has(q.substring(0, 80).toLowerCase()),
      };
      if (stripped) rec._opt_prefix_stripped = true;
      Object.assign(rec, raw.extra);
      if (issues.length) { rec._needs_review = issues; flags.push({ id: raw.origId, issues }); }

      out.push(rec);
    }
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');

  console.log(`\nnormalize_rescue_mcqs — ${STAMP}`);
  console.log(`src: ${SRC_DIR}`);
  for (const s of ['R7', 'R13', 'R19', 'R20']) console.log(`  ${s}: ${by[s].length}`);
  console.log(`TOTAL: ${out.length} → ${path.relative(REPO, OUT_PATH)}`);
  console.log(`c-resolution: ${JSON.stringify(cDist)}`);
  console.log(`dup-likely vs live corpus: ${out.filter(r => r._dup_likely).length}`);
  console.log(`ti confidence: high=${out.filter(r => r._ti_confidence === 'high').length} ` +
              `med=${out.filter(r => r._ti_confidence === 'med').length} ` +
              `low=${out.filter(r => r._ti_confidence === 'low').length}`);
  console.log(`ti distribution: ${JSON.stringify(tiDist)}`);
  console.log(`flagged for review: ${flags.length}`);
  for (const f of flags) console.log(`  ${f.id}: ${f.issues.join('; ')}`);
  console.log('');
}

main();
