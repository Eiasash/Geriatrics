import { describe, it, expect } from 'vitest';
import {
  shuffle,
  getTopicStats,
  isExamTrap,
  getDueQuestions,
  buildPool,
  getWeakTopics,
  buildRescuePool,
} from '../src/quiz/quiz-filters.js';

// ===== HELPERS =====
function makeQuestions(n, topicFn = (i) => i % 5) {
  return Array.from({ length: n }, (_, i) => ({
    q: `Question ${i}`,
    o: ['A', 'B', 'C', 'D'],
    c: 0,
    t: '2024',
    ti: topicFn(i),
  }));
}

function makeSR(entries) {
  // entries: { qIdx: { ok, tot, ef, next, ... } }
  const sr = {};
  for (const [k, v] of Object.entries(entries)) {
    sr[k] = {
      ef: v.ef ?? 2.5,
      n: v.n ?? 0,
      next: v.next ?? 0,
      ts: [],
      at: v.at ?? 0,
      tot: v.tot ?? 0,
      ok: v.ok ?? 0,
      fsrsS: v.fsrsS,
      fsrsD: v.fsrsD,
      wc: v.wc,
    };
  }
  return sr;
}

const TOPICS = ['T0', 'T1', 'T2', 'T3', 'T4'];

// ===== TESTS =====

describe('shuffle', () => {
  it('returns the same array reference', () => {
    const arr = [1, 2, 3, 4, 5];
    const result = shuffle(arr);
    expect(result).toBe(arr);
  });

  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    shuffle(arr);
    expect([...arr].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('handles empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(shuffle([42])).toEqual([42]);
  });
});

describe('getTopicStats', () => {
  it('returns stats per topic', () => {
    const questions = makeQuestions(10);
    const sr = makeSR({
      0: { ok: 3, tot: 5 },  // topic 0
      5: { ok: 2, tot: 4 },  // topic 0 (5 % 5 = 0)
    });
    const stats = getTopicStats(questions, sr, TOPICS);
    // Both q0 and q5 map to topic 0, so they sum
    expect(stats[0].ok).toBe(5);
    expect(stats[0].tot).toBe(9);
    expect(stats[0].no).toBe(4);
  });

  it('initializes all topics to zero', () => {
    const questions = makeQuestions(10);
    const stats = getTopicStats(questions, {}, TOPICS);
    TOPICS.forEach((_, i) => {
      expect(stats[i]).toEqual({ ok: 0, no: 0, tot: 0 });
    });
  });
});

describe('isExamTrap', () => {
  it('returns false for unseen questions', () => {
    expect(isExamTrap({}, 0)).toBe(false);
  });

  it('returns false when too few attempts', () => {
    const sr = makeSR({ 0: { tot: 2, wc: { 1: 2 } } });
    expect(isExamTrap(sr, 0)).toBe(false);
  });

  it('returns true when >40% pick same wrong distractor', () => {
    const sr = makeSR({ 0: { tot: 10, wc: { 1: 5 } } });
    expect(isExamTrap(sr, 0)).toBe(true);
  });

  it('returns false when wrong choices are spread out', () => {
    const sr = makeSR({ 0: { tot: 10, wc: { 1: 2, 2: 1, 3: 1 } } });
    expect(isExamTrap(sr, 0)).toBe(false);
  });
});

describe('getDueQuestions', () => {
  it('returns questions with next <= now', () => {
    const sr = makeSR({
      0: { next: Date.now() - 1000 },
      1: { next: Date.now() + 86400000 },
      2: { next: Date.now() - 500 },
    });
    const due = getDueQuestions(sr);
    expect(due).toContain(0);
    expect(due).toContain(2);
    expect(due).not.toContain(1);
  });

  it('returns empty array when nothing is due', () => {
    const sr = makeSR({
      0: { next: Date.now() + 86400000 },
    });
    expect(getDueQuestions(sr)).toEqual([]);
  });

  it('limits to 20 results', () => {
    const entries = {};
    for (let i = 0; i < 30; i++) {
      entries[i] = { next: Date.now() - 1000 };
    }
    const sr = makeSR(entries);
    expect(getDueQuestions(sr).length).toBe(20);
  });
});

