/**
 * Schema + wiring guards for the v10.41.0 tis[] reclassification.
 *
 * Background: v10.41.0 added an optional `tis` array (1-3 ranked topic
 * indices) to every question. The pool builder now OR-matches a Q's
 * topicFilt against `q.tis` when present, falling back to legacy `q.ti`.
 *
 * What this test catches:
 *   1. tis[] schema violations — out-of-range, dupes, non-integer.
 *   2. Pool builder regression — the OR-match logic falling back to ti-only.
 *   3. TOPICS array shrinking back to 43 (must be 46 to match topics.json).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const questions = JSON.parse(readFileSync(resolve(rootDir, 'data/questions.json'), 'utf-8'));
const topicsJson = JSON.parse(readFileSync(resolve(rootDir, 'data/topics.json'), 'utf-8'));

describe('v10.41.0 — TOPICS array extension', () => {
  it('shlav-a-mega.html declares 46 TOPICS (was 43, must match topics.json)', () => {
    const m = html.match(/const TOPICS=(\[[^\]]+\]);/);
    expect(m, 'TOPICS literal not found').toBeTruthy();
    const arr = JSON.parse(m[1]);
    expect(arr.length, 'TOPICS must have 46 entries to match data/topics.json').toBe(46);
    expect(arr.length).toBe(topicsJson.length);
  });

  it('TOPICS includes Andropause, Prevention, Interdisciplinary Care', () => {
    const m = html.match(/const TOPICS=(\[[^\]]+\]);/);
    const arr = JSON.parse(m[1]);
    expect(arr).toContain('Andropause');
    expect(arr).toContain('Prevention');
    expect(arr.some(t => /Interdisciplinary/i.test(t))).toBe(true);
  });
});

describe('v10.41.0 — tis[] schema (when present)', () => {
  it('every q.tis (when present) is an array of 1-3 distinct integers in [0, 46)', () => {
    const violations = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!('tis' in q)) continue;
      const tis = q.tis;
      if (!Array.isArray(tis)) {
        violations.push({ i, why: 'not array', tis });
        continue;
      }
      if (tis.length < 1 || tis.length > 3) {
        violations.push({ i, why: 'length', len: tis.length });
        continue;
      }
      for (const t of tis) {
        if (!Number.isInteger(t) || t < 0 || t >= 46) {
          violations.push({ i, why: 'oob', t });
          break;
        }
      }
      if (new Set(tis).size !== tis.length) {
        violations.push({ i, why: 'dupes', tis });
      }
    }
    expect(violations.slice(0, 5), `violations: ${JSON.stringify(violations.slice(0, 5))}`).toEqual([]);
  });

  it('q.tis[0] equals q.ti (primary topic must agree with legacy ti)', () => {
    // After reclassification the primary should BECOME the new ti — so we
    // also expect q.ti to have been bumped to match. If they disagree, the
    // merge step missed updating q.ti from q.tis[0].
    const mismatches = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!Array.isArray(q.tis) || !q.tis.length) continue;
      if (q.tis[0] !== q.ti) {
        mismatches.push({ i, ti: q.ti, primary: q.tis[0] });
      }
    }
    // Once tis[] is fully merged, this should be 0.
    expect(mismatches.slice(0, 5), `tis[0]≠ti mismatches: ${JSON.stringify(mismatches.slice(0, 5))}`).toEqual([]);
  });
});

describe('v10.41.0 — pool builder OR-matches tis[]', () => {
  it("'topic' filter prefers q.tis OR-match, falls back to q.ti when tis is absent", () => {
    // Locate the topic-filter pool branch
    const m = html.match(/filt===['"]topic['"][\s\S]{0,400}?topicFilt[\s\S]{0,400}?pool\.push/);
    expect(m, 'topic filter branch not found').toBeTruthy();
    const code = m[0];
    expect(code).toMatch(/q\.tis/);
    expect(code).toMatch(/Array\.isArray\(q\.tis\)/);
    expect(code).toMatch(/q\.tis\.includes/);
    expect(code).toMatch(/q\.ti===topicFilt/); // legacy fallback
  });

  it('startTopicMiniExam pool builder OR-matches tis[] OR ti', () => {
    const m = html.match(/function\s+startTopicMiniExam\s*\([\s\S]*?render\(\);\s*\}/);
    expect(m, 'startTopicMiniExam not found').toBeTruthy();
    const code = m[0];
    expect(code).toMatch(/q\.tis/);
    expect(code).toMatch(/q\.ti===ti/);
  });

  it("'weak' filter pool considers q.tis when present", () => {
    const m = html.match(/filt===['"]weak['"][\s\S]{0,800}?qi\s*=\s*0\s*;\s*return\s*;/);
    expect(m, 'weak filter branch not found').toBeTruthy();
    const code = m[0];
    expect(code).toMatch(/q\.tis/);
    expect(code).toMatch(/weakSet/);
  });
});
