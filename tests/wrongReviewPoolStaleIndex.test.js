/**
 * Regression: getWrongReviewPool() must PRUNE a stale wrong-answer index, not
 * ABORT the whole pool build on the first one.
 *
 * Bug (pre-v10.64.182): inside `for(const k in S.wrongQs)`, the guard
 *   `const q=QZ[i];if(!q)return;`
 * used a bare `return` — so the FIRST wrongQs index that no longer resolves to
 * a live question (indices persist across corpus refreshes / question-bank
 * trims) exited the entire function and returned `undefined`. The "Review wrong"
 * pool path (`filt==='wrong'`) then assigned `pool=undefined`, and the quiz card
 * crashed on click. The sibling guard one line up already used `continue`.
 *
 * Fix: `if(!q)continue;` — skip the stale entry, keep building the pool.
 *
 * This test extracts the REAL function body from shlav-a-mega.html and executes
 * it, so it fails if the source ever reverts to a bare `return` (a hand-copied
 * duplicate could silently drift from the monolith).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

// Extract the getWrongReviewPool source. The body ends at the line
// `return out.map(o=>o.i);}` which is the function's final statement.
function buildGetWrongReviewPool() {
  const m = html.match(/function getWrongReviewPool\(\)\{[\s\S]+?return out\.map\(o=>o\.i\);\s*\}/);
  if (!m) throw new Error('getWrongReviewPool source not extractable from HTML');
  // The function reads globals S, QZ, IMA_WEIGHTS — inject them as params.
  const factory = new Function('S', 'QZ', 'IMA_WEIGHTS', m[0] + '\nreturn getWrongReviewPool;');
  // factory(S,QZ,IMA_WEIGHTS) returns getWrongReviewPool closed over those
  // globals; invoking it () runs the real (no-arg) function body.
  return (S, QZ, IMA_WEIGHTS) => factory(S, QZ, IMA_WEIGHTS)();
}

// Minimal IMA_WEIGHTS stand-in (the function only indexes it by ti and
// falls back to 4 for out-of-range / non-finite). A short array is enough.
const WEIGHTS = [5, 3, 6, 5, 8];

// A valid (in-bounds, resolvable) question object.
function q(ti = 0) {
  return { ti, q: 'x', o: ['a', 'b', 'c', 'd'], c: 0 };
}

describe('getWrongReviewPool stale-index pruning', () => {
  it('source no longer contains the bare-return abort pattern', () => {
    const m = html.match(/function getWrongReviewPool\(\)\{[\s\S]+?return out\.map\(o=>o\.i\);\s*\}/);
    expect(m, 'getWrongReviewPool not found').toBeTruthy();
    // The in-bounds null/missing-question guard must use `continue`, not `return`.
    expect(m[0]).toContain('const q=QZ[i];if(!q)continue;');
    expect(m[0]).not.toContain('const q=QZ[i];if(!q)return;');
  });

  it('prunes an out-of-bounds (>= QZ.length) wrong index and still builds the pool', () => {
    const getWrongReviewPool = buildGetWrongReviewPool();
    const QZ = [q(0), q(1)]; // length 2 — index 99 is stale/out-of-bounds
    const S = {
      wrongQs: {
        0: { streak: 0, ts: Date.now() },
        99: { streak: 0, ts: Date.now() }, // stale — would have aborted via the i>=QZ.length guard
        1: { streak: 0, ts: Date.now() },
      },
    };
    const pool = getWrongReviewPool(S, QZ, WEIGHTS);
    expect(Array.isArray(pool)).toBe(true);
    // Both live indices survive; the stale 99 is excluded.
    expect([...pool].sort((a, b) => a - b)).toEqual([0, 1]);
    expect(pool).not.toContain(99);
  });

  it('prunes an in-bounds-but-missing question slot without aborting (the bare-return bug site)', () => {
    const getWrongReviewPool = buildGetWrongReviewPool();
    // QZ has a hole at index 1 (e.g. a question removed but its wrongQs entry
    // persisted). This is the exact `const q=QZ[i];if(!q)...` path.
    const QZ = [q(0), undefined, q(2)];
    const S = {
      wrongQs: {
        0: { streak: 0, ts: Date.now() },
        1: { streak: 0, ts: Date.now() }, // QZ[1] is undefined -> must `continue`, not `return`
        2: { streak: 0, ts: Date.now() },
      },
    };
    const pool = getWrongReviewPool(S, QZ, WEIGHTS);
    expect(Array.isArray(pool)).toBe(true);
    // Pre-fix, the bare `return` exited on index 1 (in iteration order) and
    // returned undefined; index 2 would never be reached. Post-fix, 0 and 2
    // both survive.
    expect([...pool].sort((a, b) => a - b)).toEqual([0, 2]);
    expect(pool).not.toContain(1);
  });

  it('returns [] (not undefined) when S.wrongQs is absent', () => {
    const getWrongReviewPool = buildGetWrongReviewPool();
    const pool = getWrongReviewPool({}, [q(0)], WEIGHTS);
    expect(pool).toEqual([]);
  });
});
