// Audit-8 G5 R1.5 long-probe pure-logic pins. The browser runner in
// scripts/audit8/r15LongProbe.mjs is procedure code; the gate's trigger,
// control-capture, and RED-criterion decisions live in pure functions in
// scripts/audit8/r15LongProbeLogic.mjs (split so vitest doesn't have to
// transform playwright + the chaos-doctor-bot v4 shebang). Source spec:
// docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md §R1.5.0/R1.5.1/R1.5.2 and
// §R1.5.1.1 (2026-05-24 debounce calibration appended after that run).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shouldTriggerFirstFailure,
  shouldCaptureControl,
  detectRedCrossing,
  buildMinuteRecord,
  DEFAULT_CONFIG,
} from '../scripts/audit8/r15LongProbeLogic.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper: build a synthetic minute record with just the fields the predicates
// consume. Anything not specified defaults to harmless zeros.
const rec = (over = {}) => ({
  minuteIndex: 0,
  ts: '2026-05-18T19:17:05.000Z',
  cumulativeOk: 0,
  cumulativePrePickSkip: 0,
  deltaOk: 0,
  deltaPrePickSkip: 0,
  lastExtractOutcome: null,
  ...over,
});

// Phase-1-ok / Phase-2-signature record shortcuts. Phase-1 = bot extracting
// fine (deltaOk>0, outcome='ok'). Phase-2 signature = the lock-in shape from
// the 2026-05-24 run min 288+: deltaOk=0 AND outcome='no-quiz' sustained.
const ok = (minuteIndex, over = {}) =>
  rec({ minuteIndex, deltaOk: 13, deltaPrePickSkip: 0, lastExtractOutcome: 'ok', ...over });
const p2 = (minuteIndex, over = {}) =>
  rec({ minuteIndex, deltaOk: 0, deltaPrePickSkip: 15, lastExtractOutcome: 'no-quiz', ...over });

