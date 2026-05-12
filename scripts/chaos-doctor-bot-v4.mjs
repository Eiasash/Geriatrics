#!/usr/bin/env node
/**
 * Chaos doctor bot v4 — judge-contract redesign on top of v3.
 *
 * Why v4 exists
 * -------------
 * v3 produced 585 medical_findings_ai.jsonl rows with appIdx=null in 100%
 * of them. Root cause: v3 entered the app via [data-action="start-mock"],
 * which puts FM into exam mode. In exam mode the dist bundle ONLY sets
 * data-state="correct" on the user's pick (not on the actual answer key),
 * AND hides the check-answer button entirely. The bot was therefore never
 * able to capture the app's correct index — so the "judge" turn was AI
 * judging its own pick, not AI judging the app. Zero answer-key signal.
 *
 * v4 changes (vs v3, surgical):
 *   1. Practice mode entry — never click start-mock / start-mini-exam.
 *      Use the default practice surface where check-answer reveals
 *      data-state="correct" on the actual correct option per question.
 *   2. Robust JSON parser — brace-balanced extractor instead of the
 *      v3 regex /\{[^{}]*\}/ that rejects nested braces and fails on
 *      multi-line JSON (caused 352 ai-parse-error events in workers 1/8/10).
 *   3. Targeted explanation extraction — read .quiz-feedback__body and
 *      .quiz-source separately rather than slurping the whole .card
 *      (v3 source-check fired 0 times because cite regex never matched
 *      the over-broad capture).
 *   4. Stuck-worker detection — track stem hash across iterations;
 *      if the same stem persists 3+ times consecutively the worker is
 *      jammed, refresh the page (worker 8 in v3 produced 0 Qs / 154 bugs).
 *   5. Three-way judge prompt — with real appIdx now available, the
 *      judge prompt explicitly asks the model to validate the APP's
 *      answer, not blend its own pick into the verdict. Disagreement
 *      cases get a richer prompt that surfaces both picks separately.
 *   6. Skip judge when appIdx is null — don't burn API calls on
 *      tautological AI-vs-AI verdicts. Log the gap as a methodology
 *      event (post-fix, this should round to 0 — used as a regression
 *      signal that we landed on practice mode correctly).
 *
 * v4 keeps the same Sonnet 4.6 model, the same JSONL ledger format
 * (so v3+v4 records co-mingle cleanly), and the same feedback/report
 * side-effect rates. It deliberately does NOT change the DOM
 * selectors v3 already verified work for Geri v10.64.66+.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { extractJson } from './lib/extractJson.mjs';
import { resolveAppVerdict } from './lib/optionResolver.mjs';

const DEFAULT_URL = 'https://eiasash.github.io/Geriatrics/';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.CHAOS_MODEL || 'claude-opus-4-7';

const CONFIG = {
  url: process.env.CHAOS_URL || DEFAULT_URL,
  durationMs: Number(process.env.CHAOS_DURATION_MS || 30 * 60_000),
  users: Math.max(1, Number(process.env.CHAOS_USERS || 10)),
  navigationTimeoutMs: Number(process.env.CHAOS_NAV_TIMEOUT_MS || 30_000),
  actionTimeoutMs: Number(process.env.CHAOS_ACTION_TIMEOUT_MS || 5000),
  headless: process.env.CHAOS_HEADLESS !== '0',
  reportDir: process.env.CHAOS_REPORT_DIR || 'chaos-reports/v4',
  screenshotOnBug: process.env.CHAOS_SCREENSHOTS !== '0',
  feedbackRate: Number(process.env.CHAOS_FEEDBACK_RATE || 0.10),
  reportRate: Number(process.env.CHAOS_REPORT_RATE || 0.08),
  // v4: jam-detection threshold — N consecutive same-stem iterations triggers refresh
  stuckThreshold: Number(process.env.CHAOS_STUCK_THRESHOLD || 3),
  // v4: cost cap (USD). Workers self-terminate when cost ledger crosses this.
  costCapUsd: Number(process.env.CHAOS_COST_CAP_USD || 25),
};

const KEY = process.env.CLAUDE_API_KEY;
if (!KEY) { console.error('CLAUDE_API_KEY not set in environment'); process.exit(2); }
if (KEY.length !== 108) console.warn(`WARN: CLAUDE_API_KEY length=${KEY.length}, expected 108 — may 401`);

const COST = { totalCalls: 0, totalInTokens: 0, totalOutTokens: 0, failures: 0 };
function priceUsd(inTok, outTok) {
  return (inTok / 1_000_000) * 3 + (outTok / 1_000_000) * 15;
}
function costExceeded() {
  return priceUsd(COST.totalInTokens, COST.totalOutTokens) >= CONFIG.costCapUsd;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (xs) => xs[rand(0, xs.length - 1)];
const nowIso = () => new Date().toISOString();

function hashStem(s) {
  // Simple djb2 — deterministic across workers, no crypto cost.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

// ============================================================
// Anthropic API helper (unchanged from v3)
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
        await sleep((attempt + 1) * 1500);
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

// extractJson is imported from ./lib/extractJson.mjs (above) so unit tests
// don't have to load the playwright runtime.

const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3, 'א': 0, 'ב': 1, 'ג': 2, 'ד': 3 };

// ============================================================
// Question / answer extraction (v4 targeted)
// ============================================================

async function extractQuestion(page) {
  // Geri renders the stem inside the quiz card; first .heb element after
  // the question card header is the stem. Skeleton-state .qo blocks have
  // ⠀ (braille blank) so we filter on stem length to skip pre-load state.
  const stemLoc = page.locator('.heb').first();
  if (!(await stemLoc.count().catch(() => 0))) return null;
  let stem = '';
  try { stem = (await stemLoc.innerText({ timeout: 800 })).trim(); } catch (_) { return null; }
  if (!stem || stem.length < 20) return null;
  // Geri's quiz options are <button class="qo"> rendered by _rqmQuestion at
  // shlav-a-mega.html:3052. NO data-i attribute — index is positional.
  // The .qo skeleton blocks at lines 3493-3496 use the same class but are
  // <div> not <button>; filter to button:has-class.
  const opts = page.locator('button.qo');
  const n = await opts.count().catch(() => 0);
  if (n < 2) return null;
  const options = [];
  for (let i = 0; i < n; i++) {
    const btn = opts.nth(i);
    let txt = '';
    try { txt = (await btn.innerText({ timeout: 500 })).trim(); } catch (_) { /* skip */ }
    if (!txt) continue;
    options.push({ idx: i, text: txt });
  }
  if (options.length < 2) return null;
  return { stem, options };
}

