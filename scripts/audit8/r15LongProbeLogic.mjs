// AUDIT-8 G5 R1.5 long-probe pure logic.
//
// The browser-driven runner in `r15LongProbe.mjs` imports playwright + the
// chaos-doctor-bot v4 module (which itself has a `#!/usr/bin/env node`
// shebang esbuild rejects). Pure decisions live here so they can be pinned
// by the vitest suite without dragging those imports into the test
// transformer.
//
// Spec source: `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md`
// §R1.5.0 (RED criterion), §R1.5.1 (first-failure trigger), §R1.5.2
// (Phase-1 control trigger), §R1.5.1.1 (2026-05-24 debounce calibration).
// Drift here = drift in the gate's binding procedure; the test suite is the
// falsifier.

export const DEFAULT_CONFIG = Object.freeze({
  url: 'https://eiasash.github.io/Geriatrics/',
  minHours: 6,
  maxHours: 10,
  headless: true,
  outDir: null,
  label: 'r15-live-main',
  readPauseMs: 2500,
  phase1ControlMinute: 30,
  redOkMinThreshold: 1,
  redOkWindowMinutes: 60,
  redSkipMinThreshold: 5,
  redSkipStreakMinutes: 10,
  firstFailStreakMinutes: 3,
  netBufferSize: 20,
  consoleBufferSize: 5000,
});

/**
 * First-failure trigger predicate (R1.5.1, with §R1.5.1.1 debounce).
 *
 * Fires when the last `firstFailStreakMinutes` records in `history` all
 * satisfy the Phase-2 signature:
 *   - `deltaOk === 0`
 *   - `lastExtractOutcome === 'no-quiz'`
 *
 * AND somewhere earlier in `history` there exists a record with
 * `deltaOk > 0` (Phase-1 anchor — preserves the existing spec invariant
 * that a cold-start no-quiz streak is NOT a Phase-1 → Phase-2 bifurcation).
 *
 * Calibration anchor: the 2026-05-24 R1.5 run (timeline at
 * `chaos-reports/v4-long/audit8r15_20260524T022036Z/`) — original 1-event
 * predicate fired at min 49 on a single-skip Phase-1 blip (d_skip 2→3,
 * d_ok=12, outcome=ok), consuming the capture budget before the real
 * lock-in at min 287. Streak debounce + outcome-conjunction discriminate:
 * every observed Phase-1 blip in that run is 1 minute wide with d_ok≥12
 * and outcome=ok; the bifurcation has d_ok=0 + outcome=no-quiz sustained
 * ≥73 min. See `tests/audit8r15LongProbe.test.js` "replay-pin" case for
 * the slimmed fixture that pins this calibration.
 *
 * Asymmetry vs `detectRedCrossing` (R1.5.0): RED uses thresholded streaks
 * on counters (60-min ok-window before 10-min skip-streak with strict
 * thresholds); firstFail uses the conjunction of `deltaOk=0` AND
 * `outcome='no-quiz'` because the *signature of the lock-in* is the bot
 * being unable to find a quiz at all — not just a skip-rate uptick. Don't
 * force symmetry; the predicates capture different states.
 *
 * @param {Array<object>} history ordered minute records, most-recent last
 * @param {object} config { firstFailStreakMinutes }
 * @returns {boolean}
 */
export function shouldTriggerFirstFailure(history, config) {
  if (!Array.isArray(history)) return false;
  if (!config || typeof config.firstFailStreakMinutes !== 'number') return false;
  const N = config.firstFailStreakMinutes;
  if (!Number.isInteger(N) || N < 1) return false;
  if (history.length < N) return false;

  const tailStart = history.length - N;
  for (let i = tailStart; i < history.length; i++) {
    const r = history[i];
    if (!r) return false;
    if (typeof r.deltaOk !== 'number' || r.deltaOk !== 0) return false;
    if (r.lastExtractOutcome !== 'no-quiz') return false;
  }

  for (let i = 0; i < tailStart; i++) {
    const r = history[i];
    if (r && typeof r.deltaOk === 'number' && r.deltaOk > 0) return true;
  }
  return false;
}

