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
import { createWriteStream, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { extractJson } from './lib/extractJson.mjs';
import { hashStem, normStem } from './lib/hashStem.mjs';
import { judgeWithShapeRetry } from './lib/judgeShapeValidator.mjs';
import {
  resolveAppVerdict,
  resolveJudgeLetter,
  pickAgreesWithApp,
  extractAcceptedDisplayIdxSet,
} from './lib/optionResolver.mjs';
import { nextRecovery, initialRecoveryState } from './lib/workerRecovery.mjs';
import { recordDeployedCorpusSha } from './lib/corpusSha.mjs';

// v10.64.118: audit-grade chapter assignment input for the redesigned
// SYS_DOCTOR_SOURCE prompt. Loaded lazily at bot startup from local
// data/ files (the working tree's questions.json + question_chapters.json
// + hazzard_chapters.json + harrison_chapters.json). Used to construct
// the "audit-grade chapter assignment" block in the audit-2 user prompt.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
let AUDIT_GRADE_MAP = null;  // { stemPrefix80 -> { qzIdx, audit_grade_text } }
let DATA_LOAD_FAILED = false;
function loadAuditGradeData() {
  if (AUDIT_GRADE_MAP !== null || DATA_LOAD_FAILED) return AUDIT_GRADE_MAP;
  try {
    const QZ = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', 'questions.json'), 'utf-8'));
    const CH = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', 'question_chapters.json'), 'utf-8'));
    const HAZ = JSON.parse(readFileSync(path.join(REPO_ROOT, 'data', 'hazzard_chapters.json'), 'utf-8'));
    const HAR = JSON.parse(readFileSync(path.join(REPO_ROOT, 'harrison_chapters.json'), 'utf-8'));
    const map = new Map();
    for (let i = 0; i < QZ.length; i++) {
      const prefix = (QZ[i].q || '').slice(0, 80);
      if (!prefix) continue;
      const entry = CH[String(i)] || {};
      const lines = [];
      if (entry.haz) {
        const title = HAZ[String(entry.haz)]?.title || '';
        lines.push(`- Hazzard: Ch ${entry.haz}${title ? ' — ' + title : ''}`);
      }
      if (entry.har) {
        const title = HAR[String(entry.har)]?.title || '';
        lines.push(`- Harrison: Ch ${entry.har}${title ? ' — ' + title : ''}`);
      }
      if (entry.grs) lines.push(`- GRS8: Ch ${entry.grs}`);
      map.set(prefix, { qzIdx: i, audit_grade_text: lines.join('\n') || '(no audit-grade entry)' });
    }
    AUDIT_GRADE_MAP = map;
    console.error(`[v4] loaded audit-grade map: ${map.size} stem-prefix entries`);
    return map;
  } catch (e) {
    console.error(`[v4] WARN: audit-grade data load failed: ${e.message}. Audit-2 will run without audit-grade input.`);
    DATA_LOAD_FAILED = true;
    return null;
  }
}
function lookupAuditGrade(stem) {
  const map = loadAuditGradeData();
  if (!map) return null;
  return map.get((stem || '').slice(0, 80)) || null;
}

const DEFAULT_URL = 'https://eiasash.github.io/Geriatrics/';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
// v10.64.114: documented Toranot proxy secret for Geri — same value used by
// scripts/generate_distractors.cjs (this is the contract, not a credential).
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
// v10.64.131: model default branches on mode after the USE_PROXY flip.
// Proxy accepts 'opus' alias (resolves to current opus server-side); direct mode
// needs a canonical Anthropic model ID. CHAOS_MODEL env overrides both.
// (Codex P1 #265 caught the original opus-4-7-everywhere default would 400 on proxy.)
// Note: USE_PROXY is declared below, so we use a getter pattern to defer resolution.
const MODEL = process.env.CHAOS_MODEL ||
  (process.env.CHAOS_USE_DIRECT === '1' ? 'claude-opus-4-7' : 'opus');

// v10.64.114: proxy mode lets the bot run without a personal CLAUDE_API_KEY,
// routing through the Toranot AI proxy (same path Geri's in-app aiAutopsy uses).
// v10.64.131: proxy mode is now the DEFAULT (no personal key needed). Set
// CHAOS_USE_DIRECT=1 + CLAUDE_API_KEY for the direct-API fallback when Toranot
// is down. Legacy CHAOS_USE_PROXY=1 / TORANOT_API_SECRET still force proxy mode
// (no-op now since proxy is already default) — kept for backward compatibility.
const USE_PROXY = process.env.CHAOS_USE_DIRECT !== '1';
const API_URL = USE_PROXY ? TORANOT_URL : ANTHROPIC_URL;

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
  // R1.6: null-stemHash consecutive-skip threshold → reload (Phase-2 lock-in recovery)
  nullStreakThreshold: Number(process.env.CHAOS_NULL_STREAK_THRESHOLD || 5),
  // R1.6: reloads-without-progress before escalating reload → context recreate
  reloadEscalateThreshold: Number(process.env.CHAOS_RELOAD_ESCALATE_THRESHOLD || 3),
  // v4: cost cap (USD). Workers self-terminate when cost ledger crosses this.
  costCapUsd: Number(process.env.CHAOS_COST_CAP_USD || 25),
};

