/**
 * Tests for the deadline-aware wrappers in shared/fsrs.js:
 *   fsrsDaysToExam, fsrsIntervalWithDeadline, fsrsScheduleWithDeadline
 *
 * These functions are v2 (20/04/26) of the shared FSRS module and had zero
 * dedicated test coverage before this file. They're important because
 * exam-prep users rely on them to cap the next-review interval so at least
 * one re-exposure lands before the exam date.
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

let ctx;

// Evaluate the shared file inside a sandbox that exposes fake `window` and
// `localStorage` handles so the deadline branch can read exam-date state.
beforeAll(() => {
  const code = readFileSync(join(__dirname, "..", "shared", "fsrs.js"), "utf-8");
  const factory = new Function(
    "window",
    "localStorage",
    code + "\nreturn {fsrsInterval,fsrsDaysToExam,fsrsIntervalWithDeadline,fsrsScheduleWithDeadline};"
  );
  const fakeStore = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (fakeStore.has(k) ? fakeStore.get(k) : null),
    setItem: (k, v) => fakeStore.set(k, String(v)),
    removeItem: (k) => fakeStore.delete(k),
    clear: () => fakeStore.clear(),
  };
  const fakeWindow = {};
  // The file also sets window.FSRS_W / window.fsrs* if typeof window !== 'undefined'
  // — harmless in tests.
  ctx = factory(fakeWindow, fakeLocalStorage);
  ctx.__fakeLocalStorage = fakeLocalStorage;
  ctx.__fakeWindow = fakeWindow;
});

beforeEach(() => {
  ctx.__fakeLocalStorage.clear();
  // Wipe state from fakeWindow between tests.
  delete ctx.__fakeWindow.S;
});

describe("fsrsDaysToExam", () => {
  it("returns null when no override and no localStorage entry", () => {
    expect(ctx.fsrsDaysToExam()).toBeNull();
  });

  it("returns null for a malformed date string", () => {
    expect(ctx.fsrsDaysToExam("2026/04/24")).toBeNull();
    expect(ctx.fsrsDaysToExam("tomorrow")).toBeNull();
    expect(ctx.fsrsDaysToExam("2026-4-24")).toBeNull();
  });

  it("returns 0 when the exam is already past", () => {
    // 1990 is well behind any current run date.
    expect(ctx.fsrsDaysToExam("1990-01-01")).toBe(0);
  });

  it("returns a positive integer for a future date", () => {
    const d = new Date();
    d.setDate(d.getDate() + 10);
    const iso = d.toISOString().slice(0, 10);
    const days = ctx.fsrsDaysToExam(iso);
    // Target is YYYY-MM-DD T23:59:59 local — so 10..11 depending on clock.
    expect(days).toBeGreaterThanOrEqual(9);
    expect(days).toBeLessThanOrEqual(11);
  });
});

describe("fsrsIntervalWithDeadline", () => {
  it("returns vanilla fsrsInterval when no exam date set (override null)", () => {
    // Any reasonable stability: base interval should match exactly.
    const s = 10;
    expect(ctx.fsrsIntervalWithDeadline(s, 5, 0.9, null)).toBe(ctx.fsrsInterval(s));
  });

  it("returns vanilla fsrsInterval when exam date is 0 or past", () => {
    const s = 10;
    expect(ctx.fsrsIntervalWithDeadline(s, 5, 0.9, 0)).toBe(ctx.fsrsInterval(s));
    expect(ctx.fsrsIntervalWithDeadline(s, 5, 0.9, -3)).toBe(ctx.fsrsInterval(s));
  });

  it("always returns 1 when exam is today or tomorrow, regardless of mastery", () => {
    expect(ctx.fsrsIntervalWithDeadline(100, 2, 0.98, 1)).toBe(1);
  });

  it("caps at ≤30% of daysToExam for WEAK cards (d >= 7)", () => {
    const cap = Math.max(1, Math.floor(20 * 0.30));
    // Stability 100 → vanilla interval is tens of days, so the cap dominates.
    const out = ctx.fsrsIntervalWithDeadline(100, 9, 0.9, 20);
    expect(out).toBeLessThanOrEqual(cap);
    expect(out).toBeGreaterThanOrEqual(1);
  });

  it("caps at ≤30% of daysToExam when rPrev is low (<0.75)", () => {
    const cap = Math.max(1, Math.floor(20 * 0.30));
    const out = ctx.fsrsIntervalWithDeadline(100, 2, 0.5, 20);
    expect(out).toBeLessThanOrEqual(cap);
  });

  it("caps at ≤60% of daysToExam for NORMAL cards (d in 4..6)", () => {
    const cap = Math.max(1, Math.floor(20 * 0.60));
    const out = ctx.fsrsIntervalWithDeadline(100, 5, 0.92, 20);
    expect(out).toBeLessThanOrEqual(cap);
    // And strictly greater than the WEAK cap — otherwise the bucket logic
    // doesn't distinguish WEAK from NORMAL.
    const weakCap = Math.max(1, Math.floor(20 * 0.30));
    expect(out).toBeGreaterThan(weakCap);
  });

  it("caps at ≤85% of daysToExam for STRONG cards (d <= 3 AND rPrev >= 0.9)", () => {
    const cap = Math.max(1, Math.floor(20 * 0.85));
    const out = ctx.fsrsIntervalWithDeadline(100, 2, 0.95, 20);
    expect(out).toBeLessThanOrEqual(cap);
    const normalCap = Math.max(1, Math.floor(20 * 0.60));
    expect(out).toBeGreaterThan(normalCap);
  });

  it("never extends past the FSRS base interval — only caps", () => {
    // Low stability -> base interval is tiny (1-2 days). Deadline should NOT
    // stretch it out even if exam is months away.
    const base = ctx.fsrsInterval(1);
    const out = ctx.fsrsIntervalWithDeadline(1, 2, 0.98, 180);
    expect(out).toBe(base);
  });

  it("never returns 0 even on tight deadline + WEAK bucket", () => {
    // 2 days to exam * 30% = 0.6 → floor = 0 → clamp to 1
    const out = ctx.fsrsIntervalWithDeadline(100, 9, 0.5, 2);
    expect(out).toBeGreaterThanOrEqual(1);
  });

  it("treats NaN / null rPrev as full retrievability (1)", () => {
    const a = ctx.fsrsIntervalWithDeadline(100, 5, null, 20);
    const b = ctx.fsrsIntervalWithDeadline(100, 5, NaN, 20);
    const c = ctx.fsrsIntervalWithDeadline(100, 5, 1.0, 20);
    expect(a).toBe(c);
    expect(b).toBe(c);
  });
});

describe("fsrsScheduleWithDeadline", () => {
  it("returns baseIntervalDays equal to fsrsInterval(s)", () => {
    const sched = ctx.fsrsScheduleWithDeadline(10, 5, 0.9, 0, null);
    expect(sched.baseIntervalDays).toBe(ctx.fsrsInterval(10));
    expect(sched.warped).toBe(false);
  });

  it("flags warped=true when deadline forces a shorter interval", () => {
    const sched = ctx.fsrsScheduleWithDeadline(100, 9, 0.5, 1_700_000_000_000, 5);
    expect(sched.warped).toBe(true);
    expect(sched.intervalDays).toBeLessThan(sched.baseIntervalDays);
  });

  it("computes nextReviewTime = now + intervalDays * 86_400_000", () => {
    const now = 1_700_000_000_000;
    const sched = ctx.fsrsScheduleWithDeadline(10, 5, 0.9, now, null);
    expect(sched.nextReviewTime).toBe(now + sched.intervalDays * 86_400_000);
  });

  it("uses Date.now() when `now` is falsy", () => {
    const sched = ctx.fsrsScheduleWithDeadline(10, 5, 0.9, 0, null);
    // Within a second of real now.
    expect(Math.abs(sched.nextReviewTime - (Date.now() + sched.intervalDays * 86_400_000))).toBeLessThan(1000);
  });
});
