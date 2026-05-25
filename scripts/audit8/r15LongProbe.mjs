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
//   R15_PROBE_PHASE1_LATE_MIN      minute at which Phase-1 late baseline is captured (default 200)
//   R15_PROBE_RED_OK_MIN_THRESHOLD     ok/min threshold for the ok-window (default 1)
//   R15_PROBE_RED_OK_WINDOW_MINUTES    contiguous ok-minutes required (default 60)
//   R15_PROBE_RED_SKIP_MIN_THRESHOLD   pre-pick-skip/min threshold for the streak (default 5)
//   R15_PROBE_RED_SKIP_STREAK_MINUTES  contiguous skip-minutes required (default 10)
//   R15_PROBE_FIRSTFAIL_STREAK_MINUTES contiguous Phase-2-signature minutes (deltaOk=0 AND
//                                  outcome='no-quiz') required to fire the first-failure
//                                  capture (default 3; §R1.5.1.1 debounce calibration)
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
import { fileURLToPath } from 'node:url';
import { extractQuestion, ensureOnPracticeQuiz } from '../chaos-doctor-bot-v4.mjs';
import { hashStem, normStem } from '../lib/hashStem.mjs';
import {
  DEFAULT_CONFIG,
  shouldTriggerFirstFailure,
  shouldCaptureControl,
  shouldCapturePhase1Late,
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
  shouldCapturePhase1Late,
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
    phase1LateMinute: Math.max(1, Number(process.env.R15_PROBE_PHASE1_LATE_MIN || DEFAULT_CONFIG.phase1LateMinute)),
    redOkMinThreshold: Math.max(0, Number(process.env.R15_PROBE_RED_OK_MIN_THRESHOLD || DEFAULT_CONFIG.redOkMinThreshold)),
    redOkWindowMinutes: Math.max(1, Number(process.env.R15_PROBE_RED_OK_WINDOW_MINUTES || DEFAULT_CONFIG.redOkWindowMinutes)),
    redSkipMinThreshold: Math.max(0, Number(process.env.R15_PROBE_RED_SKIP_MIN_THRESHOLD || DEFAULT_CONFIG.redSkipMinThreshold)),
    redSkipStreakMinutes: Math.max(1, Number(process.env.R15_PROBE_RED_SKIP_STREAK_MINUTES || DEFAULT_CONFIG.redSkipStreakMinutes)),
    firstFailStreakMinutes: Math.max(1, Number(process.env.R15_PROBE_FIRSTFAIL_STREAK_MINUTES || DEFAULT_CONFIG.firstFailStreakMinutes)),
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

// R1.5-doc Class B discriminator (PWA page-state accumulation: event-listener
// growth, render-buffer drift). Cumulative DOM mutation count since the
// observer was installed just after initial nav. A sharp delta between
// phase1control / phase1late / firstfail captures says "structural drift
// at the transition"; a flat delta + same DOM node count says "structure
// stable, look at Class A heap or Class C connection state."
//
// R1.6 diagnostic (path (a), 2026-05-24 evening — pre-registered by §R1.5.2-REV3,
// PR #278): the v10.64.130 smoke pair produced { count: null, installedAt: null }
// at every per-minute snapshot from minuteIndex=0. Both fields nulling together
// rules out "install succeeded, observer never fired" and points at the install
// itself not landing visibly to the snapshot. The augmented payload below
// surfaces the swallowed error, identity drift between install and snapshot
// (via a window-bound + DOM-attribute-bound tag), and readyState progression —
// the minimum forensic signal needed to pick the actual repair in R1.7.
// Pre-existing fields (count, installedAt) preserved verbatim so any consumer
// reading just those still works; new info under .diag.
let installDiagnostic = null;

async function snapshotMutationCount(page) {
  const snap = await page.evaluate(() => {
    const out = {
      count: null,
      installedAt: null,
      tagOnWindow: null,
      tagOnDocEl: null,
      readyState: null,
      docElTagName: null,
      readError: null,
    };
    try {
      const c = window.__r15MutationCount;
      const installedAt = window.__r15MutationCounterInstalledAt;
      out.count = typeof c === 'number' ? c : null;
      out.installedAt = installedAt || null;
      out.tagOnWindow = window.__r15InstallTag || null;
      out.tagOnDocEl = document.documentElement
        ? document.documentElement.getAttribute('data-r15-tag')
        : null;
      out.readyState = document.readyState;
      out.docElTagName = document.documentElement ? document.documentElement.tagName : null;
    } catch (e) {
      out.readError = { name: (e && e.name) || 'Error', message: (e && e.message) || String(e) };
    }
    return out;
  }).catch((e) => ({
    count: null,
    installedAt: null,
    tagOnWindow: null,
    tagOnDocEl: null,
    readyState: null,
    docElTagName: null,
    readError: {
      name: (e && e.name) || 'EvaluateError',
      message: (e && e.message) || String(e),
      outer: true,
    },
  }));
  const install = installDiagnostic || null;
  const tagMatchWindow = install && install.tag && snap.tagOnWindow ? install.tag === snap.tagOnWindow : null;
  const tagMatchDocEl  = install && install.tag && snap.tagOnDocEl  ? install.tag === snap.tagOnDocEl  : null;
  return {
    count: snap.count,
    installedAt: snap.installedAt,
    diag: {
      readyStateAtSnapshot: snap.readyState,
      docElTagNameAtSnapshot: snap.docElTagName,
      tagOnWindow: snap.tagOnWindow,
      tagOnDocEl: snap.tagOnDocEl,
      tagMatchWindow,
      tagMatchDocEl,
      readError: snap.readError,
      install,
    },
  };
}

// R1.5-doc Class C discriminator (Connection/proxy/CDN). Cache API entries
// per cache. A new cache key appearing between captures suggests the SW
// swapped to a different version mid-run; an entry-count surge suggests
// the SW re-fetched the practice surface (possible CDN edge rotation).
async function snapshotCacheKeys(page) {
  return await page.evaluate(async () => {
    try {
      if (!('caches' in window)) return null;
      const keys = await caches.keys();
      const out = {};
      for (const k of keys) {
        try {
          const c = await caches.open(k);
          const reqs = await c.keys();
          out[k] = { entryCount: reqs.length };
        } catch (_) { out[k] = { error: 'open-failed' }; }
      }
      return out;
    } catch (_) { return null; }
  }).catch(() => null);
}

// R1.5-doc Class C discriminator (the precise script URL of the active
// service worker). The existing snapshotPersistentState captures
// registrations, but the controller — the SW that actually owns the
// page — is a separate handle. If `scriptURL` changes between captures,
// a SW update took control of the page mid-run; that's a plausible
// Phase-2 trigger absent from the current capture set.
async function snapshotControllerUrl(page) {
  return await page.evaluate(() => {
    try {
      if (!navigator.serviceWorker) return null;
      const c = navigator.serviceWorker.controller;
      return c ? { scriptURL: c.scriptURL, state: c.state } : null;
    } catch (_) { return null; }
  }).catch(() => null);
}

// Install the MutationObserver counter once after initial nav. Counts
// every mutation on document.documentElement. Idempotent — re-running
// is a no-op. Caveat: if a hard reload happens (window context replaced
// by SW navigation preload, etc.), the counter resets; that reset
// itself is a Class B/C signal worth reading (snapshotMutationCount
// returns installedAt so the diff can detect re-installations).
//
// R1.6 diagnostic (path (a), 2026-05-24 evening): the prior body swallowed
// install errors via `.catch(() => {})` and the inner `try { … } catch (_) {}`,
// which is exactly what made the v10.64.130 smoke-pair null debuggable only
// at REV3-level. The body below: (1) returns a structured outcome from
// page.evaluate (preInstalled / tag / installError / readyStateAtInstall /
// hasMutationObserver / docElTagName), (2) console.errors any install failure
// AND any "evaluate returned with no install path" anomaly, (3) tags the install
// with both window.__r15InstallTag AND a data-r15-tag attribute on documentElement
// so the snapshot can detect identity drift on either axis, (4) persists the
// result in the module-level installDiagnostic so every later snapshot can
// include it. No behavior change to the install itself; everything new is
// diagnostic surface for R1.7.
async function installMutationCounter(page) {
  const result = await page.evaluate(() => {
    const out = {
      readyStateAtInstall: null,
      hasMutationObserver: null,
      preInstalled: null,
      tag: null,
      installError: null,
      docElTagName: null,
    };
    try {
      out.readyStateAtInstall = document.readyState;
      out.hasMutationObserver = typeof MutationObserver === 'function';
      out.docElTagName = document.documentElement ? document.documentElement.tagName : null;
      out.preInstalled = typeof window.__r15MutationCount === 'number';
      if (out.preInstalled) {
        out.tag = window.__r15InstallTag || null;
        return out;
      }
      const tag = 'inst-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      window.__r15MutationCount = 0;
      window.__r15MutationCounterInstalledAt = Date.now();
      window.__r15InstallTag = tag;
      if (document.documentElement) {
        document.documentElement.setAttribute('data-r15-tag', tag);
      }
      const obs = new MutationObserver((muts) => {
        window.__r15MutationCount += muts.length;
      });
      obs.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, characterData: true,
      });
      out.tag = tag;
    } catch (e) {
      out.installError = { name: (e && e.name) || 'Error', message: (e && e.message) || String(e) };
    }
    return out;
  }).catch((e) => ({
    readyStateAtInstall: null,
    hasMutationObserver: null,
    preInstalled: null,
    tag: null,
    installError: {
      name: (e && e.name) || 'EvaluateError',
      message: (e && e.message) || String(e),
      outer: true,
    },
    docElTagName: null,
  }));
  if (result.installError) {
    console.error('[r15LongProbe] installMutationCounter error:', JSON.stringify(result.installError));
  } else if (!result.preInstalled && !result.tag) {
    console.error('[r15LongProbe] installMutationCounter: page.evaluate returned but no install path ran (preInstalled=false, tag=null)');
  }
  installDiagnostic = result;
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
    fs.writeFile(path.join(outDir, `${prefix}-mutation.json`), JSON.stringify(parts.mutation || null, null, 2)),
    fs.writeFile(path.join(outDir, `${prefix}-cache-keys.json`), JSON.stringify(parts.cacheKeys || null, null, 2)),
    fs.writeFile(path.join(outDir, `${prefix}-controller.json`), JSON.stringify(parts.controller || null, null, 2)),
    fs.writeFile(path.join(outDir, `${prefix}-extract-probe.json`), JSON.stringify(parts.extractProbe || null, null, 2)),
  ]);
}

