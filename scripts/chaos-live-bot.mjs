#!/usr/bin/env node
/**
 * Controlled browser chaos bot for shlav-a-mega.html.
 *
 * It simulates a real user at a deliberately throttled pace:
 * - random clicks
 * - random text entry
 * - random keyboard navigation
 * - console/page error capture
 * - failed request capture
 * - latency/event timing summaries
 * - Markdown + JSON reports
 *
 * This is NOT a high-volume load tester. It is a UX/performance smoke gremlin.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'https://eiasash.github.io/Geriatrics/shlav-a-mega.html';

const CONFIG = {
  url: process.env.CHAOS_URL || DEFAULT_URL,
  durationMs: Number(process.env.CHAOS_DURATION_MS || 120_000),
  users: Math.max(1, Number(process.env.CHAOS_USERS || 2)),
  minDelayMs: Number(process.env.CHAOS_MIN_DELAY_MS || 500),
  maxDelayMs: Number(process.env.CHAOS_MAX_DELAY_MS || 2500),
  navigationTimeoutMs: Number(process.env.CHAOS_NAV_TIMEOUT_MS || 30_000),
  actionTimeoutMs: Number(process.env.CHAOS_ACTION_TIMEOUT_MS || 5000),
  headless: process.env.CHAOS_HEADLESS !== '0',
  reportDir: process.env.CHAOS_REPORT_DIR || 'chaos-reports',
  screenshotOnBug: process.env.CHAOS_SCREENSHOTS !== '0',
};

const HEBREW_WORDS = [
  'דליריום', 'נפילות', 'דמנציה', 'תשישות', 'פוליפרמסיה', 'אוסטאופורוזיס',
  'שבר ירך', 'אצירת שתן', 'עצירות', 'כאב', 'לחץ דם', 'סוכרת', 'שיקום',
];
const ENGLISH_WORDS = ['frailty', 'falls', 'dementia', 'delirium', 'polypharmacy', 'pain'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (items) => items[rand(0, items.length - 1)];
const nowIso = () => new Date().toISOString();

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx]);
}

function safeName(value) {
  return value.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function visibleLocators(page) {
  const selectors = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'textarea:not([disabled])',
    'select:not([disabled])',
    '[role="button"]',
    '[tabindex]:not([tabindex="-1"])',
  ];
  const handles = [];
  for (const selector of selectors) {
    const count = await page.locator(selector).count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 80); i += 1) {
      const locator = page.locator(selector).nth(i);
      if (await locator.isVisible().catch(() => false)) {
        handles.push({ selector, index: i, locator });
      }
    }
  }
  return handles;
}

async function randomTextAction(page, log) {
  const fields = [];
  for (const selector of ['input:not([disabled])', 'textarea:not([disabled])', '[contenteditable="true"]']) {
    const count = await page.locator(selector).count().catch(() => 0);
    for (let i = 0; i < Math.min(count, 30); i += 1) {
      const locator = page.locator(selector).nth(i);
      if (await locator.isVisible().catch(() => false)) fields.push({ selector, index: i, locator });
    }
  }
  if (!fields.length) return false;
  const target = pick(fields);
  const text = Array.from({ length: rand(1, 4) }, () => pick([...HEBREW_WORDS, ...ENGLISH_WORDS])).join(' ');
  await target.locator.click({ timeout: CONFIG.actionTimeoutMs });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
  await page.keyboard.type(text, { delay: rand(20, 120) });
  log.actions.push({ at: nowIso(), type: 'type', selector: target.selector, index: target.index, text });
  return true;
}

async function randomClickAction(page, log) {
  const items = await visibleLocators(page);
  if (!items.length) return false;
  const target = pick(items);
  const label = await target.locator.innerText({ timeout: 750 }).catch(() => '');
  await target.locator.click({ timeout: CONFIG.actionTimeoutMs, trial: false }).catch(async (error) => {
    const box = await target.locator.boundingBox().catch(() => null);
    if (!box) throw error;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  });
  log.actions.push({
    at: nowIso(),
    type: 'click',
    selector: target.selector,
    index: target.index,
    label: label.slice(0, 120),
  });
  return true;
}

async function randomKeyboardAction(page, log) {
  const key = pick(['Tab', 'ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'PageDown', 'PageUp']);
  await page.keyboard.press(key, { delay: rand(20, 120) });
  log.actions.push({ at: nowIso(), type: 'key', key });
  return true;
}

async function screenshot(page, workerId, label) {
  if (!CONFIG.screenshotOnBug) return null;
  const file = path.join(CONFIG.reportDir, `worker-${workerId}-${Date.now()}-${safeName(label)}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => null);
  return file;
}

async function runWorker(browser, workerId, stopAt, report) {
  const context = await browser.newContext({
    viewport: { width: pick([390, 768, 1280, 1440]), height: pick([844, 900, 1024]) },
    locale: pick(['he-IL', 'en-US']),
    timezoneId: 'Asia/Jerusalem',
  });
  context.setDefaultTimeout(CONFIG.actionTimeoutMs);
  // Instrument JSON.parse + Response.prototype.json to attribute parse errors
  // to a real stack — Playwright's `pageerror` handler returns null `stack` for
  // these because the error is rethrown at the V8 internal layer.
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
  const log = { workerId, actions: [], bugs: [], timings: [] };

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) {
      log.bugs.push({ at: nowIso(), type: `console:${msg.type()}`, text: msg.text() });
    }
  });
  page.on('pageerror', async (error) => {
    log.bugs.push({
      at: nowIso(),
      type: 'pageerror',
      message: error.message,
      stack: error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : null,
      screenshot: await screenshot(page, workerId, 'pageerror'),
    });
  });
  page.on('requestfailed', (request) => {
    log.bugs.push({
      at: nowIso(),
      type: 'requestfailed',
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      log.bugs.push({ at: nowIso(), type: 'http', status, url: response.url() });
    }
  });

  const start = performance.now();
  try {
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
    log.timings.push({ type: 'initial-domcontentloaded', ms: Math.round(performance.now() - start) });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {
      log.bugs.push({ at: nowIso(), type: 'timeout', message: 'networkidle not reached after initial load' });
    });

    while (Date.now() < stopAt) {
      const actionStart = performance.now();
      const choice = Math.random();
      try {
        if (choice < 0.45) await randomClickAction(page, log);
        else if (choice < 0.75) await randomTextAction(page, log);
        else await randomKeyboardAction(page, log);
        log.timings.push({ type: 'action', ms: Math.round(performance.now() - actionStart) });
      } catch (error) {
        log.bugs.push({
          at: nowIso(),
          type: 'action-error',
          message: error.message,
          screenshot: await screenshot(page, workerId, 'action-error'),
        });
      }
      await sleep(rand(CONFIG.minDelayMs, CONFIG.maxDelayMs));
    }
  } finally {
    // Snapshot the app's in-page debug buffer (window.__debug.buffer) before
    // closing — it captures unhandledrejection stacks the Playwright pageerror
    // event drops as null. See shlav-a-mega.html line 725.
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

function buildMarkdown(report) {
  const allBugs = report.workers.flatMap((worker) => worker.bugs.map((bug) => ({ workerId: worker.workerId, ...bug })));
  const allActions = report.workers.flatMap((worker) => worker.actions);
  const timings = report.workers.flatMap((worker) => worker.timings.filter((t) => t.type === 'action').map((t) => t.ms));
  const bugCounts = allBugs.reduce((acc, bug) => {
    acc[bug.type] = (acc[bug.type] || 0) + 1;
    return acc;
  }, {});

  const lines = [];
  lines.push(`# Chaos bot report`);
  lines.push('');
  lines.push(`- URL: ${report.config.url}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${Math.round(report.config.durationMs / 1000)}s`);
  lines.push(`- Simulated users: ${report.config.users}`);
  lines.push(`- Throttle: ${report.config.minDelayMs}-${report.config.maxDelayMs}ms between actions per user`);
  lines.push(`- Total actions: ${allActions.length}`);
  lines.push(`- Bugs/events captured: ${allBugs.length}`);
  lines.push(`- Action latency p50/p95/max: ${percentile(timings, 50)}ms / ${percentile(timings, 95)}ms / ${timings.length ? Math.max(...timings) : 0}ms`);
  lines.push('');
  lines.push('## Bug/event counts');
  lines.push('');
  if (!Object.keys(bugCounts).length) lines.push('No captured console errors, failed requests, HTTP 4xx/5xx, or action exceptions. Suspiciously civilized.');
  else {
    lines.push('| Type | Count |');
    lines.push('|---|---:|');
    for (const [type, count] of Object.entries(bugCounts).sort((a, b) => b[1] - a[1])) {
      lines.push(`| ${type} | ${count} |`);
    }
  }
  lines.push('');
  lines.push('## First captured issues');
  lines.push('');
  if (!allBugs.length) lines.push('None. The site survived this tiny gremlin pass.');
  else {
    lines.push('| Worker | Type | Details | Screenshot |');
    lines.push('|---:|---|---|---|');
    for (const bug of allBugs.slice(0, 30)) {
      const detail = (bug.message || bug.text || bug.url || bug.failure || '').replace(/\s+/g, ' ').slice(0, 180);
      lines.push(`| ${bug.workerId} | ${bug.type} | ${detail || '-'} | ${bug.screenshot || '-'} |`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This is intentionally throttled. Increase users/duration only when you are ready to annoy your own infrastructure responsibly.');
  lines.push('- For real load testing, use server-side tools with explicit rate limits and metrics. This browser bot is better at finding client-side weirdness.');
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
  const jsonPath = path.join(CONFIG.reportDir, `chaos-report-${stamp}.json`);
  const mdPath = path.join(CONFIG.reportDir, `chaos-report-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, buildMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
