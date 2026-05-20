// Audit-8 G5 R1.5 long-probe pure-logic pins. The browser runner in
// scripts/audit8/r15LongProbe.mjs is procedure code; the gate's trigger,
// control-capture, and RED-criterion decisions live in pure functions in
// scripts/audit8/r15LongProbeLogic.mjs (split so vitest doesn't have to
// transform playwright + the chaos-doctor-bot v4 shebang). Source spec:
// docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md §R1.5.0/R1.5.1/R1.5.2.
import { describe, it, expect } from 'vitest';
import {
  shouldTriggerFirstFailure,
  shouldCaptureControl,
  detectRedCrossing,
  buildMinuteRecord,
  DEFAULT_CONFIG,
} from '../scripts/audit8/r15LongProbeLogic.mjs';

// Helper: build a synthetic minute record with just the fields the predicates
// consume. Anything not specified defaults to harmless zeros.
const rec = (over = {}) => ({
  minuteIndex: 0,
  ts: '2026-05-18T19:17:05.000Z',
  cumulativeOk: 0,
  cumulativePrePickSkip: 0,
  deltaOk: 0,
  deltaPrePickSkip: 0,
  ...over,
});

describe('shouldTriggerFirstFailure (R1.5.1)', () => {
  it('returns false when prev is null (minute 0 of probe)', () => {
    expect(shouldTriggerFirstFailure(null, rec({ deltaPrePickSkip: 3 }))).toBe(false);
  });

  it('returns true at the Phase-1 → Phase-2 boundary', () => {
    // The audit-8 RESULT shape: Phase 1 had 2-3 ok/min, Phase 2 opened with
    // pre-pick-skip>0. The trigger fires exactly at that transition.
    const prev = rec({ minuteIndex: 193, deltaOk: 2, deltaPrePickSkip: 0 });
    const curr = rec({ minuteIndex: 194, deltaOk: 0, deltaPrePickSkip: 3 });
    expect(shouldTriggerFirstFailure(prev, curr)).toBe(true);
  });

  it('returns false when previous minute had no ok activity', () => {
    // Without a Phase-1 baseline (deltaOk=0 in prev), a single pre-pick-skip
    // is not a transition — could be a transient warm-up failure.
    const prev = rec({ deltaOk: 0 });
    const curr = rec({ deltaPrePickSkip: 5 });
    expect(shouldTriggerFirstFailure(prev, curr)).toBe(false);
  });

  it('returns false when current minute has no pre-pick-skip', () => {
    const prev = rec({ deltaOk: 4 });
    const curr = rec({ deltaPrePickSkip: 0, deltaOk: 4 });
    expect(shouldTriggerFirstFailure(prev, curr)).toBe(false);
  });

  it('returns false when fields are missing (defensive guard)', () => {
    expect(shouldTriggerFirstFailure({}, {})).toBe(false);
    expect(shouldTriggerFirstFailure({ deltaOk: 'oops' }, { deltaPrePickSkip: 5 })).toBe(false);
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
  it('matches the gate doc defaults (R1.5.0)', () => {
    // These are the numbers the gate doc §R1.5.0 binds: 60-min ok-window,
    // 10-min skip-streak, threshold >5/min on skip, >1/min on ok, control
    // at minute 30. If any drift, the gate-doc-vs-code contract is broken.
    expect(DEFAULT_CONFIG.redOkWindowMinutes).toBe(60);
    expect(DEFAULT_CONFIG.redSkipStreakMinutes).toBe(10);
    expect(DEFAULT_CONFIG.redOkMinThreshold).toBe(1);
    expect(DEFAULT_CONFIG.redSkipMinThreshold).toBe(5);
    expect(DEFAULT_CONFIG.phase1ControlMinute).toBe(30);
    expect(DEFAULT_CONFIG.minHours).toBe(6);
    expect(DEFAULT_CONFIG.maxHours).toBe(10);
  });
});
