/**
 * CHANGELOG drift regression test.
 *
 * 2026-05-06: noticed APP_VERSION='10.64.57' but the latest CHANGELOG entry
 * was '10.64.47' — 10 missing entries. The v10.64.49 defensive fix masked
 * this by showing "(no entry)" instead of falling back to old content, but
 * nothing actively prevented the drift.
 *
 * The version-trinity guard (APP_VERSION ↔ sw.js CACHE ↔ package.json) catches
 * version-bump misalignment but does NOT check whether the CURRENT version has
 * a corresponding CHANGELOG entry. This test fills that gap.
 *
 * If this fails:
 *   - Easy fix: add an entry like `'<APP_VERSION>':[` to the CHANGELOG block.
 *   - The v10.64.49 help-overlay fallback shows "(no entry)" — that's the
 *     symptom users see; this test is the upstream guard.
 *
 * Sibling-paired with InternalMedicine/tests/changelogDrift.test.js and
 * FamilyMedicine/tests/changelogDrift.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

describe('CHANGELOG drift guard', () => {
  it('APP_VERSION constant is parseable from shlav-a-mega.html', () => {
    const m = html.match(/const\s+APP_VERSION\s*=\s*'([^']+)';/);
    expect(m, 'APP_VERSION declaration not found').toBeTruthy();
    expect(m[1]).toMatch(/^\d+\.\d+(\.\d+)?$/);
  });

  it('current APP_VERSION has a corresponding CHANGELOG entry', () => {
    const versionMatch = html.match(/const\s+APP_VERSION\s*=\s*'([^']+)';/);
    expect(versionMatch).toBeTruthy();
    const version = versionMatch[1];
    // CHANGELOG entries take the form `'<version>':[` inside the const CHANGELOG={...} block.
    const entryRegex = new RegExp(`'${version.replace(/\./g, '\\.')}'\\s*:\\s*\\[`);
    expect(
      html,
      `CHANGELOG missing an entry for current APP_VERSION='${version}'. ` +
      `Add an entry like "'${version}':[ '...' ]," after the const CHANGELOG={ line. ` +
      `(See v10.64.49 help-overlay fallback — users currently see "(no entry)" for this version.)`
    ).toMatch(entryRegex);
  });

  it('CHANGELOG block opens with a known marker (sanity check)', () => {
    // The slice marker `const CHANGELOG=` is also used by the dataIntegrity STALE_COUNTS
    // guard (tests/dataIntegrity.test.js:463). If this disappears, multiple guards break.
    expect(html).toContain('const CHANGELOG=');
  });
});
