#!/usr/bin/env node
/**
 * smoke-api-key-restore.mjs — Geri runtime invariant for the api_key
 * cloud-sync chain. Closes the runtime-layer gap of the dev/CI/runtime
 * triad for the v10.64.48–50 wiring documented in
 * `tests/apiKeyLoginRestore.test.js` (see also auto-memory
 * `feedback_invariant_triad.md`).
 *
 * What this asserts
 * -----------------
 * Three observations of one expected value, each catching a distinct
 * regression class:
 *
 *   (1) Network response from the live `auth_login_user` RPC includes
 *       `api_key === EXPECTED_API_KEY`. Catches Supabase RPC contract
 *       drift — e.g., the migration at 2026-05-06 that added the column
 *       being silently rolled back, or the SECURITY DEFINER body
 *       refactored to omit the field from its `jsonb_build_object` shape.
 *
 *   (2) Client-side `r.api_key` after `await window.authLogin(...)`
 *       deserializes to the same string. Catches JSON parse / typeof
 *       guard / wrapper drift — the client wraps the RPC POST in
 *       `_rpc(fn, body)` (see `shlav-a-mega.html` ~line 6499) and any
 *       middleware that mutates the response in transit would surface
 *       here even if (1) passed.
 *
 *   (3) `localStorage.samega_apikey === EXPECTED_API_KEY` after the
 *       script invokes `window.setApiKey(r.api_key)`. Catches the
 *       persistence half — `setApiKey` is a one-liner today
 *       (`localStorage.setItem('samega_apikey', k.trim())`), but the
 *       trim, the key name, and the try/catch wrapping are all silently
 *       breakable. The key name in particular is in users' browsers and
 *       cannot be renamed without orphaning their stored keys.
 *
 * The integration of (1)→(2)→(3) (i.e., `_doLogin` actually calls
 * `setApiKey(r.api_key)` on success) is already pinned by the 11
 * source-grep tests in `tests/apiKeyLoginRestore.test.js`. The runtime
 * layer here asserts the data flow, not the call graph — they're
 * complementary, not redundant.
 *
 * Why `page.waitForResponse`, NOT `page.route`
 * --------------------------------------------
 * `page.route` lets you stub or transform the network response, which
 * defeats the entire runtime-observation principle: the whole point is
 * to see what the REAL Supabase RPC returns, not what we tell Playwright
 * to pretend it returns. `waitForResponse` is purely passive — the real
 * RPC fires, the real response comes back, we just look at it. The
 * next maintainer will instinctively reach for `route()` when extending
 * this smoke; resist.
 *
 * One-time setup (the SQL-seeded burner)
 * --------------------------------------
 * The smoke reads three env vars: `TEST_USER`, `TEST_PASS`,
 * `EXPECTED_API_KEY`. The corresponding row in `app_users` was seeded via
 * direct `execute_sql` on Supabase project `krmlzwwelqvlfslwltol`:
 *
 *   INSERT INTO app_users (username, password_hash, api_key, display_name)
 *   VALUES (
 *     'smoke-burner-001',
 *     extensions.crypt('<password>', extensions.gen_salt('bf', 10)),
 *     '<expected_api_key>',
 *     'Smoke Burner (Geri scripts/smoke-api-key-restore.mjs)'
 *   )
 *   ON CONFLICT (username) DO UPDATE SET
 *     password_hash = EXCLUDED.password_hash,
 *     api_key       = EXCLUDED.api_key,
 *     display_name  = EXCLUDED.display_name;
 *
 * Setup deliberately uses direct INSERT (not auth_register_user) and
 * does NOT exercise cloudBackup — those are the subsystems we want to
 * exclude from observation (per the brokered-design note: setup
 * shouldn't entangle with the assertion path). The placeholder api_key
 * is intentionally NOT shaped like a real Anthropic / OpenAI / AWS /
 * GitHub PAT so the secret-scan PreToolUse hook won't false-positive on
 * future commits referencing it in test fixtures or PR bodies.
 *
 * Lockout note: 5 consecutive failed logins lock the burner for 15 min.
 * If repeated env-var typos lock the account, re-run the seed UPSERT
 * (the password_hash refresh resets failed_count via the UPDATE).
 *
 * Exit codes
 * ----------
 *   0  — all 3 assertions held
 *   1  — at least 1 assertion failed (or harness threw)
 *   2  — setup error (missing env vars, browser launch failure)
 *
 * Operate
 * -------
 *   TEST_USER=smoke-burner-001 \
 *   TEST_PASS=<password> \
 *   EXPECTED_API_KEY=<placeholder> \
 *   npm run smoke:api-key
 */

import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'https://eiasash.github.io/Geriatrics/shlav-a-mega.html';
const TEST_USER = process.env.TEST_USER;
const TEST_PASS = process.env.TEST_PASS;
const EXPECTED_API_KEY = process.env.EXPECTED_API_KEY;
const HEADLESS = process.env.SMOKE_HEADLESS !== '0';
const NAV_TIMEOUT_MS = Number(process.env.SMOKE_NAV_TIMEOUT_MS || 30_000);
const RPC_TIMEOUT_MS = Number(process.env.SMOKE_RPC_TIMEOUT_MS || 15_000);

