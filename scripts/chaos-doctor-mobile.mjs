#!/usr/bin/env node
/**
 * Doctor-on-mobile chaos bot for shlav-a-mega.html.
 *
 * Simulates an Israeli geriatrics fellow at SZMC on a mobile phone with
 * suboptimal real-world conditions (Slow/Fast 3G network, 4× CPU throttle on
 * a budget Android), walking through Geri exam prep the way a real user
 * would: read the question, pick an answer, read the explanation, move on.
 *
 * Differences from chaos-live-bot.mjs (the random gremlin):
 *  - FIXED mobile viewport 390×844 (iPhone 12-class)
 *  - Network throttling via CDP — Slow3G default (400 Kbps DL, 400 Kbps UL,
 *    400ms RTT), or Fast3G via env (1.5 Mbps DL, 750 Kbps UL, 150ms RTT)
 *  - CPU throttling 4× (CDP Emulation.setCPUThrottlingRate)
 *  - Doctor-persona behavior:
 *    * Dismiss install / SW-update banners on landing
 *    * Read question (2-5s realistic dwell)
 *    * Click an answer (A/B/C/D, weighted random)
 *    * Click "בדוק" (Check)
 *    * Read explanation (3-8s)
 *    * Click "→ הבאה" (Next)
 *    * Repeat for N questions
 *    * Occasionally tab into Study/Track/More to break monotony
 *  - Per-question telemetry:
 *    * time-to-question-render (since navigation start)
 *    * click-to-feedback latency (option click → reveal state)
 *    * explain-render latency (Check click → explain visible)
 *  - Categorized bug capture:
 *    * RENDER:    timeout reaching network-idle, missing core elements
 *    * NAV:       tab switch failed
 *    * ANSWER:    no .qo, .quiz-choice, [data-action="pick"] elements, click did not change reveal state
 *    * EXPLAIN:   no explain panel after Check
 *    * NETWORK:   failed requests (offline-period intentional, but tracked)
 *    * A11Y:      target too small (<32×32), overflow detected
 *    * SLOW:      action latency >2s on user-blocking paths
 *    * CONSOLE:   error / warning level messages from page
 *    * PAGEERROR: uncaught JS exception
 *  - Markdown + JSON report with an "actionable" section ranked by impact
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const CONFIG = {
  url: process.env.CHAOS_URL || 'https://eiasash.github.io/Geriatrics/shlav-a-mega.html',
  durationMs: Number(process.env.CHAOS_DURATION_MS || 300_000), // 5 min default
  questionsPerSession: Number(process.env.CHAOS_QS || 10),
  network: process.env.CHAOS_NETWORK || 'slow3g', // slow3g | fast3g | 4g | offline-bursts | none
  cpuThrottle: Number(process.env.CHAOS_CPU || 4),
  headless: process.env.CHAOS_HEADLESS !== '0',
  reportDir: process.env.CHAOS_REPORT_DIR || 'chaos-reports',
  maxNavTimeoutMs: Number(process.env.CHAOS_NAV_TIMEOUT_MS || 60_000),
  questionDwellMs: [Number(process.env.CHAOS_READ_MIN || 2000), Number(process.env.CHAOS_READ_MAX || 5000)],
  explainDwellMs: [Number(process.env.CHAOS_EXPLAIN_MIN || 3000), Number(process.env.CHAOS_EXPLAIN_MAX || 8000)],
};

const NETWORK_PROFILES = {
  // Bytes/sec for Playwright/CDP. RTT in ms. Aligned with WebPageTest/Lighthouse profiles.
  slow3g:    { downloadKbps: 400,    uploadKbps: 400,   latencyMs: 400, label: 'Slow 3G' },
  fast3g:    { downloadKbps: 1500,   uploadKbps: 750,   latencyMs: 150, label: 'Fast 3G' },
  '4g':      { downloadKbps: 9000,   uploadKbps: 9000,  latencyMs: 170, label: '4G LTE' },
  // 'offline-bursts' handled in-loop with toggleOffline()
  none:      null,
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const pick = (items) => items[rand(0, items.length - 1)];
const nowIso = () => new Date().toISOString();
const safeName = (v) => String(v).replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

function applyNetworkProfile(client, profile) {
  if (!profile) return Promise.resolve();
  return client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: profile.downloadKbps * 1024 / 8, // bytes/sec
    uploadThroughput:   profile.uploadKbps   * 1024 / 8,
    latency:            profile.latencyMs,
  });
}

function applyCpuThrottle(client, rate) {
  if (rate <= 1) return Promise.resolve();
  return client.send('Emulation.setCPUThrottlingRate', { rate });
}

function recordBug(log, bug) {
  log.bugs.push({ at: nowIso(), ...bug });
}

async function dismissOverlays(page, log) {
  // SW update banner
  const dismissUpdate = await page.$('[data-action="dismiss-update"]').catch(() => null);
  if (dismissUpdate) {
    await dismissUpdate.click().catch(() => {});
    log.actions.push({ at: nowIso(), type: 'dismiss', target: 'sw-update-banner' });
  }
  // PWA install prompt — "Not now"
  const notNow = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button')).find(b => /not now|לא עכשיו/i.test(b.textContent))
  ).catch(() => null);
  if (notNow) {
    const el = notNow.asElement();
    if (el) {
      await el.click().catch(() => {});
      log.actions.push({ at: nowIso(), type: 'dismiss', target: 'install-prompt' });
    }
  }
  await sleep(200);
}

async function runDoctorSession(browser, sessionId, report) {
  const profile = NETWORK_PROFILES[CONFIG.network] || null;
  const log = {
    sessionId,
    network: CONFIG.network,
    cpuThrottle: CONFIG.cpuThrottle,
    actions: [],
    bugs: [],
    timings: [],
    questions: [], // per-Q telemetry
  };

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 12-class
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Wire bug listeners BEFORE first navigation
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const text = msg.text();
      // Filter known no-op noise
      if (/Banner not shown.*beforeinstallpromptevent/i.test(text)) return;
      recordBug(log, { category: 'CONSOLE', level: msg.type(), text: text.slice(0, 300) });
    }
  });
  page.on('pageerror', (error) => {
    recordBug(log, {
      category: 'PAGEERROR',
      message: error.message?.slice(0, 200),
      stack: String(error.stack || '').split('\n').slice(0, 6).join(' | '),
    });
  });
  page.on('requestfailed', (request) => {
    recordBug(log, {
      category: 'NETWORK',
      url: request.url().slice(0, 200),
      method: request.method(),
      failure: request.failure()?.errorText || 'unknown',
    });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400 && status !== 404 /* /favicon.ico is expected on root */) {
      recordBug(log, { category: 'NETWORK', kind: 'http', status, url: response.url().slice(0, 200) });
    }
  });

  // Apply throttling
  try {
    await cdp.send('Network.enable');
    await applyNetworkProfile(cdp, profile);
    await applyCpuThrottle(cdp, CONFIG.cpuThrottle);
    log.actions.push({ at: nowIso(), type: 'throttle-applied', profile: CONFIG.network, cpu: CONFIG.cpuThrottle });
  } catch (e) {
    recordBug(log, { category: 'RENDER', message: `CDP throttle setup failed: ${e.message}` });
  }

  // Land on the page
  const navStart = performance.now();
  try {
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.maxNavTimeoutMs });
    log.timings.push({ phase: 'domcontentloaded', ms: Math.round(performance.now() - navStart) });
  } catch (e) {
    recordBug(log, { category: 'RENDER', message: `goto failed: ${e.message}` });
    await context.close().catch(() => {});
    report.sessions.push(log);
    return;
  }

  // Wait for the question UI to render. The DOM signal (>=2 .qo, .quiz-choice, [data-action="pick"] answer pills)
  // is more portable across the medical-PWA siblings than probing globals
  // (Geri uses top-level `let QZ=[]`, FM/IM use `G.QZ` on a shared globals
  // object — neither attaches to `window`). Under Slow 3G + 4x CPU this can
  // take 60-180s+ on first load.
  const qzWaitStart = performance.now();
  const qzReady = await page.waitForFunction(async () => {
    // Land on Quiz tab — siblings' default-tab choice varies (FM/IM may land
    // on Library; Geri lands on Quiz). Calling go('quiz') is idempotent.
    if (typeof go === 'function') { try { go('quiz'); } catch {} }
    return document.querySelectorAll('.qo, .quiz-choice, [data-action="pick"]').length >= 2;
  },
    null,
    { timeout: 180_000, polling: 1500 }
  ).then(() => true).catch(() => false);
  const qzMs = Math.round(performance.now() - qzWaitStart);
  log.timings.push({ phase: 'qz-ready', ms: qzMs, success: qzReady });
  if (!qzReady) {
    recordBug(log, { category: 'RENDER', severity: 'critical', message: `quiz UI did not render within 180s under throttled network — first-load is unusable (qzMs=${qzMs})` });
    await context.close().catch(() => {});
    report.sessions.push(log);
    return;
  } else if (qzMs > 30_000) {
    recordBug(log, { category: 'SLOW', severity: 'high', message: `quiz UI took ${qzMs}ms to render — slow but functional` });
  } else if (qzMs > 10_000) {
    recordBug(log, { category: 'SLOW', severity: 'medium', message: `quiz UI took ${qzMs}ms to render — borderline acceptable` });
  }

  await dismissOverlays(page, log);
  await sleep(500);

  // Doctor session loop — answer up to N questions
  const stopAt = Date.now() + CONFIG.durationMs;
  let qIndex = 0;
  while (Date.now() < stopAt && qIndex < CONFIG.questionsPerSession) {
    const qStart = performance.now();
    const qLog = { qIndex, anomalies: [] };
    try {
      // Ensure on Quiz tab
      await page.evaluate(() => { if (typeof go === 'function') go('quiz'); });
      await sleep(300);

      // Find answer options
      const optionCount = await page.locator('.qo, .quiz-choice, [data-action="pick"]').count();
      if (optionCount === 0) {
        recordBug(log, { category: 'ANSWER', qIndex, message: '.qo, .quiz-choice, [data-action="pick"] elements not found on Quiz tab' });
        qLog.anomalies.push('no-options');
        await sleep(2000);
        qIndex++;
        continue;
      }
      qLog.optionCount = optionCount;

      // Read the question (doctor dwell)
      await sleep(rand(...CONFIG.questionDwellMs));

      // Re-dismiss any popups that appeared during the dwell
      await dismissOverlays(page, { actions: log.actions });

      // Pick a random option, capture click-to-feedback latency.
      // Use direct DOM .click() (which fires the inline onclick="pick(N)" handler)
      // INSTEAD of Playwright's locator.click() — the latter does actionability checks
      // (visible/stable/enabled/receives-events) that can take seconds under CPU throttling
      // and inflate latency measurements with framework overhead, not real user-perceptible
      // delay. A real touch event hits the handler immediately.
      const pickIdx = rand(0, Math.min(optionCount, 4) - 1);
      const clickStart = performance.now();
      await page.evaluate((idx) => {
        const opts = document.querySelectorAll('.qo, .quiz-choice, [data-action="pick"]');
        if (opts[idx]) opts[idx].click();
      }, pickIdx).catch(() => {});

      // Click "בדוק" (Check) button
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const check = btns.find(b => b.textContent.trim() === 'בדוק' || b.textContent.includes('בדוק'));
        if (check) check.click();
      });

      // Wait for reveal — option gains class 'lk' (linked/locked) post-check
      const revealOk = await page.waitForFunction(
        () => Array.from(document.querySelectorAll('.qo, .quiz-choice, [data-action="pick"]')).some(o => /\blk\b/.test(o.className)),
        null,
        { timeout: 8000 }
      ).then(() => true).catch(() => false);
      const clickToFeedback = Math.round(performance.now() - clickStart);
      qLog.clickToFeedbackMs = clickToFeedback;
      if (!revealOk) {
        recordBug(log, { category: 'ANSWER', qIndex, message: 'options did not transition to reveal state after Check' });
        qLog.anomalies.push('no-reveal');
      }
      if (clickToFeedback > 2000) {
        recordBug(log, { category: 'SLOW', qIndex, message: `click-to-feedback ${clickToFeedback}ms (threshold 2000ms)` });
        qLog.anomalies.push('slow-feedback');
      }

      // Read the explanation (doctor dwell)
      await sleep(rand(...CONFIG.explainDwellMs));

      // Look for layout-overlap or off-screen issues post-reveal
      const layout = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const winW = window.innerWidth;
        // Find any element whose visible rect is fully clipped by a higher-z sibling
        const overflowing = [];
        document.querySelectorAll('main *, #ct *').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > winW + 5) {
            const cs = getComputedStyle(el);
            if (cs.position !== 'fixed' && cs.position !== 'sticky') {
              overflowing.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 30), w: Math.round(r.width), x: Math.round(r.x) });
            }
          }
        });
        return { docW, winW, overflowingCount: overflowing.length, overflowingSample: overflowing.slice(0, 3) };
      });
      qLog.layout = layout;
      if (layout.docW > layout.winW + 4) {
        recordBug(log, { category: 'A11Y', qIndex, message: `horizontal overflow docW=${layout.docW} winW=${layout.winW}`, overflowing: layout.overflowingSample });
        qLog.anomalies.push('h-overflow');
      }

      // Move to next question — try "→ הבאה" or just next via API
      const nextClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const next = btns.find(b => /הבאה|next/i.test(b.textContent.trim()));
        if (next && !next.disabled) { next.click(); return true; }
        return false;
      });
      if (!nextClicked) {
        recordBug(log, { category: 'NAV', qIndex, message: 'next-question button not found or disabled' });
        qLog.anomalies.push('no-next');
      }
      await sleep(800);
      qLog.totalMs = Math.round(performance.now() - qStart);
      log.questions.push(qLog);
    } catch (e) {
      recordBug(log, { category: 'ANSWER', qIndex, message: `loop iteration failed: ${e.message}` });
      qLog.anomalies.push('exception');
      log.questions.push(qLog);
    }
    qIndex++;
  }

  // Tab through other sections to surface non-Quiz bugs
  for (const tab of ['study', 'track', 'more', 'quiz']) {
    try {
      const navStart = performance.now();
      await page.evaluate((t) => { if (typeof go === 'function') go(t); }, tab);
      await sleep(700);
      const ms = Math.round(performance.now() - navStart);
      log.timings.push({ phase: `tab-${tab}`, ms });
      if (ms > 1500) recordBug(log, { category: 'SLOW', message: `tab switch to ${tab} took ${ms}ms` });
    } catch (e) {
      recordBug(log, { category: 'NAV', message: `tab switch to ${tab} failed: ${e.message}` });
    }
  }

  // Final snapshot of in-page debug buffer
  try {
    const buffer = await page.evaluate(() => {
      const b = window.__debug && window.__debug.buffer;
      return b ? { errors: (b.errors || []).slice(-30), network: (b.network || []).slice(-30) } : null;
    });
    if (buffer) log.appDebugBuffer = buffer;
  } catch {/* page closed */}

  await context.close().catch(() => {});
  report.sessions.push(log);
}

