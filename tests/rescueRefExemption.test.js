/**
 * SZMC-Rescue ref exemption — bounded invariant guard.
 *
 * The SZMC-Rescue batch was originally 75 intentionally-unsourced questions
 * (bespoke Israeli-context, no textbook source, empty `ref` per the
 * anti-fabrication rule; #307 recovered the only 5 with a genuine `_refs_orig`).
 * The 3C content-audit (v10.64.184) re-examined them and found 72 ARE
 * textbook-groundable — those received CONTENT-derived refs (chapter assigned
 * from each question's clinical content, NOT the question_chapters.json
 * topic-default floor, which WOULD be the fabrication the policy forbids:
 * "reliable as a floor… does NOT carry per-Q curatorial specificity" — q.ref
 * rebuild caveat 2026-05-13). The exemption now bounds to the 3 genuinely
 * Israel-specific items (end-of-life law, decisional capacity, driving fitness)
 * that have no textbook home and stay unsourced.
 *
 * weekly-audit.yml used to require `ref` on every question, so it failed
 * weekly on these. That check is now exempt for `t === 'SZMC-Rescue'`.
 *
 * This test moves the *real* guard onto every CI run: the exemption must stay
 * BOUNDED — an empty/missing ref is allowed ONLY on SZMC-Rescue questions. If a
 * regular (sourced) question ever loses its ref, this fails loudly instead of
 * being silently swallowed by the now-relaxed weekly audit.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const questions = JSON.parse(
  readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'),
);

describe('SZMC-Rescue ref exemption is bounded', () => {
  it('every question with an empty/missing ref is tagged SZMC-Rescue', () => {
    const offenders = [];
    for (let i = 0; i < questions.length; i++) {
      const ref = String(questions[i].ref || '').trim();
      if (!ref && questions[i].t !== 'SZMC-Rescue') {
        offenders.push({ idx: i, t: questions[i].t, q: String(questions[i].q || '').slice(0, 50) });
      }
    }
    expect(
      offenders,
      `${offenders.length} non-SZMC-Rescue questions are missing a ref ` +
        `(empty ref is only allowed on SZMC-Rescue): ${JSON.stringify(offenders.slice(0, 5))}`,
    ).toEqual([]);
  });

  it('the SZMC-Rescue batch genuinely contains unsourced questions (sanity)', () => {
    const rescue = questions.filter((q) => q.t === 'SZMC-Rescue');
    const unsourced = rescue.filter((q) => !String(q.ref || '').trim());
    // The batch exists and at least some are intentionally unsourced — guards
    // against the test silently passing because the tag was renamed/removed.
    expect(rescue.length, 'expected a non-empty SZMC-Rescue batch').toBeGreaterThan(0);
    expect(
      unsourced.length,
      'expected SZMC-Rescue to include intentionally-unsourced questions',
    ).toBeGreaterThan(0);
  });

  it('weekly-audit.yml ref check carries the SZMC-Rescue exemption', () => {
    const yml = readFileSync(
      resolve(rootDir, '.github/workflows/weekly-audit.yml'),
      'utf-8',
    );
    // Pin the exemption so a future edit that re-tightens the audit (and would
    // re-break it weekly) is caught here instead of in production.
    expect(yml).toMatch(/q\.get\('t'\)\s*!=\s*'SZMC-Rescue'/);
  });
});
