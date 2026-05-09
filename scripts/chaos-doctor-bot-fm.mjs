#!/usr/bin/env node
/**
 * Chaos doctor bot v3 — AI-judge bots that act like a family-medicine
 * physician using the app. Built per user request 2026-05-07:
 *
 *   "answer questions / judge the medicine / write stuff / check sources
 *    like a doctor using the app would"
 *
 * Per question, each worker does 3 AI calls:
 *   1. Pre-answer: extract stem + 4 options, ask Sonnet 4.6 to pick A/B/C/D
 *      with brief reasoning. Click matching [data-action="pick"][data-i].
 *   2. Check answer: app reveals its own correct option (class 'ok') and
 *      the e-field explanation. Ask AI: is the app right, is the
 *      explanation medically sound?
 *   3. Source check: if explanation cites a chapter (Goroll/Harrison/Nelson),
 *      ask AI whether the cite actually supports the explanation's claim.
 *
 * Findings are recorded to chaos-reports/upgraded-run/medical_findings_ai.jsonl
 * (one JSON object per line; survives crashes). Disagreements with the
 * app's `c` index are highlighted as Sev-3 candidates — but per CLAUDE.md
 * curator-overrides discipline, the bot NEVER auto-fixes. It only records.
 *
 * Sometimes (configurable rate) the bot also:
 *   - Opens the feedback form and submits AI-drafted feedback
 *   - Triggers the "Report this question" flow (writes answer_reports)
 *
 * Token cost is tracked and surfaced in the final report.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

const DEFAULT_URL = 'https://eiasash.github.io/FamilyMedicine/';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CHAOS_MODEL || 'claude-sonnet-4-6';

const CONFIG = {
  url: process.env.CHAOS_URL || DEFAULT_URL,
  durationMs: Number(process.env.CHAOS_DURATION_MS || 30 * 60_000),
  users: Math.max(1, Number(process.env.CHAOS_USERS || 10)),
  navigationTimeoutMs: Number(process.env.CHAOS_NAV_TIMEOUT_MS || 30_000),
  actionTimeoutMs: Number(process.env.CHAOS_ACTION_TIMEOUT_MS || 5000),
  headless: process.env.CHAOS_HEADLESS !== '0',
  reportDir: process.env.CHAOS_REPORT_DIR || 'chaos-reports/upgraded-run',
  screenshotOnBug: process.env.CHAOS_SCREENSHOTS !== '0',
  feedbackRate: Number(process.env.CHAOS_FEEDBACK_RATE || 0.10),  // submit feedback ~10% of disagreements
  reportRate: Number(process.env.CHAOS_REPORT_RATE || 0.08),      // report-question ~8% of disagreements
};

const KEY = process.env.CLAUDE_API_KEY;
if (!KEY) { console.error('CLAUDE_API_KEY not set in environment'); process.exit(2); }
if (KEY.length !== 108) console.warn(`WARN: CLAUDE_API_KEY length=${KEY.length}, expected 108 — may 401`);

// Shared cost ledger across workers (rough — JS runs on a single isolate
// so simple module-level mutations are safe enough; add a counter object).
const COST = { totalCalls: 0, totalInTokens: 0, totalOutTokens: 0, failures: 0 };
function priceUsd(inTok, outTok) {
  // Rough Sonnet 4.6 list price: $3/M input, $15/M output. Adjust if model differs.
  return (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (xs) => xs[rand(0, xs.length - 1)];
const nowIso = () => new Date().toISOString();

// ============================================================
// Anthropic API helper with retry + token capture
// ============================================================

async function callClaude(systemPrompt, userPrompt, { maxTokens = 400, retries = 3 } = {}) {
  const body = {
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  };
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = (attempt + 1) * 1500;
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        lastErr = new Error(`Claude API ${res.status}: ${text.slice(0, 200)}`);
        break;
      }
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      const inT = data.usage?.input_tokens || 0;
      const outT = data.usage?.output_tokens || 0;
      COST.totalCalls += 1;
      COST.totalInTokens += inT;
      COST.totalOutTokens += outT;
      return { text, inputTokens: inT, outputTokens: outT };
    } catch (e) {
      lastErr = e;
      await sleep((attempt + 1) * 800);
    }
  }
  COST.failures += 1;
  throw lastErr || new Error('Claude API call failed after retries');
}

// ============================================================
// Question extractor — FM-specific
// ============================================================

async function extractQuestion(page) {
  // v1.21.16 stem is rendered as <h2 class="quiz-question"> (older sd path
  // uses <p class="heb">, kept for fallback).
  const stemLoc = page.locator('h2.quiz-question, .quiz-question, .heb').first();
  if (!(await stemLoc.count().catch(() => 0))) return null;
  let stem = '';
  try { stem = (await stemLoc.innerText({ timeout: 800 })).trim(); } catch (_) { return null; }
  if (!stem || stem.length < 20) return null;
  // Options — prefer the inner span.quiz-choice__text (v1.21.16) over the
  // whole button (which would include the A/B/C/D letter prefix span).
  const opts = page.locator('[data-action="pick"]');
  const n = await opts.count().catch(() => 0);
  if (n < 2) return null;
  const options = [];
  for (let i = 0; i < n; i++) {
    const btn = opts.nth(i);
    let txt = '';
    try {
      const inner = btn.locator('.quiz-choice__text');
      if ((await inner.count().catch(() => 0)) > 0) {
        txt = (await inner.first().innerText({ timeout: 500 })).trim();
      } else {
        txt = (await btn.innerText({ timeout: 500 })).trim();
      }
    } catch (_) { /* skip */ }
    if (!txt) continue;
    const di = await btn.getAttribute('data-i').catch(() => null);
    options.push({ idx: Number(di ?? i), text: txt });
  }
  if (options.length < 2) return null;
  return { stem, options };
}

