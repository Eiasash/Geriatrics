#!/usr/bin/env node
/**
 * regen_derived.cjs — single-command regeneration of all derived data files.
 *
 * Closes the "denominator-invalidates-all-ratios" bug class that bit PR #258:
 * when data/questions.json row count changes, every file caching a ratio or
 * tagger output against it drifts silently. Pre-PR #258 there was no audit
 * step; the syllabus_data.json shipped with 19/46 stale frequency_pct values
 * (caught by CC during merge, not before).
 *
 * Scope — DETERMINISTIC derived files only:
 *   - data/regulatory.json      via scripts/tag_regulatory.cjs (idempotent)
 *   - data/question_chapters.json via scripts/tag_chapters.cjs (idempotent)
 *   - data/syllabus_data.json   inline: Geri section's n_questions +
 *                                frequency_pct + total_questions_analyzed.
 *                                Preserves: weight (opaque), keywords, en/he,
 *                                topic order, Pnimit/Mishpacha sections (those
 *                                are cross-repo data, not derivable here).
 *
 * Out of scope — NON-DETERMINISTIC AI outputs:
 *   - data/distractors.json    (AI-generated, cached)
 *   - data/explanations.json   (AI-generated, canonical post-v10.64.93 split)
 *
 * Modes:
 *   node scripts/regen_derived.cjs           regenerate in place
 *   node scripts/regen_derived.cjs --check   write to .tmp/, diff vs current,
 *                                            exit 1 on drift (CI gate use)
 *   node scripts/regen_derived.cjs --verbose include diff detail on drift
 *
 * Exit codes:
 *   0  no drift (--check) or regen successful (default mode)
 *   1  drift detected (--check) or regen failed (default mode)
 *   2  unexpected error (corpus unreadable, tagger script missing, etc.)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const Q_PATH = path.join(ROOT, 'data', 'questions.json');
const SYL_PATH = path.join(ROOT, 'data', 'syllabus_data.json');
const REG_PATH = path.join(ROOT, 'data', 'regulatory.json');
const QC_PATH = path.join(ROOT, 'data', 'question_chapters.json');
const TAG_REG_SCRIPT = path.join(__dirname, 'tag_regulatory.cjs');
const TAG_CH_SCRIPT = path.join(__dirname, 'tag_chapters.cjs');

const CHECK = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--verbose');

/**
 * Regenerate the Geri section of syllabus_data.json against questions.json.
 * Pure function — takes parsed inputs, returns the new full syllabus object.
 * Preserves weight, keywords, en/he, topic order, and Pnimit/Mishpacha
 * sections untouched. Only updates n_questions, frequency_pct, and the
 * top-level total_questions_analyzed for the Geri section.
 */
function regenSyllabusGeri(syllabus, questions) {
  const out = JSON.parse(JSON.stringify(syllabus));  // deep clone, don't mutate input
  if (!out.Geri || !Array.isArray(out.Geri.topics)) {
    throw new Error('syllabus_data.json: Geri.topics missing or not an array');
  }
  const total = questions.length;
  out.Geri.total_questions_analyzed = total;
  for (const topic of out.Geri.topics) {
    if (!Number.isInteger(topic.id)) {
      throw new Error(`syllabus topic missing integer id: ${JSON.stringify(topic).slice(0, 100)}`);
    }
    const n = questions.filter(q => q.ti === topic.id).length;
    topic.n_questions = n;
    // round to 2 decimals — matches the convention CC used in PR #258 fix commit
    topic.frequency_pct = Math.round((n / total) * 100 * 100) / 100;
  }
  return out;
}

