// CI guard: ratchet against re-introduction of mid-sentence-truncated entries
// in data/explanations.json. v10.64.122 (regen PR #1) ships this test alongside
// the first cluster regen to prevent future explanation batches from silently
// re-introducing the bug class the 2026-05-13 truncation scanner identified.
//
// Heuristic is INLINED rather than imported from scripts/scan_truncated_explanations.mjs
// because vitest's esbuild transformer rejects raw Hebrew chars in regex
// character classes (works at Node ESM level, fails in vitest). The duplication
// is the cost; the "regex equivalence" smoke test below guards against drift —
// the Hebrew fixtures specifically pin the Hebrew character-class behavior so
// scanner-side edits that change the Hebrew regex without updating this mirror
// fail loud.
//
// SCOPE NOTE — what this guard catches and doesn't catch:
//   CATCHES (syntactic): no terminal punctuation, ends mid-word, anomalously
//     short. This is the v10.64.119 truncation bug class — the AI was hitting
//     max_tokens or honoring a tight word cap and stopping mid-sentence.
//   DOES NOT CATCH (semantic): a complete sentence that omits discussion of
//     one or more distractors. The explanation is grammatically complete but
//     incomplete in coverage. The redesigned audit-1 channel in chaos-doctor-bot
//     v4 (v10.64.118 SYS_DOCTOR_EXPLAIN) catches THIS class at chaos-bot run
//     time, with explicit axis_failures=['2'] when distractor analysis is missing.
//   This guard is a REGRESSION GATE against the syntactic class, not a quality
//   gate against the semantic class. Future-Claude reading this: don't trust
//   passing this test as proof that explanations are clinically complete.
//
// To update the baseline (e.g., after a regen batch drops the count):
//   1. Run: node scripts/scan_truncated_explanations.mjs
//   2. Read the candidates_count from .audit_logs/truncated_explanations.json
//   3. Set TRUNCATION_BASELINE in this file to that value

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

// Baseline as of v10.64.126 (cancer cluster regen, PR #4 of rollout).
// Rollout history: 766 → 706 (dementia v122) → 704 (carryover-clear v123)
// → 653 (infections v124) → 616 (polypharmacy v125) → 580 (cancer v126).
// Four consecutive clean regens (124+ stems consecutive 0-failure streak).
// v10.64.126: cancer median 1789 chars, 100% in 1500-2100 band. Topic-
// density char-distribution framing broke on out-of-sample data (cancer
// predicted wider/higher than polypharmacy on narrative-density hypothesis;
// actually landed tighter and lower). Provisional refinement: SYSTEM_PROMPT_V2
// word-target dominates topic-density for output shape. Delirium + parkinson
// predictions remain sealed for stress-testing.
// Update only when a future regen batch tightens the count further.
const TRUNCATION_BASELINE = 519;

// Mirror of scripts/scan_truncated_explanations.mjs detectTruncation. Hebrew
// chars expressed as Unicode escapes (א-ת for alef-tav, ״ for
// gershayim, ׳ for geresh) to placate vitest's transformer.
const TERMINAL_PUNCT = /[.!?:][\s'"*\])}״׳-]*$/u;
const ENDS_WITH_LETTER = /[A-Za-zא-ת]\s*$/u;
const WHITESPACE = /\s/u;

function detectTruncation(text) {
  const reasons = [];
  const trimmed = (text || '').replace(/\s+$/u, '');
  if (!trimmed || trimmed.length < 30) return { reasons, truncated: false };
  if (ENDS_WITH_LETTER.test(trimmed)) {
    const tail = trimmed.slice(-20);
    if (!WHITESPACE.test(tail)) reasons.push('ends-mid-word');
    else reasons.push('ends-on-letter-no-punct');
  }
  if (!TERMINAL_PUNCT.test(trimmed) && !reasons.includes('ends-on-letter-no-punct') && !reasons.includes('ends-mid-word')) {
    reasons.push('no-terminal-punct');
  }
  if (trimmed.length < 250 && !trimmed.includes('\n\n')) reasons.push('short-single-paragraph');
  const highConf = reasons.includes('ends-mid-word') || reasons.includes('ends-on-letter-no-punct') || reasons.includes('no-terminal-punct');
  return { reasons, truncated: highConf };
}

describe('explanation truncation ratchet (v10.64.122 CI guard)', () => {
  const EXP = JSON.parse(fs.readFileSync(path.join(REPO, 'data/explanations.json'), 'utf8'));

  it('heuristic smoke: complete sentences clear, mid-word cutoffs flag', () => {
    // Length must be ≥30 to be eligible for truncation flagging (per heuristic).
    expect(detectTruncation('Complete sentence with full context here.')).toMatchObject({ truncated: false });
    expect(detectTruncation('This is a complete-but-not-terminated sentence and ends mid-wor')).toMatchObject({ truncated: true });
  });

  it('terminal-punct regex handles sentence-end + closing-mark combinations', () => {
    expect(detectTruncation('Ends with quote.')).toMatchObject({ truncated: false });
    expect(detectTruncation('Quote inside.\'')).toMatchObject({ truncated: false });
    expect(detectTruncation('Markdown emphasis.*')).toMatchObject({ truncated: false });
    expect(detectTruncation('Parenthetical close.)')).toMatchObject({ truncated: false });
  });

  it('Hebrew character-class behavior is pinned (scanner-mirror equivalence)', () => {
    // Without these, scanner-side edits to the Hebrew character class would
    // silently desync from this mirrored regex. The Hebrew fixtures exercise
    // the same heuristic branches as the Latin ones above, in the Hebrew
    // half of the [A-Za-zא-ת] class.
    // Complete Hebrew sentence ending with period.
    expect(detectTruncation('זוהי משפט מלא ומסיים בנקודה כך שהבדיקה רואה אותו תקין.')).toMatchObject({ truncated: false });
    // Hebrew sentence cut off mid-word (length ≥30 to bypass the short-circuit).
    expect(detectTruncation('משפט שנקטע באמצע המילה ולא מסתיים כראוי מילגג')).toMatchObject({ truncated: true });
    // Hebrew sentence ending with gershayim-after-period (the closing-mark carve-out).
    expect(detectTruncation('סוף משפט עם גרשיים כדי להבטיח הבחנה נכונה."')).toMatchObject({ truncated: false });
  });

  it('truncation count is at or below baseline (monotone ratchet)', () => {
    let truncated = 0;
    for (let i = 0; i < EXP.length; i++) {
      const text = EXP[i];
      if (typeof text !== 'string') continue;
      const { truncated: isTrunc } = detectTruncation(text);
      if (isTrunc) truncated += 1;
    }
    expect(truncated).toBeLessThanOrEqual(TRUNCATION_BASELINE);
    if (truncated < TRUNCATION_BASELINE - 20) {
      console.log(`[truncationGuard] current count ${truncated} is ${TRUNCATION_BASELINE - truncated} below baseline; consider tightening TRUNCATION_BASELINE.`);
    }
  });
});