async function detectAppCorrectIdx(page) {
  // v1.21.16: data-state="correct" attr on the correct option after check.
  // Also try .ok (older sd path) for backward compat.
  let okLoc = page.locator('[data-action="pick"][data-state="correct"]');
  if ((await okLoc.count().catch(() => 0)) === 0) {
    okLoc = page.locator('[data-action="pick"].ok');
  }
  if ((await okLoc.count().catch(() => 0)) === 0) return null;
  const di = await okLoc.first().getAttribute('data-i').catch(() => null);
  return di == null ? null : Number(di);
}

async function extractExplanation(page) {
  // FM renders the explanation post-check; we can grab a broad container
  // and trim. This is best-effort — explanation text appears within the
  // active quiz card.
  try {
    const card = page.locator('.card').first();
    if ((await card.count().catch(() => 0)) > 0) {
      const txt = (await card.innerText({ timeout: 800 })).trim();
      return txt.slice(0, 2500);
    }
  } catch (_) { /* fall through */ }
  return '';
}

// ============================================================
// Doctor prompts
// ============================================================

const SYS_DOCTOR_PICK = `You are an experienced board-certified family-medicine physician taking an Israeli family-medicine board exam (P0062-2025). Questions are in Hebrew. You read carefully, reason step by step in your head, and answer with discipline.

Output format (strict): respond with ONLY a JSON object on a single line, no markdown, no prose. Schema:
{"pick":"A"|"B"|"C"|"D","confidence":0..100,"why":"<=200 chars terse reasoning"}
A=index 0, B=index 1, C=index 2, D=index 3 (Hebrew labeling א/ב/ג/ד maps the same way).`;

const SYS_DOCTOR_JUDGE = `You are an experienced family-medicine attending grading a board exam answer. The student app shows a correct-answer key and an explanation. Tell me whether the answer key is medically correct AND whether the explanation supports it. Be a strict but fair examiner — only flag if there is a clear medical issue, not stylistic.

Output format (strict): one JSON line, no markdown.
Schema:
{"answer_correct":true|false,"explanation_sound":true|false,"confidence":0..100,"issue":"<=300 chars or null"}`;

