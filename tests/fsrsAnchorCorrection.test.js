/**
 * FSRS difficulty mean-reversion anchor correction (2026-07-18).
 *
 * Before this fix, fsrsUpdate() reverted difficulty toward FSRS_W[4] (~7.21),
 * inflating D over repeated reviews. Because stability growth carries an (11-D)
 * factor, an inflated D suppressed interval growth. The corrected anchor reverts
 * difficulty toward D0_Easy = fsrsInitNew(4).d (~3.28) — the canonical FSRS-4.5
 * "Easy" initial difficulty — so repeated success drives D down (not up) and the
 * card is rescheduled with faster stability/interval growth.
 *
 * Every number below is a genuine recomputed value from the corrected
 * shared/fsrs.js (canonical md5 7cb675ea3865d8accdc7bcd3a0cc5fa8).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

let f;
beforeAll(() => {
  const code = readFileSync(join(__dirname, "..", "shared", "fsrs.js"), "utf-8");
  f = new Function(code + "\nreturn {FSRS_W,fsrsInterval,fsrsInitNew,fsrsUpdate};")();
});

describe("FSRS anchor correction — difficulty mean-reverts to D0_Easy (~3.28)", () => {
  it("D0_Easy = fsrsInitNew(4).d is ~3.28, far below the old FSRS_W[4] anchor (~7.21)", () => {
    expect(f.fsrsInitNew(4).d).toBeCloseTo(3.2829, 3);
    expect(f.fsrsInitNew(4).d).toBeLessThan(4);
    expect(f.FSRS_W[4]).toBeCloseTo(7.2102, 4);
  });

  it("repeated Good (rating 3) from an inflated d=7 drives difficulty DOWN toward ~3.28, not up toward 7.21", () => {
    const anchor = f.fsrsInitNew(4).d; // ~3.2829
    let s = 10, d = 7;
    // Single step already decreases; the OLD anchor (revert toward 7.21) would have
    // nudged d UP from 7. Corrected: d falls to ~6.7635.
    const one = f.fsrsUpdate(s, d, 0.9, 3);
    expect(one.d).toBeCloseTo(6.7635, 3);
    expect(one.d).toBeLessThan(7);
    // Full trajectory: monotone non-increasing, converging on D0_Easy from above.
    let prev = d;
    for (let i = 0; i < 60; i++) {
      const o = f.fsrsUpdate(s, d, 0.9, 3);
      s = o.s; d = o.d;
      expect(d).toBeLessThanOrEqual(prev + 1e-12);
      prev = d;
    }
    expect(d).toBeGreaterThan(anchor);      // approaches from above, never overshoots below
    expect(d).toBeLessThan(anchor + 0.1);   // within 0.1 of D0_Easy after 60 reviews
    expect(d).toBeCloseTo(3.3549, 3);
  });

  it("repeated Good from a very low d=1 pushes difficulty UP toward the same ~3.28 anchor (two-sided reversion)", () => {
    const anchor = f.fsrsInitNew(4).d;
    let s = 5, d = 1, prev = d;
    for (let i = 0; i < 60; i++) {
      const o = f.fsrsUpdate(s, d, 0.9, 3);
      s = o.s; d = o.d;
      expect(d).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = d;
    }
    expect(d).toBeLessThan(anchor);         // approaches from below
    expect(d).toBeGreaterThan(anchor - 0.1);
    expect(d).toBeCloseTo(3.2386, 3);
  });

  it("faster interval growth: 5 Good reviews outgrow the counterfactual where D stays pinned at 7.21", () => {
    // Well-known card: s=10, d=7, rPrev=0.9. Corrected trajectory lets D fall each
    // review; the counterfactual pins D at FSRS_W[4] (7.2102 — the old anchor's steady
    // state) every step using the SAME stability formula, so D is the only difference.
    const W4 = f.FSRS_W[4];
    let cs = 10, cd = 7, ks = 10;
    for (let i = 0; i < 5; i++) {
      const co = f.fsrsUpdate(cs, cd, 0.9, 3);
      cs = co.s; cd = co.d;
      ks = f.fsrsUpdate(ks, W4, 0.9, 3).s; // difficulty stuck at 7.21
    }
    // Concrete recomputed values:
    expect(cs).toBeCloseTo(511.5976, 2);
    expect(ks).toBeCloseTo(357.1742, 2);
    expect(f.fsrsInterval(cs)).toBe(512);
    expect(f.fsrsInterval(ks)).toBe(357);
    // Corrected anchor schedules the card meaningfully further out.
    expect(cs).toBeGreaterThan(ks);
    expect(f.fsrsInterval(cs)).toBeGreaterThan(f.fsrsInterval(ks));
  });

  it("single + double Good review pin concrete corrected stability and difficulty", () => {
    const o1 = f.fsrsUpdate(10, 7, 0.9, 3);
    expect(o1.s).toBeCloseTo(23.9088, 3);
    expect(o1.d).toBeCloseTo(6.7635, 3);
    const o2 = f.fsrsUpdate(o1.s, o1.d, 0.9, 3);
    expect(o2.s).toBeCloseTo(54.6942, 3);
    expect(o2.d).toBeCloseTo(6.5421, 3);
  });
});
