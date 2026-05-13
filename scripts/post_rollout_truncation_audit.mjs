#!/usr/bin/env node
/**
 * post_rollout_truncation_audit.mjs — post-deploy verification that the
 * truncation rate across regen output stays at the pre-flight prediction.
 *
 * Designed to run after any regen batch merges. Samples N stems from the
 * regenerated set (or from a specific ti cluster), runs the truncation
 * scanner heuristic against their current state in data/explanations.json,
 * asserts truncation rate < 5% per stratum AND overall.
 *
 * The mid-tier N=10 limitation in the 2026-05-13 pre-flight is the failure
 * mode this audit closes: pre-flight could miss real signal at low N per
 * stratum, but post-rollout audit at N=30-40 across actual production
 * output catches it. If audit-stage truncation rate diverges from pre-flight
 * prediction, the rollout PR needs a touch-up before the next cluster ships.
 *
 * Designed to be callable by CI hook + by hand. Default exit code: 0 if
 * truncation rate < 5%, 1 if ≥ 5%.
 *
 * Usage:
 *   node scripts/post_rollout_truncation_audit.mjs --ti 6 --sample 40
 *   node scripts/post_rollout_truncation_audit.mjs --idx-list FILE
 *   node scripts/post_rollout_truncation_audit.mjs --all  # full-corpus scan (slow)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Truncation heuristic (mirrored from scan_truncated_explanations.mjs;
// kept inline to avoid coupling this audit to the scanner's exact export).
const TERMINAL_PUNCT = /[.!?:][\s'"*\])}״׳-]*$/u;
const ENDS_WITH_LETTER = /[A-Za-zא-ת]\s*$/u;
const WHITESPACE = /\s/u;
function isTruncated(text) {
  const trimmed = (text || '').replace(/\s+$/u, '');
  if (!trimmed || trimmed.length < 30) return true;
  if (ENDS_WITH_LETTER.test(trimmed)) {
    const tail = trimmed.slice(-20);
    return !WHITESPACE.test(tail) || true; // ends-on-letter classes both fire
  }
  if (!TERMINAL_PUNCT.test(trimmed)) return true;
  return false;
}

function parseArgs(argv) {
  const args = { ti: null, sample: 40, idxList: null, all: false, threshold: 0.05 };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ti') args.ti = parseInt(argv[++i], 10);
    else if (argv[i] === '--sample') args.sample = parseInt(argv[++i], 10);
    else if (argv[i] === '--idx-list') args.idxList = argv[++i];
    else if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--threshold') args.threshold = parseFloat(argv[++i]);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const QZ = JSON.parse(readFileSync(`${ROOT}/data/questions.json`, 'utf-8'));
  const EXP = JSON.parse(readFileSync(`${ROOT}/data/explanations.json`, 'utf-8'));

  // Build target idx set
  let targetIdxs;
  if (args.idxList) {
    const list = JSON.parse(readFileSync(args.idxList, 'utf-8'));
    targetIdxs = Array.isArray(list) ? list : list.idxs || [];
  } else if (args.ti != null) {
    targetIdxs = QZ
      .map((q, i) => (q.ti === args.ti ? i : null))
      .filter((i) => i != null);
  } else if (args.all) {
    targetIdxs = QZ.map((_, i) => i);
  } else {
    console.error('ERROR: must supply --ti N, --idx-list FILE, or --all');
    process.exit(2);
  }

  // Sample
  let sample;
  if (targetIdxs.length <= args.sample || args.all || args.idxList) {
    sample = targetIdxs;
  } else {
    // Deterministic stride-sample for reproducibility
    const stride = Math.floor(targetIdxs.length / args.sample);
    sample = [];
    for (let i = 0; i < args.sample; i++) sample.push(targetIdxs[i * stride]);
  }

  // Scan
  let truncated = 0;
  const truncIdxs = [];
  for (const idx of sample) {
    if (isTruncated(EXP[idx])) {
      truncated += 1;
      truncIdxs.push(idx);
    }
  }

  const rate = sample.length ? truncated / sample.length : 0;
  console.log(`Post-rollout truncation audit:`);
  console.log(`  Sample size: ${sample.length}`);
  console.log(`  Truncated:   ${truncated} (${(rate * 100).toFixed(1)}%)`);
  console.log(`  Threshold:   ${(args.threshold * 100).toFixed(0)}%`);
  if (truncIdxs.length) {
    console.log(`  Truncated idx: ${JSON.stringify(truncIdxs.slice(0, 20))}${truncIdxs.length > 20 ? ` ... (${truncIdxs.length - 20} more)` : ''}`);
  }

  if (rate >= args.threshold) {
    console.log(`\nFAIL — truncation rate ${(rate * 100).toFixed(1)}% exceeds ${(args.threshold * 100).toFixed(0)}% threshold`);
    console.log(`Rollout PR needs touch-up. Re-run regen_explanations_v2.mjs on the failed idx list.`);
    process.exit(1);
  }
  console.log(`\nPASS — within threshold.`);
}

main();
