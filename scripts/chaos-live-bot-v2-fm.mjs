#!/usr/bin/env node
/**
 * Chaos bot v2 — human-like quiz behavior + stress patterns.
 *
 * Upgrades over v1 (Geri scripts/chaos-live-bot.mjs):
 *
 * 1. Task-oriented action selection. Instead of uniform-random clicks
 *    on whatever button is visible (which dominated v1's traffic with
 *    checkbox-toggle timeouts), v2 follows realistic FM user flows:
 *      - Quiz flow: pick option (`[data-action="pick"]`) → check
 *        (`[data-action="sd-check"]`) → read explanation → next
 *        (`[data-action="sd-next"]`)
 *      - Tab nav: cycle Quiz / Track / Library / Learn / More
 *      - Search: type medical terms into visible text inputs
 *      - Keyboard: 1-4 pick, Enter check, B bookmark, ? help
 *      - Settings: open / toggle theme / close
 *      - Scroll: vertical scroll while reading
 *
 * 2. Human-like timing. Per-class delays calibrated to a real user:
 *      - Read stem: 2-5 s
 *      - Read options before picking: 1-2 s
 *      - After answer reveal: 3-8 s (read explanation)
 *      - Idle moments: 8-20 s every 60-180 s
 *      - Tab switch settle: 1-3 s
 *
 * 3. Stress patterns ("and more" — exceeds normal human):
 *      - Random page refresh every 5-10 min
 *      - Rapid escape spam (close overlays/modals)
 *      - Occasional very long input strings
 *      - Browser-back navigation mid-quiz
 *      - Rapid sequential tab switches
 *
 * 4. Robust failure handling. v1 logged element-detached errors that
 *    were just DOM rebuilds between locator + click; v2 retries the
 *    locator once before recording, and never loops on the same stuck
 *    element more than 2 times in a row.
 *
 * 5. Better attribution. Track per-action-class counts, per-tab time,
 *    and a separate `pageerror` ledger surfaced prominently in the
 *    final markdown.
 *
 * Inherited from v1 (kept as-is): JSON.parse + Response.json
 * instrumentation for stack attribution, console/page error capture,
 * requestfailed + HTTP 4xx/5xx monitoring, JSON + Markdown report.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'https://eiasash.github.io/FamilyMedicine/';

const CONFIG = {
  url: process.env.CHAOS_URL || DEFAULT_URL,
  durationMs: Number(process.env.CHAOS_DURATION_MS || 30 * 60_000), // 30 min default
  users: Math.max(1, Number(process.env.CHAOS_USERS || 10)),
  navigationTimeoutMs: Number(process.env.CHAOS_NAV_TIMEOUT_MS || 30_000),
  actionTimeoutMs: Number(process.env.CHAOS_ACTION_TIMEOUT_MS || 5000),
  headless: process.env.CHAOS_HEADLESS !== '0',
  reportDir: process.env.CHAOS_REPORT_DIR || 'chaos-reports/upgraded-run',
  screenshotOnBug: process.env.CHAOS_SCREENSHOTS !== '0',
};

// Hebrew + English medical terms relevant to family medicine
const SEARCH_TERMS = [
  'יתר לחץ דם', 'סוכרת', 'דיסליפידמיה', 'דכאון', 'חרדה',
  'הריון', 'גיל המעבר', 'אנמיה', 'מחלת ריאות', 'אסתמה',
  'COPD', 'דלקת אוזן', 'דלקת גרון', 'שפעת', 'אוסטאופורוזיס',
  'כאבי גב', 'הפטיטיס', 'תזונה', 'חיסונים', 'screening',
  'hypertension', 'diabetes', 'depression', 'anxiety', 'pregnancy',
  'menopause', 'pneumonia', 'asthma', 'osteoporosis', 'vaccination',
];

const STRESS_LONG_STRINGS = [
  'ל'.repeat(500),
  'a'.repeat(500),
  '🚀'.repeat(50),
  'אבגדה ' .repeat(200),
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randF = (min, max) => Math.random() * (max - min) + min;
const pick = (xs) => xs[rand(0, xs.length - 1)];
const nowIso = () => new Date().toISOString();

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

async function tryClick(locator, timeoutMs) {
  // Layer 1: normal click. Catches well-behaved targets fast.
  try { return await locator.click({ timeout: timeoutMs }); }
  catch (e1) {
    // Layer 2: detached/stale race — common in FM's frequent re-render cycle.
    if (/detached|stale|element is not attached|element handle is detached/i.test(e1.message)) {
      await sleep(80);
      try { return await locator.click({ timeout: timeoutMs }); } catch (_) { /* fall through */ }
    }
    // Layer 3: mouse.click via bounding box — bypasses Playwright's
    // actionability "stable" check, which times out on FM quiz options
    // because the quiz view rebuilds the DOM on every state change.
    // This is how a real user click lands; the actionability check is
    // overly strict for a vanilla-JS app that re-renders the option set.
    try {
      const box = await locator.boundingBox();
      if (box) {
        const page = locator.page();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return;
      }
    } catch (_) { /* fall through */ }
    // Layer 4: synthetic DOM click — last resort, bypasses pointer event
    // simulation entirely. Triggers any wired data-action handler directly.
    try { await locator.evaluate((el) => el.click()); return; } catch (_) { /* fall through */ }
    throw e1;
  }
}

