// Regression pin for v10.64.131 flipped proxy-mode default on chaos-doctor-bot v4.
// As of v10.64.131 proxy is the DEFAULT (no key needed). Direct mode is opt-in
// via CHAOS_USE_DIRECT=1 + CLAUDE_API_KEY. This pin prevents accidental loss of:
//   (a) the flipped default (would re-introduce the bash_history leak class)
//   (b) the direct-anthropic fallback path (would break Toranot-outage recovery)
// Same readFile-grep style as chaosBotV4Persona.test.js — operates on the
// source text, doesn't import the bot (which would exit(2) on missing key).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../scripts/chaos-doctor-bot-v4.mjs'),
  'utf8',
);

describe('chaos-doctor-bot v4 — proxy-mode pins', () => {
  it('exposes both API URLs as constants', () => {
    expect(SRC).toMatch(/ANTHROPIC_URL\s*=\s*'https:\/\/api\.anthropic\.com\/v1\/messages'/);
    expect(SRC).toMatch(/TORANOT_URL\s*=\s*'https:\/\/toranot\.netlify\.app\/api\/claude'/);
  });

  it('USE_PROXY defaults to true; direct mode is opt-in via CHAOS_USE_DIRECT=1', () => {
    // v10.64.131 flipped the default: proxy is now the no-key path.
    expect(SRC).toMatch(/USE_PROXY\s*=\s*process\.env\.CHAOS_USE_DIRECT\s*!==\s*'1'/);
  });

  it('API_URL routes to TORANOT_URL in proxy mode, ANTHROPIC_URL otherwise', () => {
    expect(SRC).toMatch(/API_URL\s*=\s*USE_PROXY\s*\?\s*TORANOT_URL\s*:\s*ANTHROPIC_URL/);
  });

  it('callClaude uses x-api-secret in proxy mode, x-api-key in direct mode', () => {
    // Both header keys must appear in callClaude — the ternary picks at runtime.
    expect(SRC).toMatch(/'x-api-secret':\s*KEY/);
    expect(SRC).toMatch(/'x-api-key':\s*KEY/);
    // Anthropic-version is direct-mode only (proxy is a passthrough that supplies it)
    expect(SRC).toMatch(/'anthropic-version':\s*'2023-06-01'/);
  });

  it('direct mode still requires CLAUDE_API_KEY (back-compat)', () => {
    expect(SRC).toMatch(/process\.env\.CLAUDE_API_KEY/);
    expect(SRC).toMatch(/CLAUDE_API_KEY not set/);
  });

  it('proxy mode falls back to documented secret if TORANOT_API_SECRET is unset', () => {
    expect(SRC).toMatch(/TORANOT_DEFAULT_SECRET\s*=\s*'shlav-a-mega-1f97f311d307-2026'/);
    expect(SRC).toMatch(/KEY\s*=\s*process\.env\.TORANOT_API_SECRET\s*\|\|\s*TORANOT_DEFAULT_SECRET/);
  });

  it('startup log surfaces the API mode', () => {
    expect(SRC).toMatch(/api=\$\{USE_PROXY\s*\?\s*'toranot-proxy'\s*:\s*'anthropic-direct'\}/);
  });
});
