#!/usr/bin/env node
/**
 * Bot D — source-citation scanner.
 *
 * Per Phase 2b of the 2026-05-08 overnight plan: scan every question's
 * q.ref field, classify the citation, and produce a review queue without
 * auto-modifying the dataset. The curator-overrides discipline applies
 * here as anywhere — this bot ONLY records, never auto-writes.
 *
 * Workflow:
 *   1. Load data/questions.json.
 *   2. For each q with q.ref:
 *        - Send (stem, q.ref) to Sonnet 4.6.
 *        - Ask: is the cited Hazzard/Harrison chapter plausibly aligned
 *          with the clinical content? Classify as one of:
 *             ok               — cite text and clinical content match
 *             missing          — q.ref is empty/whitespace
 *             broken           — q.ref is malformed (e.g. truncated mid-word)
 *             truncated        — q.ref starts but doesn't complete a full citation
 *             wrong_textbook   — cite says Hazzard but content is internal-medicine
 *                                Harrison territory (or vice versa)
 *        - Provide a fix suggestion with confidence 0-1 (NOT applied).
 *   3. Write source_completeness_audit_{repo}.json with one record per
 *      question that has a non-ok classification.
 *
 * Cost cap: Sonnet 4.6 ~$0.0045 per Q (3500in + 200out tokens). At
 * 3,743 Geri Qs that's ~$17. Adjustable via CHAOS_COST_CAP_USD env.
 *
 * RUN AFTER MORNING REVIEW. Not auto-launched tonight.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { extractJson } from './lib/extractJson.mjs';

// proxy-client.cjs is CJS — use createRequire for ESM interop
const require = createRequire(import.meta.url);
const { callClaude: callClaudeProxy } = require('./lib/proxy-client.cjs');

// v10.64.131: migrated to Toranot proxy (per audit-fix-deploy D.3 + memory #29).
// Default = proxy mode (no key needed locally). Set SCAN_DIRECT=1 + CLAUDE_API_KEY
// for fallback when Toranot is down (per deploy-primitives §4 direct-api carve-out).
const DIRECT_MODE = process.env.SCAN_DIRECT === '1';
// Default model branches on mode: proxy accepts 'opus' alias (resolves to current
// opus server-side); direct mode forwards the string straight to Anthropic, which
// needs a canonical model ID. SCAN_MODEL env var overrides both paths.
// (Codex P1 #264 caught the original 'opus'-everywhere default breaking direct fallback.)
const MODEL = process.env.SCAN_MODEL || (DIRECT_MODE ? 'claude-opus-4-7' : 'opus');
const DIRECT_KEY = DIRECT_MODE ? (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) : null;
if (DIRECT_MODE && !DIRECT_KEY) { console.error('SCAN_DIRECT=1 but CLAUDE_API_KEY/ANTHROPIC_API_KEY not set'); process.exit(2); }

const CONFIG = {
  questionsPath: process.env.SCAN_QUESTIONS || 'data/questions.json',
  outputPath: process.env.SCAN_OUTPUT || `source_completeness_audit_${path.basename(process.cwd())}.json`,
  maxQs: Number(process.env.SCAN_MAX || 0),                    // 0 = all
  costCapUsd: Number(process.env.CHAOS_COST_CAP_USD || 25),
  concurrency: Math.max(1, Number(process.env.SCAN_CONCURRENCY || 4)),
};

const COST = { totalCalls: 0, inTok: 0, outTok: 0, failures: 0 };
const priceUsd = (i, o) => (i / 1e6) * 3 + (o / 1e6) * 15;
// v10.64.131: cost cap now enforced by Toranot proxy server-side (per #261 precedent).
// Client-side cap is a no-op in proxy mode because proxy-client doesn't expose usage tokens.
// In direct mode (SCAN_DIRECT=1) the cap is also disabled — for that case, set tighter
// CHAOS_COST_CAP_USD environment guards or use the proxy.
const costExceeded = () => false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callClaude(system, user, { maxTokens = 250, retries = 3 } = {}) {
  // Retry wrapper around proxy-client. proxy-client throws on any !res.ok,
  // so we catch and retry uniformly (vs the pre-migration code which distinguished
  // 429/5xx as retryable and 4xx as fatal). Net effect: more retries on bad requests,
  // which costs an extra ~3 attempts at script start if the prompt is malformed.
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const text = await callClaudeProxy(user, {
        model: MODEL,
        system,
        max_tokens: maxTokens,
        timeout_ms: 60_000,
        direct: DIRECT_MODE,
        apiKey: DIRECT_KEY,
      });
      COST.totalCalls += 1;
      return { text };
    } catch (e) {
      lastErr = e;
      await sleep((attempt + 1) * 1500);
    }
  }
  COST.failures += 1;
  throw lastErr || new Error('Claude API call failed after retries');
}

const SYS_SCAN = `You are a careful clinical educator auditing textbook citations on board-exam questions. Given the question stem and the cited reference, classify the citation:
  - "ok" — the cited chapter/section topic plausibly aligns with the clinical content
  - "missing" — the q.ref field is empty or whitespace
  - "broken" — q.ref is clearly malformed (truncated mid-word, mojibake, etc)
  - "truncated" — q.ref starts a citation but doesn't complete it (e.g. "Hazzard Ch" with no number)
  - "wrong_textbook" — cite says one source but the clinical content is in a different one
NEVER mark something "ok" you can't justify against board-level family-medicine / geriatric medicine evidence.

Output format (strict): one JSON line, no markdown.
Schema:
{"classification":"ok"|"missing"|"broken"|"truncated"|"wrong_textbook","confidence":0..1,"suggestion":"<=200 chars or null","note":"<=200 chars or null"}`;

async function classifyOne(q, idx) {
  const ref = (q.ref || '').trim();
  if (!ref) {
    return { idx, q_first40: (q.q || '').slice(0, 40), ref: '', classification: 'missing', confidence: 1.0, suggestion: null, note: 'q.ref empty', skipped_api: true };
  }
  const userPrompt = `Question stem (Hebrew):\n${(q.q || '').slice(0, 600)}\n\nCited reference: ${ref}\n\nClassify the citation.`;
  let resp;
  try { resp = await callClaude(SYS_SCAN, userPrompt, { maxTokens: 250 }); }
  catch (e) { return { idx, q_first40: (q.q || '').slice(0, 40), ref, classification: 'error', confidence: 0, suggestion: null, note: e.message.slice(0, 100) }; }
  const j = extractJson(resp.text) || {};
  return {
    idx,
    q_first40: (q.q || '').slice(0, 40),
    ref,
    classification: j.classification || 'unknown',
    confidence: typeof j.confidence === 'number' ? j.confidence : 0,
    suggestion: j.suggestion || null,
    note: j.note || null,
  };
}

async function runWithConcurrency(items, fn, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      if (costExceeded()) {
        console.error(`[cost-cap] $${priceUsd(COST.inTok, COST.outTok).toFixed(2)} >= $${CONFIG.costCapUsd}, halting`);
        break;
      }
      const my = cursor++;
      try { results[my] = await fn(items[my], my); }
      catch (e) { results[my] = { idx: my, error: e.message }; }
      if (my % 25 === 0 && my > 0) console.error(`  ${my}/${items.length} (cost=$${priceUsd(COST.inTok, COST.outTok).toFixed(2)})`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results.filter(Boolean);
}

async function main() {
  const raw = await fs.readFile(CONFIG.questionsPath, 'utf-8');
  let qs = JSON.parse(raw);
  if (CONFIG.maxQs > 0) qs = qs.slice(0, CONFIG.maxQs);
  console.error(`Scanning ${qs.length} questions, cost cap $${CONFIG.costCapUsd}, concurrency ${CONFIG.concurrency}`);
  const verdicts = await runWithConcurrency(qs, classifyOne, CONFIG.concurrency);
  // Filter to non-ok for the review queue
  const flagged = verdicts.filter((v) => v && v.classification !== 'ok');
  await fs.writeFile(CONFIG.outputPath, JSON.stringify({
    runAt: new Date().toISOString(),
    model: MODEL,
    totalQ: qs.length,
    cost: { ...COST, usd: priceUsd(COST.inTok, COST.outTok) },
    counts: verdicts.reduce((acc, v) => { acc[v.classification] = (acc[v.classification] || 0) + 1; return acc; }, {}),
    flagged,
  }, null, 2));
  console.error(`Wrote ${flagged.length} flagged of ${qs.length} total → ${CONFIG.outputPath}`);
  console.error(`Cost: $${priceUsd(COST.inTok, COST.outTok).toFixed(2)} (${COST.totalCalls} calls, ${COST.failures} failures)`);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('source-scanner.mjs');
if (isMain) main().catch((e) => { console.error(e); process.exitCode = 1; });