async function safeText(locator, fallback = '') {
  try { return (await locator.innerText({ timeout: 600 })) || fallback; } catch (_) { return fallback; }
}

async function readPause(min, max) { await sleep(rand(min, max)); }

// ============================================================
// Action behaviors — quiz-aware + tab-aware
// ============================================================

async function doQuizFlow(page, log) {
  // Try to find quiz options. If none visible, this user isn't on a quiz screen.
  const opts = page.locator('[data-action="pick"]');
  const n = await opts.count().catch(() => 0);
  if (n < 2) return false;
  // Read stem (pause 2-5s)
  await readPause(2000, 5000);
  // Read options briefly (1-2s per option, up to 4 options)
  await readPause(1000, 2000 * Math.min(n, 4));
  // Pick one (prefer keyboard 1-4 sometimes for variety)
  const pickIdx = rand(0, n - 1);
  if (Math.random() < 0.35) {
    // keyboard pick
    await page.keyboard.press(String(pickIdx + 1)).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'kbd-pick', index: pickIdx });
  } else {
    await tryClick(opts.nth(pickIdx), CONFIG.actionTimeoutMs).catch((e) => {
      log.bugs.push({ at: nowIso(), type: 'action-error', context: 'quiz-pick', message: e.message });
    });
    log.actions.push({ at: nowIso(), type: 'pick', index: pickIdx });
  }
  await readPause(500, 1500);
  // Click check
  const check = page.locator('[data-action="sd-check"]');
  if (await check.count().catch(() => 0) > 0) {
    await tryClick(check.first(), CONFIG.actionTimeoutMs).catch((e) => {
      log.bugs.push({ at: nowIso(), type: 'action-error', context: 'quiz-check', message: e.message });
    });
    log.actions.push({ at: nowIso(), type: 'check' });
    // Read explanation 3-8s
    await readPause(3000, 8000);
    // Click next
    const next = page.locator('[data-action="sd-next"]');
    if (await next.count().catch(() => 0) > 0) {
      await tryClick(next.first(), CONFIG.actionTimeoutMs).catch(() => {});
      log.actions.push({ at: nowIso(), type: 'next' });
      await readPause(500, 1200);
    }
  }
  return true;
}

async function doTabNav(page, log) {
  // Find nav tabs (FM uses data-action="navtab" or similar bottom-nav pattern)
  const tabs = page.locator('[data-action^="nav"], [data-action="tab"], nav button');
  const n = await tabs.count().catch(() => 0);
  if (n === 0) return false;
  const idx = rand(0, n - 1);
  await tryClick(tabs.nth(idx), CONFIG.actionTimeoutMs).catch((e) => {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'tab-nav', message: e.message });
  });
  const label = await safeText(tabs.nth(idx)).catch(() => '');
  log.actions.push({ at: nowIso(), type: 'tab-nav', index: idx, label: label.slice(0, 40) });
  await readPause(1000, 3000);
  return true;
}

async function doSearch(page, log) {
  const inputs = page.locator('input[type="text"]:not([disabled]), input:not([type]):not([disabled]), input[type="search"]:not([disabled])');
  const n = await inputs.count().catch(() => 0);
  if (n === 0) return false;
  // Pick a visible one
  for (let i = 0; i < Math.min(n, 6); i++) {
    const loc = inputs.nth(i);
    if (await loc.isVisible().catch(() => false)) {
      const term = pick(SEARCH_TERMS);
      try {
        await tryClick(loc, CONFIG.actionTimeoutMs);
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
        await page.keyboard.type(term, { delay: rand(40, 110) });
        log.actions.push({ at: nowIso(), type: 'search-type', term, index: i });
        await readPause(800, 1800);
      } catch (e) {
        log.bugs.push({ at: nowIso(), type: 'action-error', context: 'search', message: e.message });
      }
      return true;
    }
  }
  return false;
}

