// Audit-8 R1.6 — bot-resilience recovery contract.
//
// Validates lib/workerRecovery.mjs OFFLINE: the counter+action contract that
// fixes the R1 RESULT "bot bug" (Phase-2 null-stemHash lock-in never triggered
// a reload). This is the in-PR GREEN. The EMPIRICAL "does the reload/recreate
// actually recover the live bot from Phase-2" GREEN is pending the overnight
// run (R1.6 RESULT, validation marked pending-overnight).
import { describe, it, expect } from 'vitest';
import {
  nextRecovery,
  initialRecoveryState,
  DEFAULT_RECOVERY_CONFIG,
} from '../scripts/lib/workerRecovery.mjs';

const NULL_FAIL = { advanced: false, stemHash: null };
const ok = (h) => ({ advanced: true, stemHash: h });
const failStem = (h) => ({ advanced: false, stemHash: h });

// Drive a sequence of results through nextRecovery, returning every action.
function drive(results, cfg = {}) {
  let state = initialRecoveryState();
  const actions = [];
  for (const r of results) {
    const d = nextRecovery(state, r, cfg);
    state = d.state;
    actions.push(d.action);
  }
  return { state, actions };
}

describe('initialRecoveryState', () => {
  it('starts all counters at zero / null', () => {
    expect(initialRecoveryState()).toEqual({
      lastStemHash: null, stuckCount: 0, nullStreak: 0, reloadsSinceProgress: 0,
    });
  });
});

describe('R1.6 regression — Phase-2 null-stemHash lock-in now recovers', () => {
  it('THE BUG: the original same-stem counter never fired on null streaks; the new counter does', () => {
    const cfg = { nullStreakThreshold: 5, reloadEscalateThreshold: 99 };
    const { actions } = drive(Array(5).fill(NULL_FAIL), cfg);
    // first 4 nulls: no action; the 5th crosses the threshold → reload
    expect(actions.slice(0, 4)).toEqual(['none', 'none', 'none', 'none']);
    expect(actions[4]).toBe('reload');
  });

  it('does NOT fire on a single transient null (no thrash)', () => {
    const cfg = { nullStreakThreshold: 5 };
    const { actions } = drive([NULL_FAIL, NULL_FAIL], cfg);
    expect(actions).toEqual(['none', 'none']);
  });

  it('a successful question resets the null streak', () => {
    const cfg = { nullStreakThreshold: 5, reloadEscalateThreshold: 99 };
    // 4 nulls, then an ok, then 4 more nulls → never reaches 5-in-a-row
    const seq = [NULL_FAIL, NULL_FAIL, NULL_FAIL, NULL_FAIL, ok('A'), NULL_FAIL, NULL_FAIL, NULL_FAIL, NULL_FAIL];
    const { actions } = drive(seq, cfg);
    expect(actions.every((a) => a === 'none')).toBe(true);
  });
});

describe('R1.6 escalation — reload → recreate when reload-alone is not recovering', () => {
  it('escalates to recreate after reloadEscalateThreshold reloads without progress', () => {
    const cfg = { nullStreakThreshold: 2, reloadEscalateThreshold: 3 };
    // every 2 nulls → an action; 3rd action escalates to recreate
    const { actions } = drive(Array(6).fill(NULL_FAIL), cfg);
    const fired = actions.filter((a) => a !== 'none');
    expect(fired).toEqual(['reload', 'reload', 'recreate']);
  });

  it('recreate resets reloadsSinceProgress so the cycle restarts cleanly', () => {
    const cfg = { nullStreakThreshold: 2, reloadEscalateThreshold: 3 };
    const { state } = drive(Array(6).fill(NULL_FAIL), cfg);
    expect(state.reloadsSinceProgress).toBe(0);
    expect(state.nullStreak).toBe(0);
  });

  it('progress between reloads prevents escalation (reloadsSinceProgress resets on advanced)', () => {
    const cfg = { nullStreakThreshold: 2, reloadEscalateThreshold: 3 };
    // 2 nulls→reload, ok (reset), 2 nulls→reload, ok (reset), 2 nulls→reload — three reloads but never 3 in a row
    const seq = [NULL_FAIL, NULL_FAIL, ok('A'), NULL_FAIL, NULL_FAIL, ok('B'), NULL_FAIL, NULL_FAIL];
    const { actions } = drive(seq, cfg);
    expect(actions.filter((a) => a === 'recreate')).toEqual([]);
    expect(actions.filter((a) => a === 'reload').length).toBe(3);
  });
});

