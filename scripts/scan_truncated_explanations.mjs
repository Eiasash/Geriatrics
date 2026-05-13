#!/usr/bin/env node
/**
 * scan_truncated_explanations.mjs — bulk-detect mid-sentence-truncated entries
 * in data/explanations.json.
 *
 * Motivation: 2026-05-13 chaos-doctor v4 audit-1 redesign surfaced that 2 of 8
 * "unsound explanation"-flagged stems (idx 3208, 3413) failed axis-2/axis-3
 * NOT because the medical reasoning was wrong, but because the explanation
 * text was cut off mid-sentence — likely Sonnet hitting max_tokens during the
 * e-regen pipeline. The fix is to re-regenerate with higher max_tokens, NOT to
 * rewrite from scratch. This scanner identifies the cohort that needs regen.
 *
 * Detection heuristics (any triggers a flag):
 *   1. Ends mid-word: last character is a letter (Hebrew or Latin) AND the
 *      previous 20 chars contain no whitespace boundary. Strong signal of
 *      mid-token cutoff.
 *   2. No terminal punctuation: explanation doesn't end in `.`, `!`, `?`,
 *      `:`, `)`, `"`, `]`, `}`, or sof-pasuq-equivalent. AI-generated medical
 *      prose normally terminates with `.` or `:` after the clinical pearl.
 *   3. Anomalously short for a multi-distractor explanation: length < 250
 *      chars AND no `\n\n` paragraph breaks (a Q with 4 distractors should
 *      produce at least ~200 chars per option-discussion paragraph).
 *
 * Each flag carries a `reason` array naming which heuristic(s) fired, plus the
 * last-50-chars tail for human review.
 *
 * Output: .audit_logs/truncated_explanations.json — { _meta, candidates: [...] }
 *
 * Usage:
 *   node scripts/scan_truncated_explanations.mjs
 *   node scripts/scan_truncated_explanations.mjs --verbose  (print tail for every flag)
 *
 * Idempotent. Same input → same output. Designed to run as a one-shot triage
 * scan, not a CI gate.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXP_PATH = resolve(ROOT, 'data/explanations.json');
const OUT_PATH = resolve(ROOT, '.audit_logs/truncated_explanations.json');

const VERBOSE = process.argv.includes('--verbose');

// Terminal punctuation: `.!?:` (sentence enders) optionally followed by any
// number of closing marks (`'"*)]}-` and Hebrew gershayim ״) and trailing
// whitespace. This handles common real-world endings like `.'` (period inside
// quote), `.*` (period before markdown italic closer), `."` (period + close
// quote), and `).` (parenthetical close + period).
// Hebrew chars expressed as \u escapes (״ = ״ gershayim, ׳ = ׳ geresh,
// א-ת = Hebrew alef through tav). Raw multi-byte chars in regex
// literals trip vitest's esbuild transformer (works at Node level, fails in
// vitest); \u escapes round-trip cleanly.
const TERMINAL_PUNCT = /[.!?:][\s'"*\])}״׳-]*$/u;
const ENDS_WITH_LETTER = /[A-Za-zא-ת]\s*$/u;
const WHITESPACE = /\s/u;

// Exported so tests/truncationGuard.test.js can ratchet against the same
// heuristic the scanner uses (v10.64.122 — CI guard ships in regen PR #1).
export function detectTruncation(text) {
  const reasons = [];
  const trimmed = (text || '').replace(/\s+$/u, '');
  if (!trimmed || trimmed.length < 30) return { reasons, truncated: false };

  // 1. Ends mid-word: last char is a letter AND no whitespace in the trailing 20 chars
  if (ENDS_WITH_LETTER.test(trimmed)) {
    const tail = trimmed.slice(-20);
    if (!WHITESPACE.test(tail)) {
      reasons.push('ends-mid-word');
    } else {
      // Soft signal: even with whitespace nearby, ending on a letter without
      // terminal punct often indicates truncation in clinical prose.
      reasons.push('ends-on-letter-no-punct');
    }
  }

  // 2. No terminal punctuation
  if (!TERMINAL_PUNCT.test(trimmed)) {
    if (!reasons.includes('ends-on-letter-no-punct') && !reasons.includes('ends-mid-word')) {
      reasons.push('no-terminal-punct');
    }
  }

  // 3. Anomalously short with no paragraph break
  if (trimmed.length < 250 && !trimmed.includes('\n\n')) {
    reasons.push('short-single-paragraph');
  }

  // Truncated if at least one high-confidence reason fired.
  const highConf = reasons.includes('ends-mid-word') || reasons.includes('ends-on-letter-no-punct') || reasons.includes('no-terminal-punct');
  return { reasons, truncated: highConf };
}

function main() {
  const EXP = JSON.parse(readFileSync(EXP_PATH, 'utf-8'));
  if (!Array.isArray(EXP)) {
    console.error(`ERROR: data/explanations.json is not an array (got ${typeof EXP})`);
    process.exit(1);
  }
  console.log(`Scanning ${EXP.length} explanations for truncation patterns...`);

  const candidates = [];
  let emptyCount = 0;
  for (let idx = 0; idx < EXP.length; idx++) {
    const text = EXP[idx];
    if (!text || typeof text !== 'string') { emptyCount++; continue; }
    const { reasons, truncated } = detectTruncation(text);
    if (truncated) {
      candidates.push({
        qz_idx: idx,
        length: text.length,
        reasons,
        tail_50: text.slice(-50),
      });
      if (VERBOSE) {
        console.log(`  idx=${idx}  len=${text.length}  reasons=${reasons.join(',')}`);
        console.log(`    tail: ${JSON.stringify(text.slice(-80))}`);
      }
    }
  }

  console.log(`\nScanned ${EXP.length} entries:`);
  console.log(`  - Empty/non-string: ${emptyCount}`);
  console.log(`  - Truncation candidates: ${candidates.length}`);
  if (candidates.length > 0) {
    // Reason distribution
    const reasonDist = {};
    for (const c of candidates) {
      for (const r of c.reasons) reasonDist[r] = (reasonDist[r] || 0) + 1;
    }
    console.log(`  - Reason distribution:`);
    for (const [r, n] of Object.entries(reasonDist).sort((a, b) => b[1] - a[1])) {
      console.log(`      ${r}: ${n}`);
    }
  }

  const out = {
    _meta: {
      scanner: 'scan_truncated_explanations.mjs',
      scanned_at: new Date().toISOString(),
      input: 'data/explanations.json',
      total_entries: EXP.length,
      empty_entries: emptyCount,
      candidates_count: candidates.length,
      heuristics: ['ends-mid-word', 'ends-on-letter-no-punct', 'no-terminal-punct', 'short-single-paragraph'],
      action_required: 'Spot-check the first ~10 candidates. If they are genuine truncations, re-regenerate with `scripts/generate_explanations.cjs` at higher max_tokens for just the flagged qz_idx list (not a full rewrite). The 2026-05-13 chaos-doctor v4 audit-1 redesign surfaced this bug class; the fix is regen-with-higher-cap, not rewrite-from-scratch.',
    },
    candidates,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\nWrote ${OUT_PATH}`);
}

// Only run main() when invoked directly (not when imported as a module —
// the test suite imports detectTruncation from this file and must not
// trigger the file-write side effect at import time).
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  main();
}