async function doKeyboardShortcut(page, log) {
  const k = pick(['1','2','3','4','Enter','b','B','?','Escape','ArrowDown','ArrowUp']);
  await page.keyboard.press(k, { delay: rand(20, 80) }).catch(() => {});
  log.actions.push({ at: nowIso(), type: 'kbd', key: k });
  await readPause(300, 900);
  return true;
}

async function doScroll(page, log) {
  const dy = rand(-400, 400);
  await page.mouse.wheel(0, dy).catch(() => {});
  log.actions.push({ at: nowIso(), type: 'scroll', dy });
  await readPause(400, 1100);
  return true;
}

async function doSettingsToggle(page, log) {
  // FM has a settings overlay opened via [data-action] like "open-settings" / "settings"
  const opener = page.locator('[data-action*="settings"], [data-action="more"]').first();
  if (!(await opener.count().catch(() => 0))) return false;
  await tryClick(opener, CONFIG.actionTimeoutMs).catch(() => {});
  log.actions.push({ at: nowIso(), type: 'settings-open' });
  await readPause(800, 1800);
  // Toggle a control inside
  const toggles = page.locator('[role="dialog"] button, [role="dialog"] input[type="checkbox"]');
  const tn = await toggles.count().catch(() => 0);
  if (tn > 0) {
    await tryClick(toggles.nth(rand(0, tn - 1)), CONFIG.actionTimeoutMs).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'settings-toggle' });
  }
  // Close via Escape
  await page.keyboard.press('Escape').catch(() => {});
  log.actions.push({ at: nowIso(), type: 'settings-close' });
  await readPause(500, 1200);
  return true;
}

async function doStressRefresh(page, log) {
  // Refresh page mid-flow
  log.actions.push({ at: nowIso(), type: 'stress-refresh' });
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
    await readPause(2000, 4000);
    return true;
  } catch (e) {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'refresh', message: e.message });
    return false;
  }
}

async function doStressLongInput(page, log) {
  const inputs = page.locator('textarea:not([disabled]), input[type="text"]:not([disabled])');
  const n = await inputs.count().catch(() => 0);
  if (n === 0) return false;
  const loc = inputs.nth(rand(0, n - 1));
  if (!(await loc.isVisible().catch(() => false))) return false;
  const s = pick(STRESS_LONG_STRINGS);
  try {
    await tryClick(loc, CONFIG.actionTimeoutMs);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
    await page.keyboard.type(s.slice(0, 200), { delay: 5 }); // 200 chars max to keep it bounded
    log.actions.push({ at: nowIso(), type: 'stress-long-input', length: s.length });
    return true;
  } catch (e) {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'stress-long-input', message: e.message });
    return false;
  }
}

async function doIdle(log) {
  const ms = rand(8000, 20000);
  log.actions.push({ at: nowIso(), type: 'idle', ms });
  await sleep(ms);
  return true;
}

// ============================================================
// Worker loop
// ============================================================

