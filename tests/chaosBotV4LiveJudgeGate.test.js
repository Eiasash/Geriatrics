// AUDIT-8 G5 — live judge-call regression gate (the "instrument is inert" guard).
//
// FAILURE CLASS: the v4 chaos bot pins its practice-surface entry + answer-reveal
// to a live aria-label (`check answer`). When the monolith's a11y labels drift
// (PR #290, 2026-05-26, made the button bilingual → broke exact-match
// `[aria-label="Check answer"]`), the bot silently goes inert: it launches, finds
// no practice surface, and produces ZERO judge calls — an 8 h / $20 R3 run would
// burn for 0 findings. A fixture test that only checks the selector *string*
// resolves cannot catch this — the live DOM is the thing that drifts. Only a live
// run that counts the producer's actual judge-call counter catches the class.
//
// This gate spawns a short live smoke and asserts the bot's OWN judge-call counter
// (`actions[].type === 'ai-judge'`, emitted at chaos-doctor-bot-v4.mjs:604,
// aggregated identically at :1037-1038) is > 0. Hard-fails (non-zero exit) on 0.
//
// It is env-gated (CHAOS_LIVE_SMOKE=1) so default `npm test` / CI stays offline +
// free. Run it as the R3 pre-flight gate:
//   CHAOS_LIVE_SMOKE=1 npx vitest run tests/chaosBotV4LiveJudgeGate.test.js
// Do NOT fire R3 unless this gate is green.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT = path.join(ROOT, 'scripts', 'chaos-doctor-bot-v4.mjs');
const LIVE = process.env.CHAOS_LIVE_SMOKE === '1';

// --- Always-on structural pins (cheap; keep the gate's contract from rotting) ---
// These do NOT replace the live gate (a string check can't catch live-DOM drift);
// they pin (a) the exact-match selector that #290 broke is not reintroduced, and
// (b) the producer judge-call counter the live gate reads still exists.
describe('chaosBotV4 check-answer selector + judge-counter contract', () => {
  const src = fs.readFileSync(BOT, 'utf8');

  it('does NOT use the exact-match [aria-label="Check answer"] selector (#290 regression)', () => {
    expect(src).not.toContain('[aria-label="Check answer"]');
  });

  it('uses the case-insensitive substring matcher that survives i18n label drift', () => {
    const hits = src.match(/\[aria-label\*="check answer" i\]/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(3); // :504 reveal, :865 entry, :892 confirm
  });

  it('still emits + aggregates the ai-judge producer counter the live gate reads', () => {
    expect(src).toContain("type: 'ai-judge'");          // emit site (:604)
    expect(src).toContain("a.type === 'ai-judge'");      // aggregation (:1038)
  });
});

// --- The real guard: live judge-call count must be > 0 ---
describe.skipIf(!LIVE)('chaosBotV4 LIVE judge-call gate (CHAOS_LIVE_SMOKE=1)', () => {
  it('produces > 0 judge calls against the live practice surface', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'r3-judge-gate-'));
    execFileSync('node', [BOT], {
      cwd: ROOT,
      timeout: 170_000,
      encoding: 'utf8',
      stdio: 'inherit',
      env: {
        ...process.env,
        CHAOS_DURATION_MS: '120000',     // 2-min attempt budget
        CHAOS_COST_CAP_USD: '1.0',       // safety cap (smoke costs ~$0.05)
        CHAOS_USERS: '1',
        CHAOS_MODEL: 'claude-sonnet-4-6',
        CHAOS_REPORT_RATE: '0.0',        // read-only, no prod writes
        CHAOS_FEEDBACK_RATE: '0.0',
        CHAOS_REPORT_DIR: outDir,
      },
    });

    const summaryFile = fs.readdirSync(outDir).find((f) => f.endsWith('.json'));
    expect(summaryFile, 'bot wrote a summary JSON').toBeTruthy();
    const report = JSON.parse(fs.readFileSync(path.join(outDir, summaryFile), 'utf8'));

    // Source-pinned to the producer: same derivation as buildMarkdown :1037-1038.
    const judgeCalls = (report.workers || [])
      .flatMap((w) => w.actions || [])
      .filter((a) => a.type === 'ai-judge').length;

    expect(judgeCalls, 'bot is inert (0 judge calls) — live label likely drifted from the selector').toBeGreaterThan(0);
  }, 200_000);
});