async function detectAppCorrectIdx(page) {
  // Geri marks the correct option with `class="qo lk ok"` (post-answer
  // reveal in non-exam mode). Wrong-but-selected gets ` no`, others get
  // ` dim`. See shlav-a-mega.html:3048. The ok class is the answer-key
  // signal regardless of whether the bot picked right or wrong (unlike
  // FM's data-state="correct-unchosen" — Geri uses a single ok marker).
  // Index = position among button.qo siblings.
  const okLoc = page.locator('button.qo.ok');
  if ((await okLoc.count().catch(() => 0)) === 0) return null;
  // To get the index, count button.qo elements before the .ok one.
  const idx = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button.qo'));
    const ok = document.querySelector('button.qo.ok');
    return ok ? all.indexOf(ok) : -1;
  }).catch(() => -1);
  return idx >= 0 ? idx : null;
}

// v4: targeted explanation + source extraction. The dist bundle exposes
// .quiz-feedback__body for the explanation prose and .quiz-source for the
// citation pill. v3 grabbed the whole .card and lost discrimination.
async function extractExplanationAndSource(page) {
  // Geri renders the explanation inside `.explain-box` (shlav-a-mega.html
  // line 3191 + 2446). No separate .quiz-source element — the citation,
  // if any, is inline in the explanation prose. Source-check regex picks
  // it up downstream.
  let explanation = '';
  let source = '';
  try {
    const body = page.locator('.explain-box').first();
    if ((await body.count().catch(() => 0)) > 0) {
      explanation = (await body.innerText({ timeout: 800 })).trim().slice(0, 2500);
    }
  } catch (_) { /* fall */ }
  if (!explanation) {
    try {
      const card = page.locator('.card').first();
      if ((await card.count().catch(() => 0)) > 0) {
        explanation = (await card.innerText({ timeout: 800 })).trim().slice(0, 2500);
      }
    } catch (_) { /* skip */ }
  }
  return { explanation, source };
}

// ============================================================
// Doctor prompts — v4 judge contract is sharper
// ============================================================

