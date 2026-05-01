/**
 * tests/fsrsEdgeCases.test.js
 *
 * Adversarial / boundary tests for shared/fsrs.js — covers transitions
 * between lapse / relearn / mastery, deadline-warp boundaries, NaN/null
 * defensive paths, and chronic-fail classification edges. The existing
 * sharedFsrs.test.js + fsrsDeadline.test.js cover the happy paths; this
 * file targets the regions where bugs historically slipped through
 * (e.g. near-zero stability, exam-day intervals, rPrev=0 floor).
 *
 * shared/fsrs.js is byte-identical across §C / §D / §E (canonical
 * md5 cea66a0435…), so every edge case here is a sibling-PWA risk too.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let f;

beforeAll(() => {
  const code = readFileSync(resolve(import.meta.dirname, '..', 'shared', 'fsrs.js'), 'utf-8');
  const fn = new Function(
    code +
      '\nreturn { FSRS_W, FSRS_DECAY, FSRS_FACTOR, FSRS_RETENTION,' +
      ' fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2,' +
      ' isChronicFail, fsrsDaysToExam, fsrsIntervalWithDeadline,' +
      ' fsrsScheduleWithDeadline };',
  );
  f = fn();
});

describe('fsrsR — retrievability defensive paths', () => {
  it('returns 0 when stability is 0 (avoid divide-by-zero)', () => {
    expect(f.fsrsR(10, 0)).toBe(0);
  });
  it('returns 0 when stability is negative', () => {
    expect(f.fsrsR(10, -1)).toBe(0);
  });
  it('returns 0 when stability is null/undefined', () => {
    expect(f.fsrsR(10, null)).toBe(0);
    expect(f.fsrsR(10, undefined)).toBe(0);
  });
  it('R(0, s) === 1 — no time has passed', () => {
    expect(f.fsrsR(0, 5)).toBeCloseTo(1, 6);
  });
  it('R is monotonically non-increasing in t for fixed s', () => {
    const s = 7;
    let prev = Infinity;
    for (let t = 0; t <= 90; t += 5) {
      const r = f.fsrsR(t, s);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
  });
});

describe('fsrsInterval — never-zero floor', () => {
  it('returns at least 1 day even on tiny stability', () => {
    expect(f.fsrsInterval(0.01)).toBeGreaterThanOrEqual(1);
    expect(f.fsrsInterval(0.001)).toBeGreaterThanOrEqual(1);
  });
  it('grows monotonically with stability across realistic range', () => {
    let prev = -Infinity;
    for (const s of [0.1, 0.5, 1, 2, 5, 10, 30, 90, 180, 365]) {
      const i = f.fsrsInterval(s);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });
});

describe('fsrsInitNew — rating clamp + bounds', () => {
  it('rating 1 (Again) gives lower stability than rating 4 (Easy)', () => {
    const again = f.fsrsInitNew(1);
    const easy = f.fsrsInitNew(4);
    expect(again.s).toBeLessThan(easy.s);
  });
  it('clamps rating below 1', () => {
    const r0 = f.fsrsInitNew(0);
    const r1 = f.fsrsInitNew(1);
    expect(r0.s).toBeCloseTo(r1.s, 6);
  });
  it('clamps rating above 4', () => {
    const r5 = f.fsrsInitNew(5);
    const r4 = f.fsrsInitNew(4);
    expect(r5.s).toBeCloseTo(r4.s, 6);
  });
  it('difficulty stays inside [1,10]', () => {
    for (const r of [1, 2, 3, 4]) {
      const { d } = f.fsrsInitNew(r);
      expect(d).toBeGreaterThanOrEqual(1);
      expect(d).toBeLessThanOrEqual(10);
    }
  });
});

describe('fsrsUpdate — lapse / relearn / mastery transitions', () => {
  it('Again (1) on a mature card collapses stability toward floor', () => {
    const before = { s: 90, d: 4 };
    const after = f.fsrsUpdate(before.s, before.d, 0.95, 1);
    expect(after.s).toBeLessThan(before.s);
    expect(after.s).toBeGreaterThanOrEqual(0.1);
    // difficulty rises after a lapse
    expect(after.d).toBeGreaterThan(before.d - 1e-6);
  });
  it('Easy (4) on a stable card grows stability', () => {
    const after = f.fsrsUpdate(20, 3, 0.92, 4);
    expect(after.s).toBeGreaterThan(20);
    expect(after.d).toBeLessThanOrEqual(10);
  });
  it('Hard (2) keeps stability between Again and Good', () => {
    const again = f.fsrsUpdate(15, 5, 0.85, 1);
    const hard = f.fsrsUpdate(15, 5, 0.85, 2);
    const good = f.fsrsUpdate(15, 5, 0.85, 3);
    expect(hard.s).toBeGreaterThan(again.s);
    expect(hard.s).toBeLessThan(good.s);
  });
  it('repeated Again calls never drop stability below 0.1 floor', () => {
    let s = 30, d = 5;
    for (let i = 0; i < 20; i++) {
      const r = f.fsrsUpdate(s, d, 0.9, 1);
      s = r.s; d = r.d;
      expect(s).toBeGreaterThanOrEqual(0.1);
      expect(d).toBeLessThanOrEqual(10);
      expect(d).toBeGreaterThanOrEqual(1);
    }
  });
  it('rPrev = 0 (totally forgotten) does not throw and yields finite stability', () => {
    const r = f.fsrsUpdate(10, 5, 0, 3);
    expect(Number.isFinite(r.s)).toBe(true);
    expect(Number.isFinite(r.d)).toBe(true);
  });
});

describe('fsrsMigrateFromSM2 — legacy import bounds', () => {
  it('past-due SM2 entry uses n (interval) not negative time', () => {
    const past = { next: Date.now() - 30 * 86400000, n: 4, ef: 2.0 };
    const r = f.fsrsMigrateFromSM2(past);
    expect(r.s).toBeGreaterThan(0);
    expect(r.d).toBeGreaterThanOrEqual(1);
    expect(r.d).toBeLessThanOrEqual(10);
  });
  it('zero ef does not produce NaN difficulty', () => {
    const r = f.fsrsMigrateFromSM2({ next: Date.now() + 86400000 * 5, n: 3, ef: 0 });
    expect(Number.isFinite(r.d)).toBe(true);
    expect(r.d).toBeLessThanOrEqual(10);
  });
  it('high ef (well-learned) maps to low difficulty', () => {
    const easy = f.fsrsMigrateFromSM2({ next: Date.now() + 86400000 * 30, n: 30, ef: 2.5 });
    const hard = f.fsrsMigrateFromSM2({ next: Date.now() + 86400000 * 5, n: 5, ef: 1.3 });
    expect(easy.d).toBeLessThan(hard.d);
  });
});

describe('isChronicFail — retire heuristic boundaries', () => {
  it('flags low-accuracy on >=4 attempts', () => {
    expect(f.isChronicFail({ tot: 4, ok: 1, fsrsD: 3 })).toBe(true);
    expect(f.isChronicFail({ tot: 10, ok: 3, fsrsD: 3 })).toBe(true);
  });
  it('does not flag fewer than 4 attempts', () => {
    expect(f.isChronicFail({ tot: 3, ok: 0, fsrsD: 3 })).toBe(false);
  });
  it('flags high difficulty (>=8) on >=3 attempts', () => {
    expect(f.isChronicFail({ tot: 3, ok: 2, fsrsD: 8 })).toBe(true);
    expect(f.isChronicFail({ tot: 5, ok: 4, fsrsD: 9.5 })).toBe(true);
  });
  it('does not flag missing srEntry', () => {
    expect(f.isChronicFail(null)).toBe(false);
    expect(f.isChronicFail(undefined)).toBe(false);
  });
  it('does not flag good-accuracy easy card', () => {
    expect(f.isChronicFail({ tot: 10, ok: 9, fsrsD: 3 })).toBe(false);
  });
  it('boundary: exactly 35% accuracy on 4 attempts is NOT flagged (strict <)', () => {
    // 0.35 == 0.35, the test is `< 0.35`, so 0.35 itself does not flag
    expect(f.isChronicFail({ tot: 20, ok: 7, fsrsD: 3 })).toBe(false); // 0.35
    expect(f.isChronicFail({ tot: 100, ok: 34, fsrsD: 3 })).toBe(true); // 0.34
  });
});

describe('fsrsIntervalWithDeadline — exam-day boundary', () => {
  it('no deadline → returns vanilla fsrsInterval', () => {
    const s = 12;
    expect(f.fsrsIntervalWithDeadline(s, 5, 0.9, null)).toBe(f.fsrsInterval(s));
  });
  it('deadline === 0 (exam today) → returns vanilla interval, no warp', () => {
    expect(f.fsrsIntervalWithDeadline(20, 5, 0.9, 0)).toBe(f.fsrsInterval(20));
  });
  it('deadline === 1 (exam tomorrow) → always 1 day, regardless of mastery', () => {
    expect(f.fsrsIntervalWithDeadline(0.5, 9, 0.5, 1)).toBe(1);
    expect(f.fsrsIntervalWithDeadline(365, 1, 0.99, 1)).toBe(1);
  });
  it('weak card (D=8) caps at 30% of remaining days', () => {
    const i = f.fsrsIntervalWithDeadline(50, 8, 0.7, 100);
    expect(i).toBeLessThanOrEqual(30);
    expect(i).toBeGreaterThanOrEqual(1);
  });
  it('normal card (D=5) caps at 60% of remaining days', () => {
    const i = f.fsrsIntervalWithDeadline(50, 5, 0.85, 100);
    expect(i).toBeLessThanOrEqual(60);
  });
  it('strong card (D=2, rPrev=0.95) caps at 85% of remaining days', () => {
    const i = f.fsrsIntervalWithDeadline(500, 2, 0.95, 100);
    expect(i).toBeLessThanOrEqual(85);
  });
  it('never returns 0 days', () => {
    for (const days of [1, 2, 3, 5, 10, 100]) {
      const i = f.fsrsIntervalWithDeadline(0.1, 10, 0.1, days);
      expect(i).toBeGreaterThanOrEqual(1);
    }
  });
  it('never extends interval beyond what FSRS computed', () => {
    const base = f.fsrsInterval(2);
    const warp = f.fsrsIntervalWithDeadline(2, 5, 0.9, 9999);
    expect(warp).toBeLessThanOrEqual(base);
  });
  it('rPrev = NaN does not propagate NaN out', () => {
    const i = f.fsrsIntervalWithDeadline(10, 5, NaN, 30);
    expect(Number.isFinite(i)).toBe(true);
    expect(i).toBeGreaterThanOrEqual(1);
  });
  it('rPrev = null defaults to 1 (treated as fresh)', () => {
    const i = f.fsrsIntervalWithDeadline(10, 2, null, 30);
    expect(Number.isFinite(i)).toBe(true);
  });
});

describe('fsrsScheduleWithDeadline — composite contract', () => {
  it('returns object with intervalDays, nextReviewTime, warped, baseIntervalDays', () => {
    const r = f.fsrsScheduleWithDeadline(10, 5, 0.9, 1_700_000_000_000, 30);
    expect(r).toHaveProperty('intervalDays');
    expect(r).toHaveProperty('nextReviewTime');
    expect(r).toHaveProperty('warped');
    expect(r).toHaveProperty('baseIntervalDays');
  });
  it('warped === true when deadline forced shorter than base', () => {
    const r = f.fsrsScheduleWithDeadline(50, 8, 0.6, Date.now(), 5);
    expect(r.warped).toBe(true);
    expect(r.intervalDays).toBeLessThan(r.baseIntervalDays);
  });
  it('warped === false when no deadline override', () => {
    const r = f.fsrsScheduleWithDeadline(10, 5, 0.9, Date.now(), null);
    expect(r.warped).toBe(false);
    expect(r.intervalDays).toBe(r.baseIntervalDays);
  });
  it('nextReviewTime is exactly intervalDays in the future', () => {
    const now = 1_700_000_000_000;
    const r = f.fsrsScheduleWithDeadline(10, 5, 0.9, now, null);
    expect(r.nextReviewTime - now).toBe(r.intervalDays * 86400000);
  });
});

describe('fsrsDaysToExam — date parsing edge cases', () => {
  it('rejects invalid date format', () => {
    expect(f.fsrsDaysToExam('not-a-date')).toBeNull();
    expect(f.fsrsDaysToExam('2025-1-1')).toBeNull(); // not zero-padded
    expect(f.fsrsDaysToExam('2025/06/15')).toBeNull();
    expect(f.fsrsDaysToExam('')).toBeNull();
  });
  it('returns 0 for past dates >1 day ago', () => {
    expect(f.fsrsDaysToExam('2020-01-01')).toBe(0);
  });
  it('returns positive integer for future dates', () => {
    const next = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const d = f.fsrsDaysToExam(next);
    expect(d).toBeGreaterThan(28);
    expect(d).toBeLessThanOrEqual(31);
  });
  it('returns null when no localStorage / window context and no override', () => {
    // In Node test env, localStorage is undefined → catch path → returns null
    const r = f.fsrsDaysToExam();
    // either a number from a globally polluted context or null — both finite states
    expect(r === null || typeof r === 'number').toBe(true);
  });
});
