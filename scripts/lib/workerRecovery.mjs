// Audit-8 R1.6 — bot-resilience recovery decision (pure, unit-testable).
//
// Background (R1 RESULT "the bot bug", docs/AUDIT8_G5_REPAIR_GATE.md §"The
// bot bug"): chaos-doctor-bot-v4's runWorker incremented `stuckCount` only on
// a NON-null stemHash that equalled the previous stemHash. A Phase-2 lock-in
// returns `{ advanced:false, stemHash:null }` every iteration, so the
// same-stem jam counter never advanced and the `stuckThreshold` reload path
// never fired — the bot logged pre-pick-skip indefinitely (structurally
// unable to recover from Phase-2).
//
// The pre-registered fix (R1 RESULT Option B + §R1.5.4 sketch): a
// null-stemHash consecutive-skip counter that triggers a recovery action.
// This module extends "reload" with a second escalation tier — recreate the
// browser context — because §R1.5.4's leading (provisional) mechanism is
// Class C (connection / proxy / CDN state), which a same-context reload may
// not clear; a fresh context resets connection + profile state (covers
// Class C and Class D). Tier selection is validated EMPIRICALLY by the
// overnight live run (R1.6 GREEN — pending); this module's CONTRACT is
// validated offline by tests/audit8WorkerRecovery.test.js.
//
// Pure function: no Playwright, no I/O. runWorker owns the side effects
// (page.reload / context recreate); this decides WHICH action and threads the
// counter state.

/** @typedef {{ lastStemHash: (string|number|null), stuckCount: number, nullStreak: number, reloadsSinceProgress: number }} RecoveryState */

export const DEFAULT_RECOVERY_CONFIG = {
  // Existing v4 same-stem jam threshold (unchanged default).
  stuckThreshold: 3,
  // NEW: consecutive failed turns with stemHash===null before a reload.
  // 5 ≈ ~20–25 s of Phase-2 (one failed turn ≈ 4–5 s) — fast enough to
  // recover, long enough not to thrash on a single transient miss.
  nullStreakThreshold: 5,
  // NEW: reloads-without-progress before escalating reload → recreate.
  reloadEscalateThreshold: 3,
};

/** Fresh starting state for a worker loop. */
export function initialRecoveryState() {
  return { lastStemHash: null, stuckCount: 0, nullStreak: 0, reloadsSinceProgress: 0 };
}

/**
 * Decide the recovery action after one doctorOneQuestion turn and return the
 * next counter state. Faithful superset of the original runWorker logic:
 * the same-stem jam path is preserved; the null-streak + recreate-escalation
 * tiers are added.
 *
 * @param {RecoveryState} state
 * @param {{ advanced: boolean, stemHash: (string|number|null) }} result
 * @param {Partial<typeof DEFAULT_RECOVERY_CONFIG>} [config]
 * @returns {{ state: RecoveryState, action: ('none'|'reload'|'recreate') }}
 */
export function nextRecovery(state, result, config = {}) {
  const stuckThreshold = config.stuckThreshold ?? DEFAULT_RECOVERY_CONFIG.stuckThreshold;
  const nullStreakThreshold = config.nullStreakThreshold ?? DEFAULT_RECOVERY_CONFIG.nullStreakThreshold;
  const reloadEscalateThreshold = config.reloadEscalateThreshold ?? DEFAULT_RECOVERY_CONFIG.reloadEscalateThreshold;

  let { lastStemHash, stuckCount, nullStreak, reloadsSinceProgress } = state;
  const stemHash = result && result.stemHash != null ? result.stemHash : null;

  if (result && result.advanced) {
    // Real progress — a question was answered. Reset the failure counters.
    stuckCount = stemHash != null && stemHash === lastStemHash ? stuckCount + 1 : 0;
    nullStreak = 0;
    reloadsSinceProgress = 0;
    lastStemHash = stemHash;
  } else {
    // Failed turn.
    if (stemHash == null) {
      // The Phase-2 lock-in signature (no-quiz / extract→null). THIS is the
      // counter the original code lacked.
      nullStreak += 1;
    } else {
      // Non-null failure on the same stem = the original same-stem jam.
      nullStreak = 0;
      if (stemHash === lastStemHash) stuckCount += 1;
    }
    lastStemHash = stemHash;
  }

  let action = 'none';
  if (stuckCount >= stuckThreshold || nullStreak >= nullStreakThreshold) {
    reloadsSinceProgress += 1;
    stuckCount = 0;
    nullStreak = 0;
    lastStemHash = null;
    if (reloadsSinceProgress >= reloadEscalateThreshold) {
      action = 'recreate';
      reloadsSinceProgress = 0;
    } else {
      action = 'reload';
    }
  }

  return { state: { lastStemHash, stuckCount, nullStreak, reloadsSinceProgress }, action };
}
