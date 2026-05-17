// Audit-4 (2026-05-17) — judge-letter FRAME guard.
//
// WHAT THIS PINS
// --------------
// `judge.correct_letter_if_app_wrong` is a DISPLAY-frame letter: the judge
// only ever sees served options labeled A..D in display order
// (chaos-doctor-bot-v4.mjs:546). The audit-3 §4 manual 5-row sample mapped
// it against canonical `q.o[]` instead and reported a prose↔index
// "artifact" on 3/5 rows. A full-corpus rigorous detector found the judge
// is **0/61 inconsistent in display frame** — there was never a defect;
// §4 measured its own frame error (reproducible as a ~41/61 spurious base
// rate). `resolveJudgeLetter` + the captured `correct_display_idx` make the
// frame explicit at the SOURCE so no downstream re-framer can repeat it.
//
// THREE LAYERS
//   1. resolveJudgeLetter unit contract (display-positional; null/oob;
//      Geri-no-data-i vs FM/IM-data-i canonical behaviour).
//   2. AUDIT TRAIL — the 3 §4-cited "artifact" rows (idx 3255/1584/1273)
//      pinned verbatim from the backfilled ledger, proven display-frame-
//      consistent. This fixture IS the record that the §4 finding was a
//      frame error, not a judge defect.
//   3. DRIFT SNAPSHOT — a test-only prose↔display-letter detector over all
//      86 disagreement rows asserts 0 real inconsistencies (catches a
//      future genuinely-drifting judge for free; deliberately NOT shipped
//      as runtime code — the rigorous detector proved the failure mode
//      does not currently occur, so a live validator would be speculative).
//
// Distinct from the 2026-05-08 FM/IM served↔canonical PROMPT bug
// (chaosBotV4OptionResolver.test.js) — that was a real bot bug there and a
// no-op for Geri. Do not conflate.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveJudgeLetter } from '../scripts/lib/optionResolver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = JSON.parse(
  readFileSync(path.join(HERE, 'fixtures', 'chaosJudgeLetterFrame.json'), 'utf-8'),
);

// ---- test-only prose↔display-letter consistency detector --------------
// Mirrors the audit-4 STEP-1 rigorous detector. Lives in the test, NOT in
// production (user scope: keep prose-consistency as a snapshot guard only).
const BIDI = /[‎‏؜‪-‮⁦-⁩]/g;
const norm = (s) =>
  (s == null ? '' : String(s)).normalize('NFC').replace(BIDI, '').replace(/\s+/g, '');