const SYS_DOCTOR_SOURCE = `You are a careful clinical educator. The explanation cites a textbook source (e.g. "Goroll פרק 19", "Harrison Ch 47"). Without access to the textbook, judge whether the citation is plausible — does the chapter/section topic align with the question's clinical content?

Output format (strict): one JSON line.
Schema:
{"citation_plausible":true|false,"confidence":0..100,"note":"<=200 chars or null"}`;

function tryParseJson(text) {
  // Tolerant JSON parse for one-line JSON-like responses.
  const m = text.match(/\{[^{}]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3, 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3 };

// ============================================================
// Findings ledger — JSONL append (crash-resilient)
// ============================================================

let findingsStream = null;
function openFindingsLog(reportDir) {
  const p = path.join(reportDir, 'medical_findings_ai.jsonl');
  findingsStream = createWriteStream(p, { flags: 'a' });
  return p;
}
function recordFinding(obj) {
  if (findingsStream) findingsStream.write(JSON.stringify({ at: nowIso(), ...obj }) + '\n');
}

// ============================================================
// Click helper with 4-layer fallback (from v2)
// ============================================================

async function tryClick(locator, timeoutMs) {
  try { return await locator.click({ timeout: timeoutMs }); }
  catch (e1) {
    if (/detached|stale|not attached/i.test(e1.message)) {
      await sleep(80);
      try { return await locator.click({ timeout: timeoutMs }); } catch (_) { /* fall */ }
    }
    try {
      const box = await locator.boundingBox();
      if (box) {
        await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return;
      }
    } catch (_) { /* fall */ }
    try { await locator.evaluate((el) => el.click()); return; } catch (_) { /* fall */ }
    throw e1;
  }
}

// ============================================================
// Doctor flow — answer, judge, source-check
// ============================================================

async function doctorOneQuestion(page, workerId, log) {
  const q = await extractQuestion(page);
  if (!q || q.options.length < 2) return false;

  // Read pause
  await sleep(rand(2000, 4500));

  // 1) Pick answer
  const userPrompt1 = `שאלה:\n${q.stem}\n\nאפשרויות:\n${q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}\n\nWhich is correct?`;
  let pickResp;
  try { pickResp = await callClaude(SYS_DOCTOR_PICK, userPrompt1, { maxTokens: 250 }); }
  catch (e) {
    log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'pick', message: e.message });
    return false;
  }
  const pickJson = tryParseJson(pickResp.text) || {};
  const aiLetter = String(pickJson.pick || '').trim().slice(0, 1);
  const aiIdx = LETTER_TO_IDX[aiLetter];
  log.actions.push({ at: nowIso(), type: 'ai-pick', letter: aiLetter, idx: aiIdx, conf: pickJson.confidence });
  if (aiIdx == null || aiIdx < 0 || aiIdx >= q.options.length) {
    log.bugs.push({ at: nowIso(), type: 'ai-parse-error', context: 'pick', text: pickResp.text.slice(0, 200) });
    return false;
  }

  // Click the matching option
  const optBtn = page.locator(`[data-action="pick"][data-i="${aiIdx}"]`).first();
  await tryClick(optBtn, CONFIG.actionTimeoutMs).catch((e) => {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'doctor-pick', message: e.message });
  });
  await sleep(rand(400, 900));
  // Click check (v1.21.16: check-answer; v1.21.15-and-older sd path: sd-check)
  const check = page.locator('[data-action="check-answer"], [data-action="sd-check"]').first();
  if ((await check.count().catch(() => 0)) > 0) {
    await tryClick(check, CONFIG.actionTimeoutMs).catch((e) => {
      log.bugs.push({ at: nowIso(), type: 'action-error', context: 'doctor-check', message: e.message });
    });
  }
  await sleep(rand(900, 1700)); // settle for data-state="correct" to render

  // Detect app's correct index
  const appIdx = await detectAppCorrectIdx(page);
  const explanation = await extractExplanation(page);
  const disagrees = appIdx != null && appIdx !== aiIdx;

  // 2) Judge correctness + explanation soundness
  const userPrompt2 = `Question (Hebrew):\n${q.stem}\n\nOptions:\n${q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}\n\nApp's claimed correct answer: ${appIdx == null ? 'unknown' : 'ABCD'[appIdx]}\nMy clinical pick was: ${aiLetter} (${pickJson.why || ''})\n\nApp's explanation snippet:\n${(explanation || '').slice(0, 1500)}\n\nIs the app right? Is the explanation sound?`;
  let judgeResp = null;
  try { judgeResp = await callClaude(SYS_DOCTOR_JUDGE, userPrompt2, { maxTokens: 350 }); }
  catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'judge', message: e.message }); }
  const judgeJson = judgeResp ? (tryParseJson(judgeResp.text) || {}) : {};
  log.actions.push({ at: nowIso(), type: 'ai-judge', answer_correct: judgeJson.answer_correct, explanation_sound: judgeJson.explanation_sound, conf: judgeJson.confidence });

  // 3) Source-check if explanation cites a chapter
  let sourceJson = null;
  const cite = explanation.match(/(Goroll|Harrison|Nelson|Lerner|הר['"]י|AFP)\s*(?:Ch\.?|Chapter|פרק)?\s*\d{1,3}/i);
  if (cite) {
    const userPrompt3 = `Explanation snippet (about a Hebrew family-medicine question):\n${explanation.slice(0, 1500)}\n\nThe cited source is: ${cite[0]}.\nIs the topic of that chapter/section plausibly aligned with the explanation's claim?`;
    let srcResp;
    try { srcResp = await callClaude(SYS_DOCTOR_SOURCE, userPrompt3, { maxTokens: 200 }); }
    catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'source', message: e.message }); }
    sourceJson = srcResp ? (tryParseJson(srcResp.text) || {}) : {};
    log.actions.push({ at: nowIso(), type: 'ai-source', plausible: sourceJson.citation_plausible, citation: cite[0], conf: sourceJson.confidence });
  }

  // Record finding (always — agreement or disagreement)
  const finding = {
    workerId,
    stem: q.stem.slice(0, 300),
    options: q.options.map((o) => o.text.slice(0, 120)),
    aiLetter,
    aiIdx,
    aiWhy: pickJson.why || null,
    aiConf: pickJson.confidence,
    appIdx,
    disagrees,
    judge: judgeJson,
    source: sourceJson,
    citation: cite ? cite[0] : null,
  };
  recordFinding(finding);

  // 4) Sometimes write feedback or report on disagreements / soundness flags
  const flagged = disagrees || judgeJson?.answer_correct === false || judgeJson?.explanation_sound === false;
  if (flagged && Math.random() < CONFIG.feedbackRate) {
    await maybeSubmitFeedback(page, log, finding);
  }
  if (flagged && Math.random() < CONFIG.reportRate) {
    await maybeReportQuestion(page, log, finding);
  }

  // Click next (v1.21.16: next-q; older sd path: sd-next)
  const next = page.locator('[data-action="next-q"], [data-action="sd-next"]').first();
  if ((await next.count().catch(() => 0)) > 0) {
    await tryClick(next, CONFIG.actionTimeoutMs).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'next' });
  }
  await sleep(rand(800, 1700));
  return true;
}

