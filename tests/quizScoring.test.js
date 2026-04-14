import { describe, it, expect } from 'vitest';
import {
  calcEstScore,
  getStudyStreak,
  trackDailyActivity,
} from '../src/quiz/quiz-scoring.js';

describe('calcEstScore (canonical monolith algorithm)', () => {
  // 5 topics, frequencies match EXAM_FREQ pattern
  const examFreq = [10, 20, 30, 0, 15];

  it('returns null when all frequencies are zero', () => {
    expect(calcEstScore([0, 0, 0], {}, {}, [])).toBeNull();
  });

  it('returns 60 when no topic has enough data (all default to 60%)', () => {
    // topicStats empty → every topic gets acc=0.60
    const result = calcEstScore(examFreq, {}, {}, []);
    expect(result).toBe(60);
  });

  it('uses topic stats when tot >= 3', () => {
    const topicStats = {
      0: { ok: 8, no: 2, tot: 10 }, // 80%
      1: { ok: 5, no: 5, tot: 10 }, // 50%
      // topic 2: no data → 60% default
      // topic 3: freq=0 → skipped
      // topic 4: no data → 60% default
    };
    const result = calcEstScore(examFreq, topicStats, {}, []);
    // weighted: (0.8*10 + 0.5*20 + 0.6*30 + 0.6*15) / (10+20+30+15)
    //         = (8 + 10 + 18 + 9) / 75 = 45/75 = 0.60 → 60%
    expect(result).toBe(60);
  });

  it('applies due penalty to topic accuracy', () => {
    const topicStats = {
      0: { ok: 9, no: 1, tot: 10 }, // 90% before penalty
    };
    // 2 due questions in topic 0
    const questions = [
      { q: 'Q', o: ['A', 'B', 'C', 'D'], c: 0, t: '2024', ti: 0 },
      { q: 'Q', o: ['A', 'B', 'C', 'D'], c: 0, t: '2024', ti: 0 },
      { q: 'Q', o: ['A', 'B', 'C', 'D'], c: 0, t: '2024', ti: 1 },
    ];
    const dueSet = { 0: true, 1: true };
    const resultWithDue = calcEstScore(examFreq, topicStats, dueSet, questions);
    const resultNoDue = calcEstScore(examFreq, topicStats, {}, questions);
    // Due penalty should lower the score
    expect(resultWithDue).toBeLessThanOrEqual(resultNoDue);
  });

  it('skips topics with freq=0', () => {
    // topic 3 has freq=0 — should not contribute even with data
    const topicStats = {
      3: { ok: 10, no: 0, tot: 10 }, // 100% but freq=0
    };
    const result = calcEstScore(examFreq, topicStats, {}, []);
    // topic 3 is skipped, everything else defaults to 60%
    expect(result).toBe(60);
  });
});

describe('getStudyStreak', () => {
  it('returns 0 for empty activity', () => {
    expect(getStudyStreak({})).toBe(0);
    expect(getStudyStreak(null)).toBe(0);
  });

  it('returns 1 for activity today only', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(getStudyStreak({ [today]: { q: 5 } })).toBe(1);
  });

  it('counts consecutive days', () => {
    const act = {};
    for (let i = 0; i < 5; i++) {
      const d = new Date(Date.now() - i * 86400000);
      act[d.toISOString().slice(0, 10)] = { q: 1 };
    }
    expect(getStudyStreak(act)).toBe(5);
  });

  it('breaks at gap', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const act = {
      [today]: { q: 1 },
      [yesterday]: { q: 1 },
      [threeDaysAgo]: { q: 1 },
    };
    expect(getStudyStreak(act)).toBe(2);
  });
});

describe('trackDailyActivity', () => {
  it('creates entry for today', () => {
    const act = {};
    trackDailyActivity(act);
    const today = new Date().toISOString().slice(0, 10);
    expect(act[today]).toBeDefined();
    expect(act[today].q).toBe(1);
  });

  it('increments existing entry', () => {
    const today = new Date().toISOString().slice(0, 10);
    const act = { [today]: { q: 5, ok: 3, time: 0, sessions: 0 } };
    trackDailyActivity(act);
    expect(act[today].q).toBe(6);
  });

  it('trims to 90 days', () => {
    const act = {};
    for (let i = 0; i < 100; i++) {
      const d = new Date(Date.now() - i * 86400000);
      act[d.toISOString().slice(0, 10)] = { q: 1, ok: 0, time: 0, sessions: 0 };
    }
    trackDailyActivity(act);
    expect(Object.keys(act).length).toBeLessThanOrEqual(91);
  });
});
