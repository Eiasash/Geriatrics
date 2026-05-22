#!/usr/bin/env node
// gen_ai_hard_geri.mjs — Bot C: generate hard-level Geri board MCQs.
//
// Pattern: FamilyMedicine/scripts/gen_ai_hard.mjs adapted for Geri's
// syllabus (P005-2026), 46-topic taxonomy, and Hazzard 8e + Harrison 22e
// + GRS8 source library. Per Phase 2c of 2026-05-08 plan: NEVER auto-merge,
// outputs to data/ai_hard_seed.geri.generated.json for morning review.
//
// Usage (proxy mode — default, no local key needed):
//   node scripts/gen_ai_hard_geri.mjs --hazzard 30 --harrison 15 --grs8 5
//
// Usage (direct mode fallback, when Toranot is down):
//   AI_DIRECT=1 ANTHROPIC_API_KEY=sk-... node scripts/gen_ai_hard_geri.mjs --hazzard 30 --harrison 15 --grs8 5
//
// Cost: ~$0.0080 per question on Sonnet 4.6. Cap enforcement moved server-side to Toranot
// proxy in v10.64.131 (per audit-fix-deploy D.3 + #261 precedent). Direct mode bypasses
// the cap entirely — use with care.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { extractJson } from './lib/extractJson.mjs';

