/**
 * Guards the sync indicator + offline export feature added in 9.66.
 *
 * Surfaces:
 *  1. #syncPill element present in the header chrome with role=status + aria-live.
 *  2. computeSyncState() resolves in priority order:
 *       offline > syncing/failed (sticky) > never > stale > synced
 *  3. syncPillMeta returns a {label,bg,fg,brd} quadruplet per state.
 *  4. cloudBackup updates S._lastCloudSync on success and drives _syncState.
 *  5. save() calls updateSyncPill() so the pill tracks navigator.onLine changes.
 *  6. exportProgress() writes a _meta envelope + timestamped filename.
 *  7. importProgress() is unchanged but still tolerates the new _meta key
 *     (whitelists only declared S keys — extra fields are ignored).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

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

describe('sync indicator — source wiring', () => {
  it('#syncPill element is declared in the header with accessibility hooks', () => {
    // role=status + aria-live=polite so screen readers announce state changes.
    expect(html).toMatch(/id=["']syncPill["']/);
    expect(html).toMatch(/role=["']status["'][^>]*aria-live=["']polite["']|aria-live=["']polite["'][^>]*role=["']status["']/);
  });

  it('save() calls updateSyncPill() after writing localStorage', () => {
    // Keeps the pill fresh on every debounced save tick (e.g. after offline check).
    const saveBody = html.match(/function\s+save\(\)\s*\{[\s\S]*?,150\)\}/);
    expect(saveBody, 'save() should match the debounced tail').toBeTruthy();
    expect(saveBody[0]).toMatch(/updateSyncPill\(\)/);
  });

  it('cloudBackup() sets _syncState=syncing at start and persists S._lastCloudSync on success', () => {
    const body = extractFunction(html, 'cloudBackup');
    // Must flip to syncing BEFORE the fetch() so the pill changes immediately.
    const syncingIdx = body.indexOf("_syncState='syncing'");
    const fetchIdx = body.indexOf('fetch(');
    expect(syncingIdx, 'cloudBackup must enter syncing state').toBeGreaterThan(-1);
    expect(syncingIdx).toBeLessThan(fetchIdx);
    // And must persist the ISO timestamp on success.
    expect(body).toMatch(/S\._lastCloudSync\s*=\s*new Date\(\)\.toISOString\(\)/);
    // And must set failed state on error path.
    expect(body).toMatch(/_syncState\s*=\s*ok\s*\?\s*'init'\s*:\s*'failed'/);
  });

  it('online/offline window listeners are attached', () => {
    expect(html).toMatch(/addEventListener\(['"]online['"]/);
    expect(html).toMatch(/addEventListener\(['"]offline['"]/);
  });

  it('boot path calls updateSyncPill after data loads', () => {
    expect(html).toMatch(/renderTabs\(\);render\(\);updateSyncPill\(\)/);
  });
});

describe('sync indicator — state machine (vm sandbox)', () => {
  // Seed a sandbox with S + navigator, then evaluate the helpers.
  function bootCtx(opts = {}) {
    const ctx = {
      S: opts.S || { sr: {} },
      _syncState: opts.state || 'init',
      navigator: { onLine: opts.onLine !== false },
      Date: Date,
      document: null,
      window: null,
      localStorage: { getItem: () => null, setItem: () => {} },
      computeSyncState: null,
      syncPillMeta: null,
    };
    vm.createContext(ctx);
    vm.runInContext(
      extractFunction(html, 'computeSyncState') + ';' +
      extractFunction(html, 'syncPillMeta'),
      ctx,
    );
    return ctx;
  }

  it('returns "offline" when navigator.onLine is false', () => {
    const ctx = bootCtx({ onLine: false, S: { _lastCloudSync: new Date().toISOString() } });
    expect(ctx.computeSyncState()).toBe('offline');
  });

  it('offline outranks a sticky syncing state', () => {
    // Priority: offline > sticky transient > otherwise.
    // We got burned in similar indicators before — if the user disconnects mid-sync,
    // the pill should show offline, not a phantom "Syncing…" forever.
    const ctx = bootCtx({ onLine: false, state: 'syncing' });
    expect(ctx.computeSyncState()).toBe('offline');
  });

  it('returns "syncing" when transient state is syncing and online', () => {
    const ctx = bootCtx({ state: 'syncing' });
    expect(ctx.computeSyncState()).toBe('syncing');
  });

  it('returns "failed" when transient state is failed and online', () => {
    const ctx = bootCtx({ state: 'failed' });
    expect(ctx.computeSyncState()).toBe('failed');
  });

  it('returns "never" when S._lastCloudSync is missing', () => {
    const ctx = bootCtx({});
    expect(ctx.computeSyncState()).toBe('never');
  });

  it('returns "synced" when last backup was <1 day ago', () => {
    const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const ctx = bootCtx({ S: { _lastCloudSync: recent } });
    expect(ctx.computeSyncState()).toBe('synced');
  });

  it('returns "stale" when last backup was >1 day ago', () => {
    const old = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
    const ctx = bootCtx({ S: { _lastCloudSync: old } });
    expect(ctx.computeSyncState()).toBe('stale');
  });

  it('syncPillMeta returns complete {label,bg,fg,brd} for every known state', () => {
    const ctx = bootCtx({});
    const states = ['offline', 'syncing', 'synced', 'stale', 'never', 'failed'];
    for (const s of states) {
      const m = ctx.syncPillMeta(s);
      expect(m.label, `${s}.label`).toBeTruthy();
      expect(m.bg, `${s}.bg`).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(m.fg, `${s}.fg`).toMatch(/^#[0-9a-f]{3,6}$/i);
      expect(m.brd, `${s}.brd`).toMatch(/^#[0-9a-f]{3,6}$/i);
    }
  });

  it('syncPillMeta falls back to "Local only" for unknown state (no blank pill)', () => {
    const ctx = bootCtx({});
    const m = ctx.syncPillMeta('banana');
    expect(m.label).toMatch(/Local only/);
  });
});

describe('offline export — exportProgress()', () => {
  // Shim a tiny DOM-ish harness and run exportProgress in a sandbox.
  function runExport(Sstate) {
    const ctx = {
      S: Sstate,
      QZ: Array(100).fill({}),
      APP_VERSION: '9.66',
      localStorage: { getItem: () => 'dev_test123' },
      document: {
        createElement: () => {
          const el = { _href: null, _download: null, click: () => {}, set href(v) { this._href = v; }, set download(v) { this._download = v; }, get href() { return this._href; }, get download() { return this._download; } };
          ctx._lastEl = el;
          return el;
        },
      },
      URL: { createObjectURL: (blob) => { ctx._lastBlob = blob; return 'blob:stub'; } },
      Blob: class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } get text() { return this.parts.join(''); } },
      Date,
      _lastEl: null,
      _lastBlob: null,
    };
    vm.createContext(ctx);
    vm.runInContext(extractFunction(html, 'exportProgress') + '; exportProgress();', ctx);
    return ctx;
  }

  it('wraps S with _meta envelope preserving existing keys', () => {
    const S = { sr: { 0: { at: 20 }, 1: { at: 30 } }, streak: 7, qOk: 100, qNo: 25 };
    const ctx = runExport(S);
    const data = JSON.parse(ctx._lastBlob.parts[0]);
    expect(data._meta).toBeDefined();
    expect(data._meta.app).toBe('shlav-a-mega');
    expect(data._meta.appVersion).toBe('9.66');
    expect(data._meta.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data._meta.deviceId).toBe('dev_test123');
    expect(data._meta.srEntryCount).toBe(2);
    expect(data._meta.streak).toBe(7);
    expect(data._meta.questionCount).toBe(100);
    // S keys are preserved:
    expect(data.sr).toEqual(S.sr);
    expect(data.qOk).toBe(100);
    expect(data.qNo).toBe(25);
  });

  it('sets filename with YYYY-MM-DD timestamp', () => {
    const ctx = runExport({ sr: {} });
    expect(ctx._lastEl._download).toMatch(/^shlav-a-progress-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('does not throw when QZ/localStorage/device id is missing (defensive)', () => {
    const ctx = {
      S: { sr: {} },
      QZ: null,
      APP_VERSION: '9.66',
      localStorage: { getItem: () => null },
      document: { createElement: () => ({ click: () => {} }) },
      URL: { createObjectURL: () => 'blob:stub' },
      Blob: class { constructor(p, o) { this.parts = p; this.type = o && o.type; } },
      Date,
    };
    vm.createContext(ctx);
    expect(() => vm.runInContext(extractFunction(html, 'exportProgress') + '; exportProgress();', ctx)).not.toThrow();
  });
});

describe('importProgress tolerates _meta envelope (backward compat)', () => {
  it('whitelists S keys — extra _meta field is silently ignored', () => {
    // Source check: importProgress iterates Object.keys(S) (the existing whitelist),
    // so any future field added to the export won't crash the import.
    const imp = extractFunction(html, 'importProgress');
    expect(imp).toMatch(/Object\.keys\(S\)/);
    expect(imp).toMatch(/for\s*\(\s*const\s+k\s+of\s+allowed\s*\)\s*\{\s*if\s*\(k\s+in\s+d\s*\)\s*validated\[k\]\s*=\s*d\[k\]/);
  });
});

describe('version sync', () => {
  it('APP_VERSION, sw.js CACHE, and package.json agree', () => {
    const sw = readFileSync(resolve(rootDir, 'sw.js'), 'utf-8');
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
    const appVer = html.match(/const\s+APP_VERSION\s*=\s*['"]([\d.]+)['"]/)[1];
    const cacheVer = sw.match(/const\s+CACHE\s*=\s*['"]shlav-a-v([\d.]+)['"]/)[1];
    expect(cacheVer).toBe(appVer);
    expect(pkg.version).toMatch(new RegExp('^' + appVer.replace(/\./g, '\\.') + '(\\.\\d+)?$'));
  });
});