describe('buildPool', () => {
  const questions = makeQuestions(20);
  const sr = {};

  it('builds "all" pool with all questions', () => {
    const pool = buildPool({ questions, sr, topics: TOPICS, filter: 'all', topicFilter: -1 });
    expect(pool.length).toBe(20);
    // Check all indices present
    expect(pool.sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it('builds "topic" pool filtering by topic index', () => {
    const pool = buildPool({ questions, sr, topics: TOPICS, filter: 'topic', topicFilter: 0 });
    pool.forEach((i) => expect(questions[i].ti).toBe(0));
    expect(pool.length).toBe(4); // 20 questions, 5 topics, 4 per topic
  });

  it('builds "due" pool from SR data', () => {
    const dueSR = makeSR({
      3: { next: Date.now() - 1000 },
      7: { next: Date.now() - 500 },
    });
    const pool = buildPool({ questions, sr: dueSR, topics: TOPICS, filter: 'due', topicFilter: -1 });
    expect(pool).toContain(3);
    expect(pool).toContain(7);
  });

  it('builds "hard" pool sorted by easiness factor', () => {
    const hardSR = makeSR({
      0: { ef: 1.3 },
      5: { ef: 2.0 },
      10: { ef: 2.5 },
    });
    const pool = buildPool({ questions, sr: hardSR, topics: TOPICS, filter: 'hard', topicFilter: -1 });
    expect(pool[0]).toBe(0); // lowest ef first
    expect(pool[1]).toBe(5);
    expect(pool).not.toContain(10); // ef=2.5 excluded
  });

  it('builds "slow" pool sorted by answer time', () => {
    const slowSR = makeSR({
      0: { at: 120 },
      5: { at: 90 },
      10: { at: 30 },
    });
    const pool = buildPool({ questions, sr: slowSR, topics: TOPICS, filter: 'slow', topicFilter: -1 });
    expect(pool[0]).toBe(0); // slowest first
    expect(pool[1]).toBe(5);
    expect(pool).not.toContain(10); // at=30 < 60 threshold
  });

  it('builds "traps" pool from exam trap questions', () => {
    const trapSR = makeSR({
      0: { tot: 10, wc: { 1: 5 } },
      5: { tot: 10, wc: { 1: 2, 2: 1 } },
    });
    const pool = buildPool({ questions, sr: trapSR, topics: TOPICS, filter: 'traps', topicFilter: -1 });
    expect(pool).toContain(0);
    expect(pool).not.toContain(5);
  });

  it('builds year-filtered pool', () => {
    const yearQs = [
      { q: 'Q1', o: ['A', 'B', 'C', 'D'], c: 0, t: '2022', ti: 0 },
      { q: 'Q2', o: ['A', 'B', 'C', 'D'], c: 0, t: '2023', ti: 0 },
      { q: 'Q3', o: ['A', 'B', 'C', 'D'], c: 0, t: '2022', ti: 0 },
    ];
    const pool = buildPool({ questions: yearQs, sr: {}, topics: TOPICS, filter: '2022', topicFilter: -1 });
    expect(pool.length).toBe(2);
    pool.forEach((i) => expect(yearQs[i].t).toContain('2022'));
  });
});

describe('getWeakTopics', () => {
  it('returns topics sorted by accuracy (worst first)', () => {
    const questions = makeQuestions(20);
    const sr = makeSR({
      0: { ok: 1, tot: 5 },  // topic 0: 20%
      1: { ok: 4, tot: 5 },  // topic 1: 80%
      5: { ok: 0, tot: 4 },  // topic 0: 0% (adds to topic 0)
      6: { ok: 3, tot: 4 },  // topic 1: 75%
      2: { ok: 2, tot: 3 },  // topic 2: 67%
    });
    const weak = getWeakTopics(questions, sr, TOPICS, 2);
    expect(weak.length).toBe(2);
    expect(weak[0].ti).toBe(0); // worst accuracy
  });

  it('excludes topics with < 3 attempts', () => {
    const questions = makeQuestions(10);
    const sr = makeSR({
      0: { ok: 0, tot: 2 },
      1: { ok: 1, tot: 3 },
    });
    const weak = getWeakTopics(questions, sr, TOPICS, 5);
    const tis = weak.map((w) => w.ti);
    expect(tis).not.toContain(0); // only 2 attempts
  });
});

describe('buildRescuePool', () => {
  it('returns empty array when no weak topics', () => {
    const questions = makeQuestions(10);
    const pool = buildRescuePool(questions, {}, TOPICS);
    expect(pool).toEqual([]);
  });

  it('builds pool from weakest topics, max 7 per topic', () => {
    const questions = makeQuestions(50, (i) => i % 5);
    const sr = {};
    // Make topic 0 weak
    for (let i = 0; i < 50; i += 5) {
      sr[i] = { ef: 2.5, n: 0, next: 0, ts: [], at: 0, tot: 5, ok: 1 };
    }
    // Make topic 1 strong
    for (let i = 1; i < 50; i += 5) {
      sr[i] = { ef: 2.5, n: 0, next: 0, ts: [], at: 0, tot: 5, ok: 5 };
    }
    const pool = buildRescuePool(questions, sr, TOPICS);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThanOrEqual(21); // 3 topics × 7
  });
});