async function maybeSubmitFeedback(page, log, finding) {
  // Open the feedback view via search-and-find; FM uses [data-action="submit-feedback"]
  // inside the feedback overlay. We need to first navigate to the feedback panel.
  // Try a direct selector for the feedback nav button or settings overlay.
  const fbBtn = page.locator('[data-action*="feedback"], [data-action="more"]').first();
  if ((await fbBtn.count().catch(() => 0)) === 0) return;
  await tryClick(fbBtn, CONFIG.actionTimeoutMs).catch(() => {});
  await sleep(rand(900, 1700));
  const fbText = page.locator('#fb-text, textarea[id*="fb"], textarea[placeholder*="פידבק"], textarea[placeholder*="feedback"]').first();
  if ((await fbText.count().catch(() => 0)) === 0) return;
  const text = `[chaos-doctor-bot v3] Disagreement: AI picked ${finding.aiLetter} (${finding.aiWhy || ''}). App says correct=${finding.appIdx == null ? 'unknown' : 'ABCD'[finding.appIdx]}. Judge: answer_correct=${finding.judge?.answer_correct ?? 'n/a'}, explanation_sound=${finding.judge?.explanation_sound ?? 'n/a'}. Stem: ${finding.stem.slice(0, 180)}`;
  try {
    await tryClick(fbText, CONFIG.actionTimeoutMs);
    await page.keyboard.type(text.slice(0, 500), { delay: rand(8, 25) });
    log.actions.push({ at: nowIso(), type: 'feedback-typed' });
    const submit = page.locator('[data-action="submit-feedback"]').first();
    if ((await submit.count().catch(() => 0)) > 0) {
      await tryClick(submit, CONFIG.actionTimeoutMs).catch(() => {});
      log.actions.push({ at: nowIso(), type: 'feedback-submit' });
    }
    await sleep(rand(800, 1600));
  } catch (e) {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'feedback', message: e.message });
  }
}

