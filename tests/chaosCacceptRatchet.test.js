// chaosCacceptRatchet.test.js — durable anti-regression lock for the
// chaos-doctor-bot v4 `c_accept` false-positive fix (2026-05-17).
//
// THE BUG
// -------
// Geri's app marks the answer key with `class="qo ... ok"` via
// `isOk(q,i)` (shlav-a-mega.html:2466):
//   if (Array.isArray(q.c_accept) && q.c_accept.length) return q.c_accept.includes(i);
//   return i === q.c;
// For a multi-accept question the render path (shlav-a-mega.html:3160)
// therefore puts `.ok` on EVERY accepted option. The bot's
// `detectAppCorrectIdx` read only the FIRST `.ok`
// (`document.querySelector('button.qo.ok')`), so the old
// `disagrees = appDisplayIdx !== aiIdx` fired a false positive whenever
// the AI picked an accepted-but-not-first option.
//
// THE FIX
// -------
// `detectAppAcceptedDisplayIdxSet` now collects ALL `.ok` display
// positions and `disagrees` uses `pickAgreesWithApp(set, aiIdx)`
// (set-membership) instead of scalar equality. The bot stays
// DOM-driven — the DOM already encodes `{c} ∪ c_accept` via `isOk`.
//
// THE GUARD (two-sided, deterministic, drift-proof)
// -------------------------------------------------
// `chaos-reports/` is gitignored, so this test pins a SELF-CONTAINED
// snapshot — `tests/fixtures/chaosCacceptLedger.json` — of every
// `disagrees:true` judged row from the newest committed-era ledger
// (`chaos-reports/v4/post_truncation_rollout_2026-05-14`, 2278 findings,
// 357 disagrees:true). Each row carries the question's `{c, c_accept, o}`
// AT FIXTURE-CREATION TIME, so the pinned numbers cannot drift when a
// future legitimate `c_accept` edit lands in `data/questions.json`
// (the contamination that makes older ledgers unusable as anchors).
//
// The test reconstructs the `.ok` DISPLAY set the fixed bot would have
// read from the DOM — { d : isOk(q, canonicalAt(d)) }, recovering
// canonicalAt(d) via the sanctioned `textResolveAgainstQZ` resolver —
// then recomputes `disagrees` through the REAL exported
// `pickAgreesWithApp`. This is a faithful model of the fix because the
// app's render sets `.ok` on display button d iff `isOk(q, _shuf[d])`.
//
// Two-sided so a "suppress everything" false-green cannot pass:
//   (a) old-true → fixed-false FLIPS  (the false positives killed)
//   (b) genuine disagreements (fixed-true) stay STABLE
//   (a)+(b) == total, and NO row goes false→true (monotone relax-only).
//
// Anchored to any-`isOk` (not c_accept-specific): the v4-long ledger
// showed 0 c_accept-specific but 15 any-isOk FPs — the defect surface
// is `detectAppCorrectIdx`'s first-of-N collapse, of which c_accept is
// only the currently-dominant trigger. Pinning c_accept-specific would
// leave the broader surface unguarded.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  pickAgreesWithApp,
  textResolveAgainstQZ,
} from '../scripts/lib/optionResolver.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// EXACT replica of shlav-a-mega.html:2466 isOk(q,i). If this drifts from
// the monolith the fix's premise is void — keep byte-faithful.
function isOk(q, i) {
  if (!q) return false;
  if (Array.isArray(q.c_accept) && q.c_accept.length) return q.c_accept.includes(i);
  return i === q.c;
}

// === Pinned characterization constants ===
// Derived by deterministic recomputation over the self-contained fixture
// (newest ledger only). These are the ACTUAL reproduced numbers, not the
// kickoff brief's "18 / 8 stems" (a non-deterministic prior live run) nor
// the 21/10 quick-count (per-pick resolve that skipped 2 unresolvable
// picks). 22/11 is the faithful set-reconstruction that models the fixed
// bot's DOM `.ok`-set read. Any change to `pickAgreesWithApp`, the
// resolver, or the fixture must consciously re-baseline these.
const TOTAL_DISAGREES_TRUE = 357;
const EXPECT_FLIPPED = 22;          // false positives the fix kills → 0
const EXPECT_FLIP_STEMS = 11;       // distinct stems among them
const EXPECT_GENUINE = 335;         // real disagreements, must stay put
const EXPECT_FALSE_TO_TRUE = 0;     // fix is relax-only (monotone)

describe('pickAgreesWithApp — pure multi-accept agreement predicate', () => {
  it('agrees when the pick is the only accepted option', () => {
    expect(pickAgreesWithApp([2], 2)).toBe(true);
  });
  it('agrees when the pick is an accepted-but-not-first option (the bug)', () => {
    // multi-accept Q: app marks display positions 0 and 2 as .ok; AI
    // picked 2. Old logic compared aiIdx to first .ok (0) → false flag.
    expect(pickAgreesWithApp([0, 2], 2)).toBe(true);
  });
  it('disagrees when the pick is outside the accepted set', () => {
    expect(pickAgreesWithApp([0, 2], 1)).toBe(false);
    expect(pickAgreesWithApp([3], 1)).toBe(false);
  });
  it('treats unknown/empty key set as "do not flag" (defers to outer gate)', () => {
    expect(pickAgreesWithApp([], 1)).toBe(true);
    expect(pickAgreesWithApp(null, 1)).toBe(true);
    expect(pickAgreesWithApp(undefined, 1)).toBe(true);
  });
  it('treats a missing pick as "do not flag"', () => {
    expect(pickAgreesWithApp([0, 2], null)).toBe(true);
    expect(pickAgreesWithApp([0, 2], undefined)).toBe(true);
  });
  it('coerces stringy display indices (defensive)', () => {
    expect(pickAgreesWithApp([0, 2], '2')).toBe(true);
    expect(pickAgreesWithApp([0, 2], '1')).toBe(false);
  });
});

