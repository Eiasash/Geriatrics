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
 *  - v10.64.152 (PR2): reconstructs the 99 from source booklets and empties this allowlist.
 *
 * RATCHET: any spaced-Hebrew outside the allowlist fails. When a quarantined case is
 * reconstructed from source, remove its idx from ALLOWLIST in that PR.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const QZ = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));

// 99 ambiguous single-prefix (ו/ה/ש) + entangled cases QUARANTINED for source-PDF
// reconstruction (v10.64.151, PR1). ו can be word-final, ה a suffix — gluing forward makes
// non-words (IM #158/#159 lesson) — so these need a verbatim source read, not a mechanical
// de-space. PR2 reconstructs them from the exam booklets and empties this set.
const ALLOWLIST = new Set([
  303, 2392, 2400, 2406, 2419, 2420, 2422, 2475, 2480, 2496, 2503, 2511, 2593, 2603, 2606,
  2621, 2624, 2637, 2646, 2653, 2660, 2661, 2663, 2679, 2681, 2688, 2737, 2751, 2779, 2787,
  2810, 2814, 2818, 2839, 2844, 2849, 2853, 2887, 2946, 2964, 2973, 2982, 2985, 2995, 2997,
  3004, 3011, 3018, 3028, 3045, 3168, 3172, 3175, 3181, 3189, 3201, 3222, 3236, 3240, 3242,
  3247, 3248, 3251, 3258, 3267, 3270, 3271, 3284, 3286, 3293, 3301, 3308, 3309, 3311, 3327,
  3329, 3341, 3356, 3384, 3392, 3415, 3419, 3423, 3432, 3437, 3439, 3444, 3448, 3449, 3452,
  3462, 3472, 3474, 3482, 3506, 3507, 3687, 3689, 3708,
]);

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