let KEY;
if (USE_PROXY) {
  KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
} else {
  KEY = process.env.CLAUDE_API_KEY;
  if (!KEY) { console.error('CHAOS_USE_DIRECT=1 but CLAUDE_API_KEY not set in environment. Either set CLAUDE_API_KEY or unset CHAOS_USE_DIRECT to use proxy mode (default).'); process.exit(2); }
  if (KEY.length !== 108) console.warn(`WARN: CLAUDE_API_KEY length=${KEY.length}, expected 108 — may 401`);
}

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

// hashStem + normStem moved to scripts/lib/hashStem.mjs (single source of
// truth; the offline audit-8 join must hash with the IDENTICAL function).
// See docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md.

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
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: USE_PROXY
          ? {
              'x-api-secret': KEY,
              'content-type': 'application/json',
            }
          : {
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
      // Audit-6 Option-0: surface stop_reason so judge parse-failures can
      // be bucketed (max_tokens ⟺ truncation; the single direct length-cut
      // signal). Null when upstream omits it (proxy/stream tap).
      return { text, inputTokens: inT, outputTokens: outT, stopReason: data.stop_reason || null };
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

export async function extractQuestion(page) {
  // Geri renders the stem inside the quiz card; first .heb element after
  // the question card header is the stem. Skeleton-state .qo blocks have
  // ⠀ (braille blank) so we filter on stem length to skip pre-load state.
  const stemLoc = page.locator('.heb').first();
  if (!(await stemLoc.count().catch(() => 0))) return null;
  let stem = '';
  try { stem = (await stemLoc.innerText({ timeout: 800 })).trim(); } catch (_) { return null; }
  if (!stem || stem.length < 20) return null;
  // CERT (AUDIT8_G5_REPAIR_GATE §CERT): read the served question's canonical
  // corpus index from the SAME stem element, so the index corresponds to the
  // extracted stem (not a sibling). int-or-null; the analyzer falls back when
  // absent. _rqmQuestion renders data-qidx="${pool[qi]}" on the stem <p.heb>.
  let qIdx = null;
  try {
    const rawQIdx = await stemLoc.getAttribute('data-qidx');
    if (rawQIdx != null) { const parsed = Number.parseInt(rawQIdx, 10); if (Number.isInteger(parsed)) qIdx = parsed; }
  } catch (_) { /* qIdx stays null → analyzer bucket fallback */ }
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
  return { stem, options, qIdx };
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

// 2026-05-17 (c_accept false-positive fix; bot-only, no app-version bump):
// collect the display positions
// of EVERY `button.qo.ok`, not just the first. Geri's `isOk(q,i)`
// (shlav-a-mega.html:2466) returns true for every index in `q.c_accept`
// when the question is multi-accept, so the render path
// (shlav-a-mega.html:3160) marks all accepted options `.ok`. The old
// single-`.ok` read in `detectAppCorrectIdx` made the bot flag a
// disagreement whenever the AI picked an accepted-but-not-first option
// (22 across 11 stems, any-isOk, on the 2026-05-14
// post_truncation_rollout ledger — deterministic set-reconstruction;
// the c_accept-attributable subset is 17). Reading the full set keeps
// the bot DOM-driven (the DOM already encodes `{c} ∪ c_accept`) — no
// dataset lookup, no canonical↔display mapping. Returns display-frame
// indices, same frame as `aiIdx`.
//
// The scrape itself is `extractAcceptedDisplayIdxSet` in
// scripts/lib/optionResolver.mjs — ONE shared source so the live-DOM
// behavior is unit-tested (tests/extractAcceptedDisplayIdxSet.test.js)
// rather than only syntax-checked. Playwright serializes the same
// function body into the page; called with no arg it falls back to the
// page `document`.
async function detectAppAcceptedDisplayIdxSet(page) {
  if ((await page.locator('button.qo.ok').count().catch(() => 0)) === 0) return [];
  return await page.evaluate(extractAcceptedDisplayIdxSet).catch(() => []);
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

// v4 judge prompt — audit-3 channel (answer-correctness validation).
// v10.64.118 redesign: split off from SYS_DOCTOR_EXPLAIN (audit-1) so each
// channel evaluates one axis. The original combined prompt was 75% noise
// on audit-1 (rediscovering c-correctness conflation per 2026-05-13
// calibration pilot). Now this prompt judges ONLY whether app's answer is
// medically correct; audit-1 runs separately with explicit "assume answer
// correct" carve-out.
const SYS_DOCTOR_JUDGE = `You are an experienced geriatric medicine attending validating an APP's claimed correct answer for a Hebrew geriatric-medicine board-exam question (Shlav A, P005-2026). Your job is narrow: judge ONLY whether the app's claimed correct answer is medically correct against board-level evidence (Hazzard 8e, Harrison 22e, GRS8, Israeli MOH). DO NOT judge the explanation prose — that's audit-1, a separate channel. DO NOT judge the source citation — that's audit-2, a separate channel. The AI's prior pick is supplied as context only, NOT for adjudication.

Output format (strict): one JSON line, no markdown.
Schema:
{"app_answer_correct":true|false,"confidence":0..100,"issue":"<=300 chars or null","correct_letter_if_app_wrong":"A"|"B"|"C"|"D"|null}

Be a strict but fair examiner — only flag app_answer_correct=false if you have a board-level reason. If you'd defer to the textbook (i.e. <80% confident the app is wrong), set app_answer_correct=true and explain in issue.`;

// v10.64.118 NEW: audit-1 channel (explanation-text-soundness given correct answer).
// Validated 2026-05-13 against an 8-stem cohort (75% noise reduction vs prior
// combined prompt). Carve-out structure: explicit axis exclusion ("audit-3
// judges X separately") + three-axis decomposition (reasoning soundness,
// distractor accuracy, prose well-formedness). Truncation defects surface
// as axis 2-3 failures (incomplete distractor analysis + broken prose).
const SYS_DOCTOR_EXPLAIN = `You are evaluating a Hebrew geriatric medicine board question. ASSUME THE CLAIMED CORRECT ANSWER IS CORRECT — its medical accuracy is judged separately by audit-3 (a different channel). Your job here is to judge ONLY THE EXPLANATION TEXT on three axes:

1. Does the explanation justify the correct answer with sound medical reasoning? (vs. circular reasoning, non-sequitur claims, or arguments that contradict the answer it's defending)
2. Does the explanation contain factually wrong medical claims about the distractors (the wrong options)? (vs. claims that are accurate within the space of the option set)
3. Is the explanation prose well-formed Hebrew with embedded clinical English where idiomatic? (vs. machine-translation artifacts, broken bidi, missing clinical context, truncated mid-sentence)

Reply with strict JSON only, no prose outside JSON:
{
  "sound": true | false,
  "issue": "<one paragraph naming the specific axis(es) that failed, or 'sound on all three axes' if true>",
  "axis_failures": ["1" | "2" | "3" or empty array],
  "confidence": <integer 0-100>
}

DO NOT consider whether the answer index "c" is correct. That's audit-3, not your job here. Even if you would have picked a different answer, defer to the claimed correct answer and judge only the explanation text quality given that the answer is right.`;

// v10.64.118 redesign: audit-2 channel (ref-faithfulness given audit-grade
// chapter assignment). Validated 2026-05-13 against a 13-stem cohort (85%
// noise reduction vs prior "citation_plausible" prompt; idx 1954 carve-out
// tightened to include peer-chapter specificity). Takes audit-grade chapter
// assignment from data/question_chapters.json as INPUT (eliminates the
// "Sonnet must construct chapter mapping from explanation text" failure
// mode that produced ~85% noise on the prior channel).
const SYS_DOCTOR_SOURCE = `You are evaluating whether a Hebrew geriatric medicine question's q.ref text is a FAITHFUL DISPLAY of the audit-grade chapter assignment from question_chapters.json. Your job is narrow: NOT to judge whether the chapter is topically aligned with the question, but whether q.ref displays the audit-grade assignment correctly.

The q.ref is FAITHFUL if any of:
- It cites at least one of the audited chapters with the correct chapter number.
- It cites a more specific subchapter/section/page WITHIN an audited chapter (acceptable curatorial specificity).
- It cites a more specific PEER CHAPTER within the same topic-default group as the audited chapter (e.g., audit says "Ch 88 — CANCER AND AGING: GENERAL PRINCIPLES" because the Q's ti=26 maps there by default, but q.ref cites "Ch 91 — LUNG CANCER" for a lung cancer Q — this is curatorial specificity choosing a more topic-specific peer chapter from the same book, and is acceptable). The audit-grade is the floor (topic-default), not the ceiling — when q.ref picks a more topically-precise peer, that's curatorial value-add, not drift.
- The current q.ref is more specific than the audit-grade in any way that improves clinical accuracy (specific cancer subtype where audit says "cancer general", specific syndrome where audit says "broad category", etc.).
- It cites a non-textbook source (e.g., Israeli law citation "חוק..." for legal-topic Qs) that the audit-grade mapping has no entry for. The audit-grade mapping is topic-default and doesn't cover legal sources.

The q.ref is UNFAITHFUL if:
- It cites a chapter number that disagrees with the audit-grade assignment AND is NOT a more-specific-peer relationship within the same clinical topic group (e.g., audit says Ch 79, q.ref says Ch 75, both Harrison, but Ch 75 is on a totally different topic — that's drift, not curatorial specificity).
- It cites a clearly incorrect chapter on a different clinical topic entirely (e.g., Cardiology chapter on a Cancer Q).
- It is internally inconsistent with the Q content.

Reply with strict JSON only:
{"faithful":true|false,"reason":"<one sentence>","confidence":0-100}

DO NOT evaluate whether the explanation prose aligns with the chapter — that's audit-1. DO NOT evaluate the medical content of the question — that's audit-3. Judge ONLY whether q.ref faithfully displays the audit-grade chapter assignment given the carve-outs above.`;

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
  if (!q || q.options.length < 2) {
    // Pre-pick DOM/extraction failure. NOT a pick-parse event — AUDIT8
    // pre-registers this EXCLUDED from the pick-parse universe (gate
    // G0 / G4.1). Tagged with a distinct `dropCtx` so the offline
    // analyzer keys the exclusion on it; counted for an honest
    // denominator. Return shape (stemHash:null) is unchanged so the
    // worker-loop stuck-refresh semantics are preserved; the recoverable
    // identity lives on the bug row only. See
    // docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md.
    log.extractNull = (log.extractNull || 0) + 1;
    log.bugs.push({
      at: nowIso(), type: 'pre-pick-skip', context: 'pick',
      dropCtx: q ? 'pre-pick-short-extract' : 'pre-pick-no-question',
      stemHash: q && q.stem ? hashStem(normStem(q.stem)) : null,
    });
    return { advanced: false, stemHash: null };
  }

  const stemHash = hashStem(normStem(q.stem));
  await sleep(rand(2000, 4500)); // read pause

  // 1) Pick
  const userPrompt1 = `שאלה:\n${q.stem}\n\nאפשרויות:\n${q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n')}\n\nWhich is correct?`;
  let pickResp;
  try { pickResp = await callClaude(SYS_DOCTOR_PICK, userPrompt1, { maxTokens: 250 }); }
  catch (e) {
    log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'pick', dropCtx: 'pick-ai-error', message: e.message, stemHash });
    return { advanced: false, stemHash };
  }
  const pickJson = extractJson(pickResp.text) || {};
  const aiLetter = String(pickJson.pick || '').trim().slice(0, 1);
  const aiIdx = LETTER_TO_IDX[aiLetter];
  log.actions.push({ at: nowIso(), type: 'ai-pick', letter: aiLetter, idx: aiIdx, conf: pickJson.confidence });
  if (aiIdx == null || aiIdx < 0 || aiIdx >= q.options.length) {
    log.bugs.push({ at: nowIso(), type: 'ai-parse-error', context: 'pick', dropCtx: 'pick-parse-error', text: pickResp.text.slice(0, 200), stemHash, qIdx: q.qIdx, stem: q.stem.slice(0, 300), optCount: q.options.length });
    return { advanced: false, stemHash };
  }

  // Click option + check (Geri uses button.qo + onclick="pick(N)" — no data-i)
  const optBtn = page.locator('button.qo').nth(aiIdx);
  await tryClick(optBtn, CONFIG.actionTimeoutMs).catch((e) => {
    log.bugs.push({ at: nowIso(), type: 'action-error', context: 'doctor-pick', message: e.message });
  });
  await sleep(rand(400, 900));
  // Geri's check button onclick="check()". #290 (2026-05-26) made its aria-label
  // bilingual + confidence-prefixed; match the persistent lowercase "check answer"
  // fragment case-insensitively so an i18n tweak can't silently re-break the bot.
  const check = page.locator('[aria-label*="check answer" i]').first();
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
  // 2026-05-17: full accepted-answer set (all `.ok` display positions).
  // For single-answer Qs this is `[appIdx]`; for multi-accept Qs it is
  // every index the app's own `isOk(q,i)` accepts. `appIdx` /
  // `appDisplayIdx` / `appLetter` / `appText` still point at the FIRST
  // `.ok` so the JSONL schema + analyzer + sibling record shape are
  // unchanged — only the `disagrees` classification honors the set.
  const appAcceptedDisplayIdxSet = await detectAppAcceptedDisplayIdxSet(page);
  const { explanation, source } = await extractExplanationAndSource(page);
  const appVerdict = resolveAppVerdict(q.options, appIdx);
  const appDisplayIdx = appVerdict ? appVerdict.displayIdx : null;
  // 2026-05-17 c_accept false-positive fix: agreement is set-membership
  // against ALL accepted `.ok` positions, not scalar equality with the
  // first one. `appDisplayIdx != null` stays the single gate for "the
  // app revealed a key at all"; `pickAgreesWithApp` only ever relaxes a
  // disagreement (never manufactures one — the set ⊇ {first .ok}).
  const disagrees = appDisplayIdx != null
    && !pickAgreesWithApp(appAcceptedDisplayIdxSet, aiIdx);

  // v4: methodology guard. If appIdx is null after a check click in practice
  // mode, our entry path probably fell back to exam mode. Log it so we can
  // alert post-run; don't waste a judge call.
  if (appIdx == null) {
    log.bugs.push({ at: nowIso(), type: 'methodology', context: 'appIdx-null-post-check', stemHash });
    recordFinding({
      workerId, stemHash, stem: q.stem.slice(0, 300),
      options: q.options.map((o) => o.text.slice(0, 120)),
      aiLetter, aiIdx, aiWhy: pickJson.why || null, aiConf: pickJson.confidence,
      appIdx: null, disagrees: null, judge: null, source: null, citation: null,
      methodology: 'appIdx-null-post-check',
    });
    // Try to advance even without a verdict
    const next = page.locator('[aria-label*="next question" i], [aria-label*="finish exam" i]').first();
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
  // 2026-05-17 audit-5 (B5): post-generate JSON-shape validator + exactly
  // one corrective retry. Replaces the bare `extractJson(...) || {}` that
  // silently produced 22/86 audit-3 non-boolean verdicts with no log + no
  // retry. callClaude is injected so the path is unit-testable (see
  // scripts/lib/judgeShapeValidator.mjs + docs/AUDIT5_PRE_REGISTERED_GATE.md).
  const judgeJson = await judgeWithShapeRetry({
    system: SYS_DOCTOR_JUDGE,
    userPrompt: userPrompt2,
    // audit-7: 400 → 1024. In R3, ~101 judge calls truncated at stop_reason=max_tokens
    // with first_branch=no_brace — RL'd-in JSON preamble exhausted the 400-tok budget
    // before the model emitted any '{', so the brace-extractor + corrective retry had
    // nothing to recover (38 residual hard ai-parse-errors fed N_drop). SYS_DOCTOR_JUDGE
    // already mandates JSON-only; the preamble defies it, and prefill is NOT usable here
    // (the proxy's Sonnet 4.6 returns 400 on assistant prefill — deploy-primitives §4).
    // Budget is the available lever: ~800 tok preamble headroom + the ~200-tok verdict.
    // Verdict-safe — more budget lets a response complete, it cannot change a verdict.
    maxTokens: 1024,
    callJudge: callClaude,
    log,
    nowIso,
  });
  log.actions.push({
    at: nowIso(), type: 'ai-judge',
    app_answer_correct: judgeJson.app_answer_correct,
    conf: judgeJson.confidence,
  });

  // 3) Audit-1: explanation-text soundness given correct answer.
  // v10.64.118: split from SYS_DOCTOR_JUDGE per the 2026-05-13 redesign pilot
  // (75% noise reduction). Only fires when explanation text is available.
  let explainJson = null;
  if (explanation && explanation.length > 50) {
    const lettered = q.options.map((o, i) => `${'ABCD'[i]}. ${o.text}`).join('\n');
    const userPromptExplain = `Question (Hebrew):
${q.stem}

Options:
${lettered}

Claimed correct answer (assume correct, judge only the explanation): ${appLetter} — ${appText}

Explanation text (Hebrew):
${explanation.slice(0, 2000)}

Is the explanation TEXT medically sound on the three axes? Reply JSON only.`;
    let explainResp;
    try { explainResp = await callClaude(SYS_DOCTOR_EXPLAIN, userPromptExplain, { maxTokens: 400 }); }
    catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'explain', message: e.message }); }
    explainJson = explainResp ? (extractJson(explainResp.text) || {}) : {};
    log.actions.push({
      at: nowIso(), type: 'ai-explain',
      sound: explainJson.sound,
      axis_failures: explainJson.axis_failures,
      conf: explainJson.confidence,
    });
  }

  // 4) Audit-2: ref-faithfulness given audit-grade chapter assignment.
  // v10.64.118 redesign: takes audit-grade chapter assignment from
  // data/question_chapters.json[idx] as INPUT (eliminates the failure
  // mode where Sonnet had to construct chapter mapping from explanation
  // text). Only fires when both audit-grade and source are available.
  let sourceJson = null;
  let cite = null;
  if (source) {
    const m = source.match(/(Hazzard|Harrison|GRS\s*8?|Brookdale|הזרד|הריסון)\s*(?:Ch\.?|Chapter|פרק)?\s*\d{1,3}/i);
    cite = m ? m[0] : (source.length < 200 ? source : null);
  } else if (explanation) {
    const m = explanation.match(/(Hazzard|Harrison|GRS\s*8?|Brookdale|הזרד|הריסון)\s*(?:Ch\.?|Chapter|פרק)?\s*\d{1,3}/i);
    cite = m ? m[0] : null;
  }
  const auditGrade = lookupAuditGrade(q.stem);
  if (cite && auditGrade) {
    const userPromptSource = `Question (Hebrew, abbreviated stem):
${q.stem.slice(0, 400)}

Audit-grade chapter assignment from question_chapters.json[${auditGrade.qzIdx}]:
${auditGrade.audit_grade_text}

Current q.ref text (extracted from explanation):
"${cite}"

Is the current q.ref a faithful display of the audit-grade chapter assignment, considering the carve-outs (curatorial specificity, non-textbook sources, subchapter relationships, peer-chapter specificity within same topic group)? Reply JSON only.`;
    let srcResp;
    try { srcResp = await callClaude(SYS_DOCTOR_SOURCE, userPromptSource, { maxTokens: 300 }); }
    catch (e) { log.bugs.push({ at: nowIso(), type: 'ai-error', context: 'source', message: e.message }); }
    sourceJson = srcResp ? (extractJson(srcResp.text) || {}) : {};
    log.actions.push({ at: nowIso(), type: 'ai-source', faithful: sourceJson.faithful, citation: cite, qzIdx: auditGrade.qzIdx, conf: sourceJson.confidence });
  } else if (cite) {
    // Audit-grade not available (stem didn't match dataset, or data load failed).
    // Skip source-check rather than fall back to the old prompt — partial-input
    // judgments are exactly what the redesign eliminates.
    log.actions.push({ at: nowIso(), type: 'ai-source-skipped', reason: 'no-audit-grade', citation: cite });
  }

  // Record finding.
  // For Geri, `appIdx` and `appDisplayIdx` are the same value (display
  // frame), but persist both fields for sibling-aligned record shape.
  //
  // `optionCanonicalIdx` is null for Geri because Geri's monolith renders
  // options without `data-i` attributes — `option.idx` falls back to the
  // loop counter (display position), so emitting the identity array would
  // be type-correct but semantically wrong, silently misleading any
  // consumer that assumes the field carries a real display→canonical
  // mapping (as it does in FM/IM bot variants). Null fails loudly at
  // first access. See scripts/lib/optionResolver.mjs module-header for
  // the served↔canonical coordinate-frame doctrine and 2026-05-13
  // .audit_logs/benchmarks/calibration_pilot_results_*.json for the
  // pilot run that surfaced the schema-level contract mismatch.
  // v10.64.118: backwards-compat mirrors for long-chaos-analyze.mjs.
  //  - explain.sound -> judge.explanation_sound (analyzer reads judge.explanation_sound)
  //  - source.faithful -> source.citation_plausible (analyzer reads source.citation_plausible)
  // The new explain.axis_failures field and the source.reason field carry
  // the structured detail; the mirrored fields are single-boolean compat shims.
  if (explainJson && typeof explainJson.sound === 'boolean') {
    judgeJson.explanation_sound = explainJson.sound;
    if (judgeJson.confidence == null && explainJson.confidence != null) {
      judgeJson.confidence = explainJson.confidence;
    }
  }
  if (sourceJson && typeof sourceJson.faithful === 'boolean') {
    sourceJson.citation_plausible = sourceJson.faithful;
  }

  // 2026-05-17 audit-4: annotate the judge's letter frame AT THE SOURCE.
  // `correct_letter_if_app_wrong` is DISPLAY-frame (the judge only saw
  // served options labeled A..D in display order — see userPrompt2 above).
  // Recording it raw let the audit-3 §4 manual sample map it against
  // canonical q.o[] and fabricate a prose↔index "artifact" on ~41/61 rows
  // (rigorous full-corpus detector: judge is 0/61 inconsistent in display
  // frame — there was no defect). Emitting the resolved DISPLAY index +
  // served text here makes the frame unambiguous so no downstream
  // re-framer can repeat the §4 hand-error. `correct_canonical_idx` is
  // null for Geri (no data-i; mirrors `optionCanonicalIdx: null` at the
  // finding below) — TRUE canonical is recovered offline via
  // scripts/backfill_judge_letter_frame.py (the sanctioned path).
  const jLetter = resolveJudgeLetter(q.options, judgeJson.correct_letter_if_app_wrong);
  judgeJson.correct_letter_frame = 'display';
  judgeJson.correct_display_idx = jLetter ? jLetter.displayIdx : null;
  judgeJson.correct_display_text = jLetter ? jLetter.displayText : null;
  judgeJson.correct_canonical_idx = null;

  const finding = {
    workerId,
    stemHash,
    qIdx: q.qIdx, // CERT corpus-index capture (gate §CERT) — recovers t
    stem: q.stem.slice(0, 300),
    options: q.options.map((o) => o.text.slice(0, 120)),
    optionCanonicalIdx: null,
    aiLetter, aiIdx, aiWhy: pickJson.why || null, aiConf: pickJson.confidence,
    appIdx, appDisplayIdx, appLetter, appText,
    appAcceptedDisplayIdxSet,
    disagrees,
    judge: judgeJson,
    explain: explainJson,
    source: sourceJson,
    citation: cite,
  };
  recordFinding(finding);

  // 4) Side-effects on flagged Qs (feedback / report)
  const flagged = disagrees
    || judgeJson?.app_answer_correct === false
    || explainJson?.sound === false
    || sourceJson?.faithful === false;
  if (flagged && Math.random() < CONFIG.feedbackRate) {
    await maybeSubmitFeedback(page, log, finding);
  }
  if (flagged && Math.random() < CONFIG.reportRate) {
    await maybeReportQuestion(page, log, finding);
  }

  // Advance (onclick="next()"; aria-label "Next question"/"Finish exam"). Match the
  // English fragment case-insensitively — same #290-class i18n hardening as check-answer.
  const next = page.locator('[aria-label*="next question" i], [aria-label*="finish exam" i]').first();
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

