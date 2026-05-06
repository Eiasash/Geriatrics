/**
 * Pins the unmount-race contract: no `await` may appear between
 * `setAuthSession(...)` and the end of the auth handler body.
 *
 * Background — feedback_react_setauthsession_unmount_race.md (memory):
 *   "Chaining `await` after `setAuthSession` unmounts the calling
 *   component mid-handler; setStatus on the stale closure silently
 *   fails. Always do dependent RPCs BEFORE setAuthSession."
 *
 * Geri ships as a single-file HTML monolith, so the auth handlers
 * `_doLogin` / `_doRegister` are extracted via regex against the
 * deployed bytes (mirroring apiKeyLoginRestore.test.js shape). They
 * live inside an outer IIFE wrapper, so `function ` start markers are
 * indented — we pin against the unique function-name marker.
 *
 * Today both _doLogin and _doRegister are correctly shaped: dependent
 * async work (`await authLogin/authRegister`) happens BEFORE
 * setAuthSession; everything after setAuthSession is sync (setApiKey,
 * _dispatchAuthEvent, toast, render).
 *
 * Sibling-paired with:
 *   - InternalMedicine/tests/authUnmountRaceGuard.test.js
 *   - FamilyMedicine/tests/authUnmountRaceGuard.test.js
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

/**
 * Extract the source slice from `setAuthSession(` to the end of the
 * Geri auth handler body. Geri's auth handlers live inside an outer
 * IIFE wrapper; we slice from the function-name marker to the next
 * `async function _do…` declaration in the same scope. Names like
 * `_doLogin` / `_doRegister` are unique to this auth block.
 */
function bodyAfterSetAuthSession(fnName) {
  const startMarker = `async function ${fnName}(`;
  const startIdx = html.indexOf(startMarker);
  expect(startIdx, `${fnName} not found in shlav-a-mega.html`).toBeGreaterThan(-1);
  // Geri wraps these functions in an outer scope, so they're indented.
  // Body terminator: next sibling `async function _do…` declaration.
  const nextFnIdx = html.indexOf('async function _do', startIdx + 1);
  const body = nextFnIdx < 0 ? html.slice(startIdx) : html.slice(startIdx, nextFnIdx);
  const setAuthIdx = body.indexOf('setAuthSession(');
  expect(setAuthIdx, `setAuthSession() not called in ${fnName}`).toBeGreaterThan(-1);
  return body.slice(setAuthIdx);
}

describe('auth handler — no awaits after setAuthSession (unmount race guard)', () => {
  it('_doLogin: setAuthSession() is followed only by sync ops', () => {
    const tail = bodyAfterSetAuthSession('_doLogin');
    // \bawait\b matches the word as a token. Comments containing the
    // bare word "await" would false-positive — write comments without
    // it, or this test guarantees nothing.
    expect(tail).not.toMatch(/\bawait\b/);
  });

  it('_doRegister: setAuthSession() is followed only by sync ops', () => {
    const tail = bodyAfterSetAuthSession('_doRegister');
    expect(tail).not.toMatch(/\bawait\b/);
  });
});
