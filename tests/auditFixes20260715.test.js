/**
 * Regression tests for the 2026-07-15 audit fixes (G1-G4).
 *
 * Each test exercises the REAL source extracted from shlav-a-mega.html and is
 * designed to FAIL against the pre-fix code and PASS against the fix:
 *
 *   G1 (crash)  checkMockIntercept dereferenced mockExamResults.byTopic[q.ti]
 *               unconditionally. byTopic is seeded from EXAM_FREQ (40 buckets)
 *               but TOPICS has 46, so a year-tag mock question with ti>=40 threw
 *               a TypeError and froze answer submission. Now guarded.
 *
 *   G2 (crash)  the top-level `let S=JSON.parse(...)` was the one localStorage
 *               read not wrapped in try/catch; corrupt storage threw a
 *               SyntaxError at module top -> permanent white screen. Now wrapped.
 *
 *   G3 (resil.) the 7-file aux Promise.all rejected the whole batch and showed a
 *               fatal "Error loading data" overlay if any single file 404'd.
 *               Now Promise.allSettled; a rejected file keeps its default and no
 *               overlay is shown (questions load via the separate _qzPromise).
 *
 *   G4 (cost)   check() scheduled a paid aiAutopsy AI call on every wrong answer,
 *               including exam/mock mode where the result is never displayed.
 *               Now gated on !examMode.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

// Brace-matched function extractor (same technique as syncIndicator.test.js).
function extractFunction(src, name) {
  const sig = `function ${name}(`;
  const i = src.indexOf(sig);
  if (i < 0) throw new Error(`${name} not found`);
  const openBrace = src.indexOf('{', i);
  let depth = 0;
  let end = -1;
  for (let j = openBrace; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j; break; } }
  }
  if (end < 0) throw new Error(`Could not balance ${name}`);
  return src.slice(i, end + 1);
}

// ────────────────────────────────────────────────────────────────────
// G1 — checkMockIntercept must not crash on ti>=40 (byTopic gap)
// ────────────────────────────────────────────────────────────────────

describe('G1 — mock-intercept byTopic guard', () => {
  it('structural: EXAM_FREQ (40) is shorter than TOPICS (46) — the gap this guard covers', () => {
    const ef = html.match(/const EXAM_FREQ=(\[[^\]]*\])/);
    const tp = html.match(/const TOPICS=(\[[^\]]*\])/);
    expect(ef, 'EXAM_FREQ literal not found').toBeTruthy();
    expect(tp, 'TOPICS literal not found').toBeTruthy();
    const EXAM_FREQ = JSON.parse(ef[1]);
    const TOPICS = JSON.parse(tp[1]);
    expect(EXAM_FREQ.length).toBe(40);
    expect(TOPICS.length).toBe(46);
    // The whole point: any question tagged into topics 40..45 has no byTopic bucket.
    expect(EXAM_FREQ.length).toBeLessThan(TOPICS.length);
  });

  // Run the real checkMockIntercept with byTopic seeded 0..39 (as the app does).
  function bootCMI(state) {
    const byTopic = {};
    for (let i = 0; i < 40; i++) byTopic[i] = { ok: 0, no: 0 };
    const ctx = Object.assign({
      ans: false, sel: 0, qi: 0, pool: [0],
      QZ: [{ ti: state.ti }],
      isOk: () => state.correct,
      mockExamResults: { byTopic },
      _mockAnswered: 0,
    }, {});
    vm.createContext(ctx);
    vm.runInContext(extractFunction(html, 'checkMockIntercept'), ctx);
    return ctx;
  }

  it('correct answer with ti>=40 does not throw (was TypeError on byTopic[42].ok)', () => {
    const ctx = bootCMI({ ti: 42, correct: true });
    expect(() => ctx.checkMockIntercept()).not.toThrow();
    // No phantom bucket is created for the missing topic…
    expect(ctx.mockExamResults.byTopic[42]).toBeUndefined();
    // …but the answered counter still advances (the rest is unchanged).
    expect(ctx._mockAnswered).toBe(1);
  });

  it('wrong answer with ti>=40 does not throw and still records wrongIdxs', () => {
    const ctx = bootCMI({ ti: 45, correct: false });
    expect(() => ctx.checkMockIntercept()).not.toThrow();
    expect(ctx.mockExamResults.byTopic[45]).toBeUndefined();
    expect(ctx.mockExamResults.wrongIdxs).toEqual([0]);
    expect(ctx._mockAnswered).toBe(1);
  });

  it('control: a question in a seeded topic still records into byTopic', () => {
    const ok = bootCMI({ ti: 5, correct: true });
    ok.checkMockIntercept();
    expect(ok.mockExamResults.byTopic[5].ok).toBe(1);
    const no = bootCMI({ ti: 5, correct: false });
    no.checkMockIntercept();
    expect(no.mockExamResults.byTopic[5].no).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// G2 — corrupt localStorage must fall back to defaults, not white-screen
// ────────────────────────────────────────────────────────────────────

describe('G2 — top-level state parse is crash-safe', () => {
  // Extract the real S-initialisation block (matches both the old one-liner
  // `let S=JSON.parse(...)||{...}` and the new try/catch form) and run it with a
  // controllable localStorage. Against the OLD source, malformed JSON throws
  // here — so these tests genuinely fail pre-fix.
  function runSInit(rawValue) {
    const m = html.match(/let S\s*(?:=|;)[\s\S]*?gnotes:''\};/);
    expect(m, 'S-init block not found').toBeTruthy();
    const factory = new Function(
      'localStorage', 'LS', 'console',
      m[0] + '\nreturn S;'
    );
    const fakeLS = { getItem: (k) => (k === 'samega' ? rawValue : null) };
    const quietConsole = { warn() {}, log() {}, error() {} };
    return factory(fakeLS, 'samega', quietConsole);
  }

  it('malformed JSON does not throw and yields the default state', () => {
    expect(() => runSInit('{ this is not : json ]')).not.toThrow();
    const S = runSInit('{ this is not : json ]');
    expect(S).toBeTruthy();
    expect(S.ck).toEqual({});
    expect(S.qOk).toBe(0);
    expect(S.qNo).toBe(0);
    expect(S.gnotes).toBe('');
    expect(S.studyMode).toBe(false);
  });

  it('literal "null" in storage also falls back to defaults', () => {
    const S = runSInit('null');
    expect(S.qOk).toBe(0);
    expect(S.sr).toEqual({});
  });

  it('valid stored state is still used (happy path preserved)', () => {
    const S = runSInit(JSON.stringify({ qOk: 7, gnotes: 'hi' }));
    expect(S.qOk).toBe(7);
    expect(S.gnotes).toBe('hi');
  });
});

// ────────────────────────────────────────────────────────────────────
// G3 — one aux file 404 must still boot the app (no fatal overlay)
// ────────────────────────────────────────────────────────────────────

describe('G3 — aux data load is resilient (allSettled)', () => {
  const SAMPLES = {
    'topics.json': [['kw']],
    'notes.json': [{ topic: 'A', notes: 'x' }],
    'drugs.json': [{ name: 'd' }],
    'flashcards.json': [{ q: 'a', a: 'b' }],
    'tabs.json': {},
    'question_chapters.json': {},
    'regulatory.json': [],
  };

  function makeFetch(rejectName) {
    return (url) => {
      const name = String(url).split('/').pop();
      if (name === rejectName) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
      }
      const data = Object.prototype.hasOwnProperty.call(SAMPLES, name) ? SAMPLES[name] : [];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(data) });
    };
  }

  async function boot(rejectName) {
    const ctEl = { innerHTML: '' };
    const ctx = {
      fetch: makeFetch(rejectName),
      console: { warn() {}, log() {}, error() {} },
      // module-top defaults, sentinelised so we can prove they survive a reject
      TK: '__D_TK__', NOTES: '__D_NOTES__', DRUGS: '__D_DRUGS__', FLASH: '__D_FLASH__',
      TABS: '__D_TABS__', QCHAPS: '__D_QCHAPS__', REG: '__D_REG__',
      _dataReady: false,
      TOPICS: ['A', 'B'], NOTES_BY_TI: {},
      lsGet: () => [], QZ: [],
      location: { hostname: 'test.example', search: '' },
      takeWeeklySnapshot: () => {},
      sanitize: (s) => String(s),
      document: { getElementById: (id) => (id === 'ct' ? ctEl : null) },
    };
    vm.createContext(ctx);
    const fn = vm.runInContext('(async ' + extractFunction(html, 'loadDataArrays') + ')', ctx);
    await fn();
    return { ctx, ctEl };
  }

  it('happy path: all 7 files load and assign their targets', async () => {
    const { ctx } = await boot(null);
    expect(ctx._dataReady).toBe(true);
    expect(ctx.TK).toEqual([['kw']]);
    expect(ctx.DRUGS).toEqual([{ name: 'd' }]);
  });

  it('a single 404 (drugs.json) still boots — no throw, no fatal overlay', async () => {
    let threw = false;
    let result;
    try { result = await boot('drugs.json'); } catch (e) { threw = true; }
    expect(threw, 'boot must not reject when one aux file 404s').toBe(false);
    const { ctx, ctEl } = result;
    // App booted with the other files assigned…
    expect(ctx._dataReady).toBe(true);
    expect(ctx.TK).toEqual([['kw']]);
    // …the rejected file kept its module-top default…
    expect(ctx.DRUGS).toBe('__D_DRUGS__');
    // …and the fatal "Error loading data" overlay was NOT shown.
    expect(ctEl.innerHTML).toBe('');
    expect(ctEl.innerHTML).not.toMatch(/Error loading data/);
  });
});

// ────────────────────────────────────────────────────────────────────
// G4 — wrong answer in examMode must NOT schedule the paid aiAutopsy call
// ────────────────────────────────────────────────────────────────────

describe('G4 — aiAutopsy scheduler gated on !examMode', () => {
  // Run the real check() for a WRONG answer and observe whether aiAutopsy is
  // scheduled. The setTimeout stub invokes its callback synchronously so we can
  // detect the scheduled aiAutopsy directly.
  function bootCheck(examMode) {
    const setTimeoutCalls = [];
    const autopsyCalls = [];
    const ctx = {
      sel: 1, ans: false,
      checkMockIntercept: () => {},
      timedMode: false, timedInt: null,
      clearInterval: () => {},
      qStartTime: Date.now(),
      _lastElapsed: 0,
      QZ: [{ ti: 5, c: 0 }], pool: [0], qi: 0,
      _confidence: null,
      S: { sr: {}, qOk: 0, qNo: 0, wrongQs: {} },
      isOk: (q, s) => s === q.c,          // sel=1, c=0 -> wrong
      srScore: () => {},
      _pendingSR: null,
      _exCache: {},
      examMode,
      aiAutopsy: (idx) => { autopsyCalls.push(idx); },
      setTimeout: (cb, ms) => { setTimeoutCalls.push(ms); if (typeof cb === 'function') cb(); },
      save: () => {}, render: () => {},
      console: { warn() {}, log() {}, error() {} },
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(html, 'check'), ctx);
    ctx.check();
    return { setTimeoutCalls, autopsyCalls, ctx };
  }

  it('examMode=true: wrong answer does NOT schedule aiAutopsy (no paid call)', () => {
    const { setTimeoutCalls, autopsyCalls, ctx } = bootCheck(true);
    expect(autopsyCalls).toEqual([]);
    expect(setTimeoutCalls).toEqual([]);
    // Sanity: the wrong answer was still recorded (the rest of check() ran).
    expect(ctx.S.qNo).toBe(1);
  });

  it('examMode=false: wrong answer DOES schedule aiAutopsy (study mode unchanged)', () => {
    const { setTimeoutCalls, autopsyCalls } = bootCheck(false);
    expect(autopsyCalls).toEqual([0]);
    expect(setTimeoutCalls).toEqual([400]);
  });
});