export async function ensureOnPracticeQuiz(page, log) {
  // Step 1: hydrate. Geri uses onclick handlers (no [data-action]); wait
  // for body to be ready and the quiz card to render.
  try {
    await page.locator('body').waitFor({ state: 'attached', timeout: 12_000 });
    await sleep(1500);
  } catch (_) { return false; }

  // Step 1.5 (v10.64.115): dismiss any auto-shown modal that would intercept
  // pointer events on button.qo. The help-overlay autoshows on first visit
  // (showHelp() at shlav-a-mega.html:8196, autoshow at :1431). It sits at
  // z-index:9999 over the quiz card, so every option click times out with
  // "intercepts pointer events" until it's gone. Same class of modals:
  // #feModal, #sdModal, #miModal, #mockPicker, #examModal, #mexModal,
  // #postLoginRstModal, #rstModal (per the v10.64.49 deferred-help guard).
  // Escape closes the top-most modal via the global keydown handler.
  const dismissed = await page.evaluate(() => {
    const modalIds = ['help-overlay', 'feModal', 'sdModal', 'miModal', 'mockPicker', 'examModal', 'mexModal', 'postLoginRstModal', 'rstModal'];
    const found = modalIds.filter((id) => document.getElementById(id));
    // Use closeTopModal() if present (canonical dismissal path); fall back to
    // direct DOM removal so the bot is robust if the helper is renamed.
    if (typeof closeTopModal === 'function') {
      while (typeof closeTopModal === 'function' && closeTopModal()) { /* loop */ }
    } else {
      found.forEach((id) => document.getElementById(id)?.remove());
    }
    return found;
  }).catch(() => []);
  if (dismissed.length) {
    log.actions.push({ at: nowIso(), type: 'modal-dismiss', ids: dismissed });
    await sleep(400);
  }

  // Step 2: if button.qo + check button are visible, we're in practice mode.
  const optsCount = await page.locator('button.qo').count().catch(() => 0);
  const checkVisible = await page.locator('[aria-label*="check answer" i]').count().catch(() => 0);
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
    await page.locator('[aria-label*="check answer" i]').first().waitFor({ state: 'attached', timeout: 4000 });
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
  const log = { workerId, actions: [], bugs: [], qsAnswered: 0, extractNull: 0 };

  const attachHandlers = (page) => {
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
  };

  // R1.6: a fresh context resets connection + profile state — the recreate
  // escalation tier for a Phase-2 lock-in that a same-context reload can't clear.
  const freshContext = async () => {
    const context = await browser.newContext({
      viewport: { width: pick([390, 414, 768, 1280]), height: pick([844, 896, 900]) },
      locale: pick(['he-IL', 'en-US']),
      timezoneId: 'Asia/Jerusalem',
    });
    context.setDefaultTimeout(CONFIG.actionTimeoutMs);
    const page = await context.newPage();
    attachHandlers(page);
    await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navigationTimeoutMs });
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await sleep(rand(1500, 3000));
    return { context, page };
  };

  const recoveryCfg = {
    stuckThreshold: CONFIG.stuckThreshold,
    nullStreakThreshold: CONFIG.nullStreakThreshold,
    reloadEscalateThreshold: CONFIG.reloadEscalateThreshold,
  };

  let { context, page } = await freshContext();
  try {
    // R1.6: replaces the inline same-stem-only stuck counter (which never
    // advanced on a Phase-2 null-stemHash lock-in) with the pure recovery
    // decision in lib/workerRecovery.mjs. Both lock-in shapes feed it: the
    // no-quiz-surface path and the extract-fails (advanced:false, stemHash:null)
    // path. Tier 1 = reload; tier 2 = recreate the context.
    let recovery = initialRecoveryState();

    while (Date.now() < stopAt) {
      if (costExceeded()) {
        log.bugs.push({ at: nowIso(), type: 'cost-cap', usd: priceUsd(COST.totalInTokens, COST.totalOutTokens) });
        break;
      }
      const onQuiz = await ensureOnPracticeQuiz(page, log);
      if (!onQuiz) {
        // No quiz surface — count it as a null failed turn so a persistent
        // no-quiz lock-in escalates past reload, then recover.
        const decision = nextRecovery(recovery, { advanced: false, stemHash: null }, recoveryCfg);
        recovery = decision.state;
        // Codex P2 (#326): only act on the escalation decision. Previously this
        // branch reloaded on BOTH 'reload' AND 'none', but reloadsSinceProgress
        // only advances inside nextRecovery once the null streak crosses
        // nullStreakThreshold — so reloading on 'none' thrashed the page without
        // counting toward escalation, needing ~15 reloads (5×3) to reach
        // 'recreate' instead of the documented 3. Mirror the on-quiz path: act
        // only on 'reload'/'recreate'; on 'none' just wait for the next turn.
        if (decision.action === 'recreate') {
          log.bugs.push({ at: nowIso(), type: 'stuck-refresh', tier: 'recreate', context: 'no-quiz', recovery });
          await context.close().catch(() => {});
          ({ context, page } = await freshContext());
        } else if (decision.action === 'reload') {
          log.bugs.push({ at: nowIso(), type: 'stuck-refresh', tier: 'reload', context: 'no-quiz', recovery });
          try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* ok */ }
          await sleep(rand(2000, 4000));
        } else {
          await sleep(rand(2000, 4000));
        }
        continue;
      }

      const result = await doctorOneQuestion(page, workerId, log);
      if (result.advanced) log.qsAnswered += 1;

      const decision = nextRecovery(recovery, result, recoveryCfg);
      recovery = decision.state;

      if (decision.action === 'reload') {
        log.bugs.push({ at: nowIso(), type: 'stuck-refresh', tier: 'reload', stemHash: result.stemHash, recovery });
        try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 }); } catch (_) { /* ok */ }
        await sleep(rand(2000, 4000));
      } else if (decision.action === 'recreate') {
        log.bugs.push({ at: nowIso(), type: 'stuck-refresh', tier: 'recreate', stemHash: result.stemHash, recovery });
        await context.close().catch(() => {});
        ({ context, page } = await freshContext());
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
  // CERT §CERT P5 (Codex P1 #342): record the DEPLOYED corpus fingerprint so the
  // analyzer can verify corpus identity before trusting captured data-qidx (else
  // fail-closed → bucket join). The helper clears any stale token FIRST, so a
  // writer failure in a reused dir cannot leave an old trust token behind (Codex
  // P1 #342, 3rd round). Single source of truth: scripts/lib/corpusSha.mjs.
  const corpusUrl = new URL('data/questions.json', CONFIG.url).href;
  const recordedCorpusSha = await recordDeployedCorpusSha(CONFIG.reportDir, corpusUrl);
  if (recordedCorpusSha) {
    console.log(`[v4] recorded corpus_sha256 ${recordedCorpusSha.slice(0, 12)}… (qIdx corpus-identity gate, ${corpusUrl})`);
  } else {
    console.warn(`[v4] WARN: could not record corpus_sha256.txt (${corpusUrl}); captured qIdx will fail-closed at analysis`);
  }
  openFindingsLog(CONFIG.reportDir);
  const report = { config: CONFIG, startedAt: nowIso(), finishedAt: null, workers: [] };
  console.log(`[v4] Launching ${CONFIG.users} workers × ${(CONFIG.durationMs / 60000).toFixed(0)} min, model=${MODEL}, url=${CONFIG.url}, cost-cap $${CONFIG.costCapUsd}, api=${USE_PROXY ? 'toranot-proxy' : 'anthropic-direct'}`);
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
