/**
 * v10.34: Parser-bleed guard.
 *
 * History: the IMA Hebrew RTL PDF parser silently concatenated adjacent
 * questions when the next question's marker (`<digit>.`) failed to match.
 * Result: the next Q's stem (sometimes plus its options) was wadded into
 * the previous Q's option D. Some Qs ended up with options 200–680 chars
 * long, while the corresponding "missing" Q simply vanished from the bank.
 *
 * Discovered while auditing 2025-Jun-Basic Q11/Q12 bleed.
 * Initial scan found 318 contaminated options across 7 past-exam tags
 * going back to 2022. v10.34 cleaned all 318.
 *
 * This guard locks in the fix: no past-exam option may contain a clear
 * next-Q-marker pattern after position 30. Page-footer cruft is also
 * caught (date stamp + exam header is the most common tail pollutant).
 *
 * NOTE: 4 Qs are legitimate 4-patient comparison questions where each
 * option is intentionally a long patient description (200+ chars). These
 * are whitelisted by bank index.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
function loadJSON(rel) { return JSON.parse(readFileSync(resolve(ROOT, rel), 'utf-8')); }

const PAST_EXAM_TAGS = new Set([
  '2020', '2021-Dec', '2021-Jun',
  '2022-Jun-Basic', '2022-Jun-Subspec', '2022-Jun-orphan',
  '2023-Jun-Basic', '2023-Jun-Subspec', '2023-Jun-orphan', '2023-Sep',
  '2024-May-Basic', '2024-May-Subspec',
  '2024-Sep-Basic', '2024-Sep-Subspec', '2024-orphan',
  '2025-Jun-Basic',
]);

// 4-patient comparison Qs where long options are LEGIT (each option = full patient description).
// These are stable bank indices — if the bank gets re-sorted, this whitelist must be updated.
// v10.35 update: indices shifted by 15 orphan deletes (all <3265). 3265→3250, 2974→2971, 3552→3537.
// v10.64.2 update: indices shifted by 16 parser-corruption fixes. 2565→2555, 3250→3237, 2971→2959, 3537→3523.
// v10.64.4 update: indices shifted by 19 multi-sibling fixes. 2555→2548, 3237→3225, 2959→2948, 3523→3506.
// v10.64.7 update: indices shifted by 3 unambiguous orphan deletes. 2548→2545, 3225→3222, 2948→2945, 3506→3503.
// v10.64.8 update: indices shifted by 4 PDF-confirmed fragment deletes. 2545→2541, 3222→3218, 2945→2941, 3503→3499.
// v10.64.11 update: indices shifted by 48 orphan deletes. 2541→2493, 3218→3170, 2941→2893, 3499→3451.
const LEGIT_LONG_OPTION_INDICES = new Set([2493, 3170, 2893, 3451]);

// Q-stem-start phrases — the universal IMA Hebrew Q openings.
// If one of these appears in an option after position 30, it's a bleed.
const Q_STEM_KW = String.raw`(?:מטופל|מטופלת|בן\s*\d|בת\s*\d|בנו|בתו|איזה\s|איזו\s|מה\s|מהי\s|מהן\s|מהם\s|אילו\s|מבין\s|מי\s+מהבאים|כל\s+הבאים|לפי\s+המאמר|על\s+פי\s+המאמר|בשאלות\s+הבאות)`;
const BLEED_RE = new RegExp(String.raw`\s\d{1,3}(?:\s+\d{1,3}){0,2}\s*["'\u0060?]?\s*[.:]?\s+(?=${Q_STEM_KW})`);

// Page-footer cruft — date + exam header
const FOOTER_RE = /\d{1,2}[/.]\d{1,2}[/.](?:20)?\d{2}.*שלב\s+א/;

describe('parser-bleed guard (v10.34) — past-exam option hygiene', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  test('no past-exam option contains a next-Q-stem bleed pattern after position 30', () => {
    const violations = [];
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.has(q.t)) return;
      if (LEGIT_LONG_OPTION_INDICES.has(i)) return;
      (q.o || []).forEach((opt, j) => {
        if (typeof opt !== 'string') return;
        const m = BLEED_RE.exec(opt);
        if (m && m.index > 30) {
          violations.push({
            tag: q.t, idx: i, oidx: j,
            optLen: opt.length,
            bleedAt: m.index,
            preview: opt.slice(Math.max(0, m.index - 20), m.index + 60),
          });
        }
      });
    });
    if (violations.length) {
      console.error(`Bleed-pattern violations (${violations.length}):`,
                    violations.slice(0, 5));
    }
    expect(violations.length, `parser-bleed in ${violations.length} options`).toBe(0);
  });

  test('no past-exam option contains page-footer cruft (date + exam header)', () => {
    const violations = [];
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.has(q.t)) return;
      if (LEGIT_LONG_OPTION_INDICES.has(i)) return;
      (q.o || []).forEach((opt, j) => {
        if (typeof opt !== 'string') return;
        if (FOOTER_RE.test(opt)) {
          violations.push({
            tag: q.t, idx: i, oidx: j,
            preview: opt.slice(0, 100),
          });
        }
      });
    });
    if (violations.length) {
      console.error(`Footer-cruft violations (${violations.length}):`, violations.slice(0, 5));
    }
    expect(violations.length, `footer-cruft in ${violations.length} options`).toBe(0);
  });

  test('no past-exam option exceeds 250 chars (legit 4-patient Qs whitelisted)', () => {
    // Generous cap. Real IMA options top out around 130 chars. 250 is
    // comfortably above any legit answer, well below any bleed wad.
    const violations = [];
    questions.forEach((q, i) => {
      if (!PAST_EXAM_TAGS.has(q.t)) return;
      if (LEGIT_LONG_OPTION_INDICES.has(i)) return;
      (q.o || []).forEach((opt, j) => {
        if (typeof opt === 'string' && opt.length > 250) {
          violations.push({
            tag: q.t, idx: i, oidx: j, len: opt.length, preview: opt.slice(0, 80),
          });
        }
      });
    });
    if (violations.length) {
      console.error(`Over-length (>250) options:`, violations.slice(0, 5));
    }
    expect(violations.length, `${violations.length} options exceed 250 char cap`).toBe(0);
  });
});

/**
 * v10.64.79 tier-2 extension — q-stem-truncation signature.
 *
 * Complementary to the v10.34 BLEED_RE guard above. The v10.34 regex
 * looks for `<digit><whitespace><Hebrew Q-stem keyword>` inside an option,
 * which catches cases where the next Q's NUMBER MARKER ("1.", "2.")
 * survived in the bleed. But the v10.64.77 + v10.64.79 cleanup batch
 * caught 7 records where the digit marker was LOST and the parser only
 * preserved the option marker ("א."). The signature is different:
 *
 *   q.q   — truncates mid-sentence, no terminal punctuation
 *   q.o[0] — anomalously longer than its siblings, contains the stem
 *            continuation + question mark + the bare option text
 *
 * After v10.64.79 the disk is clean. This guard locks the cleaning in.
 *
 * Reconstruction protocol when this fires:
 *   1. Read q.q and q.o[0] together. The boundary is at "?" or option
 *      marker ("א.", "1.", etc).
 *   2. Move continuation back into q.q, terminating with "?".
 *   3. Strip everything before/including the option marker from o[0];
 *      bare option remains. Verify length matches sibling option lengths.
 *   4. q.c MUST NOT change — c is authoritative per system-prompt rule
 *      "Authority sources (do not invert): q.c is IMA published key +
 *      curator overrides — NEVER auto-flip".
 */