const SYS_DOCTOR_PICK = `You are an experienced board-certified geriatrician taking the Israeli geriatric medicine board exam (Shlav A, P005-2026). Questions are in Hebrew. Your reference frame is Hazzard 8e, Harrison 22e, GRS8, and Israeli MOH regulation. You read carefully, reason step by step in your head, and answer with discipline.

Output format (strict): respond with ONLY a JSON object on a single line, no markdown, no prose. Schema:
{"pick":"A"|"B"|"C"|"D","confidence":0..100,"why":"<=200 chars terse reasoning"}
A=index 0, B=index 1, C=index 2, D=index 3 (Hebrew labeling א/ב/ג/ד maps the same way).`;

// v4 judge prompt — explicit that we are validating the APP, not adjudicating
// between the AI's pick and the app's pick. The AI's prior pick is supplied
// only as context for "where you would have gone".
const SYS_DOCTOR_JUDGE = `You are an experienced geriatric medicine attending grading a board-exam question and the app's answer key. The question is from an Israeli geriatric medicine board prep app (Shlav A, P005-2026). Your job: validate the APP's claimed correct answer against board-level geriatric medicine evidence (Hazzard 8e, Harrison 22e, GRS8, Israeli MOH). The AI's prior pick is context only — you are NOT adjudicating "AI vs app", you are validating the APP's stated key.

Output format (strict): one JSON line, no markdown.
Schema:
{"app_answer_correct":true|false,"explanation_sound":true|false,"confidence":0..100,"issue":"<=300 chars or null","correct_letter_if_app_wrong":"A"|"B"|"C"|"D"|null}

Be a strict but fair examiner — only flag app_answer_correct=false if you have a board-level reason. If you'd defer to the textbook (i.e. you're <80% confident the app is wrong), set app_answer_correct=true and explain in issue.`;

const SYS_DOCTOR_SOURCE = `You are a careful clinical educator. The explanation cites a textbook source (e.g. "Hazzard's Ch 43", "Harrison 22e Ch 437", "GRS8 פרק 19", "Brookdale 2024"). Without access to the textbook, judge whether the citation is plausible — does the chapter/section topic align with the question's clinical content?

Output format (strict): one JSON line.
Schema:
{"citation_plausible":true|false,"confidence":0..100,"note":"<=200 chars or null"}`;

// ============================================================
// Findings ledger — JSONL append (crash-resilient, unchanged shape from v3)
// ============================================================

let findingsStream = null;
function openFindingsLog(reportDir) {
  const p = path.join(reportDir, 'medical_findings_ai_v4.jsonl');
  findingsStream = createWriteStream(p, { flags: 'a' });
  return p;
}
function recordFinding(obj) {
  if (findingsStream) findingsStream.write(JSON.stringify({ at: nowIso(), schema: 'v4', ...obj }) + '\n');
}

// ============================================================
// Click helper (unchanged from v3)
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
// Doctor flow — v4 contract
// ============================================================

