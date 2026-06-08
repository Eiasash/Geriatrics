#!/usr/bin/env node
// AUDIT-8 G5 R1.0 RED probe — extraction-yield reproduction.
//
// Mission: deterministically reproduce the ≈88% pre-pick-skip rate the
// AUDIT-8 8h bounded run logged on `4a66ed8` (#238 RESULT), using the
// REAL chaos-doctor-bot-v4 extractor (`extractQuestion`) + entry path
// (`ensureOnPracticeQuiz`) against the REAL practice surface — no proxy,
// no hand-rolled imitation. The RED criterion is failure ≥ 0.85 over
// ≥ 100 attempts (kickoff §1.0).
//
// Cost: free. No Claude API calls — extraction is pure DOM parsing.
//
// Env knobs (all optional):
//   R1_PROBE_URL          live URL (default https://eiasash.github.io/Geriatrics/)
//   R1_PROBE_N            attempts (default 100)
//   R1_PROBE_HEADLESS     0 to run headed
//   R1_PROBE_OUT          output JSON path (default chaos-reports/r1RedProbe/<ts>.json)
//   R1_PROBE_LABEL        free-form label embedded in the report
//   R1_PROBE_READ_PAUSE_MS    delay between attempts to mirror bot pacing (default 2500)
//   R1_PROBE_FORENSIC_SAMPLES capture forensic snapshots for first N failures (default 10)
//
// Output: JSON file with { total, extractedOk, extractionFailures, failureRate,
// RED, perMode{...}, samples[...], config{...} } and a one-line stdout summary.

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { extractQuestion, ensureOnPracticeQuiz } from '../chaos-doctor-bot-v4.mjs';

const URL_DEFAULT = 'https://eiasash.github.io/Geriatrics/';