if (!TEST_USER || !TEST_PASS || !EXPECTED_API_KEY) {
  console.error('smoke-api-key-restore: missing required env vars.');
  console.error('  required: TEST_USER, TEST_PASS, EXPECTED_API_KEY');
  console.error('  optional: SMOKE_URL (default live URL), SMOKE_HEADLESS (default 1),');
  console.error('            SMOKE_NAV_TIMEOUT_MS (30000), SMOKE_RPC_TIMEOUT_MS (15000)');
  process.exit(2);
}

const t0 = Date.now();

(async () => {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  let exitCode = 0;
  try {
    console.log(`smoke-api-key-restore: opening ${URL} (headless=${HEADLESS})`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // The auth IIFE in shlav-a-mega.html assigns window.authLogin and
    // window.setApiKey synchronously after script eval. domcontentloaded is
    // sufficient, but waiting on the actual functions is the correct ratchet
    // — survives a future where the IIFE moves later in the bundle, etc.
    await page.waitForFunction(
      () => typeof window.authLogin === 'function' && typeof window.setApiKey === 'function',
      { timeout: 10_000 }
    );

    // Arm the network observer BEFORE firing the RPC. waitForResponse, NOT
    // page.route — see header for the rationale. The predicate matches
    // /rest/v1/rpc/auth_login_user as a SUBSTRING so the smoke doesn't have
    // to know which Supabase project URL the app currently points at; if
    // the app gets re-pointed to a new project, the smoke still observes
    // its real outbound request as long as it's a Supabase RPC POST.
    const responsePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/rest/v1/rpc/auth_login_user') &&
        res.request().method() === 'POST',
      { timeout: RPC_TIMEOUT_MS }
    );

    // Fire the RPC + exercise setApiKey via the real client surface. Creds
    // pass into evaluate via the args object so they don't bake into the
    // script source on disk. The localStorage.removeItem call ensures
    // setApiKey's write is observable as a transition (otherwise a prior
    // smoke run leaving the value would mask whether setApiKey ran fresh).
    const result = await page.evaluate(async ({ user, pass }) => {
      localStorage.removeItem('samega_apikey');
      const r = await window.authLogin(user, pass);
      if (!r || !r.ok) {
        throw new Error('authLogin returned !ok: ' + JSON.stringify(r));
      }
      if (typeof r.api_key !== 'string') {
        throw new Error(
          'r.api_key not string; typeof=' + typeof r.api_key +
          ' value=' + JSON.stringify(r.api_key)
        );
      }
      window.setApiKey(r.api_key);
      return {
        rpcApiKey: r.api_key,
        localStorageKey: localStorage.getItem('samega_apikey'),
      };
    }, { user: TEST_USER, pass: TEST_PASS });

    // Now collect the raw network observation. By this point the RPC has
    // returned (await authLogin already settled inside evaluate), so the
    // promise resolves immediately.
    const response = await responsePromise;
    const networkBody = await response.json();

    // Three independent assertions, each with a one-line "what regression
    // class did this catch" hint so the failure message is actionable.
    const assertions = [
      {
        label: 'network.api_key (Supabase RPC return shape)',
        actual: networkBody.api_key,
        expected: EXPECTED_API_KEY,
        regression: 'Supabase auth_login_user RPC stopped emitting api_key in its JSONB response',
      },
      {
        label: 'client.r.api_key (after authLogin deserialization)',
        actual: result.rpcApiKey,
        expected: EXPECTED_API_KEY,
        regression: '_rpc client wrapper or middleware mangled api_key during deserialization',
      },
      {
        label: 'localStorage.samega_apikey (after setApiKey)',
        actual: result.localStorageKey,
        expected: EXPECTED_API_KEY,
        regression: 'setApiKey() did not persist to localStorage.samega_apikey (key renamed, write threw, trim broken)',
      },
    ];

    let failed = 0;
    for (const a of assertions) {
      if (a.actual === a.expected) {
        console.log(`  ✓ ${a.label} = ${JSON.stringify(a.actual)}`);
      } else {
        console.error(`  ✗ ${a.label}`);
        console.error(`      expected: ${JSON.stringify(a.expected)}`);
        console.error(`      got:      ${JSON.stringify(a.actual)}`);
        console.error(`      regression class: ${a.regression}`);
        failed += 1;
      }
    }

    if (failed > 0) {
      console.error(`\nsmoke-api-key-restore: ${failed}/3 assertions failed.`);
      console.error('  See tests/apiKeyLoginRestore.test.js for the static (CI-time) layer.');
      console.error('  See auto-memory feedback_invariant_triad.md for why both layers exist.');
      exitCode = 1;
    } else {
      console.log(`\nsmoke-api-key-restore: ✓ all 3 runtime assertions held in ${Date.now() - t0}ms.`);
    }
  } catch (err) {
    console.error('\nsmoke-api-key-restore: harness threw:', err.message);
    if (err.stack) console.error(err.stack);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
  process.exit(exitCode);
})();