async function doctorOneQuestion(page, workerId, log) {
  const q = await extractQuestion(page);
  if (!q || q.options.length < 2) return { advanced: false, stemHash: null };

  const stemHash = hashStem(q.stem);
  await sleep(rand(2000, 4500)); // read pause

  // 1) Pick
  const userPrompt1 = `שאלה:\n${q.stem}\n\nאפשרויות:\n${q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}\n\nWhich is correct?`;
  let pickResp;
  try { pickResp = await callClaude(SYS_DOCTOR_PICK, userPrompt1, { maxTokens: 250 }); }
  catch (e) {
    log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'pick', message: e.message });
    return { advanced: false, stemHash };
  }
  const pickJson = extractJson(pickResp.text) || {};
  const aiLetter = String(pickJson.pick || '').trim().slice(0, 1);
  const aiIdx = LETTER_TO_IDX[aiLetter];
  log.actions.push({ at: nowIso(), type: 'ai-pick', letter: aiLetter, idx: aiIdx, conf: pickJson.confidence });
  if (aiIdx == null || aiIdx < 0 || aiIdx >= q.options.length) {
    log.bugs.push({ at: nowIso(), type: 'ai-parse-error', context: 'pick', text: pickResp.text.slice(0, 200) });
    return { advanced: false, stemHash };
  }

  // Click option + check (Geri uses button.qo + onclick="pick(N)" — no data-i)
  const optBtn = page.locator('button.qo').nth(aiIdx);
  await tryClick(optBtn, CONFIG.actionTimeoutMs).catch((e) => {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'doctor-pick', message: e.message });
  });
  await sleep(rand(400, 900));
  // Geri's check button has aria-label="Check answer" + onclick="check()"
  const check = page.locator('[aria-label="Check answer"]').first();
  if ((await check.count().catch(() => 0)) > 0) {
    await tryClick(check, CONFIG.actionTimeoutMs).catch((e) => {
      log.bugs.push({ at: nowIso(), type: 'action-error', context: 'doctor-check', message: e.message });
    });
  } else {
    // v4: no check button → we're in exam mode despite our practice-mode start.
    // Record as methodology event and bail (don't waste a judge call).
    log.bugs.push({ at: nowIso(), type: 'methodology', context: 'no-check-button', stemHash });
    return { advanced: false, stemHash };
  }
  await sleep(rand(900, 1700));

  // Detect app's correct idx + explanation + source.
  // Geri's monolith uses `<button onclick="pick(canonicalIdx)">` rendered in
  // shuffled DOM order. There is no `data-i` attribute — the bot reads the
  // .ok button's DOM position via `all.indexOf(ok)`, which is the DISPLAY
  // position (matching the AI's letter space). Both `aiIdx` and `appIdx`
  // are therefore display-frame here, and `resolveAppVerdict` collapses to
  // identity for Geri. We still funnel through the resolver so that any
  // future port to a `data-i` rendering (e.g. a Geri rewrite mirroring
  // FM/IM) cannot silently re-introduce the served↔canonical drift bug
  // that produced ~240/241 false positives in the 2026-05-08 triage.
  const appIdx = await detectAppCorrectIdx(page);
  const { explanation, source } = await extractExplanationAndSource(page);
  const appVerdict = resolveAppVerdict(q.options, appIdx);
  const appDisplayIdx = appVerdict ? appVerdict.displayIdx : null;
  const disagrees = appDisplayIdx != null && appDisplayIdx !== aiIdx;

  // v4: methodology guard. If appIdx is null after a check click in practice
  // mode, our entry path probably fell back to exam mode. Log it so we can
  // alert post-run; don't waste a judge call.
  if (appIdx == null) {
    log.bugs.push({ at: nowIso(), type: 'methodology', context: 'appIdx-null-post-check', stemHash });
    recordFinding({
      workerId, stem: q.stem.slice(0, 300),
      options: q.options.map((o) => o.text.slice(0, 120)),
      aiLetter, aiIdx, aiWhy: pickJson.why || null, aiConf: pickJson.confidence,
      appIdx: null, disagrees: null, judge: null, source: null, citation: null,
      methodology: 'appIdx-null-post-check',
    });
    // Try to advance even without a verdict
    const next = page.locator('[aria-label="Next question"], [aria-label="Finish exam"]').first();
    if ((await next.count().catch(() => 0)) > 0) {
      await tryClick(next, CONFIG.actionTimeoutMs).catch(() => {});
    }
    await sleep(rand(800, 1700));
    return { advanced: true, stemHash };
  }

  // 2) Judge — v4 prompt validates the APP, not blends with AI's pick.
  // Use the resolver output so the judge sentence quotes the option TEXT
  // (not just a letter), matching the FM/IM siblings. For Geri this is
  // mechanically identical to `'ABCD'[appIdx]` + `q.options[appIdx].text`,
  // but adopting the same shape sibling-wide keeps the contract uniform.
  const appLetter = appVerdict ? appVerdict.displayLetter : '?';
  const appText = appVerdict ? appVerdict.canonicalText : '(unresolved)';
  const userPrompt2 = `Question (Hebrew):
${q.stem}

Options:
${q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}

App's claimed correct answer: ${appLetter} (${appText})
App's explanation:
${(explanation || '(no explanation rendered)').slice(0, 1500)}
${source ? `\nApp's cited source: ${source}` : ''}

(Context — NOT for adjudication: AI prior pick was ${aiLetter}: ${pickJson.why || 'no rationale'})

