// Redesigned audit-1 + audit-2 prompts pilot — 2026-05-13.
//
// Tests two narrowed prompts against pre-curated test cohorts from the v4-long
// chaos run. Goal: empirical confirmation that the redesigns separate the
// axes the original prompts conflated.
//
// Pre-written predictions (locked before run):
//   Audit-1 (8 stems): predicted 2 flagged (~25%) → ship if 0-2
//   Audit-2 (13 stems): predicted 1-2 flagged (~10%) → ship if ≤2
//
// Carve-out clauses are the load-bearing design feature of both redesigns.
// If they don't land empirically, the redesign needs another pass.

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
const MODEL = 'claude-opus-4-7';

const ROOT = 'C:/Users/User/repos/Geriatrics';

// ============================================================
// Redesigned prompts (per followup_chaos_audit_prompt_redesigns.md)
// ============================================================

const SYS_AUDIT1_REDESIGN = `You are evaluating a Hebrew geriatric medicine board question. ASSUME THE CLAIMED CORRECT ANSWER IS CORRECT — its medical accuracy is judged separately by audit-3 (a different channel). Your job here is to judge ONLY THE EXPLANATION TEXT on three axes:

1. Does the explanation justify the correct answer with sound medical reasoning? (vs. circular reasoning, non-sequitur claims, or arguments that contradict the answer it's defending)
2. Does the explanation contain factually wrong medical claims about the distractors (the wrong options)? (vs. claims that are accurate within the space of the option set)
3. Is the explanation prose well-formed Hebrew with embedded clinical English where idiomatic? (vs. machine-translation artifacts, broken bidi, missing clinical context)

Reply with strict JSON only, no prose outside JSON:
{
  "sound": true | false,
  "issue": "<one paragraph naming the specific axis(es) that failed, or 'sound on all three axes' if true>",
  "axis_failures": ["1" | "2" | "3" or empty array],
  "confidence": <integer 0-100>
}

DO NOT consider whether the answer index "c" is correct. That's audit-3, not your job here. Even if you would have picked a different answer, defer to the claimed correct answer and judge only the explanation text quality given that the answer is right.`;

const SYS_AUDIT2_REDESIGN = `You are evaluating whether a Hebrew geriatric medicine question's q.ref text is a FAITHFUL DISPLAY of the audit-grade chapter assignment from question_chapters.json. Your job is narrow: NOT to judge whether the chapter is topically aligned with the question, but whether q.ref displays the audit-grade assignment correctly.

The q.ref is FAITHFUL if any of:
- It cites at least one of the audited chapters with the correct chapter number.
- It cites a more specific subchapter/section/page WITHIN an audited chapter (this is acceptable curatorial specificity — a more specific reference within the audited chapter's scope is a feature, not a defect).
- The current q.ref is more specific than the audit-grade (e.g., names a specific cancer subtype where audit says "cancer general") — this is curatorial specificity beyond the topic-default floor and should NOT be flagged.
- It cites a non-textbook source (e.g., Israeli law citation "חוק..."  for legal-topic Qs) that the audit-grade mapping has no entry for. The audit-grade mapping is topic-default and doesn't cover legal sources.

The q.ref is UNFAITHFUL if:
- It cites a chapter number that disagrees with the audit-grade assignment for the same book (Hazzard, Harrison, or GRS), AND the disagreement is NOT a subchapter relationship.
- It cites a clearly incorrect chapter (e.g., wrong topic entirely — Cardiology chapter on a Cancer Q).
- It is internally inconsistent with the Q content.

Reply with strict JSON only:
{
  "faithful": true | false,
  "reason": "<one sentence>",
  "confidence": <integer 0-100>
}

DO NOT evaluate whether the explanation prose aligns with the chapter. DO NOT evaluate the medical content of the question. Judge ONLY whether q.ref faithfully displays the audit-grade chapter assignment given the carve-outs above.`;

// ============================================================
// API helper
// ============================================================

