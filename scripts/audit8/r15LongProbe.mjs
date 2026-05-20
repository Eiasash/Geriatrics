#!/usr/bin/env node
// AUDIT-8 G5 R1.5 long-duration mechanism-capture probe.
//
// Mission: deterministically reproduce the Phase-1 → Phase-2 bifurcation
// observed in `chaos-reports/v4-long/audit8_20260518T191705Z/` (#238 RESULT,
// #241 disk evidence), capturing first-failure DOM + heap + persistent state
// + network + HAR + console at the bifurcation boundary, alongside a Phase-1
// control capture at minute 30. Diff between the two artifact sets selects
// among the pre-registered hypothesis classes A–E (see
// `docs/AUDIT8_G5_R1_5_MECHANISM_CAPTURE.md`).
//
// Ships **no fix**. Procedure-only. The run + RESULT append is a subsequent
// session, gated behind this PR landing on main.
//
// Cost: free. No Claude API calls — bot loop is the real chaos-doctor-v4
// extractor + advance, against the live practice surface.
//
// Env knobs (all optional):
//   R15_PROBE_URL                  live URL (default https://eiasash.github.io/Geriatrics/)
//   R15_PROBE_MIN_HOURS            min run hours before bail (default 6)
//   R15_PROBE_MAX_HOURS            max run hours (RED-NOT-REPRODUCED bail) (default 10)
//   R15_PROBE_HEADLESS             0 to run headed (default headless)
//   R15_PROBE_OUT_DIR              output directory (default chaos-reports/v4-long/audit8r15_<ts>/)
//   R15_PROBE_LABEL                free-form label embedded in the timeline
//   R15_PROBE_READ_PAUSE_MS        delay between attempts (default 2500)
//   R15_PROBE_PHASE1_CONTROL_MIN   minute at which Phase-1 control is captured (default 30)
//   R15_PROBE_RED_OK_MIN_THRESHOLD     ok/min threshold for the ok-window (default 1)
//   R15_PROBE_RED_OK_WINDOW_MINUTES    contiguous ok-minutes required (default 60)
//   R15_PROBE_RED_SKIP_MIN_THRESHOLD   pre-pick-skip/min threshold for the streak (default 5)
//   R15_PROBE_RED_SKIP_STREAK_MINUTES  contiguous skip-minutes required (default 10)
//   R15_PROBE_NET_BUFFER_SIZE      ring-buffer size for network records (default 20)
//   R15_PROBE_CONSOLE_BUFFER_SIZE  console buffer cap (default 5000)
//
// Output: per-minute records appended to `<out>/timeline.jsonl`. Captures:
//   phase1control-* (taken at minute PHASE1_CONTROL_MIN)
//   firstfail-* (taken when the trigger predicate fires)
// plus a final `<out>/summary.json` with the run outcome.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { extractQuestion, ensureOnPracticeQuiz } from '../chaos-doctor-bot-v4.mjs';
import {
  DEFAULT_CONFIG,
  shouldTriggerFirstFailure,
  shouldCaptureControl,
  detectRedCrossing,
  buildMinuteRecord,
} from './r15LongProbeLogic.mjs';

// Re-export the pure logic so callers that only need the predicates can
// import them from the probe directly (the test suite imports from the
// logic file to bypass the playwright/chaos-bot transformer hazard).
export {
  DEFAULT_CONFIG,
  shouldTriggerFirstFailure,
  shouldCaptureControl,
  detectRedCrossing,
  buildMinuteRecord,
};

const URL_DEFAULT = DEFAULT_CONFIG.url;