async function maybeReportQuestion(page, log, finding) {
  // Try to find a "report this question" button; FM exposes [data-action] with
  // 'report' substring on the quiz screen post-check.
  const rep = page.locator('[data-action*="report"]').first();
  if ((await rep.count().catch(() => 0)) === 0) return;
  await tryClick(rep, CONFIG.actionTimeoutMs).catch(() => {});
  log.actions.push({ at: nowIso(), type: 'report-open' });
  await sleep(rand(800, 1500));
  // Try to fill any visible text input in the modal
  const reasonInput = page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"]').first();
  if ((await reasonInput.count().catch(() => 0)) > 0) {
    const reason = `Disagree (AI=${finding.aiLetter}, app=${finding.appIdx == null ? '?' : 'ABCD'[finding.appIdx]}): ${(finding.judge?.issue || finding.aiWhy || 'see stem').slice(0, 200)}`;
    try {
      await tryClick(reasonInput, CONFIG.actionTimeoutMs);
      await page.keyboard.type(reason, { delay: rand(8, 20) });
    } catch (_) { /* skip */ }
  }
  // Submit report
  const repSubmit = page.locator('[role="dialog"] [data-action*="submit"], [role="dialog"] button:has-text("שלח")').first();
  if ((await repSubmit.count().catch(() => 0)) > 0) {
    await tryClick(repSubmit, CONFIG.actionTimeoutMs).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'report-submit' });
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(rand(500, 1000));
}

// ============================================================
// Worker loop
// ============================================================

