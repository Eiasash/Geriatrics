/**
 * Intra-word spaced-Hebrew guard (v10.64.145).
 *
 * Catches the PDF/BIDI extraction artifact where a Hebrew word is split by spurious
 * spaces into isolated single letters — e.g. "ד י ספגיה" (should be "דיספגיה"),
 * "ל א טובה" (should be "לא טובה"). A single standalone Hebrew letter is essentially
 * never correct (the 1-letter words ו/ה/ב/ל/מ/ש/כ are always prefixes glued to the
 * next token), so >=2 consecutive single-Hebrew-letter tokens reliably flags corruption.
 *
 * The 2026-05-31 content audit found 70 affected questions; 60 were repaired by a
 * surgical de-spacing pass (PR "hebrew-formatting-fix"). The remaining ALLOWLIST below
 * are questions where the corruption is ENTANGLED with deeper damage (scrambled letters,
 * stray periods, duplicated words) that cannot be fixed by de-spacing alone — they need
 * manual reconstruction against the source and are tracked, not silently tolerated.
 *
 * This is a RATCHET: any NEW spaced-Hebrew occurrence (idx not in the allowlist) fails.
 * When an allowlisted item is manually repaired, remove its idx here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const QZ = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));

// Entangled-corruption questions awaiting manual reconstruction (NOT de-spaceable).
const ALLOWLIST = new Set([2419, 2625, 2632, 2774, 3272, 3279, 3379, 3464, 3492, 3509]);

const isHeb = (ch) => /[֐-׿]/.test(ch);
function hasSpacedHebrew(s) {
  const t = String(s).split(/\s+/);
  for (let k = 0; k < t.length - 1; k++) {
    if (t[k].length === 1 && isHeb(t[k]) && t[k + 1].length === 1 && isHeb(t[k + 1])) return true;
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