describe('R1.6 preserves the original same-stem jam detection', () => {
  it('N consecutive same-stem FAILED turns still trigger a reload', () => {
    const cfg = { stuckThreshold: 3, nullStreakThreshold: 99 };
    // turn1 sets lastStemHash; turns 2,3,4 increment stuckCount to 3 → reload on the 4th
    const { actions } = drive([failStem('X'), failStem('X'), failStem('X'), failStem('X')], cfg);
    expect(actions).toEqual(['none', 'none', 'none', 'reload']);
  });

  it('N consecutive same-stem ADVANCED turns (genuine jam) still trigger a reload', () => {
    const cfg = { stuckThreshold: 3, nullStreakThreshold: 99 };
    const { actions } = drive([ok('X'), ok('X'), ok('X'), ok('X')], cfg);
    expect(actions).toEqual(['none', 'none', 'none', 'reload']);
  });

  it('distinct stems do not accumulate stuckCount', () => {
    const cfg = { stuckThreshold: 3 };
    const { actions } = drive([ok('A'), ok('B'), ok('C'), ok('D'), ok('E')], cfg);
    expect(actions.every((a) => a === 'none')).toBe(true);
  });

  it('a non-null failure resets the null streak (mixed lock-in does not false-escalate)', () => {
    const cfg = { nullStreakThreshold: 5, stuckThreshold: 99 };
    // null,null,null,null, failStem('Z') resets nullStreak, then null,null → only 2 → no reload
    const seq = [NULL_FAIL, NULL_FAIL, NULL_FAIL, NULL_FAIL, failStem('Z'), NULL_FAIL, NULL_FAIL];
    const { actions } = drive(seq, cfg);
    expect(actions.every((a) => a === 'none')).toBe(true);
  });
});

describe('R1.6 default config is sane', () => {
  it('ships the documented defaults', () => {
    expect(DEFAULT_RECOVERY_CONFIG).toEqual({
      stuckThreshold: 3, nullStreakThreshold: 5, reloadEscalateThreshold: 3,
    });
  });

  it('uses defaults when config omitted', () => {
    // 5 nulls with no cfg → reload at the 5th (default nullStreakThreshold=5)
    const { actions } = drive(Array(5).fill(NULL_FAIL));
    expect(actions[4]).toBe('reload');
  });
});

// ── Codex P2 (#326): no-quiz escalation must not thrash ──────────────────
// The bot's no-quiz branch previously reloaded on BOTH 'reload' AND 'none'.
// reloadsSinceProgress only advances inside nextRecovery when the null streak
// crosses nullStreakThreshold, so reloading on 'none' did not count toward
// escalation → ~15 reloads (5×3) to reach 'recreate' instead of 3.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BOT_SRC = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'chaos-doctor-bot-v4.mjs'),
  'utf8',
);

describe('no-quiz escalation reaches recreate in exactly reloadEscalateThreshold acted reloads', () => {
  it('a sustained null streak yields 2 reloads then recreate (not 15)', () => {
    // Drive enough null turns to reach the first recreate.
    const { actions } = drive(Array(15).fill(NULL_FAIL));
    const acted = actions.filter((a) => a !== 'none'); // the FIXED bot acts ONLY on these
    expect(acted).toEqual(['reload', 'reload', 'recreate']);
    // recreate arrives at the 15th null turn — but via 3 ACTED decisions, not 15 reloads
    expect(actions[14]).toBe('recreate');
    expect(actions.filter((a) => a === 'reload').length).toBe(2);
  });

  it('bot no-quiz branch GATES its reload on action===reload (source guard)', () => {
    const block = BOT_SRC.slice(BOT_SRC.indexOf('if (!onQuiz) {'));
    const noQuiz = block.slice(0, block.indexOf('continue;'));
    // the discriminating fix: reload is guarded by the escalation decision
    expect(noQuiz).toContain("decision.action === 'reload'");
    // and exactly one reload site in the block (the gated one) — no unconditional reload
    expect((noQuiz.match(/page\.reload/g) || []).length).toBe(1);
    expect(noQuiz).toContain("tier: 'reload', context: 'no-quiz'");
  });
});