// proxy-client.cjs is CJS — use createRequire for ESM interop
const require = createRequire(import.meta.url);
const { callClaude: callClaudeProxy } = require('./lib/proxy-client.cjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);
const N_HAZZARD  = parseInt(args.hazzard  || '0', 10);
const N_HARRISON = parseInt(args.harrison || '0', 10);
const N_GRS8     = parseInt(args.grs8     || '0', 10);
const OUT = args.out || join(ROOT, 'data/ai_hard_seed.geri.generated.json');

if (!N_HAZZARD && !N_HARRISON && !N_GRS8) {
  console.error('Usage: node scripts/gen_ai_hard_geri.mjs --hazzard N --harrison M --grs8 K [--out path.json]');
  console.error('Plan target was 50 Qs total. Suggested split: --hazzard 30 --harrison 15 --grs8 5');
  process.exit(1);
}

// v10.64.131: migrated to Toranot proxy (per audit-fix-deploy D.3 + memory #29).
// Default = proxy mode (no key needed locally). Set AI_DIRECT=1 + ANTHROPIC_API_KEY
// for fallback when Toranot is down (per deploy-primitives §4 direct-api carve-out).
const DIRECT_MODE = process.env.AI_DIRECT === '1';
const DIRECT_KEY = DIRECT_MODE ? (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY) : null;
if (DIRECT_MODE && !DIRECT_KEY) { console.error('AI_DIRECT=1 but ANTHROPIC_API_KEY (or CLAUDE_API_KEY) env var not set.'); process.exit(2); }

// Default model branches on mode: proxy accepts 'opus' alias (resolves to current
// opus server-side); direct mode forwards the string straight to Anthropic, which
// needs a canonical model ID. AI_MODEL env var overrides both paths.
// (Codex P1 #264 caught the original 'opus'-everywhere default breaking direct fallback.)
const MODEL = process.env.AI_MODEL || (DIRECT_MODE ? 'claude-opus-4-7' : 'opus');
const COST_CAP_USD = Number(process.env.CHAOS_COST_CAP_USD || 25);
const COST = { calls: 0, inTok: 0, outTok: 0 };
const priceUsd = () => (COST.inTok / 1e6) * 3 + (COST.outTok / 1e6) * 15;

const SYSTEM = `You are an Israeli geriatric-medicine board examiner writing very-hard-level MCQs for the P005-2026 שלב א׳ גריאטריה exam.

Constraints:
- Question stem in clinical vignette form (patient age usually >70, sex, relevant geriatric history — frailty / polypharmacy / cognitive status / functional status).
- 4 options, exactly one correct. (5 options allowed only if you're modeling a GRS8 import; mark c_accept properly.)
- Difficulty = hard (not trivial recall — requires applying a threshold, distinguishing two near-miss answers, or synthesizing function + cognition + lab data the way Hazzard 8e or GRS8 cases would).
- Each Q must cite a specific number, threshold, criterion, drug, or guideline (Beers 2023 / STOPP-START v3 / KDIGO / ACP / AGS / Israeli MOH).
- Explanation in HEBREW, 2–4 sentences, cite the specific Hazzard 8e chapter or Harrison 22e chapter or GRS8 page reference.
- Geri-relevant axes: cognitive impairment, frailty, polypharmacy, falls, incontinence, pressure injuries, palliative-vs-curative, functional decline, dementia subtypes, capacity assessment.

Output ONLY a JSON array (no prose, no markdown fence):
[{"q":"Hebrew vignette...","o":["א. ...","ב. ...","ג. ...","ד. ..."],"c":0,"c_accept":[0],"t":"AI-Hard-Haz","ti":<0-45>,"e":"Hebrew explanation + 'Hazzard Ch X' or 'Harrison Ch Y' citation","ref":"Hazzard 8e Ch X (Title)"}]

Topic indices (ti, 0-45):
0 Biology of Aging, 1 Demography, 2 CGA, 3 Frailty, 4 Falls, 5 Delirium, 6 Dementia, 7 Depression,
8 Polypharmacy, 9 Nutrition, 10 Pressure Injuries, 11 Incontinence, 12 Constipation, 13 Sleep,
14 Pain, 15 Osteoporosis, 16 OA, 17 CV Disease, 18 Heart Failure, 19 HTN, 20 Stroke, 21 COPD,
22 Diabetes, 23 Thyroid, 24 CKD, 25 Anemia, 26 Cancer, 27 Infections, 28 Palliative, 29 Ethics,
30 Elder Abuse, 31 Driving, 32 Guardianship, 33 Patient Rights, 34 Advance Directives,
35 Community/LTC, 36 Rehab, 37 Vision/Hearing, 38 Periop, 39 Geri EM, 40 Parkinson's,
41 Arrhythmia, 42 Dysphagia, 43 Andropause, 44 Prevention, 45 Interdisciplinary Care.
`;

async function callAnthropic(userPrompt, maxTokens = 1800) {
  // v10.64.131: cost cap now enforced by Toranot proxy server-side (per #261 precedent).
  // Client-side cap is a no-op in proxy mode because proxy-client doesn't expose usage tokens.
  // Set CHAOS_COST_CAP_USD on the proxy side via toranot_config if tighter caps are needed.
  const text = await callClaudeProxy(userPrompt, {
    model: MODEL,
    system: SYSTEM,
    max_tokens: maxTokens,
    timeout_ms: 60_000,
    direct: DIRECT_MODE,
    apiKey: DIRECT_KEY,
  });
  COST.calls += 1;
  return text;
}

function parseQs(text, expectedTag) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  // Try strict parse first (handles well-formed array responses)
  let arr;
  try { arr = JSON.parse(cleaned); }
  catch (_) {
    // Fallback 1: find first array boundary [...] manually
    const start = cleaned.indexOf('[');
    if (start !== -1) {
      try {
        const end = cleaned.lastIndexOf(']');
        if (end > start) arr = JSON.parse(cleaned.slice(start, end + 1));
      } catch (_) { /* fall through */ }
    }
  }
  if (!Array.isArray(arr)) {
    // Fallback 2: pull a single balanced {...} via extractJson, wrap as array.
    // Handles models that return one Q as a bare object instead of [{...}].
    const obj = extractJson(cleaned);
    if (obj && typeof obj === 'object') arr = [obj];
  }
  if (!Array.isArray(arr)) throw new Error(`LLM response not parseable as array: ${cleaned.slice(0, 100)}`);
  return arr.map((q) => {
    q.t = expectedTag;
    if (!Array.isArray(q.c_accept)) q.c_accept = [q.c];
    return q;
  });
}

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function genFromHazzard(n) {
  const haz = JSON.parse(readFileSync(join(ROOT, 'data/hazzard_chapters.json'), 'utf8'));
  // Hazzard chapters excluded from the syllabus (per Geri CLAUDE.md): 2-6, 34, 62.
  // Chapter file structure: dict keyed by chapter number string. Values have
  // {title, sections, wordCount} but no `num` property — use the key.
  const excluded = new Set([2, 3, 4, 5, 6, 34, 62]);
  const usable = Object.entries(haz)
    .map(([k, v]) => ({ num: Number(k), ...v }))
    .filter((ch) => Number.isFinite(ch.num) && !excluded.has(ch.num));
  const picks = shuffle(usable).slice(0, Math.min(n, usable.length));
  const out = [];
  for (const ch of picks) {
    const title = ch.title || ch.name || `Ch ${ch.num}`;
    console.log(`→ Hazzard Ch ${ch.num}: ${title}`);
    const prompt = `Generate 1 hard MCQ from Hazzard's Geriatric Medicine 8e Chapter ${ch.num}: ${title}. Focus on a specific threshold or decision rule a שלב א׳ examiner would test. Output only the JSON array.`;
    try {
      const text = await callAnthropic(prompt, 1500);
      const qs = parseQs(text, 'AI-Hard-Haz');
      out.push(...qs);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      if (/cost-cap/.test(e.message)) break;
    }
  }
  return out;
}