Validate the APP's claimed answer ${appLetter} (${appText}) against board-level geriatric-medicine evidence.`;
  let judgeResp = null;
  try { judgeResp = await callClaude(SYS_DOCTOR_JUDGE, userPrompt2, { maxTokens: 400 }); }
  catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'judge', message: e.message }); }
  const judgeJson = judgeResp ? (extractJson(judgeResp.text) || {}) : {};
  log.actions.push({
    at: nowIso(), type: 'ai-judge',
    app_answer_correct: judgeJson.app_answer_correct,
    explanation_sound: judgeJson.explanation_sound,
    conf: judgeJson.confidence,
  });

  // 3) Source-check
  let sourceJson = null;
  // v4: try .quiz-source first (clean cite), else fall back to regex on explanation
  let cite = null;
  if (source) {
    const m = source.match(/(Hazzard|Harrison|GRS\s*8?|Brookdale|הזרד|הריסון)\s*(?:Ch\.?|Chapter|פרק)?\s*\d{1,3}/i);
    cite = m ? m[0] : (source.length < 200 ? source : null);
  } else if (explanation) {
    const m = explanation.match(/(Hazzard|Harrison|GRS\s*8?|Brookdale|הזרד|הריסון)\s*(?:Ch\.?|Chapter|פרק)?\s*\d{1,3}/i);
    cite = m ? m[0] : null;
  }
  if (cite) {
    const userPrompt3 = `Explanation snippet (Hebrew geriatric medicine question):\n${(explanation || source).slice(0, 1500)}\n\nCited source: ${cite}.\nIs the chapter/section topic plausibly aligned with the explanation's claim?`;
    let srcResp;
    try { srcResp = await callClaude(SYS_DOCTOR_SOURCE, userPrompt3, { maxTokens: 200 }); }
    catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'source', message: e.message }); }
    sourceJson = srcResp ? (extractJson(srcResp.text) || {}) : {};
    log.actions.push({ at: nowIso(), type: 'ai-source', plausible: sourceJson.citation_plausible, citation: cite, conf: sourceJson.confidence });
  }

  // Record finding.
  // For Geri, `appIdx` and `appDisplayIdx` are the same value (display
  // frame), but persist both fields for sibling-aligned record shape.
  const finding = {
    workerId,
    stem: q.stem.slice(0, 300),
    options: q.options.map((o) => o.text.slice(0, 120)),
    optionCanonicalIdx: q.options.map((o) => Number(o.idx)),
    aiLetter, aiIdx, aiWhy: pickJson.why || null, aiConf: pickJson.confidence,
    appIdx, appDisplayIdx, appLetter, appText,
    disagrees,
    judge: judgeJson,
    source: sourceJson,
    citation: cite,
  };
  recordFinding(finding);

  // 4) Side-effects on flagged Qs (feedback / report) — same as v3 logic
  const flagged = disagrees || judgeJson?.app_answer_correct === false || judgeJson?.explanation_sound === false;
  if (flagged && Math.random() < CONFIG.feedbackRate) {
    await maybeSubmitFeedback(page, log, finding);
  }
  if (flagged && Math.random() < CONFIG.reportRate) {
    await maybeReportQuestion(page, log, finding);
  }

  // Advance (Geri uses aria-label="Next question" + onclick="next()")
  const next = page.locator('[aria-label="Next question"], [aria-label="Finish exam"]').first();
  if ((await next.count().catch(() => 0)) > 0) {
    await tryClick(next, CONFIG.actionTimeoutMs).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'next' });
  }
  await sleep(rand(800, 1700));
  // Leaderboard hook — Geri's submitLeaderboardScore + showLeaderboard are
  // global functions in the monolith. Fire every 25th answered.
  log._lbCount = (log._lbCount || 0) + 1;
  if (log._lbCount % 25 === 0) {
    try {
      const fired = await page.evaluate(() => {
        if (typeof submitLeaderboardScore === 'function') { submitLeaderboardScore(); return 'submit'; }
        if (typeof showLeaderboard === 'function') { showLeaderboard(); return 'show'; }
        return null;
      });
      if (fired) log.actions.push({ at: nowIso(), type: 'leaderboard-submit', via: fired, after: log._lbCount });
    } catch (_) { /* swallow */ }
    await sleep(rand(800, 1500));
  }
  return { advanced: true, stemHash };
}

