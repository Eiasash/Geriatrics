#!/usr/bin/env node
/**
 * regen_explanations_v2.mjs — selective explanation regeneration with:
 *   1. SYSTEM_PROMPT_V2 (explicit "discuss EVERY distractor; target 250-400 words;
 *      do not end mid-sentence") — replaces the v9.x prompt's "Keep total under
 *      200 words" framing that produced the v10.64.119-scanner-flagged
 *      mid-sentence-truncation bug class.
 *   2. Per-cluster max_tokens config map (high-depth topics get more budget) —
 *      tuned via 2026-05-13 pre-flight pilot.
 *   3. Toranot proxy path with retry-with-backoff for transport timeouts
 *      (pilot saw 2% timeout rate; at 766-stem rollout expect ~15 timeouts).
 *
 * Usage:
 *   node scripts/regen_explanations_v2.mjs --ti N           # regen all truncation candidates for topic N
 *   node scripts/regen_explanations_v2.mjs --idx-list FILE  # regen specific qz_idx values from a JSON file
 *   node scripts/regen_explanations_v2.mjs --dry-run        # don't write back, just report
 *   node scripts/regen_explanations_v2.mjs --limit N        # cap to first N stems
 *
 * Reads candidate list from .audit_logs/truncated_explanations.json (output of
 * scripts/scan_truncated_explanations.mjs). Writes regenerated explanations
 * back to data/explanations.json in place.
 *
 * Validated 2026-05-13 against a 50-stem stratified sample: 0/50 still
 * truncated after regen, median char length 1825, tight unimodal distribution
 * in 1545-2101 char range. See .audit_logs/benchmarks/regen_preflight_2026-05-13.json
 * for the pre-flight result that authorized this rollout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
const MODEL = process.env.REGEN_MODEL || 'claude-sonnet-4-6';

// Per-cluster max_tokens config map (tunable in one line). High-depth topics
// need more budget because 4-distractor explanations typically run 300-400
// words. See 2026-05-13 pre-flight pilot for the empirical validation.
const TI_BUDGET = {
  5: 1750,   // delirium
  6: 1750,   // dementia
  8: 1750,   // polypharmacy
  26: 1750,  // cancer
  27: 1750,  // infections
  40: 1750,  // parkinson
};
const DEFAULT_BUDGET = 1400;
function budgetFor(ti) { return TI_BUDGET[ti] || DEFAULT_BUDGET; }

const SYSTEM_PROMPT_V2 =
  'You are a senior geriatric medicine specialist and expert medical educator. ' +
  'For the multiple-choice question provided, write a clinical explanation that covers: ' +
  '(1) Why the correct answer is correct — include specific clinical reasoning and mechanisms. ' +
  "Cite Hazzard's Geriatric Medicine or Harrison's Internal Medicine by chapter or principle where relevant. " +
  '(2) Why EACH wrong answer is incorrect — be specific about the clinical error in each distractor. ' +
  'You MUST discuss every distractor; an explanation that omits any distractor is incomplete and unacceptable. ' +
  '(3) A brief clinical pearl or exam tip relevant to the topic. ' +
  'Target length 250-400 words. Do not end mid-sentence. Complete every clause and end with terminal punctuation. ' +
  'Write in clear prose paragraphs. ' +
  'Write in Hebrew (עברית) if the question is in Hebrew; write in English if the question is in English. ' +
  'Do not repeat or paraphrase the question text. Start directly with the explanation.';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function regenOne(q, maxTokens, { maxRetries = 3 } = {}) {
  const opts = (q.o || []).map((o, i) => `${'ABCDEF'[i]}: ${o}`).join('\n');
  const userPrompt = `Question: ${q.q}\n${opts}\nCorrect answer: ${'ABCDEF'[q.c]} — ${q.o[q.c]}`;
  const body = { model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT_V2, messages: [{ role: 'user', content: userPrompt }] };

  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(TORANOT_URL, {
        method: 'POST',
        headers: { 'x-api-secret': KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        // Transport-layer retryable: backoff + retry. Pilot saw 2% timeout
        // rate; this retry path is what makes the 766-stem rollout converge
        // without ~15 silent skips.
        const wait = (attempt + 1) * 2000;
        lastErr = new Error(`HTTP ${res.status} (retryable)`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Sonnet ${res.status}: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
      return {
        text,
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
        stopReason: data.stop_reason,
        attempts: attempt + 1,
      };
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries - 1) await sleep((attempt + 1) * 2000);
    }
  }
  throw lastErr || new Error('regen failed after retries');
}

function parseArgs(argv) {
  const args = { ti: null, idxList: null, dryRun: false, limit: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--ti') args.ti = parseInt(argv[++i], 10);
    else if (argv[i] === '--idx-list') args.idxList = argv[++i];
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === '--help') { console.log('See file header for usage'); process.exit(0); }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.ti == null && !args.idxList) {
    console.error('ERROR: must supply --ti N or --idx-list FILE');
    process.exit(2);
  }

  const QZ = JSON.parse(readFileSync(`${ROOT}/data/questions.json`, 'utf-8'));
  const EXP = JSON.parse(readFileSync(`${ROOT}/data/explanations.json`, 'utf-8'));
  const SCAN = JSON.parse(readFileSync(`${ROOT}/.audit_logs/truncated_explanations.json`, 'utf-8'));

  // Build target list
  let targetIdxs;
  if (args.ti != null) {
    targetIdxs = SCAN.candidates
      .map((c) => c.qz_idx)
      .filter((idx) => QZ[idx].ti === args.ti);
    console.log(`[regen-v2] ti=${args.ti}: ${targetIdxs.length} candidate stems from truncation scanner`);
  } else {
    const list = JSON.parse(readFileSync(args.idxList, 'utf-8'));
    targetIdxs = Array.isArray(list) ? list : list.idxs || [];
    console.log(`[regen-v2] idx-list: ${targetIdxs.length} stems`);
  }
  if (args.limit) targetIdxs = targetIdxs.slice(0, args.limit);

  if (args.dryRun) {
    console.log('[regen-v2] DRY RUN. Would regen:');
    for (const idx of targetIdxs) {
      const q = QZ[idx];
      console.log(`  idx=${idx} ti=${q.ti} budget=${budgetFor(q.ti)}`);
    }
    process.exit(0);
  }

  const startTime = Date.now();
  let totalIn = 0, totalOut = 0, successes = 0, failures = 0;
  const failedIdxs = [];

  for (let i = 0; i < targetIdxs.length; i++) {
    const idx = targetIdxs[i];
    const q = QZ[idx];
    const budget = budgetFor(q.ti);
    process.stdout.write(`  [${(i + 1).toString().padStart(3)}/${targetIdxs.length}] idx=${idx} ti=${q.ti} budget=${budget} ...`);
    try {
      const r = await regenOne(q, budget);
      EXP[idx] = r.text;
      totalIn += r.inputTokens; totalOut += r.outputTokens;
      successes += 1;
      process.stdout.write(` len=${r.text.length} attempts=${r.attempts} (${r.inputTokens}+${r.outputTokens}t)\n`);
      // Incremental save every 10 stems to avoid losing progress on long runs
      if ((i + 1) % 10 === 0) {
        writeFileSync(`${ROOT}/data/explanations.json`, JSON.stringify(EXP, null, 0), 'utf-8');
      }
    } catch (e) {
      failures += 1;
      failedIdxs.push(idx);
      process.stdout.write(` FAILED: ${String(e).slice(0, 100)}\n`);
    }
  }

  // Final write
  writeFileSync(`${ROOT}/data/explanations.json`, JSON.stringify(EXP, null, 0), 'utf-8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15;  // Sonnet pricing
  console.log(`\n[regen-v2] complete in ${elapsed}s. successes=${successes} failures=${failures}`);
  console.log(`[regen-v2] tokens=${totalIn}+${totalOut}, cost=$${cost.toFixed(2)}`);
  if (failedIdxs.length) {
    console.log(`[regen-v2] FAILED idx list: ${JSON.stringify(failedIdxs)}`);
    console.log(`[regen-v2] re-run with --idx-list path/to/failed.json after copying the list to a file`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
