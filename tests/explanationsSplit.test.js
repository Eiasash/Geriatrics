/**
 * v10.64.93 mobile-perf split — `e` field moved out of questions.json into
 * explanations.json (~43% smaller questions.json on first load on Slow 3G).
 *
 * Pinned contracts:
 *   1. data/explanations.json exists and is a JSON array of strings.
 *   2. explanations.length === questions.length (1:1 by Q position index).
 *   3. Every entry is a non-empty string ≥10 chars (mirrors the historical
 *      regressionGuards `q.e.trim().length >= 10` invariant, just relocated).
 *   4. No Q in data/questions.json carries an `e` key — it has been split out.
 *      (This is the inverse-drift guard: catches the case where a future
 *      writer adds `e` to questions.json without updating explanations.json.)
 *   5. shlav-a-mega.html declares `let EX=[]` and the `_exPromise` idle-fetch.
 *   6. sw.js JSON_DATA_URLS includes 'data/explanations.json' so the SW
 *      best-effort caches it on install.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

let questions, explanations, html, sw;

beforeAll(() => {
  questions = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));
  explanations = JSON.parse(readFileSync(resolve(ROOT, 'data/explanations.json'), 'utf-8'));
  html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');
  sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf-8');
});

describe('v10.64.93 e-split — data/explanations.json', () => {
  it('exists on disk', () => {
    expect(existsSync(resolve(ROOT, 'data/explanations.json'))).toBe(true);
  });

  it('is an array of strings', () => {
    expect(Array.isArray(explanations)).toBe(true);
    const nonStr = explanations.findIndex(e => typeof e !== 'string');
    expect(nonStr, `index ${nonStr} is not a string`).toBe(-1);
  });

  it('length matches questions.json (1:1 by Q position)', () => {
    expect(explanations.length).toBe(questions.length);
  });

  it('every explanation is ≥10 chars (was the regressionGuards invariant)', () => {
    const tooShort = [];
    explanations.forEach((e, i) => {
      if (typeof e !== 'string' || e.trim().length < 10) tooShort.push({ i, len: (e || '').length });
    });
    expect(tooShort.length, `${tooShort.length} explanations <10 chars; first 5 ${JSON.stringify(tooShort.slice(0, 5))}`).toBe(0);
  });

  it('no Q in questions.json carries an `e` key (inverse-drift guard)', () => {
    const offenders = [];
    questions.forEach((q, i) => {
      if ('e' in q) offenders.push({ i, len: typeof q.e === 'string' ? q.e.length : 0 });
    });
    expect(offenders.length, `${offenders.length} questions still carry e; first 5 ${JSON.stringify(offenders.slice(0, 5))}`).toBe(0);
  });
});

describe('v10.64.93 e-split — runtime wiring', () => {
  it('shlav-a-mega.html declares `let EX=[]` near the QZ declaration', () => {
    expect(html).toMatch(/let\s+EX\s*=\s*\[\]\s*;/);
  });

  it('shlav-a-mega.html declares _exPromise that fetches data/explanations.json', () => {
    expect(html).toMatch(/_exPromise\s*=/);
    expect(html).toMatch(/fetch\(['"]\.\/data\/explanations\.json['"]\)/);
  });

  it('shlav-a-mega.html backfills q.e from EX[pool[qi]] before the explanation render', () => {
    // The backfill is single-line and idempotent: only triggers when q.e is
    // missing AND EX has loaded. Ensures the existing q.e read sites
    // (qLang(q,"e"), q.e_issue ternary) downstream see hydrated content.
    expect(html).toMatch(/!q\.e&&Array\.isArray\(EX\)&&EX\[pool\[qi\]\]\s*\)\s*q\.e\s*=\s*EX\[pool\[qi\]\]/);
  });

  it('sw.js JSON_DATA_URLS includes data/explanations.json', () => {
    expect(sw).toMatch(/JSON_DATA_URLS\s*=\s*\[[^\]]*['"]data\/explanations\.json['"]/);
  });
});