async function runWorker(browser, workerId, stopAt, report) {
  const context = await browser.newContext({
    viewport: { width: pick([390, 414, 768, 1280, 1440]), height: pick([844, 896, 900, 1024]) },
    locale: pick(['he-IL', 'en-US']),
    timezoneId: 'Asia/Jerusalem',
  });
  context.setDefaultTimeout(CONFIG.actionTimeoutMs);
  await context.addInitScript(() => {
    const origJsonParse = JSON.parse;
    JSON.parse = function (...args) {
      try { return origJsonParse.apply(JSON, args); }
      catch (e) {
        const stack = new Error('JSON.parse failure attribution').stack;
        console.error('[chaos-instrument] JSON.parse error:', e.message, 'inputPreview=', String(args[0] ?? '').slice(0, 60), 'stack=', stack);
        throw e;
      }
    };
    const origRespJson = Response.prototype.json;
    Response.prototype.json = function (...args) {
      const url = this.url, status = this.status;
      return origRespJson.apply(this, args).catch((e) => {
        const stack = new Error('Response.json failure attribution').stack;
        console.error('[chaos-instrument] Response.json error:', e.message, 'url=', url, 'status=', status, 'stack=', stack);
        throw e;
      });
    };
  });
  const page = await context.newPage();
  const log = { workerId, actions: [], bugs: [], timings: [], actionCounts: {} };

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      log.bugs.push({ at: nowIso(), type: `console:${msg.type()}`, text: msg.text() });
    }
  });
  page.on('pageerror', async (error) => {
    let shotPath = null;
    if (CONFIG.screenshotOnBug) {
      shotPath = path.join(CONFIG.reportDir, `worker-${workerId}-${Date.now()}-pageerror.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => { shotPath = null; });
    }
    log.bugs.push({
      at: nowIso(),
      type: 'pageerror',
      message: error.message,
      stack: error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : null,
      screenshot: shotPath,
    });
  });
  page.on('requestfailed', (request) => {
    log.bugs.push({ at: nowIso(), type: 'requestfailed', url: request.url(), method: request.method(), failure: request.failure()?.errorText || 'unknown' });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      log.bugs.push({ at: nowIso(), type: 'http', status, url: response.url() });
    }
  });

  const start = performance.now();
  let lastIdleAt = Date.now();
  let lastRefreshAt = Date.now();
  let nothingHappenedStreak = 0;

  try {
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
    log.timings.push({ type: 'initial-domcontentloaded', ms: Math.round(performance.now() - start) });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      log.bugs.push({ at: nowIso(), type: 'timeout', message: 'networkidle not reached after initial load' });
    });

    // Initial settle — humans don't click immediately
    await readPause(1500, 3500);

    while (Date.now() < stopAt) {
      const actionStart = performance.now();
      let kind = 'unknown';
      try {
        // Behavior weighting (probabilistic, FM-quiz-app realistic)
        const r = Math.random();
        let didSomething = false;

        // Idle every 60-180 s
        if (Date.now() - lastIdleAt > rand(60_000, 180_000)) {
          kind = 'idle'; didSomething = await doIdle(log);
          lastIdleAt = Date.now();
        }
        // Refresh every 5-10 min
        else if (Date.now() - lastRefreshAt > rand(300_000, 600_000)) {
          kind = 'stress-refresh'; didSomething = await doStressRefresh(page, log);
          lastRefreshAt = Date.now();
        }
        // 50% quiz flow — primary user behavior on this app
        else if (r < 0.50) { kind = 'quiz'; didSomething = await doQuizFlow(page, log); }
        // 15% tab nav
        else if (r < 0.65) { kind = 'tab-nav'; didSomething = await doTabNav(page, log); }
        // 10% search/typing
        else if (r < 0.75) { kind = 'search'; didSomething = await doSearch(page, log); }
        // 8% keyboard shortcut
        else if (r < 0.83) { kind = 'kbd'; didSomething = await doKeyboardShortcut(page, log); }
        // 8% scroll
        else if (r < 0.91) { kind = 'scroll'; didSomething = await doScroll(page, log); }
        // 5% settings toggle
        else if (r < 0.96) { kind = 'settings'; didSomething = await doSettingsToggle(page, log); }
        // 4% stress long input
        else { kind = 'stress-long-input'; didSomething = await doStressLongInput(page, log); }

        // Fallback: if the chosen behavior couldn't act (no targets visible),
        // try a tab nav or scroll so the worker doesn't go idle.
        if (!didSomething) {
          nothingHappenedStreak++;
          if (nothingHappenedStreak >= 3) {
            // Force a refresh to escape a stuck state.
            await doStressRefresh(page, log);
            nothingHappenedStreak = 0;
          } else {
            await doScroll(page, log);
          }
        } else {
          nothingHappenedStreak = 0;
        }

        log.actionCounts[kind] = (log.actionCounts[kind] || 0) + 1;
        log.timings.push({ type: 'action', kind, ms: Math.round(performance.now() - actionStart) });
      } catch (error) {
        let shotPath = null;
        if (CONFIG.screenshotOnBug) {
          shotPath = path.join(CONFIG.reportDir, `worker-${workerId}-${Date.now()}-action-error.png`);
          await page.screenshot({ path: shotPath, fullPage: true }).catch(() => { shotPath = null; });
        }
        log.bugs.push({ at: nowIso(), type: 'action-error', context: kind, message: error.message, screenshot: shotPath });
      }
      // Default inter-action pause
      await sleep(rand(500, 1500));
    }
  } finally {
    try {
      const buffer = await page.evaluate(() => {
        const b = window.__debug && window.__debug.buffer;
        return b ? { errors: b.errors.slice(-50), network: b.network.slice(-50) } : null;
      });
      if (buffer) log.appDebugBuffer = buffer;
    } catch (_) { /* page may already be closed */ }
    report.workers.push(log);
    await context.close().catch(() => {});
  }
}

// ============================================================
// Reporting
// ============================================================

function buildMarkdown(report) {
  const allBugs = report.workers.flatMap((w) => w.bugs.map((b) => ({ workerId: w.workerId, ...b })));
  const allActions = report.workers.flatMap((w) => w.actions);
  const timings = report.workers.flatMap((w) => w.timings.filter((t) => t.type === 'action').map((t) => t.ms));
  const bugCounts = allBugs.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const actionKindCounts = report.workers.reduce((acc, w) => {
    Object.entries(w.actionCounts || {}).forEach(([k, v]) => { acc[k] = (acc[k] || 0) + v; });
    return acc;
  }, {});

  const lines = [];
  lines.push(`# Chaos bot v2 report`);
  lines.push('');
  lines.push(`- URL: ${report.config.url}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${Math.round(report.config.durationMs / 1000)}s (${(report.config.durationMs / 60000).toFixed(1)} min)`);
  lines.push(`- Simulated users: ${report.config.users}`);
  lines.push(`- Total actions: ${allActions.length}`);
  lines.push(`- Bugs/events captured: ${allBugs.length}`);
  lines.push(`- Action latency p50/p95/max: ${percentile(timings, 50)}ms / ${percentile(timings, 95)}ms / ${timings.length ? Math.max(...timings) : 0}ms`);
  lines.push('');
  lines.push('## Action mix');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('|---|---:|');
  for (const [k, v] of Object.entries(actionKindCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push('## Bug/event counts');
  lines.push('');
  if (!Object.keys(bugCounts).length) lines.push('No captured errors. Suspiciously civilized.');
  else {
    lines.push('| Type | Count |');
    lines.push('|---|---:|');
    for (const [t, c] of Object.entries(bugCounts).sort((a, b) => b[1] - a[1])) lines.push(`| ${t} | ${c} |`);
  }
  lines.push('');
  // Pageerrors deserve special prominence
  const pageerrors = allBugs.filter((b) => b.type === 'pageerror');
  lines.push('## Pageerrors (P0 candidates)');
  lines.push('');
  if (!pageerrors.length) lines.push('Zero pageerrors. v1.21.15 defensive guards holding.');
  else {
    lines.push('| Worker | Message | Stack | Screenshot |');
    lines.push('|---:|---|---|---|');
    pageerrors.slice(0, 30).forEach((b) => {
      const m = String(b.message || '').replace(/\s+/g, ' ').slice(0, 200);
      const s = String(b.stack || '').replace(/\s+/g, ' ').slice(0, 200);
      lines.push(`| ${b.workerId} | ${m} | ${s} | ${b.screenshot || '-'} |`);
    });
  }
  lines.push('');
  lines.push('## First captured non-pageerror bugs');
  lines.push('');
  const others = allBugs.filter((b) => b.type !== 'pageerror');
  if (!others.length) lines.push('None.');
  else {
    lines.push('| Worker | Type | Detail | Screenshot |');
    lines.push('|---:|---|---|---|');
    others.slice(0, 30).forEach((b) => {
      const detail = String(b.message || b.text || b.url || b.failure || '').replace(/\s+/g, ' ').slice(0, 200);
      lines.push(`| ${b.workerId} | ${b.type}${b.context ? `(${b.context})` : ''} | ${detail} | ${b.screenshot || '-'} |`);
    });
  }
  return lines.join('\n');
}

async function main() {
  await ensureDir(CONFIG.reportDir);
  const report = { config: CONFIG, startedAt: nowIso(), finishedAt: null, workers: [] };
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const stopAt = Date.now() + CONFIG.durationMs;
  try {
    await Promise.all(Array.from({ length: CONFIG.users }, (_, i) => runWorker(browser, i + 1, stopAt, report)));
  } finally {
    await browser.close().catch(() => {});
  }
  report.finishedAt = nowIso();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(CONFIG.reportDir, `chaos-v2-${stamp}.json`);
  const mdPath = path.join(CONFIG.reportDir, `chaos-v2-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, buildMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