async function captureSet({ page, context, outDir, prefix, consoleBuf, netBuf }) {
  const dom = await page.content().catch(() => null);
  const perf = await snapshotPerf(page);
  const persist = await snapshotPersistentState(page);
  const mutation = await snapshotMutationCount(page);
  const cacheKeys = await snapshotCacheKeys(page);
  const controller = await snapshotControllerUrl(page);
  await page.screenshot({ path: path.join(outDir, `${prefix}-screenshot.png`), fullPage: true }).catch(() => {});
  // ExtractQuestion probe runs AFTER the screenshot so the screenshot
  // captures the pre-probe page state. The probe is read-only; it does
  // not advance the bot's quiz position (extractQuestion source verified
  // at chaos-doctor-bot-v4.mjs:239-265).
  const extractProbe = await probeExtractQuestion(page);
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
    mutation,
    cacheKeys,
    controller,
    extractProbe,
  });
}

// R1.5-doc Class B verification (NOT a class discriminator — a direct
// observation of whether `extractQuestion` succeeds at capture time).
// At phase1control we expect 5/5 successful extracts; at firstfail we
// expect 5/5 nulls or near-zero stems. A mismatch (e.g., 3/5 success at
// firstfail) says the page state is intermittent rather than locked,
// which would re-open the R1.0b extractor-regression hypothesis the
// R1.5 doc's bisect-window argument otherwise rules out. Hash-aware so
// the diff can detect "same broken question repeating" vs "different
// questions all extracting cleanly." extractQuestion is read-only
// (verified at chaos-doctor-bot-v4.mjs:239-265 — locator.innerText
// only, no clicks), so calling it 5x here does not advance the bot's
// quiz position.
async function probeExtractQuestion(page) {
  const results = [];
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    let r = null;
    let err = null;
    try {
      r = await extractQuestion(page);
    } catch (e) {
      err = String((e && e.message) || e);
    }
    const stem = r && r.stem ? r.stem : null;
    results.push({
      attempt: i + 1,
      ts: nowIso(),
      elapsedMs: Date.now() - start,
      ok: !!(r && r.options && r.options.length >= 2),
      stemHash: stem ? hashStem(normStem(stem)) : null,
      stemPrefix: stem ? stem.slice(0, 60) : null,
      optionsCount: Array.isArray(r && r.options) ? r.options.length : 0,
      error: err,
    });
    await sleep(200);
  }
  return results;
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
  const recentTimeline = []; // last ~120 minutes; bounded to cap memory

  let controlCaptured = false;
  let phase1LateCaptured = false;
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

  // Install the MutationObserver counter so the snapshot helpers can
  // read window.__r15MutationCount at each capture. Idempotent.
  await installMutationCounter(page);

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
        mutationCount: await snapshotMutationCount(page),
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

      // Phase-1 late capture — bridges the observation gap between
      // phase1control (min 30) and firstfail (~min 290 in the 2026-05-24
      // calibration). Diff phase1control↔phase1late surfaces gradual
      // drift (R1.5-doc Class A heap, Class B PWA listener accumulation);
      // diff phase1late↔firstfail surfaces what changed AT the
      // transition (R1.5-doc Class B page-state, Class C connection,
      // Class D bot-profile-state corruption).
      if (shouldCapturePhase1Late(minuteIndex, CONFIG, phase1LateCaptured)) {
        console.log(`[r15LongProbe] minute ${minuteIndex}: Phase-1 late capture`);
        try {
          await captureSet({ page, context, outDir, prefix: 'phase1late', consoleBuf, netBuf });
          phase1LateCaptured = true;
        } catch (e) {
          console.error('[r15LongProbe] phase1late capture failed', e);
        }
      }

      // First-failure trigger (R1.5.1, with §R1.5.1.1 debounce). Only fires
      // after the control is in hand — otherwise we'd lose the diff baseline.
      // Predicate consumes the recent timeline (which already includes `rec`
      // — pushed just above) so the streak-debounce can read the last N
      // sealed minutes; runner only owns single-shot semantics via
      // firstFailCaptured.
      if (controlCaptured && !firstFailCaptured && shouldTriggerFirstFailure(recentTimeline, CONFIG)) {
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
    phase1LateCaptured,
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
    // fileURLToPath, not new URL().pathname — the latter yields "/C:/…" on
    // Windows, which path.resolve turns into "C:\C:\…" so isMain is never true.
    const self = path.resolve(fileURLToPath(import.meta.url));
    return invoked === self;
  } catch (_) { return false; }
})();
if (isMain) {
  main().catch((e) => { console.error('[r15LongProbe] FATAL', e); process.exitCode = 1; });
}
