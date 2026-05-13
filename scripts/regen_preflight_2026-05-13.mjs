// Pre-flight regen on a 50-stem stratified sample from the truncation
// scanner output. Validates that the proposed fix (raised max_tokens +
// updated prompt demanding full-distractor coverage) actually clears the
// truncation class before the 7-8-PR rollout commits to it.
//
// Pre-written prediction (locked, see PR thread):
//   After fix, ~5-10% of 50 stems (3-5) still truncate on first pass.
//   Decision rule:
//     <5% (≤2 of 50)   → ship: budget calibrated, rollout proceeds
//     5-15% (3-7 of 50) → tweak per-cluster budget, then re-pre-flight
//     >15% (8+ of 50)  → halt: upstream pipeline has another bug beyond
//                       max_tokens, investigate before any regen PR
//
// Prior named: truncation correlates with content-depth (high-depth
// topics like dementia/cancer need more tokens). If empirics deviate
// (uniform across topics), the prior fails and single-cap-with-headroom
// is the right fix, not per-cluster tuning.
//
// Cost target: ~$2 (50 stems × ~$0.04 via Sonnet through Toranot proxy).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
const MODEL = 'claude-sonnet-4-6';  // production regen target — cost-anchored choice

// Per-cluster max_tokens config map. v10.64.118-bot-redesign + 2026-05-13
// pre-flight intent: high-depth clinical topics need more budget for the
// 4-distractor-coverage requirement. Make this a config map (not hardcoded
// values) so future tuning is one-line.
const TI_BUDGET = {
  // High-depth: dementia(6), polypharmacy(8), cancer(26), infections(27),
  // delirium(5), parkinson(40) — 4-distractor explanations typically
  // run 300-400 words (multiple subtypes + clinical reasoning + pearl).
  5: 1750, 6: 1750, 8: 1750, 26: 1750, 27: 1750, 40: 1750,
};
const DEFAULT_BUDGET = 1400;  // 2x prior 700, standard for non-high-depth topics
function budgetFor(ti) { return TI_BUDGET[ti] || DEFAULT_BUDGET; }

// Updated system prompt: explicit full-distractor coverage requirement.
// The prior prompt said "Keep total under 200 words" — too tight when the
// Q has 4 distractors that each need clinical justification. New version
// inverts the budget framing to a minimum target with explicit guard
// against mid-sentence truncation.
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

