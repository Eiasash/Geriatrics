/**
 * Quiz scoring, spaced repetition integration, and estimated score.
 *
 * Pure functions — no DOM dependencies.
 *
 * FSRS functions are loaded globally from shared/fsrs.js.
 */

/* global fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2 */

/**
 * Core FSRS scoring — mutates srEntry in place, no side effects.
 * This is the canonical implementation mirrored in src/bridge.js.
 *
 * @param {object} srEntry - The S.sr[qIdx] object (mutated)
 * @param {boolean} correct - was the answer correct
 * @param {number} qStartTime - timestamp when question was shown
 * @param {number|null} fsrsRating - explicit FSRS rating (1-4) or null for auto
 * @returns {object} The mutated srEntry
 */
export function srScoreCore(srEntry, correct, qStartTime, fsrsRating) {
  if (!srEntry.ef) srEntry.ef = 2.5;
  if (!srEntry.n) srEntry.n = 0;
  if (!srEntry.next) srEntry.next = 0;
  if (srEntry.tot === undefined) { srEntry.tot = 0; srEntry.ok = 0; }

  const elapsed = Math.round((Date.now() - qStartTime) / 1000);
  if (!srEntry.ts) srEntry.ts = [];
  srEntry.ts.push(elapsed);
  if (srEntry.ts.length > 10) srEntry.ts.shift();
  srEntry.at = Math.round(srEntry.ts.reduce((a, b) => a + b, 0) / srEntry.ts.length);
  srEntry.tot++;
  if (correct) srEntry.ok++;

  const rating = fsrsRating || (correct ? 3 : 1);
  const daysSinceReview = srEntry.lastReview
    ? Math.max(0, (Date.now() - srEntry.lastReview) / 86400000) : 0;

  if (srEntry.fsrsS === undefined || srEntry.fsrsD === undefined) {
    if (srEntry.n > 0 || srEntry.ef !== 2.5) {
      const mig = fsrsMigrateFromSM2(srEntry);
      srEntry.fsrsS = mig.s; srEntry.fsrsD = mig.d;
    } else {
      const init = fsrsInitNew(rating);
      srEntry.fsrsS = init.s; srEntry.fsrsD = init.d;
    }
  }

  const rPrev = daysSinceReview > 0 ? fsrsR(daysSinceReview, srEntry.fsrsS) : 1;
  const upd = fsrsUpdate(srEntry.fsrsS, srEntry.fsrsD, rPrev, rating);
  srEntry.fsrsS = Math.round(upd.s * 1000) / 1000;
  srEntry.fsrsD = Math.round(upd.d * 100) / 100;
  srEntry.lastReview = Date.now();

  const fsrsDays = fsrsInterval(srEntry.fsrsS);
  srEntry.next = Date.now() + fsrsDays * 86400000;

  srEntry.n = correct ? srEntry.n + 1 : 0;
  srEntry.ef = Math.round((2.5 - (srEntry.fsrsD - 1) / (10 - 1) * (2.5 - 1.3)) * 1000) / 1000;

  return srEntry;
}

/**
 * Calculate estimated exam score (canonical monolith algorithm).
 * Uses EXAM_FREQ weights + legacy topic stats + due penalty.
 *
 * @param {number[]} examFreq - EXAM_FREQ array (40 entries)
 * @param {object} topicStats - S.ts legacy topic stats { ti: {ok, no, tot} }
 * @param {object} dueSet - { qIdx: true } set of due question indices
 * @param {Array} questions - QZ array (for topic lookup)
 * @returns {number|null} Estimated percentage score
 */
export function calcEstScore(examFreq, topicStats, dueSet, questions) {
  const totalFreq = examFreq.reduce((a, b) => a + b, 0);
  if (!totalFreq) return null;

  let weightedScore = 0, totalWeight = 0;
  examFreq.forEach((freq, ti) => {
    if (!freq) return;
    const s = topicStats[ti] || { ok: 0, no: 0, tot: 0 };
    const weight = freq / totalFreq;
    let acc;
    if (s.tot < 3) {
      acc = 0.60;
    } else {
      acc = s.ok / s.tot;
      let duePenalty = 0;
      if (dueSet && questions) {
        for (let i = 0; i < questions.length; i++) {
          if (questions[i] && questions[i].ti === ti && dueSet[i]) duePenalty++;
        }
      }
      if (duePenalty > 0) acc = Math.max(0, acc - duePenalty * 0.02);
    }
    weightedScore += acc * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : null;
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