const TIER2_TERMINAL_PUNCT = new Set([
  '?', '.', ':', '!', '"', "'", ')', ']',
  '\u05F4', // gershayim ״
  '\u05F3', // geresh ׳
  '\u201D', // right double quote ”
  '\u2019', // right single quote ’
  '\u2026', // ellipsis …
]);

function tier2EndsWithTerminalPunct(s) {
  if (!s) return false;
  const trimmed = s.trimEnd();
  if (!trimmed) return false;
  return TIER2_TERMINAL_PUNCT.has(trimmed[trimmed.length - 1]);
}

describe('parser-bleed guard tier-2 (v10.64.79) — q-stem-truncation signature', () => {
  let questions;
  beforeAll(() => { questions = loadJSON('data/questions.json'); });

  test('no question has a truncated stem with anomalously-long o[0]', () => {
    const suspects = [];

    questions.forEach((q, i) => {
      if (!q || typeof q.q !== 'string' || !Array.isArray(q.o)) return;
      if (q.o.length < 2) return;
      if (q.q.length <= 30) return;
      if (LEGIT_LONG_OPTION_INDICES.has(i)) return;
      if (tier2EndsWithTerminalPunct(q.q)) return;

      const o0Len = (q.o[0] || '').length;
      const siblingLens = q.o.slice(1).map((o) => (o || '').length);
      const maxSibling = siblingLens.length ? Math.max(...siblingLens) : 0;

      // Anomalously long: >60 chars absolute AND >3× max sibling.
      // Tuned against v10.64.79 baseline: catches all 5 fixed records when
      // reverted, fires zero false-positives on clean disk.
      if (o0Len <= 60) return;
      if (o0Len <= 3 * maxSibling) return;

      suspects.push({
        idx: i, tag: q.t || '?',
        qTail: q.q.slice(-50),
        o0Head: (q.o[0] || '').slice(0, 100),
        o0Len, maxSibling,
      });
    });

    if (suspects.length) {
      console.error(
        `Tier-2 parser-bleed (${suspects.length} record(s)). ` +
        `Reconstruct: move continuation back into q.q (terminate with "?"), ` +
        `reduce o[0] to bare option. q.c MUST NOT change. ` +
        `See header of tests/parserBleedGuard.test.js for protocol.`,
        suspects.slice(0, 10),
      );
    }
    expect(suspects.length, `tier-2 parser-bleed in ${suspects.length} records`).toBe(0);
  });

  test('synthetic regression — heuristic locks against silent weakening', () => {
    // If a future refactor weakens the predicates, this synthetic case
    // will stop firing and surface the regression. Mirrors idx 3727
    // pre-v10.64.79.
    const synthetic = {
      q: 'בן 70, ברקע סוכרת, מתאשפז לבירור השתנה מרובה. כמות שתן ביממה 3.5 ליטר',
      o: [
        'אוסמולריות השתן 200 mosm/L. מה הסיבה המתאימה לממצאים אלו? א. Resolving Acute Tubular Necrosis',
        'Uncontrolled Diabetes Mellitus',
        'Hypercalcemia',
        'High dose Furosemide',
      ],
    };
    const endsClean = tier2EndsWithTerminalPunct(synthetic.q);
    const o0Len = synthetic.o[0].length;
    const maxSibling = Math.max(...synthetic.o.slice(1).map((o) => o.length));
    const fires = !endsClean && o0Len > 60 && o0Len > 3 * maxSibling;
    expect(fires, 'tier-2 heuristic must fire on synthetic v10.64.79 case').toBe(true);
  });
});
