/**
 * Tests for shared/fsrs.js — the shared FSRS-4.5 algorithm module.
 * Validates the shared file directly (not a copy).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

let ctx;

beforeAll(() => {
  const code = readFileSync(join(__dirname, '..', 'shared', 'fsrs.js'), 'utf-8');
  const fn = new Function(code + "\nreturn {FSRS_W,FSRS_DECAY,FSRS_FACTOR,FSRS_RETENTION,fsrsR,fsrsInterval,fsrsInitNew,fsrsUpdate,fsrsMigrateFromSM2,isChronicFail};");
  ctx = fn();
});

describe("shared/fsrs.js exports", () => {
  it("exports FSRS_W array with 19 weights", () => {
    expect(ctx.FSRS_W).toHaveLength(19);
    expect(ctx.FSRS_W[0]).toBeCloseTo(0.40255, 4);
  });
  it("exports FSRS constants", () => {
    expect(ctx.FSRS_DECAY).toBe(-0.5);
    expect(ctx.FSRS_FACTOR).toBeCloseTo(19 / 81, 6);
    expect(ctx.FSRS_RETENTION).toBe(0.90);
  });
  it("exports all 6 functions", () => {
    for (const name of ["fsrsR", "fsrsInterval", "fsrsInitNew", "fsrsUpdate", "fsrsMigrateFromSM2", "isChronicFail"]) {
      expect(typeof ctx[name]).toBe("function");
    }
  });
});

describe("fsrsR", () => {
  it("returns 1.0 at t=0", () => {
    expect(ctx.fsrsR(0, 5)).toBeCloseTo(1.0, 4);
  });
  it("returns 0 for invalid stability", () => {
    expect(ctx.fsrsR(1, 0)).toBe(0);
    expect(ctx.fsrsR(1, -1)).toBe(0);
    expect(ctx.fsrsR(1, null)).toBe(0);
  });
  it("decreases with time", () => {
    expect(ctx.fsrsR(1, 10)).toBeGreaterThan(ctx.fsrsR(10, 10));
    expect(ctx.fsrsR(10, 10)).toBeGreaterThan(ctx.fsrsR(30, 10));
  });
  it("is higher with greater stability", () => {
    expect(ctx.fsrsR(10, 20)).toBeGreaterThan(ctx.fsrsR(10, 5));
  });
});

describe("fsrsInterval", () => {
  it("returns at least 1 day", () => {
    expect(ctx.fsrsInterval(0.1)).toBeGreaterThanOrEqual(1);
  });
  it("increases with stability", () => {
    expect(ctx.fsrsInterval(10)).toBeGreaterThan(ctx.fsrsInterval(1));
    expect(ctx.fsrsInterval(50)).toBeGreaterThan(ctx.fsrsInterval(10));
  });
  it("returns reasonable intervals for s=10", () => {
    const interval = ctx.fsrsInterval(10);
    expect(interval).toBeGreaterThanOrEqual(3);
    expect(interval).toBeLessThanOrEqual(30);
  });
});

describe("fsrsInitNew", () => {
  it("Again (1) gives lowest stability", () => {
    expect(ctx.fsrsInitNew(1).s).toBeCloseTo(0.40255, 3);
  });
  it("Easy (4) gives highest stability", () => {
    expect(ctx.fsrsInitNew(4).s).toBeGreaterThan(ctx.fsrsInitNew(1).s);
  });
  it("difficulty bounded [1, 10]", () => {
    for (let r = 1; r <= 4; r++) {
      const { d } = ctx.fsrsInitNew(r);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
  it("higher rating gives lower difficulty", () => {
    expect(ctx.fsrsInitNew(4).d).toBeLessThan(ctx.fsrsInitNew(1).d);
  });
});

describe("fsrsUpdate", () => {
  it("Again (1) reduces stability", () => {
    expect(ctx.fsrsUpdate(10, 5, 0.9, 1).s).toBeLessThan(10);
  });
  it("Good (3) increases stability", () => {
    expect(ctx.fsrsUpdate(10, 5, 0.9, 3).s).toBeGreaterThan(10);
  });
  it("Easy > Good > Hard for stability gain", () => {
    const sH = ctx.fsrsUpdate(10, 5, 0.9, 2).s;
    const sG = ctx.fsrsUpdate(10, 5, 0.9, 3).s;
    const sE = ctx.fsrsUpdate(10, 5, 0.9, 4).s;
    expect(sE).toBeGreaterThan(sG);
    expect(sG).toBeGreaterThan(sH);
  });
  it("stability never below 0.1", () => {
    expect(ctx.fsrsUpdate(0.1, 10, 0.1, 1).s).toBeGreaterThanOrEqual(0.1);
  });
  it("difficulty bounded [1, 10]", () => {
    for (let r = 1; r <= 4; r++) {
      const { d } = ctx.fsrsUpdate(5, 5, 0.9, r);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
  it("Again increases difficulty, Easy decreases", () => {
    expect(ctx.fsrsUpdate(5, 5, 0.9, 1).d).toBeGreaterThan(ctx.fsrsUpdate(5, 5, 0.9, 4).d);
  });
});

describe("fsrsMigrateFromSM2", () => {
  it("ef=2.5 maps to low difficulty", () => {
    expect(ctx.fsrsMigrateFromSM2({ ef: 2.5, n: 5, next: Date.now() + 86400000 }).d).toBeLessThanOrEqual(2);
  });
  it("ef=1.3 maps to high difficulty", () => {
    expect(ctx.fsrsMigrateFromSM2({ ef: 1.3, n: 1, next: 0 }).d).toBeGreaterThanOrEqual(9);
  });
  it("stability at least 0.1", () => {
    expect(ctx.fsrsMigrateFromSM2({ ef: 2.5, n: 0, next: 0 }).s).toBeGreaterThanOrEqual(0.1);
  });
  it("uses days-left for stability when next is future", () => {
    const { s } = ctx.fsrsMigrateFromSM2({ ef: 2.5, n: 5, next: Date.now() + 10 * 86400000 });
    expect(s).toBeGreaterThanOrEqual(9);
    expect(s).toBeLessThanOrEqual(11);
  });
});

describe("isChronicFail", () => {
  it("false for null/undefined", () => {
    expect(ctx.isChronicFail(null)).toBe(false);
    expect(ctx.isChronicFail(undefined)).toBe(false);
  });
  it("false for few attempts", () => {
    expect(ctx.isChronicFail({ tot: 2, ok: 0, fsrsD: 5 })).toBe(false);
  });
  it("true for low accuracy with enough attempts", () => {
    expect(ctx.isChronicFail({ tot: 10, ok: 2, fsrsD: 3 })).toBe(true);
  });
  it("true for high difficulty with enough attempts", () => {
    expect(ctx.isChronicFail({ tot: 3, ok: 2, fsrsD: 9 })).toBe(true);
  });
  it("false for good performance", () => {
    expect(ctx.isChronicFail({ tot: 10, ok: 8, fsrsD: 3 })).toBe(false);
  });
});

describe("shared/fsrs.js contract", () => {
  it("contains sync warning", () => {
    const code = readFileSync(join(__dirname, '..', 'shared', 'fsrs.js'), 'utf-8');
    expect(code).toContain("DO NOT EDIT IN INDIVIDUAL REPOS");
  });
  it("loaded successfully", () => {
    expect(ctx.FSRS_W).toBeDefined();
    expect(typeof ctx.fsrsR).toBe("function");
  });
});
