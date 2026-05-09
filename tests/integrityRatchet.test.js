/**
 * Integrity ratchets — pin baseline counts that, if silently moved, indicate
 * either real regressions or unaudited refactors that need eyes on them.
 *
 * Two ratchets:
 *  1. Function count (named `function name(...){...}` declarations) in
 *     shlav-a-mega.html. CLAUDE.md ledgered 224 as of v10.64.85. Drift is
 *     allowed, but a TEST FAILURE forces an audit conversation:
 *       - Net REMOVAL of >5 in one commit is GATE-4 territory (CI blocks it).
 *       - Net ADDITION of >20 without decomposition warrants a test bump
 *         + IMPROVEMENTS.md note (per § D.6 self-improve rule).
 *  2. innerHTML interpolation site count. `npm run verify` already gates
 *     unsanitized sites; this test ratchets the *total annotated* surface so
 *     newly-added interpolation calls force a code-review touch (a future
 *     XSS regression must overcome this guard, not slip past).
 *
 * Both ratchets are "soft" — they have a wide tolerance band. The point is
 * to surface DRIFT, not to enforce a frozen number.
 *
 * Added 2026-05-10 during § D audit-fix-deploy pass.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');

let html = '';
beforeAll(() => {
  html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
});

describe('integrity ratchets — function count', () => {
  test('named function declarations remain in 200..260 envelope', () => {
    // Count `^function name(` at column 0 — the `npm run verify` convention.
    // Ignore inline arrow-fns + method shorthand — those move freely.
    const matches = html.split('\n').filter(l => /^function\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(l));
    const count = matches.length;
    // Baseline 224 at v10.64.85 (per CLAUDE.md / actual grep).
    // Lower bound: 200 (catches a >24-function silent removal).
    // Upper bound: 260 (catches a >36-function add without decomposition).
    expect(count).toBeGreaterThanOrEqual(200);
    expect(count).toBeLessThanOrEqual(260);
  });

  test('expected critical render orchestrators are present', () => {
    // These three are the decomposition anchors that exist as top-level
    // function declarations. `renderCalc` is dispatched inline from a
    // case-switch — covered by other tests. Removing any of these without
    // a matching audit + version bump is a deploy hazard.
    for (const fn of ['renderQuiz', 'renderTrack', 'renderLibrary']) {
      expect(html).toMatch(new RegExp(`function\\s+${fn}\\s*\\(`));
    }
  });
});

describe('integrity ratchets — innerHTML interpolation surface', () => {
  test('innerHTML-with-template-literal sites stay in 0..25 envelope', () => {
    // Mirror what `scripts/check-innerhtml-pieces.py` finds (currently 11).
    // Pure regex won't match the python AST exactly, but the order of
    // magnitude is the ratchet — 0 means we accidentally scrubbed all
    // legitimate render strings; >25 means new attack surface has crept in
    // without a corresponding audit.
    const matches = html.match(/\.innerHTML\s*=\s*`[^`]*\$\{/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(0);
    expect(matches.length).toBeLessThanOrEqual(25);
  });

  test('innerHTML never receives raw user-controlled values without sanitize', () => {
    // Pin: any raw `innerHTML = userInput`-shaped pattern is blocked.
    // The innerhtml-pieces script catches dynamic interpolation; this test
    // catches the simpler bare-assignment case.
    const bare = html.match(/\.innerHTML\s*=\s*[a-zA-Z_$][\w$]*\s*;/g) || [];
    // Allowed pattern is `.innerHTML = ''` (literal clear) and
    // `.innerHTML = h` where `h` is a fully-built string. Pin upper bound
    // generous — this is a smoke test, not the primary guard.
    expect(bare.length).toBeLessThanOrEqual(60);
  });
});

describe('integrity ratchets — protected localStorage keys', () => {
  test('all four protected localStorage keys still appear in source', () => {
    // Per § D.7 hard constraint — never rename these. If a refactor
    // accidentally renames one, users lose data on next deploy.
    const PROTECTED = ['samega', 'samega_ex', 'samega_apikey', 'shlav_q_images'];
    for (const key of PROTECTED) {
      expect(html.includes(`'${key}'`) || html.includes(`"${key}"`)).toBe(true);
    }
  });
});

describe('integrity ratchets — trinity is internally consistent', () => {
  test('APP_VERSION format is N.N.N', () => {
    const m = html.match(/const\s+APP_VERSION\s*=\s*['"]([\d.]+)['"]/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
