/**
 * Tests for the flashcard FSRS scoring layer in shlav-a-mega.html (monolithic).
 *
 * Extracts the real fcFsrsScore / fcGetDueIndices / fcRebuildQueue /
 * fcRate functions from the HTML source and runs them against a local
 * `S`/`FLASH`/`save` context — so if anyone edits the source, this test
 * covers the exact new behaviour.
 *
 * Mirrors InternalMedicine/tests/flashcardFsrs.test.js.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');

function extract(html, startNeedle, endNeedle) {
  const s = html.indexOf(startNeedle);
  if (s < 0) throw new Error('needle not found: ' + startNeedle);
  const e = html.indexOf(endNeedle, s);
  if (e < 0) throw new Error('end needle not found: ' + endNeedle);
  return html.slice(s, e);
}

let ctx;

beforeAll(() => {
  const fsrs = readFileSync(resolve(ROOT, 'shared', 'fsrs.js'), 'utf-8');
  const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

  // Extract fcGetDueIndices, fcRebuildQueue, fcFsrsScore, fcRate
  const dueFns = extract(
    html,
    'function fcGetDueIndices()',
    'function renderFlash()'
  );
  const rateFns = extract(
    html,
    '// FSRS-4.5 scoring for flashcards',
    '// ===== SHARE ====='
  );

  const src = `
    ${fsrs}
    // Local stubs for ambient globals the extracted fns assume
    let S = { fcsr:{}, fci:0, fcFlip:false, fcDueMode:false };
    const FLASH = [{f:'Q1',b:'A1'},{f:'Q2',b:'A2'},{f:'Q3',b:'A3'}];
    function save(){}
    function render(){}
    ${dueFns}
    ${rateFns}
    // Expose to outer ctx
    globalThis._resetState = function(){
      S = { fcsr:{}, fci:0, fcFlip:false, fcDueMode:false };
    };
    globalThis._getState = function(){ return S; };
    globalThis._setDueMode = function(v){ S.fcDueMode = v; };
    globalThis.fcGetDueIndices = fcGetDueIndices;
    globalThis.fcRebuildQueue = fcRebuildQueue;
    globalThis.fcFsrsScore = fcFsrsScore;
    globalThis.fcRate = fcRate;
    globalThis.fsrsInterval = fsrsInterval;
    globalThis.fsrsInitNew = fsrsInitNew;
  `;
  ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
});

beforeEach(() => {
  ctx._resetState();
});

describe('Geri flashcards — fcFsrsScore', () => {
  it('creates an entry on first call with fsrs params and future next', () => {
    const now = Date.now();
    ctx.fcFsrsScore('fc_0', 3);
    const S = ctx._getState();
    const s = S.fcsr['fc_0'];
    expect(s).toBeDefined();
    expect(typeof s.fsrsS).toBe('number');
    expect(typeof s.fsrsD).toBe('number');
    expect(s.next).toBeGreaterThan(now);
  });

  it('Again (rating=1) resets legacy n to 0', () => {
    ctx.fcFsrsScore('fc_0', 3);
    ctx.fcFsrsScore('fc_0', 3);
    ctx.fcFsrsScore('fc_0', 1);
    expect(ctx._getState().fcsr['fc_0'].n).toBe(0);
  });

  it('consecutive Good ratings increment n (capped at 2)', () => {
    ctx.fcFsrsScore('fc_1', 3);
    expect(ctx._getState().fcsr['fc_1'].n).toBe(1);
    ctx.fcFsrsScore('fc_1', 3);
    expect(ctx._getState().fcsr['fc_1'].n).toBe(2);
    ctx.fcFsrsScore('fc_1', 3);
    expect(ctx._getState().fcsr['fc_1'].n).toBe(2);
  });

  it('Easy (rating=4) yields longer next-interval than Hard (rating=2)', () => {
    ctx.fcFsrsScore('fc_hard', 2);
    ctx.fcFsrsScore('fc_easy', 4);
    const S = ctx._getState();
    expect(S.fcsr['fc_easy'].next - Date.now())
      .toBeGreaterThan(S.fcsr['fc_hard'].next - Date.now());
  });
});

describe('Geri flashcards — fcGetDueIndices', () => {
  it('returns all indices when fcsr is empty', () => {
    expect(ctx.fcGetDueIndices()).toEqual([0, 1, 2]);
  });

  it('excludes cards whose next is strictly in the future', () => {
    const S = ctx._getState();
    S.fcsr['fc_0'] = { n: 2, next: Date.now() + 10 * 86400000 };
    S.fcsr['fc_1'] = { n: 1, next: Date.now() - 100 };
    const due = ctx.fcGetDueIndices();
    expect(due).toContain(1);
    expect(due).toContain(2);
    expect(due).not.toContain(0);
  });
});

describe('Geri flashcards — fcRebuildQueue', () => {
  it('populates fcQueue with all due indices and resets position', () => {
    ctx.fcRebuildQueue();
    const S = ctx._getState();
    expect(S.fcQueue).toHaveLength(3);
    expect(S.fcQueuePos).toBe(0);
    expect(S.fcQueue.slice().sort()).toEqual([0, 1, 2]);
  });
});
