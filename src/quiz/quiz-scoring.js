/**
 * Quiz scoring, spaced repetition integration, and estimated score.
 *
 * Pure functions — no DOM dependencies.
 */

// These are loaded globally from shared/fsrs.js in the monolith.
// In the modular build, we import from the shared module.
// For now, reference globals that shared/fsrs.js defines.
/* global fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2 */

/**
 * Score a question answer and update SR state.
 *
 * @param {object} sr - S.sr object (mutated in place)
 * @param {number} qIdx - question index
 * @param {boolean} correct - was the answer correct
 * @param {number} qStartTime - timestamp when question was shown
 * @param {number|null} fsrsRating - explicit FSRS rating (1-4) or null for auto
 * @returns {{ sessionOkDelta: number, sessionNoDelta: number, topicIndex: number|null }}
 */
export function srScore(sr, qIdx, correct, qStartTime, fsrsRating) {
  if (!sr[qIdx]) {
    sr[qIdx] = { ef: 2.5, n: 0, next: 0, ts: [], at: 0, tot: 0, ok: 0 };
  }
  const s = sr[qIdx];
  if (s.tot === undefined) { s.tot = 0; s.ok = 0; }

  // Answer time tracking
  const elapsed = Math.round((Date.now() - qStartTime) / 1000);
  if (!s.ts) s.ts = [];
  s.ts.push(elapsed);
  if (s.ts.length > 10) s.ts.shift();
  s.at = Math.round(s.ts.reduce((a, b) => a + b, 0) / s.ts.length);
  s.tot++;
  if (correct) s.ok++;

  // FSRS-4.5 scheduling
  const rating = fsrsRating || (correct ? 3 : 1);
  const daysSinceReview = s.lastReview ? Math.max(0, (Date.now() - s.lastReview) / 86400000) : 0;

  // Initialize or migrate FSRS state
  if (s.fsrsS === undefined || s.fsrsD === undefined) {
    if (s.n > 0 || s.ef !== 2.5) {
      const mig = fsrsMigrateFromSM2(s);
      s.fsrsS = mig.s;
      s.fsrsD = mig.d;
    } else {
      const init = fsrsInitNew(rating);
      s.fsrsS = init.s;
      s.fsrsD = init.d;
    }
  }

  const rPrev = daysSinceReview > 0 ? fsrsR(daysSinceReview, s.fsrsS) : 1;
  const upd = fsrsUpdate(s.fsrsS, s.fsrsD, rPrev, rating);
  s.fsrsS = Math.round(upd.s * 1000) / 1000;
  s.fsrsD = Math.round(upd.d * 100) / 100;
  s.lastReview = Date.now();

  // FSRS interval → next review
  const fsrsDays = fsrsInterval(s.fsrsS);
  s.next = Date.now() + fsrsDays * 86400000;

  // Keep SM-2 ef/n as proxies for filter compatibility
  s.n = correct ? s.n + 1 : 0;
  s.ef = Math.round((2.5 - (s.fsrsD - 1) / (10 - 1) * (2.5 - 1.3)) * 1000) / 1000;

  return {
    sessionOkDelta: correct ? 1 : 0,
    sessionNoDelta: correct ? 0 : 1,
  };
}

/**
 * Calculate estimated exam score based on topic accuracy and IMA weights.
 *
 * @param {Array} questions - QZ array
 * @param {object} sr - S.sr object
 * @param {Array} imaWeights - IMA_WEIGHTS array
 * @returns {number} Estimated percentage score
 */
export function calcEstScore(questions, sr, imaWeights) {
  const topicAcc = {};
  const topicTot = {};

  questions.forEach((q, i) => {
    const s = sr[i];
    if (!s || !s.tot) return;
    const ti = q.ti;
    if (!topicAcc[ti]) { topicAcc[ti] = 0; topicTot[ti] = 0; }
    topicAcc[ti] += s.ok || 0;
    topicTot[ti] += s.tot;
  });

  let weightedSum = 0;
  let weightTotal = 0;

  imaWeights.forEach((w, ti) => {
    if (topicTot[ti] && topicTot[ti] >= 3) {
      const acc = topicAcc[ti] / topicTot[ti];
      weightedSum += acc * w;
      weightTotal += w;
    }
  });

  if (weightTotal === 0) return 0;
  return Math.round((weightedSum / weightTotal) * 100);
}

/**
 * Get the study streak (consecutive days with activity).
 *
 * @param {object} dailyAct - S.dailyAct object
 * @returns {number} streak in days
 */
export function getStudyStreak(dailyAct) {
  if (!dailyAct) return 0;
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (dailyAct[key] && dailyAct[key].q > 0) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Track daily activity.
 */
export function trackDailyActivity(dailyAct) {
  const today = new Date().toISOString().slice(0, 10);
  if (!dailyAct[today]) dailyAct[today] = { q: 0, ok: 0, time: 0, sessions: 0 };
  dailyAct[today].q++;
  // Keep only last 90 days
  const keys = Object.keys(dailyAct).sort();
  while (keys.length > 90) { delete dailyAct[keys.shift()]; }
}
