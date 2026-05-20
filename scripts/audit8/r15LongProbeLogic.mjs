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
// (Phase-1 control trigger). Drift here = drift in the gate's binding
// procedure; the test suite is the falsifier.

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
  netBufferSize: 20,
  consoleBufferSize: 5000,
});

/**
 * First-failure trigger predicate (R1.5.1).
 *
 * Returns true at the first minute where the bot's per-minute pre-pick-skip
 * count crosses from 0 to >0 IMMEDIATELY after a minute that had ok>0. This
 * is the Phase-1 → Phase-2 transition boundary.
 *
 * @param {object|null} prev previous minute record (null at minute 0)
 * @param {object} curr current minute record
 * @returns {boolean}
 */
export function shouldTriggerFirstFailure(prev, curr) {
  if (!prev || !curr) return false;
  if (typeof prev.deltaOk !== 'number' || typeof curr.deltaPrePickSkip !== 'number') return false;
  return prev.deltaOk > 0 && curr.deltaPrePickSkip > 0;
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