async function ensureOnQuiz(page, log) {
  // Step 1: wait for app shell to hydrate (FM is a Vite SPA — needs JS to
  // run before any data-action attrs appear in the DOM).
  try {
    await page.locator('[data-action]').first().waitFor({ state: 'attached', timeout: 12_000 });
  } catch (_) { /* shell didn't hydrate */ return false; }

  // Step 2: detect if quiz is already active — quiz-question stem present.
  const stemActive = await page.locator('h2.quiz-question, .quiz-question').count().catch(() => 0);
  if (stemActive > 0) return true;

  // Step 3: not in a quiz yet — click a mode-start button.
  // Prefer start-mock (multi-Q exam) over start-sd (sudden-death single-Q)
  // for a steadier doctor flow. Fall back to whatever start-* exists.
  const startCandidates = ['start-mock', 'start-sd', 'start-mini-exam', 'start-oncall'];
  for (const action of startCandidates) {
    const btn = page.locator(`[data-action="${action}"]:not([disabled])`).first();
    if ((await btn.count().catch(() => 0)) > 0) {
      await tryClick(btn, CONFIG.actionTimeoutMs).catch(() => {});
      await sleep(rand(1500, 3000));
      // Confirm quiz is now active
      try {
        await page.locator('h2.quiz-question, .quiz-question').first().waitFor({ state: 'visible', timeout: 6000 });
        log.actions.push({ at: nowIso(), type: 'mode-start', action });
        return true;
      } catch (_) { /* try next mode */ }
    }
  }

  // Diagnostic — what data-actions are present? Useful for debugging
  // selector drift on future FM versions.
  if (CONFIG.screenshotOnBug) {
    const shotPath = path.join(CONFIG.reportDir, `worker-no-quiz-${Date.now()}.png`);
    await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
    const actions = await page.evaluate(() => {
      const els = document.querySelectorAll('[data-action]');
      const counts = {};
      els.forEach((e) => { const k = e.getAttribute('data-action'); counts[k] = (counts[k] || 0) + 1; });
      return counts;
    }).catch(() => ({}));
    log.bugs.push({ at: nowIso(), type: 'no-quiz-state', screenshot: shotPath, dataActionsPresent: actions });
  }
  return false;
}

