#!/usr/bin/env node
'use strict';
/**
 * Merge generated questions into data/questions.json + data/explanations.json.
 *
 * Post-v10.64.93 the explanation lives in data/explanations.json — a flat array
 * of strings PARALLEL TO questions.json BY ARRAY INDEX (explanations[i] is the
 * explanation for questions[i]; questions.json carries no inline `e`). This
 * script therefore:
 *   - validates each input question (q / o[4] / c:int-in-range / t / ti:int —
 *     `e` is NOT required for validity: a question with no explanation is still
 *     a valid question, it just gets an empty explanation),
 *   - dedups against the existing corpus by the first 80 chars of the stem,
 *   - splits each merged question into a clean question object (canonical keys
 *     only — `e` and every `_*` provenance field stripped) and an explanation
 *     string, appending them at the SAME index to the two files.
 *
 * File-format handling:
 *   - questions.json is rewritten by textual append — the existing entries are
 *     left byte-identical. Its on-disk format (newline-separated, zero-indent)
 *     is a Python format pass that Node's JSON.stringify cannot reproduce
 *     byte-exact, so re-serialising the whole file would create a spurious
 *     multi-thousand-line diff.
 *   - explanations.json is re-serialised minified — Node JSON.stringify
 *     round-trips it byte-exact (it is written that way by regen_explanations_v2).
 *
 * Usage:
 *   node scripts/merge-questions.cjs <generated-file.json> [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const Q_PATH = path.resolve(__dirname, '..', 'data', 'questions.json');
const E_PATH = path.resolve(__dirname, '..', 'data', 'explanations.json');

/** Strip `e` and every `_*` provenance key → a clean canonical question object. */
function cleanQuestion(q) {
  const clean = {};
  for (const k of Object.keys(q)) {
    if (k === 'e' || k.startsWith('_')) continue;
    clean[k] = q[k];
  }
  return clean;
}

/**
 * Pure merge. Given the existing questions, the existing parallel explanations,
 * and the generated input, return the clean new questions and their parallel
 * explanation strings. No I/O. Throws if the existing arrays are not parallel.
 */
function mergeQuestions(existingQs, existingExps, generated) {
  if (existingQs.length !== existingExps.length) {
    throw new Error(
      `parallel-index broken before merge: questions.json has ${existingQs.length} ` +
      `entries but explanations.json has ${existingExps.length} — aborting.`);
  }
  const seen = new Set(existingQs.map(q => String(q.q || '').substring(0, 80).toLowerCase()));
  const newQs = [];
  const newExps = [];
  let dupes = 0, invalid = 0, noExplanation = 0;

  for (const q of generated) {
    const prefix = String(q.q || '').substring(0, 80).toLowerCase();
    if (seen.has(prefix)) { dupes++; continue; }
    // Schema gate. `e` is intentionally NOT part of it — explanations are a
    // separate file post-v10.64.93, so a question's validity does not depend
    // on carrying an inline explanation.
    if (!q.q || !Array.isArray(q.o) || q.o.length !== 4 ||
        !Number.isInteger(q.c) || q.c < 0 || q.c >= q.o.length ||
        !q.t || !Number.isInteger(q.ti)) {
      console.log(`  ⚠️  skipping invalid: ${String(q.q || 'no question text').substring(0, 60)}`);
      invalid++;
      continue;
    }
    seen.add(prefix);
    const exp = typeof q.e === 'string' ? q.e : '';
    if (!exp) { noExplanation++; console.log(`  ⚠️  no explanation supplied: ${q.q.substring(0, 60)}`); }
    newQs.push(cleanQuestion(q));
    newExps.push(exp);
  }
  return { newQs, newExps, dupes, invalid, noExplanation };
}

/**
 * Append clean questions to questions.json's raw text WITHOUT re-serialising the
 * existing entries — they stay byte-identical. New entries are written in the
 * file's newline-separated, zero-indent style.
 */
function appendToQuestionsText(existingText, newQs) {
  const close = existingText.lastIndexOf(']');
  if (close < 0) throw new Error('questions.json: no closing "]" found');
  const head = existingText.slice(0, close).replace(/\s+$/, '');   // ends at the last "}"
  const body = newQs.map(q => JSON.stringify(q, null, 1).replace(/^ +/gm, '')).join(',\n');
  return `${head},\n${body}\n]`;
}

function main() {
  const inputFile = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');
  if (!inputFile || inputFile.startsWith('--')) {
    console.error('Usage: node scripts/merge-questions.cjs <generated-file.json> [--dry-run]');
    process.exit(1);
  }

  const qText = fs.readFileSync(Q_PATH, 'utf-8');
  const existingQs = JSON.parse(qText);
  const existingExps = JSON.parse(fs.readFileSync(E_PATH, 'utf-8'));
  const generated = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf-8'));

  console.log(`\n📋 Existing: ${existingQs.length} questions / ${existingExps.length} explanations`);
  console.log(`📥 Generated input: ${generated.length}`);

  const { newQs, newExps, dupes, invalid, noExplanation } =
    mergeQuestions(existingQs, existingExps, generated);

  console.log(`\n✅ New unique questions: ${newQs.length}`);
  console.log(`🔄 Duplicates skipped:   ${dupes}`);
  console.log(`⚠️  Invalid skipped:     ${invalid}`);
  if (noExplanation) console.log(`⚠️  Merged with empty explanation: ${noExplanation}`);

  if (dryRun) {
    console.log('\n🏃 DRY RUN — no files modified');
    const topics = {};
    for (const q of newQs) topics[q.ti] = (topics[q.ti] || 0) + 1;
    console.log('Topic distribution:', JSON.stringify(topics));
    console.log(`Would write: questions.json ${existingQs.length} → ${existingQs.length + newQs.length}, ` +
                `explanations.json ${existingExps.length} → ${existingExps.length + newExps.length}`);
    return;
  }
  if (!newQs.length) { console.log('\nNothing to merge — files unchanged.'); return; }

  fs.writeFileSync(Q_PATH, appendToQuestionsText(qText, newQs), 'utf-8');
  fs.writeFileSync(E_PATH, JSON.stringify([...existingExps, ...newExps]), 'utf-8');
  console.log(`\n📁 questions.json:    ${existingQs.length} → ${existingQs.length + newQs.length}`);
  console.log(`📁 explanations.json: ${existingExps.length} → ${existingExps.length + newExps.length}`);
  console.log('   (parallel index preserved)');
}

if (require.main === module) main();

// Exported for unit testing (tests/mergeQuestions.test.js). When imported rather
// than run directly, main() above is skipped — no file I/O at import time.
module.exports = { mergeQuestions, cleanQuestion, appendToQuestionsText };