function loadConfig() {
  return {
    url: process.env.R15_PROBE_URL || DEFAULT_CONFIG.url,
    minHours: Math.max(0.05, Number(process.env.R15_PROBE_MIN_HOURS || DEFAULT_CONFIG.minHours)),
    maxHours: Math.max(0.1, Number(process.env.R15_PROBE_MAX_HOURS || DEFAULT_CONFIG.maxHours)),
    headless: process.env.R15_PROBE_HEADLESS !== '0',
    outDir: process.env.R15_PROBE_OUT_DIR || null,
    label: process.env.R15_PROBE_LABEL || DEFAULT_CONFIG.label,
    readPauseMs: Math.max(100, Number(process.env.R15_PROBE_READ_PAUSE_MS || DEFAULT_CONFIG.readPauseMs)),
    phase1ControlMinute: Math.max(1, Number(process.env.R15_PROBE_PHASE1_CONTROL_MIN || DEFAULT_CONFIG.phase1ControlMinute)),
    redOkMinThreshold: Math.max(0, Number(process.env.R15_PROBE_RED_OK_MIN_THRESHOLD || DEFAULT_CONFIG.redOkMinThreshold)),
    redOkWindowMinutes: Math.max(1, Number(process.env.R15_PROBE_RED_OK_WINDOW_MINUTES || DEFAULT_CONFIG.redOkWindowMinutes)),
    redSkipMinThreshold: Math.max(0, Number(process.env.R15_PROBE_RED_SKIP_MIN_THRESHOLD || DEFAULT_CONFIG.redSkipMinThreshold)),
    redSkipStreakMinutes: Math.max(1, Number(process.env.R15_PROBE_RED_SKIP_STREAK_MINUTES || DEFAULT_CONFIG.redSkipStreakMinutes)),
    netBufferSize: Math.max(1, Number(process.env.R15_PROBE_NET_BUFFER_SIZE || DEFAULT_CONFIG.netBufferSize)),
    consoleBufferSize: Math.max(100, Number(process.env.R15_PROBE_CONSOLE_BUFFER_SIZE || DEFAULT_CONFIG.consoleBufferSize)),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// RUNNER (browser-driven). Pure decision logic lives in r15LongProbeLogic.mjs
// (imported above) so the vitest suite can pin it without dragging the
// playwright + chaos-doctor-bot-v4 imports through esbuild.
// ---------------------------------------------------------------------------

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

async function snapshotPerf(page) {
  return await page.evaluate(() => {
    try {
      const m = (typeof performance !== 'undefined' && performance && performance.memory)
        ? performance.memory : null;
      if (!m) return null;
      return {
        usedJSHeapSize: m.usedJSHeapSize,
        totalJSHeapSize: m.totalJSHeapSize,
        jsHeapSizeLimit: m.jsHeapSizeLimit,
      };
    } catch (_) { return null; }
  }).catch(() => null);
}

async function snapshotDomNodeCount(page) {
  return await page.evaluate(() => {
    try { return document.querySelectorAll('*').length; } catch (_) { return null; }
  }).catch(() => null);
}

async function snapshotServiceWorkerCount(page) {
  return await page.evaluate(async () => {
    try {
      if (!navigator || !navigator.serviceWorker) return 0;
      const regs = await navigator.serviceWorker.getRegistrations();
      return regs.length;
    } catch (_) { return null; }
  }).catch(() => null);
}

async function snapshotPersistentState(page) {
  return await page.evaluate(async () => {
    const out = { idb: null, ls: null, sw: null };
    try {
      out.ls = Object.fromEntries(Object.entries({ ...localStorage }));
    } catch (_) { out.ls = { __error: 'localStorage-read-failed' }; }
    try {
      const dbs = (typeof indexedDB !== 'undefined' && indexedDB.databases)
        ? await indexedDB.databases() : [];
      const idb = {};
      for (const meta of dbs) {
        if (!meta || !meta.name) continue;
        idb[meta.name] = { version: meta.version, stores: {} };
        try {
          await new Promise((resolve, reject) => {
            const req = indexedDB.open(meta.name);
            req.onsuccess = () => {
              try {
                const db = req.result;
                const storeNames = Array.from(db.objectStoreNames || []);
                let pending = storeNames.length;
                if (pending === 0) { db.close(); resolve(); return; }
                for (const sn of storeNames) {
                  try {
                    const tx = db.transaction(sn, 'readonly');
                    const store = tx.objectStore(sn);
                    const cnt = store.count();
                    cnt.onsuccess = () => {
                      idb[meta.name].stores[sn] = { count: cnt.result };
                      if (--pending === 0) { db.close(); resolve(); }
                    };
                    cnt.onerror = () => {
                      idb[meta.name].stores[sn] = { error: 'count-failed' };
                      if (--pending === 0) { db.close(); resolve(); }
                    };
                  } catch (e) {
                    idb[meta.name].stores[sn] = { error: String(e && e.message || e) };
                    if (--pending === 0) { db.close(); resolve(); }
                  }
                }
              } catch (e) { reject(e); }
            };
            req.onerror = () => reject(req.error || new Error('idb-open-failed'));
          });
        } catch (e) {
          idb[meta.name].error = String(e && e.message || e);
        }
      }
      out.idb = idb;
    } catch (e) { out.idb = { __error: String(e && e.message || e) }; }
    try {
      if (navigator && navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        out.sw = regs.map((r) => ({
          scope: r.scope,
          active: r.active ? { state: r.active.state, scriptURL: r.active.scriptURL } : null,
          waiting: r.waiting ? { state: r.waiting.state } : null,
          installing: r.installing ? { state: r.installing.state } : null,
        }));
      } else {
        out.sw = [];
      }
    } catch (e) { out.sw = { __error: String(e && e.message || e) }; }
    return out;
  }).catch((e) => ({ __error: String(e && e.message || e) }));
}

async function writeCapture(outDir, prefix, parts) {
  await Promise.all([
    fs.writeFile(path.join(outDir, `${prefix}-dom.html`), parts.dom || '<!-- dom-snapshot-failed -->'),
    fs.writeFile(path.join(outDir, `${prefix}-console.jsonl`), (parts.consoleBuf || []).map((e) => JSON.stringify(e)).join('\n')),
    fs.writeFile(path.join(outDir, `${prefix}-perf.json`), JSON.stringify(parts.perf || null, null, 2)),
    fs.writeFile(path.join(outDir, `${prefix}-net.jsonl`), (parts.netBuf || []).map((e) => JSON.stringify(e)).join('\n')),
    fs.writeFile(path.join(outDir, `${prefix}-toranot.json`), JSON.stringify(parts.toranot || { absent: true }, null, 2)),
    fs.writeFile(path.join(outDir, `${prefix}-persist.json`), JSON.stringify(parts.persist || null, null, 2)),
  ]);
}

async function captureSet({ page, context, outDir, prefix, consoleBuf, netBuf }) {
  const dom = await page.content().catch(() => null);
  const perf = await snapshotPerf(page);
  const persist = await snapshotPersistentState(page);
  await page.screenshot({ path: path.join(outDir, `${prefix}-screenshot.png`), fullPage: true }).catch(() => {});
  let toranot = { absent: true };
  for (let i = netBuf.length - 1; i >= 0; i--) {
    const n = netBuf[i];
    if (n && typeof n.url === 'string' && n.url.includes('toranot.netlify.app/api/claude')) {
      toranot = {
        url: n.url,
        method: n.method,
        status: n.status,
        responseHeaders: n.responseHeaders || null,
        requestedAt: n.requestedAt,
        respondedAt: n.respondedAt,
      };
      break;
    }
  }
  // Stop tracing → emit .zip; start a fresh trace for the next window.
  try {
    await context.tracing.stop({ path: path.join(outDir, `${prefix}-trace.zip`) });
    await context.tracing.start({ snapshots: true, screenshots: true, sources: false });
  } catch (_) { /* tolerate; the diff/dom/perf paths are the primary signal */ }
  await writeCapture(outDir, prefix, {
    dom,
    consoleBuf: consoleBuf.slice(),
    perf,
    netBuf: netBuf.slice(),
    toranot,
    persist,
  });
}

async function advance(page) {
  const next0 = page.locator('[aria-label="Next question"], [aria-label="Finish exam"]').first();
  if ((await next0.count().catch(() => 0)) > 0) {
    await next0.click({ timeout: 2500 }).catch(() => {});
    return 'next-direct';
  }
  const qo0 = page.locator('button.qo').first();
  if ((await qo0.count().catch(() => 0)) === 0) return 'no-qo';
  await qo0.click({ timeout: 2500 }).catch(() => {});
  await sleep(150);
  const check = page.locator('[aria-label="Check answer"]').first();
  if ((await check.count().catch(() => 0)) > 0) {
    await check.click({ timeout: 2500 }).catch(() => {});
    await sleep(250);
  }
  const next1 = page.locator('[aria-label="Next question"], [aria-label="Finish exam"]').first();
  if ((await next1.count().catch(() => 0)) > 0) {
    await next1.click({ timeout: 2500 }).catch(() => {});
    return 'next-after-check';
  }
  return 'stuck';
}

async function main() {
  const CONFIG = loadConfig();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = CONFIG.outDir || path.join(process.cwd(), 'chaos-reports', 'v4-long', `audit8r15_${ts}`);
  await ensureDir(outDir);

  const timelinePath = path.join(outDir, 'timeline.jsonl');
  const summaryPath = path.join(outDir, 'summary.json');
  const timelineHandle = await fs.open(timelinePath, 'a');

  console.log(`[r15LongProbe] starting at ${nowIso()} → ${outDir}`);
  console.log(`[r15LongProbe] min=${CONFIG.minHours}h max=${CONFIG.maxHours}h ctrl@min=${CONFIG.phase1ControlMinute}`);

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  // Tracing is started before page navigation so the Phase-1 control window
  // captures the whole bot warm-up; it is stopped + restarted at each capture.
  try { await context.tracing.start({ snapshots: true, screenshots: true, sources: false }); } catch (_) {}

  const page = await context.newPage();

  // Console + network ring buffers. The console buffer is bounded; entries
  // older than consoleBufferSize are dropped. Network buffer keeps the last
  // netBufferSize requests with response metadata.
  const consoleBuf = [];
  const netBuf = [];
  page.on('console', (msg) => {
    try {
      const e = { ts: nowIso(), type: msg.type(), text: msg.text() };
      consoleBuf.push(e);
      if (consoleBuf.length > CONFIG.consoleBufferSize) consoleBuf.splice(0, consoleBuf.length - CONFIG.consoleBufferSize);
    } catch (_) {}
  });
  page.on('pageerror', (err) => {
    try {
      consoleBuf.push({ ts: nowIso(), type: 'pageerror', text: String(err && err.message || err), stack: (err && err.stack) || null });
      if (consoleBuf.length > CONFIG.consoleBufferSize) consoleBuf.splice(0, consoleBuf.length - CONFIG.consoleBufferSize);
    } catch (_) {}
  });
  context.on('requestfinished', async (req) => {
    try {
      const res = await req.response();
      const rec = {
        url: req.url(),
        method: req.method(),
        status: res ? res.status() : null,
        requestHeaders: req.headers(),
        responseHeaders: res ? res.headers() : null,
        requestedAt: nowIso(),
        respondedAt: nowIso(),
      };
      netBuf.push(rec);
      if (netBuf.length > CONFIG.netBufferSize) netBuf.splice(0, netBuf.length - CONFIG.netBufferSize);
    } catch (_) {}
  });

  const startMs = Date.now();
  const startIso = nowIso();
  const minHoursMs = CONFIG.minHours * 3600_000;
  const maxHoursMs = CONFIG.maxHours * 3600_000;

  // Running counters; the bot's per-iteration outcomes update these.
  let cumulativeOk = 0;
  let cumulativePrePickSkip = 0;
  let lastExtractOutcome = null;

  let prevCumulativeOk = 0;
  let prevCumulativePrePickSkip = 0;
  let lastMinuteIndex = -1;
  let prevMinuteRecord = null;
  const recentTimeline = []; // last ~120 minutes; bounded to cap memory

  let controlCaptured = false;
  let firstFailCaptured = false;
  let redCrossingAt = null;
  let outcome = 'UNKNOWN';

  // Initial navigation + warm-up.
  try {
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (e) {
    console.error('[r15LongProbe] initial nav failed', e);
    outcome = 'NAV-FAILED';
  }

  const log = (..._args) => { /* bot's `log` callback — suppressed to keep stdout one-line-per-minute */ };

  // The bot loop runs until either: (1) RED criterion triggers, (2) first-fail
  // fires + we've captured both, (3) maxHours elapsed.
  while (true) {
    const elapsedMs = Date.now() - startMs;
    if (elapsedMs >= maxHoursMs) { outcome = outcome === 'UNKNOWN' ? 'RED-NOT-REPRODUCED' : outcome; break; }

    // Bot iteration.
    const onQuiz = await ensureOnPracticeQuiz(page, log).catch(() => false);
    if (!onQuiz) {
      cumulativePrePickSkip += 1;
      lastExtractOutcome = 'no-quiz';
    } else {
      const q = await extractQuestion(page).catch(() => null);
      if (!q || !q.options || q.options.length < 2) {
        cumulativePrePickSkip += 1;
        lastExtractOutcome = q ? 'no-options' : 'null';
      } else {
        cumulativeOk += 1;
        lastExtractOutcome = 'ok';
      }
      await advance(page).catch(() => {});
    }

    // Minute aggregation. We aggregate by *wall-clock minute since start*,
    // not by iteration count — matches the per-minute analysis used in #241.
    const minuteIndex = Math.floor(elapsedMs / 60_000);
    if (minuteIndex !== lastMinuteIndex) {
      // Flush the previous minute (lastMinuteIndex), which is now sealed.
      if (lastMinuteIndex >= 0) {
        // (Already handled in the prior iteration's branch; nothing to do.)
      }
      // Build & write a record for the minute we just entered. We do NOT
      // wait for the minute to elapse to flush — we write at the entry
      // boundary so capture triggers can act on the latest sealed minute.
      const rec = buildMinuteRecord({
        minuteIndex,
        ts: nowIso(),
        cumulativeOk,
        cumulativePrePickSkip,
        prevCumulativeOk,
        prevCumulativePrePickSkip,
        lastExtractOutcome,
        perfMemory: await snapshotPerf(page),
        domNodeCount: await snapshotDomNodeCount(page),
        serviceWorkerCount: await snapshotServiceWorkerCount(page),
      });
      await timelineHandle.appendFile(JSON.stringify(rec) + '\n');
      recentTimeline.push(rec);
      if (recentTimeline.length > 600) recentTimeline.splice(0, recentTimeline.length - 600);

      // Phase-1 control (R1.5.2).
      if (shouldCaptureControl(minuteIndex, CONFIG, controlCaptured)) {
        console.log(`[r15LongProbe] minute ${minuteIndex}: Phase-1 control capture`);
        try {
          await captureSet({ page, context, outDir, prefix: 'phase1control', consoleBuf, netBuf });
          controlCaptured = true;
        } catch (e) {
          console.error('[r15LongProbe] phase1control capture failed', e);
        }
      }

      // First-failure trigger (R1.5.1). Only fires after the control is in
      // hand — otherwise we'd lose the diff baseline.
      if (controlCaptured && !firstFailCaptured && shouldTriggerFirstFailure(prevMinuteRecord, rec)) {
        console.log(`[r15LongProbe] minute ${minuteIndex}: first-failure capture`);
        try {
          await captureSet({ page, context, outDir, prefix: 'firstfail', consoleBuf, netBuf });
          firstFailCaptured = true;
        } catch (e) {
          console.error('[r15LongProbe] firstfail capture failed', e);
        }
      }

      // RED criterion (R1.5.0). Probed once per minute against the rolling
      // timeline. Exits the loop early; we still respect minHours floor.
      if (!redCrossingAt) {
        const cross = detectRedCrossing(recentTimeline, CONFIG);
        if (cross) {
          redCrossingAt = { atMinuteIndex: minuteIndex, ...cross };
          console.log(`[r15LongProbe] minute ${minuteIndex}: RED crossing detected`, cross);
        }
      }

      // Exit conditions: RED crossing AND firstfail captured AND past minHours.
      if (redCrossingAt && firstFailCaptured && elapsedMs >= minHoursMs) {
        outcome = 'RED-REPRODUCED';
        break;
      }

      prevCumulativeOk = cumulativeOk;
      prevCumulativePrePickSkip = cumulativePrePickSkip;
      prevMinuteRecord = rec;
      lastMinuteIndex = minuteIndex;
    }

    await sleep(CONFIG.readPauseMs);
  }

  await timelineHandle.close().catch(() => {});

  // Final summary.
  const summary = {
    schema: 'r15-summary-v1',
    label: CONFIG.label,
    url: CONFIG.url,
    config: CONFIG,
    startedAt: startIso,
    finishedAt: nowIso(),
    durationMs: Date.now() - startMs,
    cumulativeOk,
    cumulativePrePickSkip,
    controlCaptured,
    firstFailCaptured,
    redCrossingAt,
    outcome,
    outDir,
  };
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));

  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

// Only run when invoked as a CLI; tests import the pure functions above
// without triggering the browser-driven runner.
const isMain = (() => {
  try {
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
    const self = path.resolve(new URL(import.meta.url).pathname);
    return invoked === self;
  } catch (_) { return false; }
})();
if (isMain) {
  main().catch((e) => { console.error('[r15LongProbe] FATAL', e); process.exitCode = 1; });
}
