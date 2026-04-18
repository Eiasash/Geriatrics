/**
 * Guards the time-to-answer signal feature added in 9.65.
 *
 * The feature has three surfaces:
 *   1. `_lastElapsed` is captured at `check()` time (before `srScore` resets qStartTime).
 *   2. `_rqmExplain()` renders a `.time-signal` widget comparing elapsed vs topic median.
 *   3. The ⏱️ Slow filter pill shows a count suffix via `slowQuestionCount()`.
 *
 * Strategy: source-level greps for wiring invariants + vm sandbox for the
 * pure helpers (`topicMedianTime`, `globalMedianTime`, `slowQuestionCount`)
 * extracted from the monolith, so we test the exact bytes that ship.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

/**
 * Pull `function <name>( ... ) { ... }` out of the monolith, brace-balanced.
 */
function extractFunction(src, name) {
  const sig = `function ${name}(`;
  const i = src.indexOf(sig);
  if (i < 0) throw new Error(`${name} not found in shlav-a-mega.html`);
  const openBrace = src.indexOf('{', i);
  let depth = 0;
  let end = -1;
  for (let j = openBrace; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = j; break; }
    }
  }
  if (end < 0) throw new Error(`Could not balance braces for ${name}`);
  return src.slice(i, end + 1);
}