function buildMarkdown(report) {
  const sessions = report.sessions;
  const allBugs = sessions.flatMap(s => s.bugs.map(b => ({ sessionId: s.sessionId, ...b })));
  const byCat = allBugs.reduce((acc, b) => { acc[b.category] = (acc[b.category] || 0) + 1; return acc; }, {});
  const allQs = sessions.flatMap(s => s.questions || []);
  const c2fLatencies = allQs.map(q => q.clickToFeedbackMs).filter(n => Number.isFinite(n));

  const p = (arr, q) => arr.length ? Math.round([...arr].sort((a,b)=>a-b)[Math.min(arr.length-1, Math.ceil(q*arr.length)-1)]) : 0;

  const lines = [];
  lines.push(`# Doctor-on-mobile chaos bot report`);
  lines.push('');
  lines.push(`- **URL**: ${report.config.url}`);
  lines.push(`- **Started**: ${report.startedAt}`);
  lines.push(`- **Finished**: ${report.finishedAt}`);
  lines.push(`- **Sessions**: ${sessions.length}`);
  lines.push(`- **Network**: ${report.config.network} (${NETWORK_PROFILES[report.config.network]?.label || 'no throttle'})`);
  lines.push(`- **CPU throttle**: ${report.config.cpuThrottle}× slowdown`);
  lines.push(`- **Viewport**: 390×844 (iPhone 12-class)`);
  lines.push(`- **Questions answered (total across sessions)**: ${allQs.length}`);
  lines.push(`- **Bugs/events captured**: ${allBugs.length}`);
  lines.push('');
  lines.push('## Click-to-feedback latency (option click → reveal state)');
  lines.push('');
  lines.push(`- p50: ${p(c2fLatencies, 0.5)}ms`);
  lines.push(`- p95: ${p(c2fLatencies, 0.95)}ms`);
  lines.push(`- max: ${c2fLatencies.length ? Math.max(...c2fLatencies) : 0}ms`);
  lines.push('');
  lines.push('## Bug counts by category');
  lines.push('');
  if (!Object.keys(byCat).length) {
    lines.push('_No bugs captured under these conditions._');
  } else {
    lines.push('| Category | Count |');
    lines.push('|---|---:|');
    for (const [cat, n] of Object.entries(byCat).sort((a,b)=>b[1]-a[1])) {
      lines.push(`| ${cat} | ${n} |`);
    }
  }
  lines.push('');
  lines.push('## Sample bugs (first 30)');
  lines.push('');
  if (!allBugs.length) {
    lines.push('_None._');
  } else {
    lines.push('| Session | Category | Detail |');
    lines.push('|---:|---|---|');
    for (const b of allBugs.slice(0, 30)) {
      const detail = (b.message || b.text || b.url || b.failure || JSON.stringify(b).slice(0, 120)).replace(/\s+/g, ' ').slice(0, 200);
      lines.push(`| ${b.sessionId} | ${b.category} | ${detail} |`);
    }
  }
  lines.push('');
  lines.push('## Per-question telemetry sample');
  lines.push('');
  lines.push('| Session | qIndex | optionCount | c2fMs | totalMs | anomalies |');
  lines.push('|---:|---:|---:|---:|---:|---|');
  for (const q of allQs.slice(0, 30)) {
    const sess = sessions.find(s => (s.questions || []).includes(q))?.sessionId ?? '?';
    lines.push(`| ${sess} | ${q.qIndex ?? '?'} | ${q.optionCount ?? '-'} | ${q.clickToFeedbackMs ?? '-'} | ${q.totalMs ?? '-'} | ${(q.anomalies || []).join(', ') || '-'} |`);
  }
  return lines.join('\n');
}

async function main() {
  await ensureDir(CONFIG.reportDir);
  const sessionsCount = Number(process.env.CHAOS_SESSIONS || 1);
  const report = { config: CONFIG, startedAt: nowIso(), finishedAt: null, sessions: [] };

  const browser = await chromium.launch({ headless: CONFIG.headless });
  try {
    await Promise.all(Array.from({ length: sessionsCount }, (_, i) => runDoctorSession(browser, i + 1, report)));
  } finally {
    await browser.close().catch(() => {});
  }
  report.finishedAt = nowIso();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const slug = safeName(`doctor-mobile-${CONFIG.network}-${CONFIG.cpuThrottle}x`);
  const jsonPath = path.join(CONFIG.reportDir, `${slug}-${stamp}.json`);
  const mdPath   = path.join(CONFIG.reportDir, `${slug}-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, buildMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
