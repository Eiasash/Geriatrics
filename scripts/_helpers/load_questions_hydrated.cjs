/**
 * Shared CJS hydrator: load data/questions.json with `e` field rehydrated
 * from data/explanations.json. v10.64.93 split `e` out of questions.json into
 * explanations.json (43% smaller questions.json on first load); scripts that
 * scan q.e text would silently drift if they only read questions.json.
 *
 * Mirror of tests/_helpers/loadQuestionsHydrated.js (ESM version for tests).
 *
 * Usage:
 *   const { loadQuestionsHydrated } = require('./_helpers/load_questions_hydrated.cjs');
 *   const qs = loadQuestionsHydrated(path.resolve(__dirname, '..'));
 */
const fs = require('fs');
const path = require('path');

function loadQuestionsHydrated(root) {
  const qPath = path.resolve(root, 'data', 'questions.json');
  const ePath = path.resolve(root, 'data', 'explanations.json');
  const qs = JSON.parse(fs.readFileSync(qPath, 'utf-8'));
  if (fs.existsSync(ePath)) {
    const ex = JSON.parse(fs.readFileSync(ePath, 'utf-8'));
    if (Array.isArray(ex) && ex.length === qs.length) {
      qs.forEach((q, i) => {
        if ((q.e === undefined || q.e === null || q.e === '') && ex[i]) {
          q.e = ex[i];
        }
      });
    }
  }
  return qs;
}

module.exports = { loadQuestionsHydrated };