const CONFIG = {
  url: process.env.R1_PROBE_URL || URL_DEFAULT,
  attempts: Math.max(10, Number(process.env.R1_PROBE_N || 100)),
  headless: process.env.R1_PROBE_HEADLESS !== '0',
  outPath: process.env.R1_PROBE_OUT || null,
  label: process.env.R1_PROBE_LABEL || 'live-main',
  readPauseMs: Math.max(100, Number(process.env.R1_PROBE_READ_PAUSE_MS || 2500)),
  forensicSamples: Math.max(0, Number(process.env.R1_PROBE_FORENSIC_SAMPLES || 10)),
  redThreshold: 0.85,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

async function classifyFailure(page) {
  // Reproduce the extractor's null-paths so we can distinguish:
  //   - no-heb         : 0 .heb elements on page (page hasn't rendered the stem)
  //   - stem-throw     : .heb exists but innerText threw (rare)
  //   - short-stem     : .heb exists but text < 20 chars
  //   - no-qo          : button.qo count < 2
  //   - empty-options  : button.qo count >= 2 but >=2 of them have empty text (skeleton)
  //   - modal-blocked  : a known auto-modal is intercepting (#help-overlay etc.)
  //   - other          : none of the above
  const hebCount = await page.locator('.heb').count().catch(() => 0);
  let stemText = '';
  let stemThrew = false;
  if (hebCount > 0) {
    try {
      stemText = (await page.locator('.heb').first().innerText({ timeout: 600 })).trim();
    } catch (_) { stemThrew = true; }
  }
  const qoCount = await page.locator('button.qo').count().catch(() => 0);
  let qoTexts = [];
  if (qoCount > 0) {
    for (let i = 0; i < Math.min(qoCount, 6); i++) {
      try { qoTexts.push((await page.locator('button.qo').nth(i).innerText({ timeout: 400 })).trim()); }
      catch (_) { qoTexts.push(''); }
    }
  }
  const nonEmptyQo = qoTexts.filter((t) => t && t.length > 0).length;
  const modalIds = ['help-overlay', 'feModal', 'sdModal', 'miModal', 'mockPicker', 'examModal', 'mexModal', 'postLoginRstModal', 'rstModal'];
  let modalPresent = null;
  for (const id of modalIds) {
    if ((await page.locator('#' + id).count().catch(() => 0)) > 0) { modalPresent = id; break; }
  }

  let mode = 'other';
  if (modalPresent && qoCount < 2) mode = 'modal-blocked';
  else if (hebCount === 0) mode = 'no-heb';
  else if (stemThrew) mode = 'stem-throw';
  else if (stemText.length < 20) mode = 'short-stem';
  else if (qoCount < 2) mode = 'no-qo';
  else if (nonEmptyQo < 2) mode = 'empty-options';

  return {
    mode,
    hebCount,
    stemTextSlice: stemText.slice(0, 80),
    stemLen: stemText.length,
    stemThrew,
    qoCount,
    qoNonEmpty: nonEmptyQo,
    qoFirstText: (qoTexts[0] || '').slice(0, 40),
    modalPresent,
  };
}

async function advance(page) {
  // Use the bot's actual advancement path without burning AI calls: click
  // first option → check → next. This matches the bot's iteration cadence
  // shape; if Next is already showing (e.g., post-check state from a prior
  // attempt) skip directly to Next.
  const next0 = page.locator('[data-testid="advance"], [aria-label*="next question" i], [aria-label*="finish exam" i]').first();
  if ((await next0.count().catch(() => 0)) > 0) {
    await next0.click({ timeout: 2500 }).catch(() => {});
    return 'next-direct';
  }
  // Need to pick something to reveal a Next. The probe doesn't care about
  // medical correctness — first option is fine.
  const qo0 = page.locator('button.qo').first();
  if ((await qo0.count().catch(() => 0)) === 0) return 'no-qo';
  await qo0.click({ timeout: 2500 }).catch(() => {});
  await sleep(150);
  const check = page.locator('[data-testid="check-answer"], [aria-label*="check answer" i]').first();
  if ((await check.count().catch(() => 0)) > 0) {
    await check.click({ timeout: 2500 }).catch(() => {});
    await sleep(250);
  }
  const next1 = page.locator('[data-testid="advance"], [aria-label*="next question" i], [aria-label*="finish exam" i]').first();
  if ((await next1.count().catch(() => 0)) > 0) {
    await next1.click({ timeout: 2500 }).catch(() => {});
    return 'next-after-check';
  }
  return 'stuck';
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDefault = path.resolve('chaos-reports/r1RedProbe', `${CONFIG.label}-${stamp}.json`);
  const outPath = CONFIG.outPath ? path.resolve(CONFIG.outPath) : outDefault;
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
  });
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();
  const log = { actions: [], bugs: [] };

  console.error(`[r1RedProbe] navigate ${CONFIG.url} (label=${CONFIG.label}, N=${CONFIG.attempts})`);
  await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await sleep(2000); // post-load settle (matches bot's initial sleep at runWorker:932)

  const stats = {
    config: { ...CONFIG, outPath },
    startedAt: nowIso(),
    finishedAt: null,
    total: 0,
    extractedOk: 0,
    extractionFailures: 0,
    ensureOnQuizFailures: 0,
    advanceOutcomes: { 'next-direct': 0, 'next-after-check': 0, 'no-qo': 0, 'stuck': 0 },
    perMode: { 'no-heb': 0, 'stem-throw': 0, 'short-stem': 0, 'no-qo': 0, 'empty-options': 0, 'modal-blocked': 0, 'other': 0 },
    samples: [],
  };

  for (let i = 0; i < CONFIG.attempts; i++) {
    const onQuiz = await ensureOnPracticeQuiz(page, log);
    if (!onQuiz) {
      stats.ensureOnQuizFailures += 1;
      try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* tolerate */ }
      await sleep(1500);
      continue;
    }
    const q = await extractQuestion(page);
    stats.total += 1;
    if (!q || q.options.length < 2) {
      stats.extractionFailures += 1;
      const klass = await classifyFailure(page);
      stats.perMode[klass.mode] = (stats.perMode[klass.mode] || 0) + 1;
      if (stats.samples.length < CONFIG.forensicSamples) {
        stats.samples.push({ attempt: i, ...klass });
      }
    } else {
      stats.extractedOk += 1;
    }
    const adv = await advance(page);
    stats.advanceOutcomes[adv] = (stats.advanceOutcomes[adv] || 0) + 1;
    await sleep(CONFIG.readPauseMs);
  }

  stats.finishedAt = nowIso();
  stats.failureRate = stats.total > 0 ? stats.extractionFailures / stats.total : null;
  stats.RED = stats.total > 0 && stats.failureRate >= CONFIG.redThreshold;

  await fs.writeFile(outPath, JSON.stringify(stats, null, 2));
  console.log(JSON.stringify({
    label: CONFIG.label,
    url: CONFIG.url,
    total: stats.total,
    extractedOk: stats.extractedOk,
    extractionFailures: stats.extractionFailures,
    failureRate: stats.failureRate,
    RED: stats.RED,
    threshold: CONFIG.redThreshold,
    ensureOnQuizFailures: stats.ensureOnQuizFailures,
    perMode: stats.perMode,
    outPath,
  }, null, 2));

  await browser.close().catch(() => {});
}

main().catch((e) => { console.error('[r1RedProbe] FATAL', e); process.exitCode = 1; });
