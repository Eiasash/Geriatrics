#!/usr/bin/env node
'use strict';

/**
 * generate_distractors.cjs — Bulk distractor-autopsy generator for geriatrics MCQs
 *
 * Reads data/questions.json, generates "why each wrong answer is wrong /
 * when it WOULD be correct" for every question, writes to data/distractors.json.
 *
 * Schema of data/distractors.json:
 *   { "<qIdx>": ["", "rationale for opt1", "rationale for opt2", "rationale for opt3"], ... }
 *   - 4-element array index-aligned with q.o
 *   - empty string at the correct option index
 *   - each non-empty string contains: "Wrong because: X. Would be correct if: Y."
 *
 * Usage:
 *   node generate_distractors.cjs [options]
 *
 * Options:
 *   --dry-run          Print work plan, no API calls
 *   --limit N          Process only first N candidates
 *   --topic N          Only questions with ti===N
 *   --model NAME       sonnet | haiku | opus (default: haiku — fast, fits Netlify 10s fn timeout)
 *   --delay N          Ms between batches (default: 400)
 *   --batch N          Concurrent calls per batch (default: 3)
 *   --force            Re-generate even if distractors exist
 *   --help             Show this help
 *
 * Routing: uses toranot AI proxy (no API key needed).
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

const QUESTIONS_PATH   = path.resolve(__dirname, '..', 'data', 'questions.json');
const DISTRACTORS_PATH = path.resolve(__dirname, '..', 'data', 'distractors.json');

const PROXY_HOST   = 'toranot.netlify.app';
const PROXY_PATH   = '/api/claude';
const PROXY_SECRET = 'shlav-a-mega-2026';

const MODEL_MAP = {
  sonnet: 'claude-sonnet-4-6',
  opus:   'claude-opus-4-6',
  haiku:  'claude-haiku-4-5-20251001'
};

const MAX_TOKENS = 1200;
const SAVE_EVERY = 25;

const LETTERS = ['A','B','C','D','E'];

const SYSTEM_PROMPT =
  'You are a senior Israeli geriatric medicine board examiner. ' +
  'For each WRONG option of a multiple-choice question, you produce a concise distractor autopsy: ' +
  'why the option is wrong in THIS clinical scenario, and what scenario would make it the correct answer. ' +
  'Write in the same language as the question (Hebrew if Hebrew, English if English). ' +
  'Be precise and specific — name mechanisms, thresholds, or criteria. ' +
  'Respond ONLY with valid JSON in the exact shape requested. No markdown, no commentary.';

function buildUserPrompt(q) {
  const lines = [];
  lines.push('Question: ' + q.q);
  (q.o || []).forEach((o, i) => lines.push(`${LETTERS[i] || i}: ${o}`));
  lines.push(`Correct option index: ${q.c} (${LETTERS[q.c] || q.c})`);
  lines.push('');
  lines.push('For each WRONG option (NOT the correct one), produce JSON in this exact shape:');
  lines.push('{"distractors":[{"i":<option_index>,"wrong":"<1-2 sentences why wrong HERE>","right_if":"<1-2 sentences describing when it WOULD be correct>"}, ...]}');
  lines.push('Include exactly 3 entries (the 3 wrong options). Skip the correct option. Same language as the question.');
  return lines.join('\n');
}

function callProxyOnce(model, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });
    const options = {
      hostname: PROXY_HOST,
      path: PROXY_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': PROXY_SECRET,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        // Upstream timeouts come back as plain-text "Upstream timeout" from Netlify
        if (data && data.trim().startsWith('Upstream')) {
          return reject(new Error('proxy_timeout'));
        }
        try {
          const p = JSON.parse(data);
          if (p.content && p.content[0] && p.content[0].text) {
            resolve(p.content[0].text.trim());
          } else if (p.error) {
            reject(new Error(`API error: ${p.error.type||'?'} — ${p.error.message||data.slice(0,200)}`));
          } else {
            reject(new Error(`Unexpected: ${data.slice(0,300)}`));
          }
        } catch (e) {
          reject(new Error(`JSON parse: ${e.message}. Raw: ${data.slice(0,200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(120000, () => req.destroy(new Error('Timeout 120s')));
    req.write(body);
    req.end();
  });
}

async function callProxy(model, userPrompt, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await callProxyOnce(model, userPrompt); }
    catch (e) {
      lastErr = e;
      if (e.message !== 'proxy_timeout') throw e;
      await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr || new Error('proxy_timeout');
}

function parseResponse(rawText, q) {
  // Extract JSON (LLMs sometimes wrap in ```json or prose)
  let m = rawText.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in response');
  const parsed = JSON.parse(m[0]);
  const arr = parsed.distractors;
  if (!Array.isArray(arr)) throw new Error('distractors not array');

  const out = Array(q.o.length).fill('');
  for (const d of arr) {
    const i = d.i;
    if (typeof i !== 'number' || i < 0 || i >= q.o.length) continue;
    if (i === q.c) continue; // skip correct
    const wrong = String(d.wrong || '').trim();
    const rightIf = String(d.right_if || '').trim();
    if (!wrong && !rightIf) continue;
    out[i] = `Wrong because: ${wrong}${rightIf ? ' Would be correct if: ' + rightIf : ''}`;
  }

  // Verify all wrong options got rationale
  const missing = [];
  for (let i = 0; i < q.o.length; i++) {
    if (i === q.c) continue;
    if (!out[i]) missing.push(i);
  }
  if (missing.length) throw new Error(`Missing rationale for options ${missing.join(',')}`);
  return out;
}

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  try { fs.renameSync(tmp, filePath); }
  catch (e) { fs.writeFileSync(filePath, JSON.stringify(data), 'utf8'); try { fs.unlinkSync(tmp); } catch {} }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseArgs(argv) {
  const a = { dryRun:false, limit:null, topic:null, model:'haiku', delay:400, batch:3, force:false };
  for (let i=2; i<argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run': a.dryRun=true; break;
      case '--limit':   a.limit=parseInt(argv[++i],10); break;
      case '--topic':   a.topic=parseInt(argv[++i],10); break;
      case '--model':   a.model=argv[++i]; break;
      case '--delay':   a.delay=parseInt(argv[++i],10); break;
      case '--batch':   a.batch=parseInt(argv[++i],10); break;
      case '--force':   a.force=true; break;
      case '--help':
        const h = fs.readFileSync(__filename,'utf8').match(/\/\*\*([\s\S]*?)\*\//);
        if (h) console.log(h[0]); process.exit(0);
      default: console.warn('Unknown arg:', argv[i]);
    }
  }
  return a;
}

async function main() {
  const args = parseArgs(process.argv);
  const model = MODEL_MAP[args.model];
  if (!model) { console.error('Unknown model:', args.model); process.exit(1); }

  const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH,'utf8'));
  if (!Array.isArray(questions) || questions.length < 10) { console.error('questions.json malformed'); process.exit(1); }

  let existing = {};
  if (fs.existsSync(DISTRACTORS_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(DISTRACTORS_PATH,'utf8')); }
    catch (e) { console.error('distractors.json parse failed, starting fresh:', e.message); }
  }

  let candidates = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q, idx }) => {
      if (!q || !Array.isArray(q.o) || q.o.length < 2) return false;
      if (typeof q.c !== 'number') return false;
      if (!args.force && existing[idx] && Array.isArray(existing[idx]) && existing[idx].length === q.o.length) return false;
      return true;
    });

  if (args.topic !== null) candidates = candidates.filter(({q}) => q.ti === args.topic);
  if (args.limit !== null) candidates = candidates.slice(0, args.limit);

  console.log(`Total questions: ${questions.length}`);
  console.log(`Already have distractors: ${Object.keys(existing).length}`);
  console.log(`Candidates to process: ${candidates.length}`);
  console.log(`Model: ${model} | Batch: ${args.batch} | Delay: ${args.delay}ms`);

  if (args.dryRun) {
    candidates.slice(0,10).forEach(({q, idx}) => {
      console.log(`  idx=${idx} ti=${q.ti}: ${q.q.slice(0,80)}...`);
    });
    if (candidates.length > 10) console.log(`  ... +${candidates.length-10} more`);
    process.exit(0);
  }
  if (candidates.length === 0) { console.log('Nothing to do.'); process.exit(0); }

  let ok=0, fail=0, sinceSave=0;
  const failures = [];

  for (let s=0; s<candidates.length; s+=args.batch) {
    const batch = candidates.slice(s, s+args.batch);
    const bn = Math.floor(s/args.batch)+1;
    const tb = Math.ceil(candidates.length/args.batch);
    process.stdout.write(`Batch ${bn}/${tb} `);

    const results = await Promise.allSettled(
      batch.map(({q, idx}) =>
        callProxy(model, buildUserPrompt(q))
          .then(txt => ({ idx, q, txt }))
      )
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        try {
          const arr = parseResponse(r.value.txt, r.value.q);
          existing[r.value.idx] = arr;
          ok++; sinceSave++;
          process.stdout.write('✓');
        } catch (e) {
          fail++; failures.push({ idx: r.value.idx, err: e.message });
          process.stdout.write('✗');
        }
      } else {
        fail++;
        const m = r.reason && r.reason.message || 'unknown';
        failures.push({ err: m });
        process.stdout.write('✗');
      }
    }
    process.stdout.write(` (${ok} ok, ${fail} fail)\n`);

    if (sinceSave >= SAVE_EVERY) {
      atomicWriteJson(DISTRACTORS_PATH, existing);
      sinceSave = 0;
      console.log(`  [checkpoint] saved ${Object.keys(existing).length} total`);
    }
    if (s + args.batch < candidates.length) await sleep(args.delay);
  }

  atomicWriteJson(DISTRACTORS_PATH, existing);
  console.log(`\nDone. ${ok} ok, ${fail} fail. Total in file: ${Object.keys(existing).length}`);
  if (failures.length) {
    console.log('\nFirst 5 failures:');
    failures.slice(0,5).forEach(f => console.log(' ', JSON.stringify(f)));
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