// Truncation detection (inlined from scripts/scan_truncated_explanations.mjs
// to avoid coupling the pre-flight to the scanner's exact export shape).
const TERMINAL_PUNCT = /[.!?:][\s'"*\])}״׳-]*$/u;
const ENDS_WITH_LETTER = /[A-Za-zא-ת]\s*$/u;
const WHITESPACE = /\s/u;
function detectTruncation(text) {
  const reasons = [];
  const trimmed = (text || '').replace(/\s+$/u, '');
  if (!trimmed || trimmed.length < 30) return { reasons: ['empty'], truncated: true };
  if (ENDS_WITH_LETTER.test(trimmed)) {
    const tail = trimmed.slice(-20);
    if (!WHITESPACE.test(tail)) reasons.push('ends-mid-word');
    else reasons.push('ends-on-letter-no-punct');
  }
  if (!TERMINAL_PUNCT.test(trimmed) && !reasons.includes('ends-on-letter-no-punct') && !reasons.includes('ends-mid-word')) {
    reasons.push('no-terminal-punct');
  }
  if (trimmed.length < 250 && !trimmed.includes('\n\n')) reasons.push('short-single-paragraph');
  const highConf = reasons.includes('ends-mid-word') || reasons.includes('ends-on-letter-no-punct') || reasons.includes('no-terminal-punct') || reasons.includes('empty');
  return { reasons, truncated: highConf };
}

// API call
async function regen(q, maxTokens) {
  const opts = (q.o || []).map((o, i) => `${'ABCDEF'[i]}: ${o}`).join('\n');
  const userPrompt = `Question: ${q.q}\n${opts}\nCorrect answer: ${'ABCDEF'[q.c]} — ${q.o[q.c]}`;
  const body = { model: MODEL, max_tokens: maxTokens, system: SYSTEM_PROMPT_V2, messages: [{ role: 'user', content: userPrompt }] };
  const res = await fetch(TORANOT_URL, {
    method: 'POST',
    headers: { 'x-api-secret': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sonnet ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  return {
    text,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
    stopReason: data.stop_reason,
  };
}

// Build stratified sample: top-4 high-volume topics (10 each) + 10 mid-tier
function buildSample(QZ, scanCands) {
  // Index of truncated candidates by ti
  const byTi = new Map();
  for (const c of scanCands) {
    const ti = QZ[c.qz_idx].ti;
    if (!byTi.has(ti)) byTi.set(ti, []);
    byTi.get(ti).push(c.qz_idx);
  }
  // Stable selection: take first N per cluster (sorted by qz_idx)
  const STRATA = [
    { name: 'dementia',     ti: 6,  n: 10 },
    { name: 'infections',   ti: 27, n: 10 },
    { name: 'polypharmacy', ti: 8,  n: 10 },
    { name: 'cancer',       ti: 26, n: 10 },
  ];
  const sample = [];
  for (const s of STRATA) {
    const pool = (byTi.get(s.ti) || []).slice().sort((a, b) => a - b);
    for (const idx of pool.slice(0, s.n)) {
      sample.push({ qz_idx: idx, stratum: s.name, ti: s.ti, budget: budgetFor(s.ti) });
    }
  }
  // Mid-tier: pick 10 from topics with 10-32 stems (not top-4, not tail)
  const midPool = [];
  for (const [ti, idxs] of byTi.entries()) {
    if (STRATA.find((s) => s.ti === ti)) continue;
    if (idxs.length >= 10 && idxs.length <= 32) {
      midPool.push({ ti, idxs });
    }
  }
  // Diversify across mid-topics: 2-3 per topic until we have 10
  midPool.sort((a, b) => a.ti - b.ti);
  let added = 0;
  for (let take = 1; added < 10 && take <= 5; take++) {
    for (const m of midPool) {
      if (added >= 10) break;
      for (const idx of m.idxs.slice((take - 1) * 1, take).filter((i) => !sample.find((s) => s.qz_idx === i))) {
        if (added >= 10) break;
        sample.push({ qz_idx: idx, stratum: `mid-tier-ti${m.ti}`, ti: m.ti, budget: budgetFor(m.ti) });
        added += 1;
      }
    }
  }
  return sample;
}

async function main() {
  const QZ = JSON.parse(readFileSync(`${ROOT}/data/questions.json`, 'utf-8'));
  const SCAN = JSON.parse(readFileSync(`${ROOT}/.audit_logs/truncated_explanations.json`, 'utf-8'));
  const sample = buildSample(QZ, SCAN.candidates);
  console.log(`Pre-flight regen on ${sample.length} stems via ${MODEL} (toranot-proxy)`);
  console.log(`Per-cluster budgets: high-depth=1750, standard=1400`);
  console.log();

  const results = [];
  let totalIn = 0, totalOut = 0;
  for (let i = 0; i < sample.length; i++) {
    const s = sample[i];
    const q = QZ[s.qz_idx];
    process.stdout.write(`  [${(i + 1).toString().padStart(2)}/${sample.length}] idx=${s.qz_idx} ti=${s.ti} stratum=${s.stratum} budget=${s.budget} ...`);
    try {
      const r = await regen(q, s.budget);
      const trunc = detectTruncation(r.text);
      results.push({
        ...s,
        regen_text: r.text,
        regen_length: r.text.length,
        stop_reason: r.stopReason,
        truncation_detected: trunc.truncated,
        truncation_reasons: trunc.reasons,
        in_tokens: r.inputTokens,
        out_tokens: r.outputTokens,
      });
      totalIn += r.inputTokens; totalOut += r.outputTokens;
      const trunc_marker = trunc.truncated ? `STILL TRUNC (${trunc.reasons.join(',')})` : 'OK';
      process.stdout.write(` len=${r.text.length} stop=${r.stopReason} ${trunc_marker} (${r.inputTokens}+${r.outputTokens}t)\n`);
    } catch (e) {
      results.push({ ...s, error: String(e).slice(0, 300) });
      process.stdout.write(` ERROR: ${String(e).slice(0, 100)}\n`);
    }
  }

  const cost = (totalIn / 1_000_000) * 3 + (totalOut / 1_000_000) * 15;  // Sonnet pricing
  const stillTrunc = results.filter((r) => r.truncation_detected).length;
  const truncRate = stillTrunc / results.length;

  console.log(`\n[pre-flight] complete. tokens=${totalIn}+${totalOut}, cost=$${cost.toFixed(2)}`);
  console.log(`[pre-flight] STILL TRUNCATED: ${stillTrunc} of ${results.length} (${(truncRate * 100).toFixed(1)}%)`);
  // By-stratum breakdown
  const byStratum = new Map();
  for (const r of results) {
    const s = byStratum.get(r.stratum) || { total: 0, trunc: 0 };
    s.total += 1;
    if (r.truncation_detected) s.trunc += 1;
    byStratum.set(r.stratum, s);
  }
  console.log(`\n[pre-flight] By stratum:`);
  for (const [name, s] of byStratum) {
    console.log(`  ${name.padEnd(20)} ${s.trunc}/${s.total} truncated (${(100 * s.trunc / s.total).toFixed(0)}%)`);
  }

  // Decision rule
  let decision;
  if (truncRate < 0.05) decision = 'SHIP — budget calibrated, rollout proceeds';
  else if (truncRate <= 0.15) decision = 'TWEAK — per-cluster budget needs adjustment, re-run pre-flight';
  else decision = 'HALT — upstream pipeline has another bug beyond max_tokens; investigate before any regen PR';
  console.log(`\n[pre-flight] DECISION: ${decision}`);

  const out = {
    model: MODEL,
    run_at: new Date().toISOString(),
    sample_size: sample.length,
    still_truncated: stillTrunc,
    truncation_rate: truncRate,
    decision,
    cost_usd: cost,
    budgets: { high_depth_ti: Object.keys(TI_BUDGET).map(Number), high_depth: 1750, default: DEFAULT_BUDGET },
    results,
  };
  const outPath = `${ROOT}/.audit_logs/benchmarks/regen_preflight_${new Date().toISOString().slice(0, 10)}.json`;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\nWrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
