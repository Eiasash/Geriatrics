/**
 * Intra-word FRACTURE repair ratchet (v10.64.153, PR3).
 *
 * PR3 swept a corruption class the spacedHebrewGuard's rules (a)/(b) missed: a single lone
 * NON-prefix Hebrew letter wedged inside a fractured word (e.g. "לח ץ"→"לחץ", "קר י אטנין"→
 * "קריאטנין", "אשפוזי ם"→"אשפוזים", "לכ י סא"→"לכיסא"). 59 spans / 53 Qs were repaired purely
 * mechanically (pure-despace; despace(old)==despace(new); 0 answer-key/option/count changes).
 *
 * The new detector rule (c) (lone word-final-form letter) guards the FINAL-FORM sub-class against
 * regression. This file pins a representative sample of the NON-final fixes — which rule (c) cannot
 * see — so a future data re-import that re-introduces the fracture (or an automated pass that
 * re-splits the word) fails CI. Each pin asserts the repaired word is present AND the old spaced
 * fracture is gone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const QZ = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));

// [idx, field ('q' | option-index), [must-contain...], [must-be-absent (old fracture)...]]
const PINS = [
  [2492, 'q', ['לחץ'], ['לח ץ']],
  [2516, 2, ['קריאטנין'], ['קר י אטנין', 'י אטנין']],
  [3195, 2, ['קריאטנין'], ['קר י אטנין']],
  [2769, 1, ['אשפוזים'], ['אשפוזי ם']],
  [2984, 'q', ['מסתם'], ['מסת ם']],
  [3438, 'q', ['שתן'], ['שת ן']],
  [2400, 'q', ['באוויר', 'לכיסא'], ['באווי ר', 'לכ י סא']],
  [2424, 'q', ['אאורטלי'], ['א אורטלי']],
  [2800, 3, ['דמנציה'], ['דמנצי ה']],
  [2513, 3, ['דליריום'], ['ד ליריום']],
  [2673, 0, ['אצל'], ['א צל']],
  [2553, 'q', ['בהדרגתית'], ['בהדרגתי ת']],
  [2760, 2, ['באריתרופואטין'], ['באריתרופו א טין']],
  [3494, 'q', ['שלפוחיות'], ['שלפוחיו ת']],
  [2664, 0, ['הבדלים'], ['הבדלי ם']],
  // Codex #321 P2 + sibling partial-fix completions (hand-curated, attestation-grounded):
  [2401, 'q', ['לב איסכמית'], ['לב א יסכ מית', 'א יסכ מית']],
  [2619, 2, ['סיכון'], ['ס יכון']],
  [3265, 2, ['סיכון'], ['ס יכון']],
  [3498, 'q', ['בסרקופניה'], ['בסרקו פ ניה']],
  [2984, 3, ['קריטריונים'], ['קר י טריונים']],
  [3443, 1, ['יתרון'], ['י תרון']],
  [2593, 'q', ['העצבית'], ['העצבי ת']],
  [3236, 'q', ['העצבית'], ['העצבי ת']],
  [3465, 'q', ['הריאתיים'], ['הר י אתיים']],
  // Source-render batch (v10.64.154): verified against the exam-booklet renders.
  [2742, 2, ['דיסתימיה'], ['דיס ת ימיה']],      // dysthymia — pure-despace, render-confirmed Q16
  [3346, 2, ['דיסתימיה'], ['דיס ת ימיה']],
  [2621, 1, ['בזיכרון'], ['י בז כרון']],        // "in memory" — reorder, render-confirmed Q33
  [3267, 1, ['בזיכרון'], ['י בז כרון']],
  [3019, 'q', ['הייתה'], ['הי י .תה', 'הי י']], // "was" — multiset + dropped spurious mid '.'
  [2476, 'q', ['מ"ג'], ['מ " ג']],              // mg gershayim — render-confirmed Q9
  [3148, 'q', ['מ"ג'], ['מ " ג']],
];

const fieldText = (q, f) => (f === 'q' ? String(q.q || '') : String((q.o || [])[f] ?? ''));

describe('intra-word fracture repair ratchet (PR3)', () => {
  PINS.forEach(([idx, f, has, absent]) => {
    it(`idx ${idx} field ${f}: fracture repaired`, () => {
      const s = fieldText(QZ[idx], f);
      for (const w of has) expect(s, `expected repaired word "${w}" in idx ${idx} field ${f}`).toContain(w);
      for (const w of absent) expect(s, `old fracture "${w}" should be gone in idx ${idx} field ${f}`).not.toContain(w);
    });
  });

  it('count is unchanged (3823) — fixes were pure-despace, no add/drop', () => {
    expect(QZ.length).toBe(3823);
  });

  it('exactly one lone final-form letter remains (idx 3211, allowlisted) — fracture floor', () => {
    const FINAL = /[ךםןףץ]/;
    const fields = (q) => [q.q || '', ...(q.o || []).map(String)];
    const offenders = [];
    QZ.forEach((q, i) => {
      if (fields(q).some((s) => String(s).split(/\s+/).some((tok) => tok.length === 1 && FINAL.test(tok)))) {
        offenders.push(i);
      }
    });
    expect(offenders).toEqual([3211]);
  });
});
