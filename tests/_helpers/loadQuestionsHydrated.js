/**
 * Test helper: load data/questions.json with `e` rehydrated from
 * data/explanations.json (the v10.64.93 mobile-perf split moved `e` out of
 * questions.json so first-load drops ~43% on Slow 3G).
 *
 * Returns questions[] in the historical hydrated shape — every Q with a
 * non-empty `e` field — so existing assertions like `q.e.trim().length >= 10`
 * keep working without per-test fallback edits.
 *
 * Idempotent: if explanations.json is missing (pre-split checkout, broken
 * partial state) returns questions.json as-is. The inverse-drift case
 * (questions.json still has e AND explanations.json present) is handled by
 * tests/explanationsSplit.test.js.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function loadQuestionsHydrated(root) {
  const qPath = resolve(root, 'data/questions.json');
  const ePath = resolve(root, 'data/explanations.json');
  const qs = JSON.parse(readFileSync(qPath, 'utf-8'));
  if (existsSync(ePath)) {
    const ex = JSON.parse(readFileSync(ePath, 'utf-8'));
    if (Array.isArray(ex) && ex.length === qs.length) {
      qs.forEach((q, i) => {
        if ((q.e === undefined || q.e === null || q.e === '') && ex[i]) {
          q.e = ex[i];
        }
      });
    }
  }
  return qs;
}