const LET = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5 };
const EXPLICIT = [
  /\bthe\s+answer\s+is\s*\(?\s*([A-F])\b/i,
  /\bcorrect\s+answer\s+is\s*\(?\s*([A-F])\b/i,
  /\bboard[-\s]*level\s+answer\s+is\s*\(?\s*([A-F])\b/i,
  /\banswer\s+is\s*\(?\s*([A-F])\b/i,
  /\boption\s*\(?\s*([A-F])\b\s+is\s+(?:the\s+)?correct/i,
  /\b([A-F])\s+is\s+(?:the\s+)?correct\b/i,
  /\boption\s*\(?\s*([A-F])\b\s*\(/i,
];
function explicitLetters(prose) {
  const out = new Set();
  for (const rx of EXPLICIT) {
    const g = new RegExp(rx.source, rx.flags.includes('g') ? rx.flags : rx.flags + 'g');
    let m;
    while ((m = g.exec(prose || '')) !== null) out.add(m[1].toUpperCase());
  }
  return out;
}
function textScore(opt, prose) {
  const on = norm(opt);
  const pn = norm(prose);
  let sc = 0;
  for (const L of [40, 30, 22, 16]) {
    if (on.length >= L && pn.includes(on.slice(0, L))) { sc += L; break; }
  }
  const toks = (s) =>
    new Set((String(s).match(/[A-Za-z][A-Za-z0-9-]{3,}/g) || []).map((w) => w.toLowerCase()));
  const a = toks(opt);
  const b = toks(prose || '');
  let shared = 0;
  for (const t of a) if (b.has(t)) shared += 1;
  return sc + 4 * shared;
}
// returns 'consistent' | 'inconsistent' | 'unnameable' | 'no-letter'
function classify(row) {
  const opts = (row.options || []).map((o) => (o && o.text != null ? o.text : o));
  const letter = row.judge && row.judge.correct_letter_if_app_wrong;
  const issue = (row.judge && row.judge.issue) || '';
  if (letter == null) return 'no-letter';
  const li = LET[String(letter).trim().slice(0, 1).toUpperCase()];
  if (li == null || li < 0 || li >= opts.length) return 'no-letter';
  const expl = [...explicitLetters(issue)].map((x) => LET[x]).filter((x) => x != null && x < opts.length);
  if (expl.length) {
    return expl.includes(li) ? 'consistent' : 'inconsistent';
  }
  const scored = opts
    .map((o, i) => [textScore(o, issue), i])
    .sort((p, q) => q[0] - p[0]);
  const [best, bi] = scored[0];
  const second = scored[1] ? scored[1][0] : 0;
  if (best >= 16 && best > second) return bi === li ? 'consistent' : 'inconsistent';
  return 'unnameable';
}

describe('resolveJudgeLetter — display-frame contract', () => {
  const geri = [
    { idx: 0, text: 'alpha' }, { idx: 1, text: 'beta' },
    { idx: 2, text: 'gamma' }, { idx: 3, text: 'delta' },
  ]; // Geri: option.idx === display position (no data-i)

  it('maps a letter to its DISPLAY position', () => {
    const r = resolveJudgeLetter(geri, 'C');
    expect(r).toEqual({
      letter: 'C', displayIdx: 2, displayText: 'gamma', canonicalIdxFromServed: 2,
    });
  });

  it('Geri (no data-i): canonicalIdxFromServed === displayIdx', () => {
    for (const [L, i] of [['A', 0], ['B', 1], ['C', 2], ['D', 3]]) {
      const r = resolveJudgeLetter(geri, L);
      expect(r.displayIdx).toBe(i);
      expect(r.canonicalIdxFromServed).toBe(i);
    }
  });

  it('FM/IM (data-i shuffle): canonicalIdxFromServed is the TRUE canonical', () => {
    // served display order, each carrying its canonical data-i
    const fm = [
      { idx: 3, text: 'Venous Insufficiency' },     // disp A
      { idx: 2, text: 'ANCA Vasculitis' },          // disp B
      { idx: 0, text: 'Atherosclerosis' },          // disp C
      { idx: 1, text: 'Arterial Hypertension' },    // disp D
    ];
    const r = resolveJudgeLetter(fm, 'A');
    expect(r.displayIdx).toBe(0);
    expect(r.displayText).toBe('Venous Insufficiency');
    expect(r.canonicalIdxFromServed).toBe(3); // not 0 — the §4-class trap
  });

  it('lowercase resolves (LLMs vary case); non-Latin → null (schema is A|B|C|D)', () => {
    // SYS_DOCTOR_JUDGE schema: correct_letter_if_app_wrong is "A"|"B"|"C"|"D".
    // case-insensitivity is free (helper upper-cases); Hebrew/other glyphs
    // are NOT in the contract — they collapse to the B5 "no clean letter"
    // case rather than guessing. No speculative Hebrew table (cf. the cut
    // runtime proseLetterConsistent).
    expect(resolveJudgeLetter(geri, 'd').displayIdx).toBe(3);
    expect(resolveJudgeLetter(geri, 'ב')).toBeNull();
  });

  it('absent / out-of-range / empty letter → null (the B5 case)', () => {
    expect(resolveJudgeLetter(geri, null)).toBeNull();
    expect(resolveJudgeLetter(geri, undefined)).toBeNull();
    expect(resolveJudgeLetter(geri, '')).toBeNull();
    expect(resolveJudgeLetter(geri, 'E')).toBeNull(); // only 4 options
    expect(resolveJudgeLetter([], 'A')).toBeNull();
    expect(resolveJudgeLetter(null, 'A')).toBeNull();
  });
});

describe('AUDIT TRAIL — audit-3 §4 "artifact" rows are display-frame-consistent', () => {
  const cited = FIX.rows.filter((r) => r.cited_audit3_s4);

  it('the 3 §4-cited rows (3255 / 1584 / 1273) are present and tagged', () => {
    expect(FIX.cited_audit3_s4_idxs).toEqual([1273, 1584, 3255]);
    expect(cited.map((r) => r.datasetIdx).sort((a, b) => a - b)).toEqual([1273, 1584, 3255]);
  });

  for (const idx of [3255, 1584, 1273]) {
    it(`idx ${idx}: emitted letter resolves in DISPLAY frame; canonical ≠ display (the §4 trap)`, () => {
      const row = cited.find((r) => r.datasetIdx === idx);
      const letter = row.judge.correct_letter_if_app_wrong;
      const r = resolveJudgeLetter(row.options, letter);
      // resolver agrees with the captured/backfilled display index
      expect(r.displayIdx).toBe(row.judge.correct_display_idx);
      // the option the judge meant is the one served at that DISPLAY pos
      const served = row.options[row.judge.correct_display_idx];
      expect(r.displayText).toBe(typeof served === 'string' ? served : served.text);
      // canonical ≠ display here: this shuffle is exactly why the §4 hand-
      // method (letter-as-canonical) fabricated a mismatch. The fields now
      // record both so the trap cannot recur.
      expect(row.judge.correct_canonical_idx).not.toBe(r.displayIdx);
      // and the row is NOT a real prose↔letter inconsistency
      expect(classify(row)).not.toBe('inconsistent');
    });
  }

  it('idx 3255 / 1584: judge prose explicitly names the emitted letter', () => {
    // the clearest possible audit trail — the judge wrote the letter out
    for (const idx of [3255, 1584]) {
      const row = cited.find((r) => r.datasetIdx === idx);
      const li = LET[String(row.judge.correct_letter_if_app_wrong).toUpperCase()];
      const expl = [...explicitLetters(row.judge.issue)].map((x) => LET[x]);
      expect(expl).toContain(li);
    }
  });
});

describe('DRIFT SNAPSHOT — full 86-row corpus, display frame', () => {
  it('exposes the 86 disagreement rows', () => {
    expect(FIX.rows.length).toBe(86);
  });

  it('ZERO prose↔display-letter inconsistencies across all 86 rows', () => {
    const tally = { consistent: 0, inconsistent: [], unnameable: 0, 'no-letter': 0 };
    for (const row of FIX.rows) {
      const c = classify(row);
      if (c === 'inconsistent') tally.inconsistent.push(row.datasetIdx);
      else tally[c] += 1;
    }
    // The pre-registered audit-4 gate: pre-fix == post-fix == 0 in the
    // correct frame (the "defect" was always a frame mis-read).
    expect(tally.inconsistent).toEqual([]);
    // sanity: the corpus actually exercised the detector
    expect(tally.consistent).toBeGreaterThanOrEqual(15);
    expect(tally['no-letter']).toBeGreaterThanOrEqual(20); // the B5 class
  });
});
