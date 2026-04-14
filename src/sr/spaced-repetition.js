/**
 * Spaced repetition wrapper.
 *
 * Thin layer around FSRS (shared/fsrs.js) that provides
 * convenience functions for the app's SR needs.
 *
 * FSRS functions are loaded globally from shared/fsrs.js.
 */

/* global fsrsR, fsrsInterval, isChronicFail */

/**
 * Get all questions due for review.
 *
 * @param {object} sr - S.sr object
 * @param {number} [limit=20] - max questions to return
 * @returns {number[]} Array of question indices due for review
 */
export function getDueQuestions(sr, limit = 20) {
  const now = Date.now();
  return Object.entries(sr)
    .filter(([, v]) => v.next <= now)
    .map(([k]) => parseInt(k))
    .slice(0, limit);
}

/**
 * Get retrievability for a question (how likely the user remembers it).
 *
 * @param {object} srEntry - S.sr[qIdx]
 * @returns {number} 0–1 retrievability
 */
export function getRetrievability(srEntry) {
  if (!srEntry || !srEntry.fsrsS || !srEntry.lastReview) return 0;
  const daysSince = Math.max(0, (Date.now() - srEntry.lastReview) / 86400000);
  return fsrsR(daysSince, srEntry.fsrsS);
}

/**
 * Get the next review interval in days for a question.
 *
 * @param {object} srEntry - S.sr[qIdx]
 * @returns {number} days until next review
 */
export function getNextInterval(srEntry) {
  if (!srEntry || !srEntry.fsrsS) return 1;
  return fsrsInterval(srEntry.fsrsS);
}

/**
 * Check if a question is a chronic failure.
 *
 * @param {object} srEntry - S.sr[qIdx]
 * @returns {boolean}
 */
export function isChronicFailure(srEntry) {
  return isChronicFail(srEntry);
}

/**
 * Track chapter reading for spaced reading feature.
 *
 * @param {object} chReads - S.chReads object (mutated)
 * @param {string} source - 'hazzard' or 'harrison'
 * @param {string} ch - chapter identifier
 */
export function trackChapterRead(chReads, source, ch) {
  const key = source + '_' + ch;
  chReads[key] = Date.now();
}

/**
 * Get chapters due for re-reading.
 *
 * @param {object} chReads - S.chReads object
 * @param {string} source - 'hazzard' or 'harrison'
 * @param {number} dayThreshold - days since last read to be considered due
 * @returns {Array<{ ch: string, daysSince: number, ts: number }>}
 */
export function getChaptersDueForReading(chReads, source, dayThreshold = 30) {
  if (!chReads) return [];
  const now = Date.now();
  const due = [];
  Object.entries(chReads).forEach(([key, ts]) => {
    if (!key.startsWith(source + '_')) return;
    const ch = key.split('_')[1];
    const daysSince = Math.floor((now - ts) / 86400000);
    if (daysSince >= dayThreshold) due.push({ ch, daysSince, ts });
  });
  return due.sort((a, b) => b.daysSince - a.daysSince);
}