describe('c_accept false-positive ratchet — newest-ledger characterization', () => {
  const fixture = JSON.parse(
    readFileSync(path.join(__dirname, 'fixtures', 'chaosCacceptLedger.json'), 'utf8'),
  );

  // Reconstruct the fixed `disagrees` for every fixture row, through the
  // REAL exported predicate, exactly as the fixed bot would compute it
  // from the live DOM `.ok` set.
  function recompute() {
    let flipped = 0;
    let genuine = 0;
    let falseToTrue = 0;
    let cAcceptSpecific = 0;
    const flipStems = new Set();
    const flippedRows = [];
    for (const row of fixture) {
      const q = row.q;
      let fixedDisagrees;
      if (!q) {
        // Stem couldn't be resolved to a question at fixture build time —
        // preserve the recorded verdict (cannot model the .ok set).
        fixedDisagrees = row.oldDisagrees;
      } else {
        const acceptedCanon = new Set();
        for (let i = 0; i < q.o.length; i++) if (isOk(q, i)) acceptedCanon.add(i);
        const map = textResolveAgainstQZ(row.options || [], q.o || []);
        const okDisplay = [];
        for (let d = 0; d < (row.options || []).length; d++) {
          const c = map[d];
          if (c != null && acceptedCanon.has(c)) okDisplay.push(d);
        }
        const appKnown = row.appDisplayIdx != null;
        fixedDisagrees = appKnown
          ? !pickAgreesWithApp(okDisplay, row.aiIdx)
          : row.oldDisagrees;
        if (row.oldDisagrees && !fixedDisagrees
            && Array.isArray(q.c_accept) && q.c_accept.length) {
          cAcceptSpecific++;
        }
      }
      if (row.oldDisagrees && !fixedDisagrees) {
        flipped++;
        flipStems.add((row.stem || '').slice(0, 60));
        flippedRows.push(row);
      } else if (fixedDisagrees) {
        genuine++;
      }
      if (!row.oldDisagrees && fixedDisagrees) falseToTrue++;
    }
    return { flipped, genuine, falseToTrue, cAcceptSpecific, flipStems, flippedRows };
  }

  const r = recompute();

  it('fixture is the full disagrees:true slice of the newest ledger', () => {
    expect(fixture.length).toBe(TOTAL_DISAGREES_TRUE);
    expect(fixture.every((x) => x.oldDisagrees === true)).toBe(true);
  });

  it('no appDisplayIdx==null rows (else the new guard masks a render-fault)', () => {
    // The fixed `disagrees` silently reclassifies appDisplayIdx==null
    // true→false. The old formula `appDisplayIdx != null && …` already
    // forced all disagrees:true rows to have a non-null appDisplayIdx, so
    // this must be 0 by construction — assert it as PROOF, not inference.
    // A non-zero count would be a masked render-fault, not a c_accept FP.
    expect(fixture.filter((x) => x.appDisplayIdx == null).length).toBe(0);
  });

  it('(a) kills exactly the known false positives → these become non-disagreements', () => {
    expect(r.flipped).toBe(EXPECT_FLIPPED);
    expect(r.flipStems.size).toBe(EXPECT_FLIP_STEMS);
    expect(r.flipped).toBeGreaterThan(0); // bug class is real & present
  });

  it('every killed false positive is provably an accepted answer', () => {
    // The precise FP definition: the AI's pick IS in the app's own
    // accepted set, so flagging it was wrong. Re-derive per flipped row.
    // The loop covers ALL 22 flipped rows — including the 2 picks the
    // earlier per-pick quick-count could not resolve (the 21→22 delta);
    // set-reconstruction resolves them, and this asserts pick ⊆ okSet
    // for every one through the REAL exported predicate (not a reimpl).
    expect(r.flippedRows.length).toBe(EXPECT_FLIPPED);
    for (const row of r.flippedRows) {
      const q = row.q;
      const acceptedCanon = new Set();
      for (let i = 0; i < q.o.length; i++) if (isOk(q, i)) acceptedCanon.add(i);
      const map = textResolveAgainstQZ(row.options || [], q.o || []);
      const okDisplay = [];
      for (let d = 0; d < (row.options || []).length; d++) {
        const c = map[d];
        if (c != null && acceptedCanon.has(c)) okDisplay.push(d);
      }
      expect(pickAgreesWithApp(okDisplay, row.aiIdx)).toBe(true);
    }
  });

  it('(b) genuine disagreements stay stable (no suppress-everything false-green)', () => {
    expect(r.genuine).toBe(EXPECT_GENUINE);
  });

  it('fix is relax-only: no disagreement is manufactured (monotone)', () => {
    expect(r.falseToTrue).toBe(EXPECT_FALSE_TO_TRUE);
  });

  it('two-sided closure: flipped + genuine == total disagrees:true', () => {
    expect(r.flipped + r.genuine).toBe(TOTAL_DISAGREES_TRUE);
  });

  it('c_accept is the dominant (not the only) trigger — informational', () => {
    // Documents the surface breakdown. Gate is any-isOk (flipped), this
    // is the c_accept-attributable subset; the remainder is single-`c`
    // shuffle/text-resolution isOk hits the broader surface also covers.
    expect(r.cAcceptSpecific).toBeGreaterThan(0);
    expect(r.cAcceptSpecific).toBeLessThanOrEqual(r.flipped);
  });
});