function runTagger(scriptPath, label) {
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`${label}: script not found at ${scriptPath}`);
  }
  const r = spawnSync('node', [scriptPath], { cwd: ROOT, encoding: 'utf-8' });
  if (r.status !== 0) {
    throw new Error(`${label} exited ${r.status}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  }
  return r.stdout;
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function regenAll() {
  // Run taggers (they write directly to data/)
  runTagger(TAG_REG_SCRIPT, 'tag_regulatory');
  runTagger(TAG_CH_SCRIPT, 'tag_chapters');
  // Regenerate syllabus Geri section
  const syllabus = readJson(SYL_PATH);
  const questions = readJson(Q_PATH);
  const newSyllabus = regenSyllabusGeri(syllabus, questions);
  // Preserve the existing 2-space pretty-print + trailing newline convention
  const serialized = JSON.stringify(newSyllabus, null, 2);
  const existing = fs.readFileSync(SYL_PATH, 'utf-8');
  const trailingNewline = existing.endsWith('\n') ? '\n' : '';
  fs.writeFileSync(SYL_PATH, serialized + trailingNewline);
}

/**
 * Deep-equal for JSON content (arrays, objects, primitives). Used by --check
 * to compare derived files semantically, ignoring whitespace/formatting drift
 * that doesn't affect runtime behavior. Matches the existing test convention
 * in tests/regulatoryTags.test.js (which parses before comparing).
 */
function jsonContentEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    // For regulatory.json (array of integers) order-independence is the
    // existing convention; we sort-compare. For other arrays, fall back to
    // positional compare.
    const allNum = a.every(x => typeof x === 'number');
    if (allNum) {
      const as = [...a].sort((x, y) => x - y);
      const bs = [...b].sort((x, y) => x - y);
      return as.every((x, i) => x === bs[i]);
    }
    return a.every((x, i) => jsonContentEqual(x, b[i]));
  }
  if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every(k => Object.prototype.hasOwnProperty.call(b, k) && jsonContentEqual(a[k], b[k]));
  }
  return false;
}

function check() {
  // Snapshot the three derived files, run regen, diff parsed content, restore.
  // Content-equal (not byte-equal) — matches existing repo convention and
  // focuses the gate on the bug class (wrong values), not format drift.
  const targets = [REG_PATH, QC_PATH, SYL_PATH];
  const snapshots = new Map();
  for (const t of targets) {
    if (fs.existsSync(t)) snapshots.set(t, fs.readFileSync(t));
  }
  try {
    regenAll();
    const drift = [];
    for (const t of targets) {
      const before = snapshots.get(t);
      const after = fs.readFileSync(t);
      if (!before) {
        drift.push({ file: path.relative(ROOT, t), reason: 'file did not exist before regen' });
        continue;
      }
      let beforeParsed, afterParsed;
      try { beforeParsed = JSON.parse(before.toString('utf-8')); }
      catch (e) { drift.push({ file: path.relative(ROOT, t), reason: 'pre-regen parse failed: ' + e.message }); continue; }
      try { afterParsed = JSON.parse(after.toString('utf-8')); }
      catch (e) { drift.push({ file: path.relative(ROOT, t), reason: 'post-regen parse failed: ' + e.message }); continue; }
      if (!jsonContentEqual(beforeParsed, afterParsed)) {
        drift.push({ file: path.relative(ROOT, t), reason: 'content drift (parsed JSON differs)' });
      }
    }
    return drift;
  } finally {
    // Always restore originals — --check must be non-mutating
    for (const [t, content] of snapshots) {
      fs.writeFileSync(t, content);
    }
  }
}

function describeSyllabusDrift() {
  // Helper for verbose mode: show which topics drifted in syllabus_data.json
  const current = readJson(SYL_PATH);
  const questions = readJson(Q_PATH);
  const regenerated = regenSyllabusGeri(current, questions);
  const lines = [];
  if (current.Geri.total_questions_analyzed !== regenerated.Geri.total_questions_analyzed) {
    lines.push(`  total_questions_analyzed: ${current.Geri.total_questions_analyzed} -> ${regenerated.Geri.total_questions_analyzed}`);
  }
  const byId = new Map(regenerated.Geri.topics.map(t => [t.id, t]));
  for (const t of current.Geri.topics) {
    const r = byId.get(t.id);
    if (!r) continue;
    if (t.n_questions !== r.n_questions || t.frequency_pct !== r.frequency_pct) {
      lines.push(`  topic id=${t.id} (${t.en}): n_questions ${t.n_questions} -> ${r.n_questions}, frequency_pct ${t.frequency_pct} -> ${r.frequency_pct}`);
    }
  }
  return lines;
}

function main() {
  try {
    if (CHECK) {
      const drift = check();
      if (drift.length === 0) {
        console.log('regen_derived: no drift. All 3 derived files match canonical state.');
        process.exit(0);
      }
      console.error('regen_derived: DRIFT DETECTED in', drift.length, 'file(s):');
      for (const d of drift) {
        console.error(`  ${d.file}: ${d.reason}`);
      }
      if (VERBOSE && drift.some(d => d.file.endsWith('syllabus_data.json'))) {
        console.error('\nSyllabus drift detail:');
        for (const line of describeSyllabusDrift()) console.error(line);
      }
      console.error('\nFix: run `node scripts/regen_derived.cjs` (no flags) to regenerate.');
      process.exit(1);
    } else {
      regenAll();
      console.log('regen_derived: regenerated regulatory.json + question_chapters.json + syllabus_data.json (Geri section).');
      process.exit(0);
    }
  } catch (e) {
    console.error('regen_derived: ERROR -', e.message);
    if (VERBOSE) console.error(e.stack);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { regenSyllabusGeri, jsonContentEqual };