async function maybeSubmitFeedback(page, log, finding) {
  // Geri's feedback overlay isn't easily reachable from the quiz screen via
  // a single click — would need tab navigation to More tab + scroll. Skip
  // for the doctor-bot run (the disagreement signal is in the JSONL anyway).
  return;
  // eslint-disable-next-line no-unreachable
  const fbBtn = page.locator('[data-action*="feedback"], [data-action="more"]').first();
  if ((await fbBtn.count().catch(() => 0)) === 0) return;
  await tryClick(fbBtn, CONFIG.actionTimeoutMs).catch(() => {});
  await sleep(rand(900, 1700));
  const fbText = page.locator('#fb-text, textarea[id*="fb"], textarea[placeholder*="פידבק"], textarea[placeholder*="feedback"]').first();
  if ((await fbText.count().catch(() => 0)) === 0) return;
  const text = `[chaos-doctor-bot v4] App=${finding.appLetter} AI=${finding.aiLetter}. Judge: app_answer_correct=${finding.judge?.app_answer_correct ?? 'n/a'}, explanation_sound=${finding.judge?.explanation_sound ?? 'n/a'}. Issue: ${finding.judge?.issue || '(none)'}. Stem: ${finding.stem.slice(0, 180)}`;
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
  const rep = page.locator('[data-action*="report"]').first();
  if ((await rep.count().catch(() => 0)) === 0) return;
  await tryClick(rep, CONFIG.actionTimeoutMs).catch(() => {});
  log.actions.push({ at: nowIso(), type: 'report-open' });
  await sleep(rand(800, 1500));
  const reasonInput = page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"]').first();
  if ((await reasonInput.count().catch(() => 0)) > 0) {
    const reason = `Disagree (AI=${finding.aiLetter}, app=${finding.appLetter}): ${(finding.judge?.issue || finding.aiWhy || 'see stem').slice(0, 200)}`;
    try {
      await tryClick(reasonInput, CONFIG.actionTimeoutMs);
      await page.keyboard.type(reason, { delay: rand(8, 20) });
    } catch (_) { /* skip */ }
  }
  const repSubmit = page.locator('[role="dialog"] [data-action*="submit"], [role="dialog"] button:has-text("שלח")').first();
  if ((await repSubmit.count().catch(() => 0)) > 0) {
    await tryClick(repSubmit, CONFIG.actionTimeoutMs).catch(() => {});
    log.actions.push({ at: nowIso(), type: 'report-submit' });
  }
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(rand(500, 1000));
}

// ============================================================
// v4: practice-mode entry — no start-mock, no exam mode
// ============================================================

