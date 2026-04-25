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
const LEGIT_LONG_OPTION_INDICES = new Set([2565, 3265, 2974, 3552]);

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
