/**
 * Tests for Geri v10.64.48 → v10.64.50 api-key cloud sync flow.
 *
 * Sibling-paired with IM v10.4.14-17 / FM v1.21.12-14. Geri ships as a
 * single-file HTML monolith (shlav-a-mega.html) so we extract patterns
 * via regex against the bytes that deploy, mirroring the postLoginRestore
 * test harness pattern.
 *
 * v10.64.48 — _apikey added to cloudBackup payload (alongside S/_mockHist/_sessions)
 *             + applyRestorePayload restores rowData._apikey via setApiKey
 * v10.64.50 — _doLogin reads r.api_key from auth_login_user response and
 *             calls setApiKey directly (Supabase migration 2026-05-06 added
 *             api_key column to app_users + auto-sync trigger from backups)
 *
 * The Supabase project (krmlzwwelqvlfslwltol, "Toranot") is shared with
 * IM and FM, so the auth_login_user RPC contract must stay aligned across
 * all three siblings. Drift in any one would break the round-trip
 * optimization on flaky 4G — users would have to re-enter their API key
 * after every login on a fresh device.
 *
 * Runtime sibling: scripts/smoke-api-key-restore.mjs asserts the runtime
 * data flow (real RPC fires → real response shape → real localStorage
 * write) against the live URL + a SQL-seeded burner. The two layers are
 * complementary per feedback_invariant_triad.md — this file pins the
 * source-side wiring at PR-review time; the runtime smoke catches drift
 * the static check cannot reach (RPC body refactor, middleware mangle,
 * setApiKey side-effects). Operate via `npm run smoke:api-key` with
 * TEST_USER / TEST_PASS / EXPECTED_API_KEY env vars.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

describe('Geri v10.64.158 — API key is NOT cloud-synced (security fix)', () => {
  // v10.64.48/50 synced _apikey in the backup blob; v10.64.158 removed it because
  // backup_get is SECURITY DEFINER with no identity check, so a synced key was
  // exfiltratable by username guess. auth_login_user still returns the key on
  // login, so restore is unaffected. Do NOT re-add _apikey to the payload.
  it('cloudBackup does NOT bundle _apikey into the synced payload', () => {
    const m = html.match(/async function cloudBackup\(\)\{[\s\S]+?const\s+_bundled\s*=\s*\{[^}]+\}/);
    expect(m, 'cloudBackup _bundled not found').toBeTruthy();
    expect(m[0], '_apikey must not be in the cloud-sync payload').not.toMatch(/_apikey/);
  });

  it('applyRestorePayload restores rowData._apikey via setApiKey with typeof guard', () => {
    const m = html.match(/function applyRestorePayload\(rowData\)\{[\s\S]+?\n\}/);
    expect(m, 'applyRestorePayload function not found').toBeTruthy();
    // Backwards-compat typeof check — legacy backups without _apikey must not throw
    expect(m[0]).toMatch(/typeof\s+rowData\._apikey\s*===\s*['"]string['"]/);
    expect(m[0]).toMatch(/setApiKey\(rowData\._apikey\)/);
  });
});

describe('Geri v10.64.50 — _doLogin restores api_key from response', () => {
  it('_doLogin calls setApiKey(r.api_key) on success with typeof guard', () => {
    // Pull the function body to scope the assertions.
    const m = html.match(/async function _doLogin\(\)\{[\s\S]+?\n  \}/);
    expect(m, '_doLogin function not found').toBeTruthy();
    expect(m[0]).toMatch(/typeof\s+r\.api_key\s*===\s*['"]string['"]/);
    expect(m[0]).toMatch(/setApiKey\(r\.api_key\)/);
  });

  it('setApiKey runs AFTER setAuthSession in _doLogin (login first, then key restore)', () => {
    const m = html.match(/async function _doLogin\(\)\{[\s\S]+?\n  \}/);
    expect(m).toBeTruthy();
    const body = m[0];
    const sessionIdx = body.indexOf('setAuthSession(r.username');
    const apiKeyIdx = body.indexOf('setApiKey(r.api_key)');
    expect(sessionIdx).toBeGreaterThan(-1);
    expect(apiKeyIdx).toBeGreaterThan(-1);
    expect(apiKeyIdx, 'setApiKey must run after setAuthSession').toBeGreaterThan(sessionIdx);
  });

  it('_doRegister does NOT call setApiKey (new accounts have no key yet)', () => {
    // New users have no api_key yet — restoring would clear an existing local one.
    const m = html.match(/async function _doRegister\(\)\{[\s\S]+?\n  \}/);
    expect(m).toBeTruthy();
    expect(m[0]).not.toMatch(/setApiKey\(r\.api_key\)/);
  });
});

describe('Geri utils — api-key storage uses samega_apikey localStorage key', () => {
  it('getApiKey reads from samega_apikey', () => {
    expect(html).toMatch(/function\s+getApiKey\(\)\s*\{\s*return\s+localStorage\.getItem\(['"]samega_apikey['"]\)/);
  });

  it('setApiKey writes to samega_apikey with try/catch and trim', () => {
    // setApiKey(k) — writes if k present, removes if empty/falsy, trims whitespace
    const m = html.match(/function\s+setApiKey\(k\)\{[\s\S]+?\}\s*\n/);
    expect(m, 'setApiKey function not found').toBeTruthy();
    expect(m[0]).toContain('samega_apikey');
    expect(m[0]).toMatch(/k\.trim\(\)/);
    expect(m[0]).toMatch(/removeItem\(['"]samega_apikey['"]\)/);
    expect(m[0]).toMatch(/try\{/);
  });

  it('localStorage key matches Geri convention (samega_*) — not pnimit_ or mishpacha_', () => {
    // Defensive: this key is in users' browsers — renaming would orphan their keys.
    expect(html).not.toMatch(/localStorage\.(getItem|setItem)\(['"]pnimit_apikey['"]\)/);
    expect(html).not.toMatch(/localStorage\.(getItem|setItem)\(['"]mishpacha_apikey['"]\)/);
  });
});

describe('Geri sibling-parity with IM/FM auth_login_user contract', () => {
  it('reads r.api_key (snake_case) — matches Supabase RPC return shape', () => {
    // The Supabase auth_login_user RPC returns api_key (snake_case, postgres convention).
    // If the client switched to camelCase r.apiKey, the typeof check would always fail.
    const m = html.match(/async function _doLogin\(\)\{[\s\S]+?\n  \}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/r\.api_key/);
    expect(m[0]).not.toMatch(/r\.apiKey\b/);
  });

  it('cloudBackup intentionally DIVERGES from FM/IM: no _apikey in payload (v10.64.158)', () => {
    // Geri dropped _apikey from the synced blob for security (exfiltration via the
    // no-identity backup_get RPC). FM/IM still sync it and need the same fix; until
    // then this divergence is deliberate, not a parity regression.
    const m = html.match(/async function cloudBackup\(\)\{[\s\S]+?const\s+_bundled\s*=\s*\{[^}]+\}/);
    expect(m).toBeTruthy();
    expect(m[0], 'Geri must not sync the api key').not.toMatch(/_apikey/);
  });
});
