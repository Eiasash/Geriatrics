import { describe, it, expect } from 'vitest';
import {
  calcEstScore,
  getStudyStreak,
  trackDailyActivity,
} from '../src/quiz/quiz-scoring.js';

describe('calcEstScore', () => {
  const weights = [5, 3, 6, 5, 8]; // 5 topics

  it('returns 0 when no SR data', () => {
    const questions = [
      { q: 'Q', o: ['A', 'B'], c: 0, t: '2024', ti: 0 },
    ];
    expect(calcEstScore(questions, {}, weights)).toBe(0);
  });

  it('calculates weighted score correctly', () => {
    const questions = [
      { q: 'Q0', o: ['A', 'B'], c: 0, t: '2024', ti: 0 },
      { q: 'Q1', o: ['A', 'B'], c: 0, t: '2024', ti: 0 },
      { q: 'Q2', o: ['A', 'B'], c: 0, t: '2024', ti: 1 },
      { q: 'Q3', o: ['A', 'B'], c: 0, t: '2024', ti: 1 },
      { q: 'Q4', o: ['A', 'B'], c: 0, t: '2024', ti: 1 },
    ];
    const sr = {
      0: { tot: 5, ok: 5 }, // topic 0: 100%
      1: { tot: 5, ok: 5 }, // topic 0: 100%
      2: { tot: 3, ok: 1 }, // topic 1: 33%
      3: { tot: 3, ok: 1 }, // topic 1: 33%
      4: { tot: 3, ok: 1 }, // topic 1: 33%
    };
    const score = calcEstScore(questions, sr, weights);
    // topic 0: 10/10 = 100%, weight 5
    // topic 1: 3/9 ≈ 33%, weight 3
    // weighted = (1.0*5 + 0.333*3) / (5+3) ≈ 75%
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThan(80);
  });

  it('excludes topics with < 3 attempts', () => {
    const questions = [
      { q: 'Q0', o: ['A', 'B'], c: 0, t: '2024', ti: 0 },
      { q: 'Q1', o: ['A', 'B'], c: 0, t: '2024', ti: 1 },
    ];
    const sr = {
      0: { tot: 2, ok: 2 }, // <3 attempts, excluded
      1: { tot: 5, ok: 5 }, // 100%
    };
    const score = calcEstScore(questions, sr, weights);
    expect(score).toBe(100); // only topic 1 counted
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
    // Skip a day, then have activity 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    const act = {
      [today]: { q: 1 },
      [yesterday]: { q: 1 },
      [threeDaysAgo]: { q: 1 },
    };
    expect(getStudyStreak(act)).toBe(2); // today + yesterday, then gap
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
    expect(Object.keys(act).length).toBeLessThanOrEqual(91); // 90 + today
  });
});