/**
 * Phase-1 control trigger (R1.5.2).
 *
 * Captures at the configured minute index, exactly once per run.
 *
 * @param {number} minuteIndex 0-based minute since probe start
 * @param {object} config { phase1ControlMinute }
 * @param {boolean} alreadyCaptured whether the control has fired
 * @returns {boolean}
 */
export function shouldCaptureControl(minuteIndex, config, alreadyCaptured) {
  if (alreadyCaptured) return false;
  return Number.isInteger(minuteIndex) && minuteIndex === config.phase1ControlMinute;
}

/**
 * RED criterion (R1.5.0).
 *
 * Scans a chronological timeline (array of per-minute records) for a
 * Phase-2 onset, defined as:
 *   - some contiguous run of >= `redOkWindowMinutes` minutes where every
 *     minute has `deltaOk > redOkMinThreshold` (the Phase-1 ok-window),
 *   - followed (later in the timeline, not necessarily adjacent) by a
 *     contiguous run of >= `redSkipStreakMinutes` minutes where every
 *     minute has `deltaPrePickSkip > redSkipMinThreshold` (the Phase-2
 *     skip-streak).
 *
 * Returns the first such crossing as `{ okWindow:[a,b), skipWindow:[c,d) }`
 * with all bounds in timeline-index space (b<=c). Returns null if no
 * crossing exists.
 *
 * @param {Array<object>} timeline ordered minute records
 * @param {object} config
 * @returns {{ okWindow:[number,number], skipWindow:[number,number] } | null}
 */
export function detectRedCrossing(timeline, config) {
  if (!Array.isArray(timeline) || timeline.length === 0) return null;
  const okThr = config.redOkMinThreshold;
  const okN = config.redOkWindowMinutes;
  const skipThr = config.redSkipMinThreshold;
  const skipN = config.redSkipStreakMinutes;

  // First locate the EARLIEST contiguous ok-window of length >= okN.
  let okStart = -1;
  let okEnd = -1;
  let runStart = -1;
  for (let i = 0; i < timeline.length; i++) {
    const m = timeline[i];
    const okHere = typeof m.deltaOk === 'number' && m.deltaOk > okThr;
    if (okHere) {
      if (runStart < 0) runStart = i;
      if (i - runStart + 1 >= okN) {
        okStart = runStart;
        okEnd = i + 1; // exclusive
        break;
      }
    } else {
      runStart = -1;
    }
  }
  if (okStart < 0) return null;

  // After the ok-window ends, search for the EARLIEST contiguous skip-streak
  // of length >= skipN.
  let skipRunStart = -1;
  for (let i = okEnd; i < timeline.length; i++) {
    const m = timeline[i];
    const skipHere = typeof m.deltaPrePickSkip === 'number' && m.deltaPrePickSkip > skipThr;
    if (skipHere) {
      if (skipRunStart < 0) skipRunStart = i;
      if (i - skipRunStart + 1 >= skipN) {
        return {
          okWindow: [okStart, okEnd],
          skipWindow: [skipRunStart, i + 1],
        };
      }
    } else {
      skipRunStart = -1;
    }
  }
  return null;
}

/**
 * Build a per-minute record from running counters + page snapshots.
 *
 * Pure aggregator — kept here so tests can fixture realistic timelines
 * without launching a browser.
 *
 * @param {object} input
 * @returns {object}
 */
export function buildMinuteRecord(input) {
  const {
    minuteIndex, ts, cumulativeOk, cumulativePrePickSkip,
    prevCumulativeOk = 0, prevCumulativePrePickSkip = 0,
    lastExtractOutcome = null, perfMemory = null, domNodeCount = null,
    serviceWorkerCount = null,
  } = input;
  return {
    minuteIndex,
    ts,
    cumulativeOk,
    cumulativePrePickSkip,
    deltaOk: cumulativeOk - prevCumulativeOk,
    deltaPrePickSkip: cumulativePrePickSkip - prevCumulativePrePickSkip,
    lastExtractOutcome,
    perfMemory,
    domNodeCount,
    serviceWorkerCount,
  };
}