describe('time-to-answer wiring (source-level guards)', () => {
  it('declares `let _lastElapsed=0;` as a top-level binding', () => {
    expect(html).toMatch(/let\s+_lastElapsed\s*=\s*0\s*;/);
  });

  it('captures _lastElapsed inside check() before srScore runs', () => {
    const checkBody = extractFunction(html, 'check');
    // Must assign _lastElapsed before any srScore() call inside check().
    const elapsedIdx = checkBody.indexOf('_lastElapsed');
    const srScoreIdx = checkBody.indexOf('srScore(');
    expect(elapsedIdx, 'check() must set _lastElapsed').toBeGreaterThan(-1);
    expect(srScoreIdx, 'check() must still call srScore').toBeGreaterThan(-1);
    expect(elapsedIdx, '_lastElapsed must be captured BEFORE srScore runs').toBeLessThan(srScoreIdx);
    // And uses the qStartTime diff (not a hardcoded zero).
    expect(checkBody).toMatch(/_lastElapsed\s*=\s*Math\.max\(\s*0\s*,\s*Math\.round\(\s*\(\s*Date\.now\(\)\s*-\s*qStartTime\s*\)\s*\/\s*1000\s*\)\s*\)\s*;/);
  });

  it('captures _lastElapsed inside onCallPick (flip-card path)', () => {
    const onCallBody = extractFunction(html, 'onCallPick');
    expect(onCallBody).toMatch(/_lastElapsed\s*=\s*Math\.max/);
  });

  it('renders the time-signal widget only when ans&&!examMode&&_lastElapsed>0', () => {
    // The guard condition must include all three — preventing a stale signal in exam mode
    // and avoiding divide-by-zero-like "0s" flashes before the first check.
    expect(html).toMatch(/if\s*\(\s*ans\s*&&\s*!\s*examMode\s*&&\s*_lastElapsed\s*>\s*0\s*\)/);
  });

  it('time-signal block uses the .time-signal id/class hook', () => {
    // Needed so the widget is discoverable for future dashboards / CSS tweaks.
    expect(html).toMatch(/id=["']time-signal["']/);
    expect(html).toMatch(/class=["']time-signal["']/);
  });

  it('Slow filter pill interpolates slowQuestionCount()', () => {
    // Must be called in the filts array so the pill shows a count suffix.
    const slowPillLine = html
      .split('\n')
      .find(line => line.includes("['slow',") && line.includes('_slowCount'));
    expect(slowPillLine, 'Slow pill must reference _slowCount').toBeTruthy();
    expect(html).toMatch(/const\s+_slowCount\s*=\s*slowQuestionCount\(\)/);
  });
});

describe('time-to-answer helpers (vm sandbox)', () => {
  // Seed a minimal sandbox with QZ + S, then evaluate the three helpers.
  const ctx = {
    S: { sr: {} },
    QZ: [],
    topicMedianTime: null,
    globalMedianTime: null,
    slowQuestionCount: null,
  };
  vm.createContext(ctx);
  vm.runInContext(
    extractFunction(html, 'topicMedianTime') + ';' +
    extractFunction(html, 'globalMedianTime') + ';' +
    extractFunction(html, 'slowQuestionCount'),
    ctx,
  );

  it('topicMedianTime returns null with fewer than 3 samples', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    ctx.QZ.push({ ti: 0 }, { ti: 0 });
    ctx.S.sr['0'] = { at: 30 };
    ctx.S.sr['1'] = { at: 50 };
    expect(ctx.topicMedianTime(0)).toBeNull();
  });

  it('topicMedianTime computes median of odd-length samples', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    [10, 30, 90].forEach((at, i) => {
      ctx.QZ.push({ ti: 5 });
      ctx.S.sr[String(i)] = { at };
    });
    expect(ctx.topicMedianTime(5)).toBe(30);
  });

  it('topicMedianTime computes median of even-length samples (rounded)', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    [10, 20, 40, 60].forEach((at, i) => {
      ctx.QZ.push({ ti: 7 });
      ctx.S.sr[String(i)] = { at };
    });
    // median = (20+40)/2 = 30
    expect(ctx.topicMedianTime(7)).toBe(30);
  });

  it('topicMedianTime ignores questions outside the topic', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    [10, 20, 30].forEach((at, i) => {
      ctx.QZ.push({ ti: 1 });
      ctx.S.sr[String(i)] = { at };
    });
    // 3 more in a different topic — should NOT leak in
    [999, 888, 777].forEach((at, i) => {
      const key = String(i + 3);
      ctx.QZ.push({ ti: 2 });
      ctx.S.sr[key] = { at };
    });
    expect(ctx.topicMedianTime(1)).toBe(20);
    expect(ctx.topicMedianTime(2)).toBe(888);
  });

  it('topicMedianTime returns null for invalid ti values', () => {
    expect(ctx.topicMedianTime(-1)).toBeNull();
    expect(ctx.topicMedianTime(null)).toBeNull();
    expect(ctx.topicMedianTime(undefined)).toBeNull();
  });

  it('topicMedianTime drops at<=0 (drive-by zeroes, unseeded entries)', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    [0, 0, 0, 40, 50, 60].forEach((at, i) => {
      ctx.QZ.push({ ti: 3 });
      ctx.S.sr[String(i)] = { at };
    });
    // Only the three positive samples count → median = 50
    expect(ctx.topicMedianTime(3)).toBe(50);
  });

  it('globalMedianTime aggregates across all topics', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    // five samples across different topics
    [10, 20, 30, 40, 50].forEach((at, i) => {
      ctx.QZ.push({ ti: i });
      ctx.S.sr[String(i)] = { at };
    });
    expect(ctx.globalMedianTime()).toBe(30);
  });

  it('globalMedianTime returns null with fewer than 3 samples', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {};
    ctx.QZ.push({ ti: 0 }, { ti: 0 });
    ctx.S.sr['0'] = { at: 30 };
    ctx.S.sr['1'] = { at: 50 };
    expect(ctx.globalMedianTime()).toBeNull();
  });

  it('slowQuestionCount counts only entries with at>60', () => {
    ctx.QZ.length = 0;
    ctx.S.sr = {
      '0': { at: 30 },   // not slow
      '1': { at: 60 },   // strictly >60 — threshold matches existing filter branch, so 60 is NOT slow
      '2': { at: 61 },   // slow
      '3': { at: 120 },  // slow
      '4': { at: 0 },    // unseeded — skip
      '5': {},           // no at field — skip
    };
    expect(ctx.slowQuestionCount()).toBe(2);
  });
});

describe('version sync', () => {
  it('sw.js CACHE matches APP_VERSION in the HTML', () => {
    const sw = readFileSync(resolve(rootDir, 'sw.js'), 'utf-8');
    const m = sw.match(/const\s+CACHE\s*=\s*['"]shlav-a-v([\d.]+)['"]/);
    expect(m, 'sw.js must declare CACHE version').toBeTruthy();
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
    const appVer = html.match(/const\s+APP_VERSION\s*=\s*['"]([\d.]+)['"]/);
    expect(appVer, 'HTML must declare APP_VERSION').toBeTruthy();
    expect(m[1]).toBe(appVer[1]);
    expect(pkg.version).toMatch(new RegExp('^' + appVer[1].replace(/\./g, '\\.') + '(\\.\\d+)?$'));
  });
});