describe('shouldTriggerFirstFailure (R1.5.1 with §R1.5.1.1 streak debounce)', () => {
  const cfg = { firstFailStreakMinutes: 3 };

  it('returns false when history is too short for the streak (N=3)', () => {
    // Even if the only 2 records are Phase-2 signature, history.length < N.
    expect(shouldTriggerFirstFailure([], cfg)).toBe(false);
    expect(shouldTriggerFirstFailure([p2(0), p2(1)], cfg)).toBe(false);
  });

  it('refuses to fire on a single-minute Phase-1 blip (today min-49-class)', () => {
    // The 2026-05-24 calibration anchor: at min 49 the bot had a single
    // d_skip=1 inside an otherwise-clean Phase-1 minute (d_ok=12,
    // outcome=ok). Under the old prev/curr predicate this fired and
    // consumed the firstfail capture budget at min 49 instead of the real
    // bifurcation at min 287. Under the streak predicate the tail must be
    // ALL Phase-2 signature — a single blip-minute (outcome='ok',
    // d_ok>0) breaks the tail.
    const history = [
      ok(46), ok(47), ok(48),
      ok(49, { deltaPrePickSkip: 1, deltaOk: 12 }), // blip
      ok(50), ok(51),
    ];
    expect(shouldTriggerFirstFailure(history, cfg)).toBe(false);
  });

  it('refuses to fire when only 2 consecutive Phase-2 minutes (under threshold)', () => {
    // Phase-1 history followed by 2 minutes of Phase-2 signature. Under
    // N=3, the tail is one short — must NOT fire. This is the debounce
    // surface: N relocates the bug if mis-tuned; an unseen 2-min Phase-1
    // anomaly would have to sustain past min 3 to trigger.
    const history = [ok(0), ok(1), ok(2), p2(3), p2(4)];
    expect(shouldTriggerFirstFailure(history, cfg)).toBe(false);
  });

  it('fires when N consecutive Phase-2 minutes follow a Phase-1 anchor', () => {
    // Canonical 2026-05-24 lock-in shape: ~280 min of Phase-1 then
    // sustained no-quiz + zero ok. With N=3 the trigger fires at the
    // 3rd Phase-2 minute of the streak.
    const history = [ok(0), ok(1), ok(2), p2(3), p2(4), p2(5)];
    expect(shouldTriggerFirstFailure(history, cfg)).toBe(true);
  });

  it('refuses to fire on a cold-start no-quiz streak (no Phase-1 anchor)', () => {
    // 3 minutes of Phase-2 signature from the very start of the run.
    // No earlier record has deltaOk>0 — this is a cold-start failure,
    // NOT a Phase-1 → Phase-2 bifurcation. Don't burn the capture budget.
    const history = [p2(0), p2(1), p2(2)];
    expect(shouldTriggerFirstFailure(history, cfg)).toBe(false);
  });

  it('requires the tail to be PURE Phase-2 (a Phase-1 minute interrupts the streak)', () => {
    // Pattern: ok ok p2 p2 ok p2 p2 — tail at N=3 is [ok, p2, p2]. The
    // ok in the tail breaks the streak. The lock-in shape from today's
    // run is monotonic (no Phase-1 minutes after Phase-2 onset); a
    // half-streak with a recovery is NOT a bifurcation.
    const history = [ok(0), ok(1), p2(2), p2(3), ok(4), p2(5), p2(6)];
    expect(shouldTriggerFirstFailure(history, cfg)).toBe(false);
  });

  it('rejects malformed inputs (defensive guard)', () => {
    expect(shouldTriggerFirstFailure(null, cfg)).toBe(false);
    expect(shouldTriggerFirstFailure(undefined, cfg)).toBe(false);
    expect(shouldTriggerFirstFailure([ok(0), ok(1), ok(2)], { firstFailStreakMinutes: 0 })).toBe(false);
    expect(shouldTriggerFirstFailure([ok(0), ok(1), ok(2)], {})).toBe(false);
    // A record with deltaOk='oops' in the tail breaks the type check.
    const bad = [ok(0), ok(1), ok(2), p2(3), p2(4), p2(5, { deltaOk: 'oops' })];
    expect(shouldTriggerFirstFailure(bad, cfg)).toBe(false);
  });

  it('replay-pin: 2026-05-24 slimmed fixture — never fires on any of the 7 blips, fires exactly at min 290', () => {
    // The slimmed fixture (tests/fixtures/r15-2026-05-24-timeline-slim.jsonl)
    // covers ±2 min windows around all 7 Phase-1 blip minutes (min 1, 11,
    // 49, 63, 78, 160, 188) plus the bifurcation window 280-295. Walks
    // the fixture cumulatively, building history as the runner would, and
    // asserts:
    //   - At each blip minute, the predicate returns false (was the bug:
    //     old predicate fired at min 49 in today's run).
    //   - The predicate first returns true at min 290 (the third
    //     consecutive Phase-2 minute after the partial-transition at
    //     min 287 and the first two clean Phase-2 minutes at min 288, 289).
    //   - Continues returning true at min 291-295 (stateless; the runner
    //     enforces single-shot via firstFailCaptured).
    const fixturePath = path.join(__dirname, 'fixtures', 'r15-2026-05-24-timeline-slim.jsonl');
    const lines = fs.readFileSync(fixturePath, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    const records = lines.map((l) => JSON.parse(l));

    const BLIP_MINUTES = new Set([1, 11, 49, 63, 78, 160, 188]);
    const FIRST_FIRE_MINUTE = 290;
    const cumulative = [];
    let firstFireMinute = null;

    for (const r of records) {
      cumulative.push(r);
      const fires = shouldTriggerFirstFailure(cumulative, cfg);
      if (BLIP_MINUTES.has(r.minuteIndex)) {
        expect(fires, `blip min ${r.minuteIndex} should NOT fire`).toBe(false);
      }
      if (fires && firstFireMinute === null) firstFireMinute = r.minuteIndex;
    }

    expect(firstFireMinute).toBe(FIRST_FIRE_MINUTE);

    // Sanity: fires at min 291..295 too (stateless predicate; the runner
    // enforces single-shot via firstFailCaptured).
    for (const tailMin of [291, 292, 293, 294, 295]) {
      const upTo = records.findIndex((r) => r.minuteIndex === tailMin);
      const slice = records.slice(0, upTo + 1);
      expect(shouldTriggerFirstFailure(slice, cfg), `min ${tailMin} should fire (stateless)`).toBe(true);
    }

    // Sanity: NO record before min 290 in the fixture causes a fire.
    let preFireCount = 0;
    const cumulative2 = [];
    for (const r of records) {
      if (r.minuteIndex >= FIRST_FIRE_MINUTE) break;
      cumulative2.push(r);
      if (shouldTriggerFirstFailure(cumulative2, cfg)) preFireCount += 1;
    }
    expect(preFireCount).toBe(0);
  });
});

describe('shouldCaptureControl (R1.5.2)', () => {
  const cfg = { phase1ControlMinute: 30 };

  it('fires exactly at the configured minute when not yet captured', () => {
    expect(shouldCaptureControl(30, cfg, false)).toBe(true);
  });

  it('does not fire before the configured minute', () => {
    expect(shouldCaptureControl(29, cfg, false)).toBe(false);
    expect(shouldCaptureControl(0, cfg, false)).toBe(false);
  });

  it('does not fire after the configured minute (single-shot semantics)', () => {
    // If the control was missed for some reason, R1.5 surfaces the
    // missed-control state through `summary.json.controlCaptured=false`,
    // not by capturing late. Late control = stale baseline = broken diff.
    expect(shouldCaptureControl(31, cfg, false)).toBe(false);
    expect(shouldCaptureControl(120, cfg, false)).toBe(false);
  });

  it('refuses to re-fire when control is already captured', () => {
    expect(shouldCaptureControl(30, cfg, true)).toBe(false);
  });

  it('refuses non-integer minute indices', () => {
    expect(shouldCaptureControl(30.5, cfg, false)).toBe(false);
    expect(shouldCaptureControl(NaN, cfg, false)).toBe(false);
  });
});

describe('detectRedCrossing (R1.5.0)', () => {
  // Synthesize timelines with the bifurcation shape: N minutes of ok>thr,
  // then M minutes of skip>thr. The detector returns the boundaries.
  const buildTimeline = ({ okCount, skipCount, okDelta = 2, skipDelta = 13, fillerBetween = 0 }) => {
    const t = [];
    let idx = 0;
    for (let i = 0; i < okCount; i++) {
      t.push(rec({ minuteIndex: idx++, deltaOk: okDelta, deltaPrePickSkip: 0 }));
    }
    for (let i = 0; i < fillerBetween; i++) {
      t.push(rec({ minuteIndex: idx++, deltaOk: 0, deltaPrePickSkip: 0 }));
    }
    for (let i = 0; i < skipCount; i++) {
      t.push(rec({ minuteIndex: idx++, deltaOk: 0, deltaPrePickSkip: skipDelta }));
    }
    return t;
  };

  const cfg = {
    redOkMinThreshold: DEFAULT_CONFIG.redOkMinThreshold,         // 1
    redOkWindowMinutes: DEFAULT_CONFIG.redOkWindowMinutes,       // 60
    redSkipMinThreshold: DEFAULT_CONFIG.redSkipMinThreshold,     // 5
    redSkipStreakMinutes: DEFAULT_CONFIG.redSkipStreakMinutes,   // 10
  };

  it('returns null on empty or trivial timelines', () => {
    expect(detectRedCrossing([], cfg)).toBeNull();
    expect(detectRedCrossing([rec({ deltaOk: 5 })], cfg)).toBeNull();
  });

  it('returns null if the ok-window is one minute short of the threshold', () => {
    const tl = buildTimeline({ okCount: 59, skipCount: 20 });
    expect(detectRedCrossing(tl, cfg)).toBeNull();
  });

  it('returns null if the skip-streak is one minute short of the threshold', () => {
    const tl = buildTimeline({ okCount: 60, skipCount: 9 });
    expect(detectRedCrossing(tl, cfg)).toBeNull();
  });

  it('returns null when the skip-streak precedes the ok-window', () => {
    // Phase 2 must come AFTER Phase 1. A pre-existing skip run before any
    // ok-window is not a bifurcation; it's a cold-start failure.
    const t = [];
    let idx = 0;
    for (let i = 0; i < 15; i++) t.push(rec({ minuteIndex: idx++, deltaPrePickSkip: 13 }));
    for (let i = 0; i < 70; i++) t.push(rec({ minuteIndex: idx++, deltaOk: 2 }));
    expect(detectRedCrossing(t, cfg)).toBeNull();
  });

  it('detects the canonical Phase-1 → Phase-2 bifurcation (audit-8 RESULT shape)', () => {
    // Audit-8 RESULT: Phase 1 = 194 min ok>0, Phase 2 = 286 min skip>5. The
    // analyzer's bifurcation-detector is calibrated on the smallest window
    // that captures this shape — 60 min ok + 10 min skip.
    const tl = buildTimeline({ okCount: 194, skipCount: 286 });
    const cross = detectRedCrossing(tl, cfg);
    expect(cross).not.toBeNull();
    // ok-window starts at index 0 and is the first 60-minute contiguous run.
    expect(cross.okWindow[0]).toBe(0);
    expect(cross.okWindow[1]).toBe(60);
    // skip-streak starts after the ok-window ends (skip phase here begins at
    // index 194 since the simulator emits 194 ok then 286 skip).
    expect(cross.skipWindow[0]).toBe(194);
    expect(cross.skipWindow[1]).toBe(204);
  });

  it('tolerates a gap of quiet minutes between Phase 1 and Phase 2', () => {
    // The transition observed in #241 had a ~1m40s gap with no events. The
    // detector should still cross even if the ok-window and skip-streak are
    // not adjacent.
    const tl = buildTimeline({ okCount: 60, skipCount: 10, fillerBetween: 3 });
    const cross = detectRedCrossing(tl, cfg);
    expect(cross).not.toBeNull();
    expect(cross.skipWindow[0]).toBe(63); // 60 ok + 3 filler
  });

  it('uses strict-greater-than semantics on both thresholds', () => {
    // deltaOk must be STRICTLY > redOkMinThreshold (1), so deltaOk=1 does
    // not contribute to the ok-window. deltaPrePickSkip must be STRICTLY > 5,
    // so deltaPrePickSkip=5 does not contribute to the skip-streak.
    const tl1 = buildTimeline({ okCount: 60, skipCount: 20, okDelta: 1, skipDelta: 13 });
    expect(detectRedCrossing(tl1, cfg)).toBeNull();
    const tl2 = buildTimeline({ okCount: 60, skipCount: 20, okDelta: 2, skipDelta: 5 });
    expect(detectRedCrossing(tl2, cfg)).toBeNull();
  });

  it('detects the EARLIEST crossing when multiple are possible', () => {
    // Two ok-windows separated by a break, with a skip-streak after each.
    // The detector should pick the first complete pair, not greedily merge.
    const t = [];
    let idx = 0;
    for (let i = 0; i < 60; i++) t.push(rec({ minuteIndex: idx++, deltaOk: 2 }));
    for (let i = 0; i < 10; i++) t.push(rec({ minuteIndex: idx++, deltaPrePickSkip: 13 }));
    for (let i = 0; i < 60; i++) t.push(rec({ minuteIndex: idx++, deltaOk: 2 }));
    for (let i = 0; i < 10; i++) t.push(rec({ minuteIndex: idx++, deltaPrePickSkip: 13 }));
    const cross = detectRedCrossing(t, cfg);
    expect(cross).not.toBeNull();
    expect(cross.okWindow).toEqual([0, 60]);
    expect(cross.skipWindow).toEqual([60, 70]);
  });
});

describe('buildMinuteRecord (pure aggregation)', () => {
  it('computes minute deltas from running counters', () => {
    const r = buildMinuteRecord({
      minuteIndex: 7,
      ts: '2026-05-18T19:24:05.000Z',
      cumulativeOk: 14,
      cumulativePrePickSkip: 2,
      prevCumulativeOk: 12,
      prevCumulativePrePickSkip: 0,
      lastExtractOutcome: 'ok',
      perfMemory: { usedJSHeapSize: 1000, totalJSHeapSize: 2000, jsHeapSizeLimit: 4000 },
      domNodeCount: 350,
      serviceWorkerCount: 1,
    });
    expect(r.minuteIndex).toBe(7);
    expect(r.deltaOk).toBe(2);
    expect(r.deltaPrePickSkip).toBe(2);
    expect(r.lastExtractOutcome).toBe('ok');
    expect(r.perfMemory.usedJSHeapSize).toBe(1000);
    expect(r.domNodeCount).toBe(350);
    expect(r.serviceWorkerCount).toBe(1);
  });

  it('defaults previous counters to 0 (first minute since probe start)', () => {
    const r = buildMinuteRecord({
      minuteIndex: 0,
      ts: 't',
      cumulativeOk: 3,
      cumulativePrePickSkip: 0,
    });
    expect(r.deltaOk).toBe(3);
    expect(r.deltaPrePickSkip).toBe(0);
    expect(r.perfMemory).toBeNull();
    expect(r.domNodeCount).toBeNull();
    expect(r.serviceWorkerCount).toBeNull();
  });
});

describe('DEFAULT_CONFIG', () => {
  it('matches the gate doc defaults (R1.5.0/R1.5.2/R1.5.1.1)', () => {
    // These are the numbers the gate doc binds: 60-min ok-window, 10-min
    // skip-streak, threshold >5/min on skip, >1/min on ok (§R1.5.0);
    // control at minute 30 (§R1.5.2); firstFail streak debounce = 3 min
    // (§R1.5.1.1, calibrated from the 2026-05-24 run). If any drift, the
    // gate-doc-vs-code contract is broken.
    expect(DEFAULT_CONFIG.redOkWindowMinutes).toBe(60);
    expect(DEFAULT_CONFIG.redSkipStreakMinutes).toBe(10);
    expect(DEFAULT_CONFIG.redOkMinThreshold).toBe(1);
    expect(DEFAULT_CONFIG.redSkipMinThreshold).toBe(5);
    expect(DEFAULT_CONFIG.phase1ControlMinute).toBe(30);
    expect(DEFAULT_CONFIG.firstFailStreakMinutes).toBe(3);
    expect(DEFAULT_CONFIG.minHours).toBe(6);
    expect(DEFAULT_CONFIG.maxHours).toBe(10);
  });
});
