/**
 * Quiz pool filtering logic.
 *
 * Pure functions that build filtered question pools from the question array
 * and user state. No DOM dependencies.
 */

/**
 * Shuffle an array in place (Fisher-Yates).
 */
export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Get topic-level accuracy stats from SR data.
 * @param {Array} questions - QZ array
 * @param {object} sr - S.sr object
 * @param {Array} topics - TOPICS array
 * @returns {object} { topicIndex: { ok, no, tot } }
 */
export function getTopicStats(questions, sr, topics) {
  const stats = {};
  topics.forEach((_, i) => {
    stats[i] = { ok: 0, no: 0, tot: 0 };
  });
  questions.forEach((q, i) => {
    const s = sr[i];
    if (s && s.tot) {
      if (!stats[q.ti]) stats[q.ti] = { ok: 0, no: 0, tot: 0 };
      stats[q.ti].ok += s.ok || 0;
      stats[q.ti].no += (s.tot - (s.ok || 0));
      stats[q.ti].tot += s.tot;
    }
  });
  return stats;
}

/**
 * Check if a question is an "exam trap" — >40% pick the same wrong distractor.
 */
export function isExamTrap(sr, qIdx) {
  const s = sr[qIdx];
  if (!s || !s.wc) return false;
  const totalAttempts = s.tot || 0;
  if (totalAttempts < 3) return false;
  const wrongValues = Object.values(s.wc);
  if (!wrongValues.length) return false;
  const maxWrong = Math.max(...wrongValues);
  return maxWrong / totalAttempts >= 0.4;
}

/**
 * Get questions that are due for spaced repetition review.
 */
export function getDueQuestions(sr) {
  const now = Date.now();
  return Object.entries(sr)
    .filter(([, v]) => v.next <= now)
    .map(([k]) => parseInt(k))
    .slice(0, 20);
}

/**
 * Build the question pool based on the current filter.
 *
 * @param {object} opts
 * @param {Array} opts.questions - QZ array
 * @param {object} opts.sr - S.sr object
 * @param {Array} opts.topics - TOPICS array
 * @param {string} opts.filter - 'all','due','weak','hard','slow','traps','topic','rescue'
 * @param {number} opts.topicFilter - topic index for 'topic' filter (-1 = none)
 * @returns {number[]} Array of question indices
 */
export function buildPool({ questions, sr, topics, filter, topicFilter }) {
  if (filter === 'traps') {
    const pool = questions.map((_, i) => i).filter((i) => isExamTrap(sr, i));
    return shuffle(pool);
  }

  if (filter === 'weak') {
    const ts = getTopicStats(questions, sr, topics);
    const weakTopics = topics
      .map((_, i) => ({ i, s: ts[i] || { ok: 0, no: 0, tot: 0 } }))
      .filter((p) => p.s.tot >= 3)
      .sort((a, b) => {
        const pa = a.s.tot ? a.s.ok / a.s.tot : 0;
        const pb = b.s.tot ? b.s.ok / b.s.tot : 0;
        return pa - pb;
      })
      .slice(0, 10)
      .map((p) => p.i);

    let pool;
    if (weakTopics.length === 0) {
      pool = questions.map((_, i) => i);
    } else {
      pool = questions.map((_, i) => i).filter((i) => weakTopics.includes(questions[i].ti));
    }
    return shuffle(pool);
  }

  if (filter === 'due') {
    return getDueQuestions(sr);
  }

  if (filter === 'hard') {
    let pool = questions
      .map((_, i) => i)
      .filter((i) => {
        const s = sr[i];
        return s && s.ef < 2.5;
      });
    pool.sort((a, b) => (sr[a]?.ef || 2.5) - (sr[b]?.ef || 2.5));
    if (!pool.length) {
      pool = questions
        .map((_, i) => i)
        .filter((i) => sr[i]);
      pool.sort((a, b) => (sr[a]?.ef || 2.5) - (sr[b]?.ef || 2.5));
    }
    return pool;
  }

  if (filter === 'slow') {
    const pool = questions
      .map((_, i) => i)
      .filter((i) => {
        const s = sr[i];
        return s && s.at && s.at > 60;
      });
    pool.sort((a, b) => (sr[b]?.at || 0) - (sr[a]?.at || 0));
    return pool;
  }

  if (filter === 'topic' && topicFilter >= 0) {
    const pool = [];
    questions.forEach((q, i) => {
      if (q.ti === topicFilter) pool.push(i);
    });
    return shuffle(pool);
  }

  // Default: 'all' or year filter
  const pool = [];
  questions.forEach((q, i) => {
    if (filter === 'all' || q.t.includes(filter)) pool.push(i);
  });

  if (filter === 'all') {
    // Smart shuffle: prioritize struggling questions
    const dueSet = new Set(getDueQuestions(sr));
    const tier1 = [], tier2 = [], tier3 = [], tier4 = [];
    pool.forEach((i) => {
      const s = sr[i];
      if (dueSet.has(i)) tier1.push(i);
      else if (s && (s.fsrsD > 7 || (s.fsrsD === undefined && s.ef < 1.8))) tier2.push(i);
      else if (s && (s.fsrsD > 4 || (s.fsrsD === undefined && s.ef < 2.2))) tier3.push(i);
      else tier4.push(i);
    });
    return [...shuffle(tier1), ...shuffle(tier2), ...shuffle(tier3), ...shuffle(tier4)];
  }

  return shuffle(pool);
}

/**
 * Get the N weakest topics by accuracy.
 */
export function getWeakTopics(questions, sr, topics, n = 3) {
  const stats = getTopicStats(questions, sr, topics);
  return Object.entries(stats)
    .map(([ti, s]) => ({
      ti: Number(ti),
      pct: s.tot ? Math.round((s.ok / s.tot) * 100) : null,
      tot: s.tot,
      ok: s.ok,
    }))
    .filter((s) => s.tot >= 3)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, n);
}

/**
 * Build rescue drill pool from weakest topics.
 */
export function buildRescuePool(questions, sr, topics) {
  const weak = getWeakTopics(questions, sr, topics, 3);
  if (!weak.length) return [];

  const rescueQs = [];
  weak.forEach((w) => {
    const topicQs = questions
      .map((q, i) => ({ i, q }))
      .filter((x) => x.q.ti === w.ti);
    topicQs.sort((a, b) => {
      const sa = sr[a.i], sb = sr[b.i];
      const pa = sa && sa.tot ? sa.ok / sa.tot : 0.5;
      const pb = sb && sb.tot ? sb.ok / sb.tot : 0.5;
      return pa - pb;
    });
    rescueQs.push(...topicQs.slice(0, 7).map((x) => x.i));
  });

  return shuffle(rescueQs);
}