async function genFromHarrison(n) {
  const harPath = join(ROOT, 'harrison_chapters.json');
  if (!existsSync(harPath)) { console.error('harrison_chapters.json missing — skipping Harrison generation'); return []; }
  const har = JSON.parse(readFileSync(harPath, 'utf8'));
  // Same dict-keyed-by-number-string shape as hazzard_chapters.json.
  const usable = Object.entries(har)
    .map(([k, v]) => ({ num: Number(k), ...v }))
    .filter((ch) => Number.isFinite(ch.num));
  const picks = shuffle(usable).slice(0, Math.min(n, usable.length));
  const out = [];
  for (const ch of picks) {
    const title = ch.title || ch.name || `Ch ${ch.num}`;
    console.log(`→ Harrison Ch ${ch.num}: ${title}`);
    const prompt = `Generate 1 hard MCQ from Harrison's Internal Medicine 22e Chapter ${ch.num}: ${title}. Geriatric framing — patient ≥70, polypharmacy / frailty / cognitive caveats. Output only the JSON array.`;
    try {
      const text = await callAnthropic(prompt, 1500);
      const qs = parseQs(text, 'AI-Hard-Har');
      out.push(...qs);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      if (/cost-cap/.test(e.message)) break;
    }
  }
  return out;
}

async function genFromGrs8(n) {
  const grsPath = join(ROOT, 'data/grs8_chapters.json');
  if (!existsSync(grsPath)) { console.error('data/grs8_chapters.json missing — skipping GRS8 generation'); return []; }
  const grs = JSON.parse(readFileSync(grsPath, 'utf8'));
  const usable = (Array.isArray(grs) ? grs : Object.values(grs)).filter(Boolean);
  const picks = shuffle(usable).slice(0, Math.min(n, usable.length));
  const out = [];
  for (const ch of picks) {
    const title = ch.title || ch.name || ch.id || 'GRS8 Ch';
    console.log(`→ GRS8: ${title}`);
    const prompt = `Generate 1 hard MCQ in the GRS8 case-vignette style based on: ${title}. 5 options allowed (set c_accept properly). Output only the JSON array.`;
    try {
      const text = await callAnthropic(prompt, 1500);
      const qs = parseQs(text, 'AI-Hard-GRS8');
      out.push(...qs);
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      if (/cost-cap/.test(e.message)) break;
    }
  }
  return out;
}

// --- main ---
const generated = [];
if (N_HAZZARD > 0)  generated.push(...(await genFromHazzard(N_HAZZARD)));
if (N_HARRISON > 0) generated.push(...(await genFromHarrison(N_HARRISON)));
if (N_GRS8 > 0)     generated.push(...(await genFromGrs8(N_GRS8)));

let existing = [];
if (existsSync(OUT)) {
  existing = JSON.parse(readFileSync(OUT, 'utf8'));
  console.log(`→ Merging with ${existing.length} existing generated Qs in ${OUT}`);
}

const merged = [...existing, ...generated];
writeFileSync(OUT, JSON.stringify(merged, null, 2));
console.log(`\n✔ Wrote ${merged.length} Qs (${generated.length} new) to ${OUT}`);
console.log(`  Cost: $${priceUsd().toFixed(2)} (${COST.calls} calls, ${COST.inTok}+${COST.outTok} tokens)`);
console.log('Review, then manually merge into data/ai_hard_seed.json and rebuild.');
console.log('Per Geri CLAUDE.md content-edit rule: every accepted Q must have its source quoted before it lands.');
