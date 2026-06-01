/**
 * Intra-word spaced-Hebrew guard (v10.64.145).
 *
 * Catches the PDF/BIDI extraction artifact where a Hebrew word is split by spurious
 * spaces — either into isolated single letters ("ד י ספגיה"→"דיספגיה") or by a single
 * prefix letter cleaved from its word ("ב שתן"→"בשתן", "ה שני"→"השני"). A standalone single
 * Hebrew letter is essentially never correct: the 1-letter prefixes ו/ה/ב/ל/מ/ש/כ are always
 * glued to the next token. The detector flags EITHER pattern.
 *
 * History:
 *  - v10.64.145: detector (>=2-consecutive rule) + repaired 60 Qs.
 *  - v10.64.148: reconstructed the final 10 ENTANGLED Qs from source exam PDFs.
 *  - v10.64.151 (PR1): detector EXTENDED with the single-prefix rule (b) — ported from IM
 *    #158, which found the >=2-consecutive rule alone missed split prefixes. This surfaced
 *    190 more Qs. The 91 with ONLY safe ב/ל/מ/כ prefixes were de-spaced mechanically (provably
 *    space-only — glue-forward, 0 char/answer-key changes). The 99 with ambiguous ו/ה (or ש,
 *    or >=2-consecutive residue) are QUARANTINED below: ו can be word-final ("ו איז"=split of
 *    "איזו"), ה a SUFFIX ("מחלק ה"→"מחלקה") — gluing forward makes non-words, so they need a
 *    verbatim source read (render-the-clean-visual, like #316/#159), not a mechanical de-space.
 *  - v10.64.152 (PR2): repaired 97 of the 99 by targeted spaced-Hebrew respacing verified against
 *    the source booklets' visual renders (minimal-span-fix — only flagged spans touched, answer
 *    keys/option-order preserved). 2 remain (idx 303, 3201 — sources not on hand); see allowlist note.
 *
 * RATCHET: any spaced-Hebrew outside the allowlist fails. When a quarantined case is
 * reconstructed from source, remove its idx from ALLOWLIST in that PR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const QZ = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));

// Of the 99 quarantined in PR1, 97 were repaired in PR2 (v10.64.152) by targeted spaced-Hebrew
// respacing — each guard-flagged span verified against the source booklet's VISUAL render
// (render-the-clean-visual; reorders like "ו איז"→"איזו", "ו דק ת"→"דקות" adjudicated against
// high-DPI crops; pure forward/backward glues confirmed). Out-of-span content was left byte-
// identical (minimal-span-fix), so answer keys + option order are untouched.
// TWO remain quarantined — unfixable from sources on hand:
//   303  — not present in ANY available exam booklet (10 sittings + 56 flat PDFs + 2020 exam).
//   3201 — dataset stem is a more-detailed HF-management variant whose clinical tail (vitals/
//          labs/fluid-intake) matches no available booklet; the shorter 2022-Jun Q66 source
//          would DROP clinical content, so it is not respaced. Both await a source not on hand.
// See .audit_logs/geri_single_prefix/STATE.md for the full pipeline + per-idx adjudication.
const ALLOWLIST = new Set([303, 3201]);

const isHeb = (ch) => /[֐-׿]/.test(ch);
const PFX = new Set('ובהלמכש'); // 1-letter Hebrew prefixes — always glued to the next token
function hasSpacedHebrew(s) {
  const t = String(s).split(/\s+/);
  for (let k = 0; k < t.length - 1; k++) {
    const a = t[k], b = t[k + 1];
    // (a) >=2 consecutive single-Hebrew-letter tokens — e.g. "ד י ספגיה"
    if (a.length === 1 && isHeb(a) && b.length === 1 && isHeb(b)) return true;
    // (b) a single prefix letter cleaved from its (Hebrew) word — e.g. "ב שתן", "ה שני" (ported from IM #158)
    if (a.length === 1 && PFX.has(a) && b.length > 0 && isHeb(b[0])) return true;
  }
  return false;
}
function fields(q) {
  const out = [q.q || ''];
  for (const o of q.o || []) out.push(String(o));
  return out;
}

describe('intra-word spaced-Hebrew guard', () => {
  const offenders = [];
  QZ.forEach((q, i) => {
    if (fields(q).some(hasSpacedHebrew)) offenders.push(i);
  });

  it('no NEW spaced-Hebrew corruption (offenders ⊆ known-entangled allowlist)', () => {
    const unexpected = offenders.filter((i) => !ALLOWLIST.has(i));
    expect(
      unexpected,
      `New spaced-Hebrew corruption at idx ${unexpected.join(', ')}. ` +
        'A Hebrew word was split by spurious spaces (e.g. "ד י ספגיה"→"דיספגיה"). ' +
        'Repair the spacing; do not add to the allowlist unless the damage is entangled.'
    ).toEqual([]);
  });

  it('allowlist does not rot — every allowlisted idx still has the artifact', () => {
    // If a manual fix lands, the idx should be removed from ALLOWLIST, not left stale.
    const stale = [...ALLOWLIST].filter((i) => !offenders.includes(i));
    expect(stale, `Allowlisted idx ${stale.join(', ')} no longer have spaced-Hebrew — remove them from ALLOWLIST.`).toEqual([]);
  });
});
