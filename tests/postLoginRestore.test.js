/**
 * tests/postLoginRestore.test.js
 *
 * Pins the structural contract of v10.63.0's auto-restore-on-login feature
 * inside shlav-a-mega.html. Mirror of FamilyMedicine v1.18.0 +
 * InternalMedicine v10.4.0 (which test the modular sources directly via
 * import). Geri is a single-file HTML monolith, so we extract the helper
 * source via regex and eval it in an isolated harness.
 *
 * What this test pins (must stay in lockstep with sibling PWAs):
 *   1. The suppress-key namespace — `geri.restore-prompted.<username>`
 *      so a future cross-PWA migration can sweep all four in one pass.
 *   2. Fresh-state heuristic — the prompt MUST NOT fire if S has any
 *      local progress, even one answered question or one SR card.
 *   3. Username regex matches `app_users` (^[a-z0-9][a-z0-9_-]{2,31}$).
 *   4. localStorage-error-implies-skip — if we can't read the marker,
 *      we can't honour a future "don't show again", so we skip the prompt.
 *   5. The auth IIFE exports `subscribeAuthEvents` on window.
 *   6. CHANGELOG declares v10.63.0 (sanity check on the version-trinity).
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

let html;
beforeAll(() => {
  html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');
});

// Extract the four pure helpers and assemble a testable sandbox.
function buildSandbox(html) {
  const blocks = [
    /const _RESTORE_PROMPT_PREFIX = '[^']+';/,
    /function _restoreSuppressKey\(username\)\{[^}]+\}/,
    /function _restoreIsFreshState\(state\)\{[\s\S]+?\n\}/,
    /async function _restoreShouldPrompt\(username,state\)\{[\s\S]+?\n\}/,
  ];
  const src = blocks.map((re) => {
    const m = html.match(re);
    if (!m) throw new Error('helper not found: ' + re);
    return m[0];
  }).join('\n');
  // localStorage shim — Map-backed, throws if poisoned.
  const _lsStore = new Map();
  let _poison = false;
  const localStorageShim = {
    getItem: (k) => { if (_poison) throw new Error('quota or private mode'); return _lsStore.has(k) ? _lsStore.get(k) : null; },
    setItem: (k, v) => _lsStore.set(k, String(v)),
    removeItem: (k) => _lsStore.delete(k),
    clear: () => _lsStore.clear(),
    _poison: (on) => { _poison = on; },
  };
  // eslint-disable-next-line no-new-func
  const factory = new Function('localStorage', src + '\nreturn { _restoreSuppressKey, _restoreIsFreshState, _restoreShouldPrompt };');
  const helpers = factory(localStorageShim);
  return { ...helpers, _lsStore, localStorage: localStorageShim };
}

describe('Geri post-login-restore — _restoreSuppressKey', () => {
  it('uses the geri. namespace shared with sibling PWAs', () => {
    const sb = buildSandbox(html);
    expect(sb._restoreSuppressKey('alice')).toBe('geri.restore-prompted.alice');
  });
});

describe('Geri post-login-restore — _restoreIsFreshState', () => {
  let sb;
  beforeEach(() => { sb = buildSandbox(html); });

  it('returns true for default empty state', () => {
    expect(sb._restoreIsFreshState({ qOk: 0, qNo: 0, sr: {} })).toBe(true);
  });
  it('returns false when any question has been answered correctly', () => {
    expect(sb._restoreIsFreshState({ qOk: 1, qNo: 0, sr: {} })).toBe(false);
  });
  it('returns false when any question has been answered incorrectly', () => {
    expect(sb._restoreIsFreshState({ qOk: 0, qNo: 1, sr: {} })).toBe(false);
  });
  it('returns false when SR data exists even with zero qOk/qNo', () => {
    expect(sb._restoreIsFreshState({ qOk: 0, qNo: 0, sr: { 42: { ef: 2.5, n: 1 } } })).toBe(false);
  });
  it('returns false on null/undefined state (defensive)', () => {
    expect(sb._restoreIsFreshState(null)).toBe(false);
    expect(sb._restoreIsFreshState(undefined)).toBe(false);
  });
  it('treats non-numeric qOk/qNo as zero', () => {
    expect(sb._restoreIsFreshState({ qOk: 'broken', qNo: undefined, sr: {} })).toBe(true);
  });
});

describe('Geri post-login-restore — _restoreShouldPrompt', () => {
  const FRESH = { qOk: 0, qNo: 0, sr: {} };
  const POPULATED = { qOk: 5, qNo: 3, sr: {} };
  let sb;
  beforeEach(() => { sb = buildSandbox(html); });

  it('returns true on fresh state with valid username and no marker', async () => {
    expect(await sb._restoreShouldPrompt('alice', FRESH)).toBe(true);
  });
  it('returns false when prior prompt marker exists', async () => {
    sb._lsStore.set(sb._restoreSuppressKey('alice'), '1234');
    expect(await sb._restoreShouldPrompt('alice', FRESH)).toBe(false);
  });
  it('returns false when local state is populated', async () => {
    expect(await sb._restoreShouldPrompt('alice', POPULATED)).toBe(false);
  });
  it('returns false on empty/missing username', async () => {
    expect(await sb._restoreShouldPrompt('', FRESH)).toBe(false);
    expect(await sb._restoreShouldPrompt(null, FRESH)).toBe(false);
    expect(await sb._restoreShouldPrompt(undefined, FRESH)).toBe(false);
  });
  it('returns false on malformed username (does not match auth regex)', async () => {
    expect(await sb._restoreShouldPrompt('AB', FRESH)).toBe(false);
    expect(await sb._restoreShouldPrompt('-alice', FRESH)).toBe(false);
    expect(await sb._restoreShouldPrompt('alice@bob', FRESH)).toBe(false);
  });
  it('localStorage read error is treated as "skip prompt"', async () => {
    sb.localStorage._poison(true);
    expect(await sb._restoreShouldPrompt('alice', FRESH)).toBe(false);
  });
});

describe('Geri post-login-restore — wiring contracts', () => {
  it('auth IIFE exports subscribeAuthEvents on window', () => {
    // The auth IIFE ends with Object.assign(window, { ... subscribeAuthEvents ... })
    expect(html).toMatch(/Object\.assign\(window,\s*\{[\s\S]+?subscribeAuthEvents[\s\S]+?\}\)/);
  });
  it('peekCloudBackup uses p_app:"geri" for the backup_get RPC', () => {
    const m = html.match(/async function peekCloudBackup\(\)\{[\s\S]+?\}\s*\n\s*\n/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/p_app:\s*'geri'/);
  });
  it('cloudRestore uses applyRestorePayload (the extracted merger)', () => {
    const m = html.match(/async function cloudRestore\(\)\{[\s\S]+?\n\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/applyRestorePayload\(row\.data\)/);
  });
  it('applyRestorePayload guards against prototype-pollution keys', () => {
    const m = html.match(/function applyRestorePayload\(rowData\)\{[\s\S]+?\n\}/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/__proto__/);
    expect(m[0]).toMatch(/constructor/);
    expect(m[0]).toMatch(/prototype/);
  });
  it('initPostLoginRestore is invoked in the boot sequence', () => {
    expect(html).toMatch(/initPostLoginRestore\s*\(\s*\)/);
  });
  it('CHANGELOG declares v10.63.0 (version-trinity sanity)', () => {
    expect(html).toMatch(/'10\.63\.0'\s*:\s*\[/);
  });
});
