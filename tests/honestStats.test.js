/**
 * Honest stats — CI guard against scoring functions returning confident-looking
 * numbers when fed sparse or empty state.
 *
 * This whole class of bug is what produced the v10.61.0 fix:
 *   - Topic Mastery Heatmap showed mastery on freshly-failed cards because the
 *     formula used FSRS R only (R≈1 right after any review, right or wrong).
 *   - Est. Score showed 60% because topics with <3 answers were imputed
 *     acc=0.60 — making the score collapse to ~60% on sparse data.
 *
 * Principle: if data is too sparse for a real measurement, the scoring
 * function MUST return null (UI shows "—") rather than a default value that
 * looks like a measurement.
 *
 * Geri is a single-file HTML monolith, so this guard is source-text based
 * (regex against the function bodies in shlav-a-mega.html) plus a behavioural
 * test on functions extracted via `new Function()`.
 *
 * Mirrors Pnimit + FM honestStats.test.js. Adding a new scoring function?
 * Add a case here AND in the sibling repos.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
let html, calcEstScoreSrc, getTopicMasterySrc;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
  calcEstScoreSrc = html.match(/function calcEstScore\(\)\{[\s\S]*?\n\}/)?.[0];
  getTopicMasterySrc = html.match(/function getTopicMastery\(\)\{[\s\S]*?\n\}/)?.[0];
});

describe("honest stats — source-level guards", () => {
  it("calcEstScore is found in the HTML", () => {
    expect(calcEstScoreSrc).toBeDefined();
    expect(calcEstScoreSrc).toMatch(/function calcEstScore/);
  });

  it("getTopicMastery is found in the HTML", () => {
    expect(getTopicMasterySrc).toBeDefined();
    expect(getTopicMasterySrc).toMatch(/function getTopicMastery/);
  });

  it("calcEstScore must NOT contain the 60% neutral-default imputation", () => {
    // Original bug: `if(s.tot<3){ acc=0.60; }` masked sparse data as 60% score.
    expect(calcEstScoreSrc).not.toMatch(/acc\s*=\s*0\.60/);
    expect(calcEstScoreSrc).not.toMatch(/acc\s*=\s*0\.6\b/);
  });

  it("calcEstScore must guard against insufficient data (return null)", () => {
    // Positive marker: must check topicsWithData < N or similar threshold.
    expect(calcEstScoreSrc).toMatch(/topicsWithData\s*<\s*\d+/);
    expect(calcEstScoreSrc).toMatch(/return\s+null/);
  });

  it("getTopicMastery must NOT use bare FSRS R aggregation", () => {
    // Original bug: `out[ti].sum += r;` aggregated raw R without correctness.
    // After fix: aggregates `mastery` (which incorporates accuracy).
    expect(getTopicMasterySrc).not.toMatch(/out\[ti\]\.sum\s*\+=\s*r\s*;/);
  });

  it("getTopicMastery must aggregate a competence-aware quantity", () => {
    // Positive marker: must reference `accuracy` or `ok/tot` and `mastery`.
    expect(getTopicMasterySrc).toMatch(/accuracy|s\.ok|ok\s*\/\s*tot/);
    expect(getTopicMasterySrc).toMatch(/mastery/);
  });

  it("takeWeeklySnapshot must require ≥3 answers per topic", () => {
    // Bug: snapshotting `s.tot>0?Math.round(s.ok/s.tot*100):null` produces
    // 0% or 100% from a single answer, driving misleading trend arrows.
    const takeFn = html.match(/function takeWeeklySnapshot\(\)\{[\s\S]*?\n\}/);
    expect(takeFn, 'takeWeeklySnapshot not found').not.toBeNull();
    expect(takeFn[0]).not.toMatch(/s\.tot>0\s*\?\s*Math\.round/);
    expect(takeFn[0]).toMatch(/s\.tot\s*>=\s*[3-9]/);
  });
});

// ─── Behavioural test: extract & eval the inline functions ────────────────
//
// Run the actual inline functions in a sandbox with stubbed globals, then
// assert their behaviour on sparse fixtures. This catches regressions that
// the source-text checks above would miss (e.g. someone moves the bug to a
// different variable name).

describe("honest stats — behavioural (extracted from HTML)", () => {
  let calcEstScore, getTopicMastery;
  // Module-scoped globals the extracted functions reference.
  const ctx = {
    TOPICS: new Array(40).fill(0).map((_, i) => `T${i}`),
    EXAM_FREQ: new Array(40).fill(1), // every topic counts equally
    QZ: [],
    S: { sr: {}, ts: {} },
    getTopicStats: () => ctx.S.ts,
    getDueQuestions: () => [],
    fsrsR: (t, s) => {
      if (!s || s <= 0) return 0;
      return Math.pow(1 + (19 / 81) * t / s, -0.5);
    },
  };

  beforeAll(() => {
    // Build a 40-topic × 3-question QZ to satisfy any topic-index lookups.
    ctx.QZ = [];
    for (let ti = 0; ti < 40; ti++) {
      for (let j = 0; j < 3; j++) ctx.QZ.push({ ti, q: `t${ti}q${j}` });
    }
    // Eval each function with the ctx as `this` & destructure into local scope.
    const evalFn = (src) => {
      const wrapped =
        `with(this){${src};return ${src.match(/function (\w+)/)[1]};}`;
      return new Function(wrapped).call(ctx);
    };
    calcEstScore = evalFn(calcEstScoreSrc);
    getTopicMastery = evalFn(getTopicMasterySrc);
  });

  // Reset state between tests via direct mutation of ctx.S.
  const reset = () => {
    ctx.S.sr = {};
    ctx.S.ts = {};
  };

  describe("calcEstScore", () => {
    it("returns null for empty state", () => {
      reset();
      expect(calcEstScore()).toBeNull();
    });

    it("returns null when only 1 topic has data", () => {
      reset();
      ctx.S.ts[0] = { ok: 5, tot: 10, no: 5 };
      expect(calcEstScore()).toBeNull();
    });

    it("returns null when only 2 topics have data", () => {
      reset();
      ctx.S.ts[0] = { ok: 5, tot: 10, no: 5 };
      ctx.S.ts[1] = { ok: 3, tot: 10, no: 7 };
      expect(calcEstScore()).toBeNull();
    });

    it("does NOT default to 60 on sparse data", () => {
      reset();
      expect(calcEstScore()).not.toBe(60);
      expect(calcEstScore()).not.toBe(0.6);
    });

    it("returns a number once 3+ topics have ≥3 answers", () => {
      reset();
      ctx.S.ts[0] = { ok: 3, tot: 3, no: 0 };
      ctx.S.ts[1] = { ok: 3, tot: 3, no: 0 };
      ctx.S.ts[2] = { ok: 3, tot: 3, no: 0 };
      const score = calcEstScore();
      expect(score).not.toBeNull();
      expect(typeof score).toBe("number");
    });
  });

  describe("getTopicMastery", () => {
    it("returns null mastery for every topic when no SR data", () => {
      reset();
      const out = getTopicMastery();
      Object.values(out).forEach((o) => {
        expect(o.r).toBeNull();
      });
    });

    it("REGRESSION: 4 cards all wrong on one topic → mastery = 0, NOT high", () => {
      reset();
      const now = Date.now();
      ctx.S.sr[0] = { fsrsS: 5, lastReview: now, tot: 1, ok: 0 };
      ctx.S.sr[1] = { fsrsS: 5, lastReview: now, tot: 1, ok: 0 };
      ctx.S.sr[2] = { fsrsS: 5, lastReview: now, tot: 1, ok: 0 };
      // sr[3] is on a different topic but use ti=0 question slot would need 4th
      // QZ entry on topic 0 — already provided 3 per topic. Use 3 wrongs.
      const out = getTopicMastery();
      // Topic 0 has 3 cards, all 0/1 → mean mastery = 0.
      expect(out[0].r).toBe(0);
    });

    it("perfect 3/3 just-reviewed cards → near 1.0", () => {
      reset();
      const now = Date.now();
      ctx.S.sr[0] = { fsrsS: 10, lastReview: now, tot: 1, ok: 1 };
      ctx.S.sr[1] = { fsrsS: 10, lastReview: now, tot: 1, ok: 1 };
      ctx.S.sr[2] = { fsrsS: 10, lastReview: now, tot: 1, ok: 1 };
      const out = getTopicMastery();
      expect(out[0].r).toBeGreaterThan(0.95);
    });

    it("cards with tot=0 are skipped", () => {
      reset();
      ctx.S.sr[0] = { fsrsS: 5, lastReview: Date.now() }; // no tot
      const out = getTopicMastery();
      expect(out[0].r).toBeNull();
      expect(out[0].n).toBe(0);
    });
  });
});