async function judge(sysPrompt, userPrompt) {
  const body = {
    model: MODEL,
    max_tokens: 600,
    system: sysPrompt,
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
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch (_) { return null; }
}

// ============================================================
// Cohort builders
// ============================================================

function buildAudit1Cohort() {
  const QZ = JSON.parse(readFileSync(`${ROOT}/data/questions.json`, 'utf-8'));
  const EXP = JSON.parse(readFileSync(`${ROOT}/data/explanations.json`, 'utf-8'));
  const A1 = JSON.parse(readFileSync(`${ROOT}/.audit_logs/pending_explanation_quality_judge.json`, 'utf-8'));
  return A1.stems.map((s) => {
    const idx = s.qz_idx;
    const q = QZ[idx];
    const e = EXP[idx] || '';
    return {
      qz_idx: idx,
      cohort_t: s.cohort_t,
      stem: q.q,
      options: q.o,
      claimed_c: q.c,
      explanation: e,
    };
  });
}

function buildAudit2Cohort() {
  const QZ = JSON.parse(readFileSync(`${ROOT}/data/questions.json`, 'utf-8'));
  const CH = JSON.parse(readFileSync(`${ROOT}/data/question_chapters.json`, 'utf-8'));
  const HAZ = JSON.parse(readFileSync(`${ROOT}/data/hazzard_chapters.json`, 'utf-8'));
  const HAR = JSON.parse(readFileSync(`${ROOT}/harrison_chapters.json`, 'utf-8'));
  const A2 = JSON.parse(readFileSync(`${ROOT}/.audit_logs/pending_audit2_redesign_cite_impl_review.json`, 'utf-8'));

  const cohort = [];
  for (const [bucketName, bucket] of Object.entries(A2.buckets)) {
    for (const stem of bucket.stems) {
      const idx = stem.qz_idx;
      const q = QZ[idx];
      const entry = CH[String(idx)] || {};
      const hazTitle = entry.haz ? (HAZ[String(entry.haz)]?.title || '') : null;
      const harTitle = entry.har ? (HAR[String(entry.har)]?.title || '') : null;
      cohort.push({
        qz_idx: idx,
        bucket: bucketName,
        cohort_t: stem.cohort_t,
        ti: stem.ti,
        stem: q.q,
        current_ref: q.ref || '',
        audit_grade: {
          haz: entry.haz ? `Ch ${entry.haz}${hazTitle ? ' — ' + hazTitle : ''}` : null,
          har: entry.har ? `Ch ${entry.har}${harTitle ? ' — ' + harTitle : ''}` : null,
          grs: entry.grs ? `Ch ${entry.grs}` : null,
        },
      });
    }
  }
  return cohort;
}

// ============================================================
// Prompt formatters
// ============================================================

function fmtAudit1Prompt(item) {
  const lettered = item.options.map((o, i) => `${'ABCDEF'[i]}. ${o}`).join('\n');
  return `Question (Hebrew):
${item.stem}

Options:
${lettered}

Claimed correct answer (assume correct, judge only the explanation): ${'ABCDEF'[item.claimed_c]} — ${item.options[item.claimed_c]}

Explanation text (Hebrew):
${item.explanation}

Is the explanation TEXT medically sound on the three axes? Reply JSON only.`;
}

function fmtAudit2Prompt(item) {
  const ag = item.audit_grade;
  const auditLines = [];
  if (ag.haz) auditLines.push(`- Hazzard: ${ag.haz}`);
  if (ag.har) auditLines.push(`- Harrison: ${ag.har}`);
  if (ag.grs) auditLines.push(`- GRS8: ${ag.grs}`);
  return `Question (Hebrew, abbreviated stem):
${(item.stem || '').slice(0, 400)}

Audit-grade chapter assignment from question_chapters.json[${item.qz_idx}]:
${auditLines.join('\n') || '(none)'}

Current q.ref text:
"${item.current_ref}"

Is the current q.ref a faithful display of the audit-grade chapter assignment, considering the carve-outs (curatorial specificity, non-textbook sources, subchapter relationships)? Reply JSON only.`;
}

// ============================================================
// Driver
// ============================================================

async function runCohort(label, cohort, sysPrompt, fmtPrompt) {
  console.log(`\n[${label}] judging ${cohort.length} stems via ${MODEL}`);
  const results = [];
  let totalIn = 0, totalOut = 0;
  for (let i = 0; i < cohort.length; i++) {
    const item = cohort[i];
    process.stdout.write(`  [${i + 1}/${cohort.length}] idx=${item.qz_idx} ...`);
    try {
      const r = await judge(sysPrompt, fmtPrompt(item));
      const parsed = extractJson(r.text);
      const result = { ...item, opus_raw: r.text, opus_parsed: parsed };
      // Extract verdict — different field per audit class
      if (label === 'audit-1') {
        result.opus_sound = parsed?.sound;
        result.flagged = parsed?.sound === false;
      } else {
        result.opus_faithful = parsed?.faithful;
        result.flagged = parsed?.faithful === false;
      }
      result.opus_confidence = parsed?.confidence;
      result.opus_in_tokens = r.inputTokens;
      result.opus_out_tokens = r.outputTokens;
      results.push(result);
      totalIn += r.inputTokens; totalOut += r.outputTokens;
      const verdict = label === 'audit-1' ? `sound=${parsed?.sound}` : `faithful=${parsed?.faithful}`;
      process.stdout.write(` ${verdict} conf=${parsed?.confidence} (${r.inputTokens}+${r.outputTokens}t)\n`);
    } catch (e) {
      results.push({ ...item, error: String(e).slice(0, 300) });
      process.stdout.write(` ERROR: ${String(e).slice(0, 120)}\n`);
    }
  }
  const cost = (totalIn / 1_000_000) * 15 + (totalOut / 1_000_000) * 75;
  console.log(`[${label}] complete. tokens=${totalIn}+${totalOut}, cost=$${cost.toFixed(2)}`);
  const flagged = results.filter((r) => r.flagged).length;
  console.log(`[${label}] flagged: ${flagged} of ${results.length}`);
  return { label, results, totalIn, totalOut, cost, flagged };
}

async function main() {
  console.log(`Audit-1 + audit-2 prompt-redesign pilot, 2026-05-13`);
  const a1Cohort = buildAudit1Cohort();
  const a2Cohort = buildAudit2Cohort();
  console.log(`Audit-1 cohort: ${a1Cohort.length} stems`);
  console.log(`Audit-2 cohort: ${a2Cohort.length} stems`);

  const a1Run = await runCohort('audit-1', a1Cohort, SYS_AUDIT1_REDESIGN, fmtAudit1Prompt);
  const a2Run = await runCohort('audit-2', a2Cohort, SYS_AUDIT2_REDESIGN, fmtAudit2Prompt);

  const out = {
    model: MODEL,
    run_at: new Date().toISOString(),
    audit_1: { cohort_size: a1Cohort.length, flagged: a1Run.flagged, cost_usd: a1Run.cost, results: a1Run.results },
    audit_2: { cohort_size: a2Cohort.length, flagged: a2Run.flagged, cost_usd: a2Run.cost, results: a2Run.results },
    total_cost_usd: a1Run.cost + a2Run.cost,
  };
  const outPath = `${ROOT}/.audit_logs/benchmarks/audit_redesign_pilot_results_${new Date().toISOString().slice(0,10)}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`\nWrote ${outPath}`);
  console.log(`\nTotal cost: $${(a1Run.cost + a2Run.cost).toFixed(2)}`);
  console.log(`Audit-1 flagged: ${a1Run.flagged} of ${a1Cohort.length}  (predicted 2/8)`);
  console.log(`Audit-2 flagged: ${a2Run.flagged} of ${a2Cohort.length}  (predicted 1-2/13)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
