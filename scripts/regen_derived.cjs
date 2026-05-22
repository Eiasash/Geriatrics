#!/usr/bin/env node
'use strict';
/**
 * regen_derived.cjs — Regenerate every mechanically-derived data file from
 * the canonical pair (data/questions.json + data/explanations.json).
 *
 * Closes the denominator-invalidates-all-ratios bug class (PR #258 / v10.64.130
 * post-mortem): when canonical row count changes, every derived file caching a
 * ratio against that count silently breaks unless explicitly regenerated. This
 * script runs every derivation in one shot — making the regen mandatory rather
 * than discretionary.
 *
 * Derived files (output):
 *   - data/question_chapters.json  via scripts/tag_chapters.cjs (topic+chapter linking)
 *   - data/regulatory.json          via scripts/tag_regulatory.cjs (Israeli regulatory tagging)
 *   - data/syllabus_data.json       Geri section only — n_questions, frequency_pct,
 *                                   total_questions_analyzed recomputed from canonical.
 *                                   Pnimit + Mishpacha sections left untouched
 *                                   (they're cross-repo snapshots, not derivable here).
 *
 * NOT regenerated (canonical / non-mechanical):
 *   - data/distractors.json         AI-generated, non-idempotent
 *   - data/explanations.json        canonical pair partner, source of truth
 *   - data/notes.json, flashcards.json   study materials, hand-curated
 *
 * Usage:
 *   node scripts/regen_derived.cjs           # write derived files (if any change)
 *   node scripts/regen_derived.cjs --check   # exit 1 if any file would change
 *                                            # (used as pre-commit / CI gate;
 *                                            # see tests/regenDerivedIdempotency.test.js)
 *
 * Discipline: run this script after ANY change to data/questions.json or any
 * `ti` field. The companion idempotency test will block PRs that forget.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHECK_MODE = process.argv.includes('--check');
const VERBOSE = process.argv.includes('--verbose');

const DERIVED_FILES = [
  'data/question_chapters.json',
  'data/regulatory.json',
  'data/syllabus_data.json',
];

function snapshot(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

function restore(relPath, content) {
  if (content === null) return;
  fs.writeFileSync(path.join(ROOT, relPath), content, 'utf8');
}

/**
 * Recompute the Geri section of syllabus_data.json:
 *   - n_questions per topic = count of questions where q.ti === topic.id
 *   - frequency_pct = round(n_questions / total * 100, 2)
 *   - total_questions_analyzed = total
 *   - total_topics = topics.length
 *
 * keywords / weight / en / he / id are HAND-CURATED, never touched.
 * Pnimit + Mishpacha sections are CROSS-REPO snapshots, never touched.
 */
function regenSyllabus() {
  const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/questions.json'), 'utf8'));
  const syllabusPath = path.join(ROOT, 'data/syllabus_data.json');
  const syllabus = JSON.parse(fs.readFileSync(syllabusPath, 'utf8'));

  const total = QUESTIONS.length;
  const counts = new Map();
  for (const q of QUESTIONS) {
    if (Number.isInteger(q.ti)) counts.set(q.ti, (counts.get(q.ti) || 0) + 1);
  }

  // Sanity: every question's ti should be a valid topic id in the syllabus.
  // Orphan ti would indicate a canonical/syllabus mismatch worth surfacing.
  const syllabusIds = new Set(syllabus.Geri.topics.map(t => t.id));
  const orphans = [...counts.keys()].filter(ti => !syllabusIds.has(ti));
  if (orphans.length) {
    console.warn(`⚠️  questions.json has ti values not in syllabus.Geri.topics: ${orphans.join(', ')}`);
  }

  for (const t of syllabus.Geri.topics) {
    const n = counts.get(t.id) || 0;
    t.n_questions = n;
    t.frequency_pct = Math.round((n / total) * 10000) / 100;
  }
  syllabus.Geri.total_questions_analyzed = total;
  syllabus.Geri.total_topics = syllabus.Geri.topics.length;

  // Pnimit + Mishpacha untouched. Format matches existing on-disk: JSON.stringify w/ 2-space indent, NO trailing newline.
  fs.writeFileSync(syllabusPath, JSON.stringify(syllabus, null, 2), 'utf8');
}

function runTagger(scriptRelPath, label) {
  const opts = { cwd: ROOT, stdio: VERBOSE ? 'inherit' : 'pipe' };
  try {
    execSync(`node ${scriptRelPath}`, opts);
    if (!VERBOSE) console.log(`  ✓ ${label}`);
  } catch (e) {
    console.error(`  ✗ ${label} FAILED`);
    if (e.stdout) console.error(e.stdout.toString());
    if (e.stderr) console.error(e.stderr.toString());
    throw e;
  }
}

function main() {
  console.log(CHECK_MODE ? '🔍 Checking derived files against canonical...' : '🔧 Regenerating derived files...');

  const before = DERIVED_FILES.map(snapshot);

  runTagger('scripts/tag_chapters.cjs', 'question_chapters.json (tag_chapters)');
  runTagger('scripts/tag_regulatory.cjs', 'regulatory.json (tag_regulatory)');
  regenSyllabus();
  console.log('  ✓ syllabus_data.json (Geri stats)');

  const after = DERIVED_FILES.map(snapshot);
  const diffs = DERIVED_FILES.filter((_, i) => before[i] !== after[i]);

  if (CHECK_MODE) {
    if (diffs.length) {
      for (let i = 0; i < DERIVED_FILES.length; i++) restore(DERIVED_FILES[i], before[i]);
      console.error('\n❌ Derived files OUT OF SYNC with canonical:');
      for (const f of diffs) console.error(`    ${f}`);
      console.error('\nFix: node scripts/regen_derived.cjs');
      console.error('This usually means data/questions.json (or a ti field) changed without regenerating downstream.');
      process.exit(1);
    }
    console.log('\n✅ All derived files in sync with canonical.');
    return;
  }

  if (diffs.length) {
    console.log(`\n📁 Updated: ${diffs.join(', ')}`);
  } else {
    console.log('\nNo changes — already in sync.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { regenSyllabus, DERIVED_FILES };