async function runWorker(browser, workerId, stopAt, report) {
  const context = await browser.newContext({
    viewport: { width: pick([390, 414, 768, 1280]), height: pick([844, 896, 900]) },
    locale: pick(['he-IL', 'en-US']),
    timezoneId: 'Asia/Jerusalem',
  });
  context.setDefaultTimeout(CONFIG.actionTimeoutMs);
  const page = await context.newPage();
  const log = { workerId, actions: [], bugs: [], qsAnswered: 0 };

  page.on('pageerror', async (error) => {
    let shotPath = null;
    if (CONFIG.screenshotOnBug) {
      shotPath = path.join(CONFIG.reportDir, `worker-${workerId}-${Date.now()}-pageerror.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => { shotPath = null; });
    }
    log.bugs.push({ at: nowIso(), type: 'pageerror', message: error.message, stack: error.stack ? String(error.stack).split('\n').slice(0, 8).join('\n') : null, screenshot: shotPath });
  });
  page.on('requestfailed', (request) => {
    log.bugs.push({ at: nowIso(), type: 'requestfailed', url: request.url(), method: request.method(), failure: request.failure()?.errorText || 'unknown' });
  });
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) log.bugs.push({ at: nowIso(), type: 'http', status, url: response.url() });
  });
  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) log.bugs.push({ at: nowIso(), type: `console:${msg.type()}`, text: msg.text() });
  });

  try {
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await sleep(rand(1500, 3000));

    while (Date.now() < stopAt) {
      const onQuiz = await ensureOnQuiz(page, log);
      if (!onQuiz) {
        // No quiz available; try a refresh to escape
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* ok */ }
        await sleep(rand(2000, 4000));
        continue;
      }
      const ok = await doctorOneQuestion(page, workerId, log);
      if (ok) log.qsAnswered += 1;
      else await sleep(rand(2000, 4000));
      // Per-worker pacing — keep ~3-4 questions/min/worker average
    }
  } finally {
    report.workers.push(log);
    await context.close().catch(() => {});
  }
}

// ============================================================
// Reporting
// ============================================================

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

function buildMarkdown(report) {
  const allBugs = report.workers.flatMap((w) => w.bugs.map((b) => ({ workerId: w.workerId, ...b })));
  const allActions = report.workers.flatMap((w) => w.actions);
  const totalQ = report.workers.reduce((s, w) => s + (w.qsAnswered || 0), 0);
  const aiPicks = allActions.filter((a) => a.type === 'ai-pick').length;
  const aiJudges = allActions.filter((a) => a.type === 'ai-judge').length;
  const aiSources = allActions.filter((a) => a.type === 'ai-source').length;
  const fbSubmits = allActions.filter((a) => a.type === 'feedback-submit').length;
  const reportSubmits = allActions.filter((a) => a.type === 'report-submit').length;
  const bugCounts = allBugs.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
  const cost = priceUsd(COST.totalInTokens, COST.totalOutTokens);

  const lines = [];
  lines.push('# Chaos doctor-bot v3 report');
  lines.push('');
  lines.push(`- URL: ${report.config.url}`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Duration: ${(report.config.durationMs / 60000).toFixed(1)} min`);
  lines.push(`- Simulated users: ${report.config.users}`);
  lines.push(`- Model: ${MODEL}`);
  lines.push(`- Questions answered: **${totalQ}**`);
  lines.push(`- AI calls: pick=${aiPicks} judge=${aiJudges} source=${aiSources} (total ${COST.totalCalls}, failures ${COST.failures})`);
  lines.push(`- Tokens: in=${COST.totalInTokens}, out=${COST.totalOutTokens}`);
  lines.push(`- Approx cost (Sonnet 4.6 list): **$${cost.toFixed(2)}**`);
  lines.push(`- Feedback submissions: ${fbSubmits}, question reports: ${reportSubmits}`);
  lines.push('');
  lines.push('## Bug/event counts');
  if (!Object.keys(bugCounts).length) lines.push('No captured errors.');
  else {
    lines.push('| Type | Count |');
    lines.push('|---|---:|');
    for (const [t, c] of Object.entries(bugCounts).sort((a, b) => b[1] - a[1])) lines.push(`| ${t} | ${c} |`);
  }
  lines.push('');
  const pageerrors = allBugs.filter((b) => b.type === 'pageerror');
  lines.push('## Pageerrors (P0 candidates)');
  lines.push('');
  if (!pageerrors.length) lines.push('Zero pageerrors. v1.21.15 defensive guards holding under doctor-mode chaos.');
  else {
    lines.push('| Worker | Message | Screenshot |');
    lines.push('|---:|---|---|');
    pageerrors.slice(0, 30).forEach((b) => lines.push(`| ${b.workerId} | ${String(b.message || '').replace(/\s+/g, ' ').slice(0, 200)} | ${b.screenshot || '-'} |`));
  }
  lines.push('');
  lines.push('## Per-worker output');
  lines.push('');
  lines.push('| Worker | Qs | Bugs |');
  lines.push('|---:|---:|---:|');
  report.workers.forEach((w) => lines.push(`| ${w.workerId} | ${w.qsAnswered || 0} | ${w.bugs.length} |`));
  lines.push('');
  lines.push('See `medical_findings_ai.jsonl` for the per-question AI verdicts (pick / judge / source-check).');
  return lines.join('\n');
}

async function main() {
  await ensureDir(CONFIG.reportDir);
  openFindingsLog(CONFIG.reportDir);
  const report = { config: CONFIG, startedAt: nowIso(), finishedAt: null, workers: [] };
  console.log(`Launching ${CONFIG.users} workers × ${(CONFIG.durationMs / 60000).toFixed(0)} min, model=${MODEL}, url=${CONFIG.url}`);
  const browser = await chromium.launch({ headless: CONFIG.headless });
  const stopAt = Date.now() + CONFIG.durationMs;
  try {
    await Promise.all(Array.from({ length: CONFIG.users }, (_, i) => runWorker(browser, i + 1, stopAt, report)));
  } finally {
    await browser.close().catch(() => {});
  }
  report.finishedAt = nowIso();
  if (findingsStream) findingsStream.end();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(CONFIG.reportDir, `chaos-doctor-${stamp}.json`);
  const mdPath = path.join(CONFIG.reportDir, `chaos-doctor-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ ...report, cost: { ...COST, usd: priceUsd(COST.totalInTokens, COST.totalOutTokens) } }, null, 2));
  await fs.writeFile(mdPath, buildMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Cost: $${priceUsd(COST.totalInTokens, COST.totalOutTokens).toFixed(2)} (${COST.totalCalls} calls, ${COST.totalInTokens}+${COST.totalOutTokens} tokens, ${COST.failures} failures)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
