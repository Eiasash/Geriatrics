/**
 * FSRS property-style sweeps.
 *
 * The existing sharedFsrs.test.js tests specific examples. This file sweeps
 * across the realistic parameter space and asserts the invariants that should
 * hold for every input — catching regressions that example tests miss.
 *
 * Byte-identical across InternalMedicine, Geriatrics, and FamilyMedicine.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

let ctx;

beforeAll(() => {
  const code = readFileSync(join(__dirname, "..", "shared", "fsrs.js"), "utf-8");
  const fn = new Function(
    code +
      "\nreturn {FSRS_W,FSRS_DECAY,FSRS_FACTOR,FSRS_RETENTION,fsrsR,fsrsInterval,fsrsInitNew,fsrsUpdate,fsrsMigrateFromSM2,isChronicFail};"
  );
  ctx = fn();
});

const STABILITIES = [0.1, 0.5, 1, 2, 5, 10, 30, 90, 365];
const DIFFICULTIES = [1, 2, 5, 7, 10];
const TIMES = [0, 0.5, 1, 5, 30, 365];
const RATINGS = [1, 2, 3, 4];
const RETENTIONS = [0.5, 0.7, 0.9, 0.99];

describe("fsrsR invariants (sweep)", () => {
  it("is in [0, 1] for all valid inputs", () => {
    for (const t of TIMES) {
      for (const s of STABILITIES) {
        const r = ctx.fsrsR(t, s);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is monotonically non-increasing in elapsed time", () => {
    for (const s of STABILITIES) {
      let prev = ctx.fsrsR(0, s);
      for (const t of [0.5, 1, 5, 30, 365]) {
        const r = ctx.fsrsR(t, s);
        expect(r).toBeLessThanOrEqual(prev + 1e-9);
        prev = r;
      }
    }
  });

  it("is monotonically non-decreasing in stability", () => {
    for (const t of [1, 5, 30]) {
      let prev = ctx.fsrsR(t, STABILITIES[0]);
      for (const s of STABILITIES.slice(1)) {
        const r = ctx.fsrsR(t, s);
        expect(r).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = r;
      }
    }
  });
});

describe("fsrsInterval invariants (sweep)", () => {
  it("returns >= 1 day for any positive stability", () => {
    for (const s of STABILITIES) {
      expect(ctx.fsrsInterval(s)).toBeGreaterThanOrEqual(1);
    }
  });

  it("is monotonically non-decreasing in stability", () => {
    let prev = ctx.fsrsInterval(STABILITIES[0]);
    for (const s of STABILITIES.slice(1)) {
      const i = ctx.fsrsInterval(s);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  it("is integer-valued (days)", () => {
    for (const s of STABILITIES) {
      expect(Number.isInteger(ctx.fsrsInterval(s))).toBe(true);
    }
  });

  it("respects custom retention if accepted as 2nd arg", () => {
    // fsrsInterval may be (s) or (s, retention). Either way, output >= 1.
    for (const s of [1, 10, 100]) {
      for (const r of RETENTIONS) {
        const i = ctx.fsrsInterval(s, r);
        expect(i).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("fsrsInitNew invariants (sweep)", () => {
  it("difficulty stays in [1, 10] for every rating", () => {
    for (const r of RATINGS) {
      const { d } = ctx.fsrsInitNew(r);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });

  it("stability stays >= 0.1 for every rating", () => {
    for (const r of RATINGS) {
      const { s } = ctx.fsrsInitNew(r);
      expect(s).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("higher rating => higher initial stability (monotone)", () => {
    let prev = ctx.fsrsInitNew(1).s;
    for (const r of [2, 3, 4]) {
      const s = ctx.fsrsInitNew(r).s;
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("higher rating => lower initial difficulty (monotone)", () => {
    let prev = ctx.fsrsInitNew(1).d;
    for (const r of [2, 3, 4]) {
      const d = ctx.fsrsInitNew(r).d;
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });
});

describe("fsrsUpdate invariants (sweep)", () => {
  it("difficulty stays in [1, 10] across the parameter space", () => {
    for (const s of [0.5, 5, 50]) {
      for (const d of DIFFICULTIES) {
        for (const r of RATINGS) {
          const out = ctx.fsrsUpdate(s, d, 0.9, r);
          expect(out.d).toBeGreaterThanOrEqual(1);
          expect(out.d).toBeLessThanOrEqual(10);
        }
      }
    }
  });

  it("stability stays >= 0.1 across the parameter space", () => {
    for (const s of [0.1, 0.5, 5, 50]) {
      for (const d of DIFFICULTIES) {
        for (const ret of RETENTIONS) {
          for (const r of RATINGS) {
            const out = ctx.fsrsUpdate(s, d, ret, r);
            expect(out.s).toBeGreaterThanOrEqual(0.1);
          }
        }
      }
    }
  });

  it("Easy >= Good >= Hard for stability gain at fixed (s, d, retention)", () => {
    for (const s of [1, 5, 30]) {
      for (const d of DIFFICULTIES) {
        const sH = ctx.fsrsUpdate(s, d, 0.9, 2).s;
        const sG = ctx.fsrsUpdate(s, d, 0.9, 3).s;
        const sE = ctx.fsrsUpdate(s, d, 0.9, 4).s;
        expect(sE).toBeGreaterThanOrEqual(sG);
        expect(sG).toBeGreaterThanOrEqual(sH);
      }
    }
  });

  it("Again (rating=1) never increases stability above the prior value", () => {
    for (const s of [1, 5, 30, 90]) {
      for (const d of DIFFICULTIES) {
        const out = ctx.fsrsUpdate(s, d, 0.9, 1);
        expect(out.s).toBeLessThanOrEqual(s);
      }
    }
  });
});

describe("isChronicFail invariants (sweep)", () => {
  it("returns a boolean for every input shape", () => {
    const cases = [
      null,
      undefined,
      {},
      { tot: 0, ok: 0, fsrsD: 0 },
      { tot: 100, ok: 100, fsrsD: 1 },
      { tot: 100, ok: 0, fsrsD: 10 },
    ];
    for (const c of cases) {
      expect(typeof ctx.isChronicFail(c)).toBe("boolean");
    }
  });

  it("never true when ok/tot is high and fsrsD is low", () => {
    for (const tot of [5, 20, 100]) {
      const card = { tot, ok: tot, fsrsD: 1 };
      expect(ctx.isChronicFail(card)).toBe(false);
    }
  });
});
