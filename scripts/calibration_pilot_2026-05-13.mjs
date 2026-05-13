// One-shot calibration pilot for chaos-doctor v4 long-run findings.
// Independent cold-validate prompt — NOT v4-derived — re-judges flagged stems
// via Opus 4.7 to settle whether the [85,90) Sonnet pile-up is real signal or
// judge self-anchoring.
//
// Pre-written prediction (2026-05-13, before this run):
//   [85,90) band 7 stems: predicted 2 survive (29%, "needs Opus as filter")
//   [90,95) band 2 stems: predicted 1 survives (50%, real but N=2 noise)
//   [80,85) band 2 stems: predicted 1 survives (50%, below audit-3 cut)
//   Aggregate: 4 of 11 (36%)
//
// Decision rule (load-bearing band = [85,90)):
//   >= 4/7 (>=57%) -> drop audit-3 threshold to conf>=85
//   <= 1/7 (<=14%) -> Sonnet self-anchoring confirmed, keep conf>=90, escalate judge model
//   2-3/7 -> Opus-as-filter pattern is the right gate design
//
// c-flip pre-commit:
//   Both NSCLC + opioid-MCI are conf=92 (in the [90,95) band).
//   If Opus disagrees with Sonnet on BOTH: c-flip workstream closes,
//   chaos config's c-disagreement output gets re-examined at the source.
//   0/2 is a valid result but only as an explicit decision.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
const MODEL = 'claude-opus-4-7';

// Independent cold-validate prompt. No v4 carryover:
//   - No bot persona framing ("you are a geriatrician chaos bot")
//   - No citation regex priors
//   - No reference to Sonnet's prior judgment
//   - No FM/IM sibling framing
// Just: question + options + claimed correct + source -> independent verdict.
const SYS = `You are a board-certified geriatrician evaluating Hebrew-language geriatric medicine board exam questions.

Given a question, its multiple-choice options, the claimed correct answer, and a textbook source citation, judge whether the claimed correct answer is medically correct.

Reply with strict JSON only, no prose outside JSON:
{
  "correct": true | false,
  "confidence": <integer 0-100>,
  "rationale": "<one-paragraph clinical justification, English or Hebrew>",
  "preferred_option_letter": "A" | "B" | "C" | "D" | null
}

"preferred_option_letter" is the letter you'd pick if you disagree with the claimed answer; null if you agree.

Judge from medical evidence only. Do not defer to the claimed answer. Do not invent textbook quotes — if the source citation seems implausible for the question content, that's part of the verdict.`;

async function judge(stem, options, claimedC, ref) {
  const lettered = options.map((o, i) => `${'ABCDEFGH'[i]}. ${o}`).join('\n');
  const userPrompt = `Question (Hebrew):
${stem}

Options:
${lettered}

Claimed correct answer: ${'ABCDEFGH'[claimedC]} — ${options[claimedC]}
Source citation: ${ref || '(none)'}

Is the claimed correct answer medically correct? Reply JSON only.`;

  const body = {
    model: MODEL,
    max_tokens: 800,
    system: SYS,
    messages: [{ role: 'user', content: userPrompt }],
  };
  const res = await fetch(TORANOT_URL, {
    method: 'POST',
    headers: { 'x-api-secret': KEY, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Opus ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  return {
    text,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

function extractJson(text) {
  // Tolerant: pull first {...} block.
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

async function main() {
  const args = process.argv.slice(2);
  const smokeOnly = args.includes('--smoke');
  const cohortFile = args.find((a) => a.startsWith('--cohort='))?.slice(9) || 'pilot_cohort.json';

  const cohortPath = `C:/Users/User/repos/Geriatrics/.audit_logs/${cohortFile}`;
  const cohort = JSON.parse(readFileSync(cohortPath, 'utf-8'));
  const target = smokeOnly ? cohort.slice(0, 1) : cohort;
  console.log(`[pilot] judging ${target.length} stems via ${MODEL} on ${TORANOT_URL}`);

  const results = [];
  let totalIn = 0, totalOut = 0;
  for (let i = 0; i < target.length; i++) {
    const t = target[i];
    process.stdout.write(`[${i + 1}/${target.length}] qz_idx=${t.qz_idx} band=[${t.sonnet_band_lo},${t.sonnet_band_hi}) class=${t.audit_class} ...`);
    try {
      const r = await judge(t.stem, t.options, t.canonical_c, t.ref || null);
      const parsed = extractJson(r.text);
      results.push({
        ...t,
        opus_raw: r.text,
        opus_parsed: parsed,
        opus_correct: parsed?.correct,
        opus_confidence: parsed?.confidence,
        opus_preferred: parsed?.preferred_option_letter,
        opus_in_tokens: r.inputTokens,
        opus_out_tokens: r.outputTokens,
      });
      totalIn += r.inputTokens; totalOut += r.outputTokens;
      process.stdout.write(` opus.correct=${parsed?.correct} conf=${parsed?.confidence} (${r.inputTokens}+${r.outputTokens}t)\n`);
    } catch (e) {
      results.push({ ...t, error: String(e).slice(0, 300) });
      process.stdout.write(` ERROR: ${String(e).slice(0, 120)}\n`);
    }
  }

  const cost = (totalIn / 1_000_000) * 15 + (totalOut / 1_000_000) * 75; // Opus 4.7 pricing
  console.log(`\n[pilot] complete. tokens=${totalIn}+${totalOut}, cost=$${cost.toFixed(2)}`);

  const outPath = `C:/Users/User/repos/Geriatrics/.audit_logs/calibration_pilot_results_${new Date().toISOString().slice(0,10)}.json`;
  writeFileSync(outPath, JSON.stringify({ model: MODEL, run_at: new Date().toISOString(), cost_usd: cost, results }, null, 2), 'utf-8');
  console.log(`[pilot] wrote ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
