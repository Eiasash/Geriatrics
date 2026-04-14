import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  defaultState,
  migrateState,
  safeJSONParse,
  loadState,
  updateStreak,
} from '../src/core/state.js';

describe('defaultState', () => {
  it('returns an object with all required keys', () => {
    const s = defaultState();
    expect(s).toHaveProperty('ck');
    expect(s).toHaveProperty('qOk', 0);
    expect(s).toHaveProperty('qNo', 0);
    expect(s).toHaveProperty('bk');
    expect(s).toHaveProperty('sr');
    expect(s).toHaveProperty('streak', 0);
    expect(s).toHaveProperty('chat');
    expect(s).toHaveProperty('dark', false);
    expect(s).toHaveProperty('studyMode', false);
    expect(s).toHaveProperty('sp');
    expect(s).toHaveProperty('dailyAct');
    expect(s).toHaveProperty('chReads');
  });

  it('returns a fresh object each time', () => {
    const a = defaultState();
    const b = defaultState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('migrateState', () => {
  it('returns default state for null input', () => {
    const s = migrateState(null);
    expect(s).toEqual(defaultState());
  });

  it('returns default state for non-object input', () => {
    expect(migrateState('broken')).toEqual(defaultState());
    expect(migrateState(42)).toEqual(defaultState());
    expect(migrateState(undefined)).toEqual(defaultState());
  });

  it('preserves existing data and fills missing keys', () => {
    const old = { qOk: 50, qNo: 10, ck: { a: true } };
    const s = migrateState(old);
    expect(s.qOk).toBe(50);
    expect(s.qNo).toBe(10);
    expect(s.ck).toEqual({ a: true });
    // Added missing keys
    expect(s.streak).toBe(0);
    expect(s.chat).toEqual([]);
    expect(s.sr).toEqual({});
    expect(s.dailyAct).toEqual({});
  });

  it('fixes corrupted chat field', () => {
    const old = { chat: 'not-an-array' };
    const s = migrateState(old);
    expect(Array.isArray(s.chat)).toBe(true);
    expect(s.chat).toEqual([]);
  });

  it('fixes corrupted streak field', () => {
    const old = { streak: 'NaN' };
    const s = migrateState(old);
    expect(s.streak).toBe(0);
  });

  it('fixes corrupted sp field', () => {
    const old = { sp: null };
    const s = migrateState(old);
    expect(s.sp).toEqual({});
  });

  it('stamps state version', () => {
    const s = migrateState({});
    expect(s._v).toBe(1);
  });
});

describe('safeJSONParse', () => {
  it('parses valid JSON', () => {
    expect(safeJSONParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeJSONParse('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(safeJSONParse('"hello"', '')).toBe('hello');
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJSONParse('{broken', 'default')).toBe('default');
    expect(safeJSONParse('undefined', [])).toEqual([]);
  });

  it('returns fallback for null/undefined', () => {
    expect(safeJSONParse(null, 'fb')).toBe('fb');
    expect(safeJSONParse(undefined, 'fb')).toBe('fb');
  });
});

describe('loadState', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      hasOwnProperty: vi.fn(() => false),
    });
  });

  it('returns default state when localStorage is empty', () => {
    localStorage.getItem.mockReturnValue(null);
    const s = loadState();
    expect(s.qOk).toBe(0);
    expect(s.streak).toBe(0);
  });

  it('loads and migrates stored state', () => {
    localStorage.getItem.mockReturnValue(JSON.stringify({ qOk: 100, qNo: 20 }));
    const s = loadState();
    expect(s.qOk).toBe(100);
    expect(s.qNo).toBe(20);
    expect(s.streak).toBe(0); // filled from default
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.getItem.mockReturnValue('{broken json!!!');
    const s = loadState();
    expect(s).toEqual(defaultState());
  });
});

describe('updateStreak', () => {
  it('starts streak at 1 on first day', () => {
    const s = { streak: 0, lastDay: null };
    updateStreak(s);
    expect(s.streak).toBe(1);
    expect(s.lastDay).toBe(new Date().toISOString().slice(0, 10));
  });

  it('increments streak for consecutive day', () => {
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const s = { streak: 5, lastDay: yest };
    updateStreak(s);
    expect(s.streak).toBe(6);
  });

  it('resets streak after gap', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const s = { streak: 5, lastDay: twoDaysAgo };
    updateStreak(s);
    expect(s.streak).toBe(1);
  });

  it('does not change streak if already updated today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const s = { streak: 3, lastDay: today };
    updateStreak(s);
    expect(s.streak).toBe(3);
  });
});