async function ensureOnPracticeQuiz(page, log) {
  // Step 1: hydrate. Geri uses onclick handlers (no [data-action]); wait
  // for body to be ready and the quiz card to render.
  try {
    await page.locator('body').waitFor({ state: 'attached', timeout: 12_000 });
    await sleep(1500);
  } catch (_) { return false; }

  // Step 2: if button.qo + check button are visible, we're in practice mode.
  const optsCount = await page.locator('button.qo').count().catch(() => 0);
  const checkVisible = await page.locator('[aria-label="Check answer"]').count().catch(() => 0);
  if (optsCount >= 2 && checkVisible > 0) return true;

  // Step 3: if options visible but no check button, we're in exam mode.
  // Reset state by reloading.
  if (optsCount >= 2 && checkVisible === 0) {
    log.actions.push({ at: nowIso(), type: 'mode-escape', from: 'exam-mode-detected' });
    try {
      await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      await sleep(rand(1500, 2500));
    } catch (_) { /* fall */ }
  }

  // Step 4: navigate to quiz tab via Geri's onclick="go('quiz')" pattern —
  // exposed through evaluate since it's a window-bound function.
  try {
    await page.evaluate(() => {
      // @ts-ignore — go is a window-bound nav fn in shlav-a-mega.html
      if (typeof go === 'function') go('quiz');
    });
    await sleep(rand(800, 1500));
  } catch (_) { /* fall */ }

  // Step 5: confirm options + check button now both visible.
  try {
    await page.locator('button.qo').first().waitFor({ state: 'visible', timeout: 6000 });
    await page.locator('[aria-label="Check answer"]').first().waitFor({ state: 'attached', timeout: 4000 });
    log.actions.push({ at: nowIso(), type: 'mode-start', action: 'practice' });
    return true;
  } catch (_) {
    if (CONFIG.screenshotOnBug) {
      const shotPath = path.join(CONFIG.reportDir, `worker-no-practice-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => {});
      const ariaLabels = await page.evaluate(() => {
        const els = document.querySelectorAll('[aria-label]');
        return Array.from(els).map((e) => e.getAttribute('aria-label')).filter(Boolean).slice(0, 50);
      }).catch(() => []);
      log.bugs.push({ at: nowIso(), type: 'no-practice-state', screenshot: shotPath, ariaLabelsPresent: ariaLabels });
    }
    return false;
  }
}

// ============================================================
// Worker loop — with stuck detection
// ============================================================

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

    let lastStemHash = null;
    let stuckCount = 0;

    while (Date.now() < stopAt) {
      if (costExceeded()) {
        log.bugs.push({ at: nowIso(), type: 'cost-cap', usd: priceUsd(COST.totalInTokens, COST.totalOutTokens) });
        break;
      }
      const onQuiz = await ensureOnPracticeQuiz(page, log);
      if (!onQuiz) {
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* ok */ }
        await sleep(rand(2000, 4000));
        continue;
      }
      const result = await doctorOneQuestion(page, workerId, log);
      if (result.advanced) {
        log.qsAnswered += 1;
        if (result.stemHash === lastStemHash) {
          stuckCount += 1;
        } else {
          stuckCount = 0;
        }
        lastStemHash = result.stemHash;
      } else {
        // Failed turn — count toward stuck if same stem
        if (result.stemHash && result.stemHash === lastStemHash) {
          stuckCount += 1;
        }
        lastStemHash = result.stemHash;
      }
      if (stuckCount >= CONFIG.stuckThreshold) {
        log.bugs.push({ at: nowIso(), type: 'stuck-refresh', stemHash: lastStemHash, stuckCount });
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* ok */ }
        await sleep(rand(2000, 4000));
        stuckCount = 0;
        lastStemHash = null;
      }
      if (!result.advanced) await sleep(rand(2000, 4000));
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

  // v4: methodology-event accounting
  const methodologyEvents = allBugs.filter((b) => b.type === 'methodology').length;
  const stuckEvents = allBugs.filter((b) => b.type === 'stuck-refresh').length;

  const lines = [];
  lines.push('# Chaos doctor-bot v4 report');
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
  lines.push(`- Approx cost (Sonnet 4.6 list): **$${cost.toFixed(2)}** (cap $${CONFIG.costCapUsd.toFixed(2)})`);
  lines.push(`- Feedback submissions: ${fbSubmits}, question reports: ${reportSubmits}`);
  lines.push(`- v4 methodology events: ${methodologyEvents}, stuck-refresh: ${stuckEvents}`);
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
  if (!pageerrors.length) lines.push('Zero pageerrors.');
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
  lines.push('See `medical_findings_ai_v4.jsonl` for the per-question AI verdicts (pick / judge / source-check).');
  lines.push('');
  lines.push('### v4 health signals to check first');
  lines.push('- `methodology` events should be near 0 — if non-zero, the practice-mode entry path failed for some workers.');
  lines.push('- `ai-parse-error` events should be << v3 (which had 352). The v4 brace-balanced extractor handles nested JSON + markdown fences.');
  lines.push('- `source` calls should be > 0 when explanations cite chapters — v3 fired 0 because `.card` was too broad.');
  return lines.join('\n');
}

async function main() {
  await ensureDir(CONFIG.reportDir);
  openFindingsLog(CONFIG.reportDir);
  const report = { config: CONFIG, startedAt: nowIso(), finishedAt: null, workers: [] };
  console.log(`[v4] Launching ${CONFIG.users} workers × ${(CONFIG.durationMs / 60000).toFixed(0)} min, model=${MODEL}, url=${CONFIG.url}, cost-cap $${CONFIG.costCapUsd}`);
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
  const jsonPath = path.join(CONFIG.reportDir, `chaos-doctor-v4-${stamp}.json`);
  const mdPath = path.join(CONFIG.reportDir, `chaos-doctor-v4-${stamp}.md`);
  await fs.writeFile(jsonPath, JSON.stringify({ ...report, cost: { ...COST, usd: priceUsd(COST.totalInTokens, COST.totalOutTokens) } }, null, 2));
  await fs.writeFile(mdPath, buildMarkdown(report));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
  console.log(`Cost: $${priceUsd(COST.totalInTokens, COST.totalOutTokens).toFixed(2)} (${COST.totalCalls} calls, ${COST.totalInTokens}+${COST.totalOutTokens} tokens, ${COST.failures} failures)`);
}

// Allow this module to be imported (extractJson is exported for unit testing)
// without auto-running main.
const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('chaos-doctor-bot-v4.mjs');
if (isMain) main().catch((e) => { console.error(e); process.exitCode = 1; });
