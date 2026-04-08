#!/usr/bin/env node
'use strict';

/**
 * generate_explanations.cjs — Bulk AI explanation generator for geriatrics MCQs
 *
 * Reads questions.json, calls Claude API for each question missing a good explanation,
 * and writes the result back to questions.json with periodic checkpoints.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node generate_explanations.cjs [options]
 *
 * Options:
 *   --dry-run        Print what would be done without calling API or writing files
 *   --limit N        Process only the first N questions needing explanations
 *   --topic N        Process only questions with ti === N
 *   --delay N        Milliseconds between batches (default: 500)
 *   --help           Show this help
 *
 * API key resolution order:
 *   1. ANTHROPIC_API_KEY environment variable
 *   2. ../config.json (JSON file with { "apiKey": "sk-..." })
 */

const fs    = require('fs');
const https = require('https');
const path  = require('path');

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTIONS_PATH = path.resolve(__dirname, '..', 'questions.json');
const CONFIG_PATH    = path.resolve(__dirname, '..', 'config.json');

const MODEL          = 'claude-opus-4-6';
const MAX_TOKENS     = 700;   // ~200 words + some margin
const BATCH_SIZE     = 5;     // concurrent API calls per batch
const SAVE_EVERY     = 50;    // write to disk every N completions

const SYSTEM_PROMPT =
  'You are a senior geriatric medicine specialist and expert medical educator. ' +
  'For the multiple-choice question provided, write a clinical explanation that covers: ' +
  '(1) Why the correct answer is correct — include specific clinical reasoning and mechanisms. ' +
  'Cite Hazzard\'s Geriatric Medicine or Harrison\'s Internal Medicine by chapter or principle where relevant. ' +
  '(2) Why each wrong answer is incorrect — be specific about the error in each distractor. ' +
  '(3) A brief clinical pearl or exam tip relevant to the topic. ' +
  'Write in clear prose paragraphs (not bullet points). Keep the total under 200 words. ' +
  'Write in Hebrew (עברית) if the question is in Hebrew; write in English if the question is in English. ' +
  'Do not repeat or paraphrase the question text. Start directly with the explanation.';

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, topic: null, delay: 500 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':  args.dryRun = true; break;
      case '--limit':    args.limit  = parseInt(argv[++i], 10); break;
      case '--topic':    args.topic  = parseInt(argv[++i], 10); break;
      case '--delay':    args.delay  = parseInt(argv[++i], 10); break;
      case '--help':
        const header = fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//);
        if (header) console.log(header[0]);
        process.exit(0);
        break;
      default:
        console.warn(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

// ─── API key loading ──────────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      if (cfg.apiKey) return cfg.apiKey;
    } catch (e) {
      console.error(`Warning: Could not parse ${CONFIG_PATH}: ${e.message}`);
    }
  }
  return null;
}

// ─── Atomic JSON write ────────────────────────────────────────────────────────

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch (e) {
    // Windows can fail rename if target is locked; fall back to direct write
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// ─── Claude API call ──────────────────────────────────────────────────────────

function callClaude(apiKey, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'anthropic-version':  '2023-06-01',
        'x-api-key':          apiKey,
        'Content-Length':     Buffer.byteLength(body)
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.content && parsed.content[0] && parsed.content[0].text) {
            resolve(parsed.content[0].text.trim());
          } else if (parsed.error) {
            reject(new Error(`API error: ${parsed.error.type} — ${parsed.error.message}`));
          } else {
            reject(new Error(`Unexpected response: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}. Raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy(new Error('Request timed out after 60s'));
    });
    req.write(body);
    req.end();
  });
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function buildUserPrompt(q) {
  const lines = [`Question: ${q.q}`];

  if (Array.isArray(q.o) && q.o.length > 0) {
    q.o.forEach((opt, i) => {
      lines.push(`${LETTERS[i] || i + 1}: ${opt}`);
    });
    const correctLetter = LETTERS[q.c] || q.c;
    const correctText   = q.o[q.c] || '(unknown)';
    lines.push(`Correct answer: ${correctLetter} — ${correctText}`);
  } else if (q.a) {
    lines.push(`Correct answer: ${q.a}`);
  }

  return lines.join('\n');
}

// ─── Skip logic ───────────────────────────────────────────────────────────────

// BAD_PATTERNS: keyword-matching artifacts that indicate a recycled/wrong explanation
const BAD_PATTERNS = ['SPRINT trial', 'pain ladder'];

function needsExplanation(q) {
  if (!q.e || q.e.trim().length <= 100) return true;
  for (const pat of BAD_PATTERNS) {
    if (q.e.includes(pat)) return true;
  }
  return false;
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!fs.existsSync(QUESTIONS_PATH)) {
    console.error(`ERROR: questions.json not found at ${QUESTIONS_PATH}`);
    process.exit(1);
  }

  let questions;
  try {
    questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, 'utf8'));
  } catch (e) {
    console.error(`ERROR: Failed to parse questions.json: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(questions) || questions.length < 10) {
    console.error(`ERROR: questions.json has ${Array.isArray(questions) ? questions.length : 'non-array'} entries — aborting.`);
    process.exit(1);
  }

  console.log(`Loaded ${questions.length} questions from questions.json`);

  // Build candidate list
  let candidates = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q }) => needsExplanation(q));

  if (args.topic !== null) {
    candidates = candidates.filter(({ q }) => q.ti === args.topic);
    console.log(`Filtered to topic ${args.topic}: ${candidates.length} need explanations`);
  } else {
    console.log(`Questions needing explanations: ${candidates.length}`);
  }

  if (args.limit !== null) {
    candidates = candidates.slice(0, args.limit);
    console.log(`--limit ${args.limit}: processing ${candidates.length} questions`);
  }

  if (candidates.length === 0) {
    console.log('All questions already have good explanations. Done!');
    process.exit(0);
  }

  // Dry run
  if (args.dryRun) {
    console.log('\n--- DRY RUN (no API calls) ---\n');
    candidates.forEach(({ q, idx }, i) => {
      const preview = buildUserPrompt(q).slice(0, 100).replace(/\n/g, ' ');
      console.log(`[${i + 1}/${candidates.length}] idx=${idx} ti=${q.ti}: ${preview}...`);
    });
    console.log('\nDry run complete.');
    process.exit(0);
  }

  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error(
      'ERROR: No API key found.\n' +
      '  Set ANTHROPIC_API_KEY env var, or create config.json with {"apiKey":"sk-..."}'
    );
    process.exit(1);
  }

  console.log(`Model: ${MODEL} | Batch size: ${BATCH_SIZE} | Delay: ${args.delay}ms | Save every: ${SAVE_EVERY}`);
  console.log('Starting...\n');

  let successCount = 0;
  let errorCount   = 0;
  let sinceSave    = 0;

  // Process in batches of BATCH_SIZE (parallel within batch, delay between batches)
  for (let batchStart = 0; batchStart < candidates.length; batchStart += BATCH_SIZE) {
    const batch = candidates.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (questions ${batchStart + 1}–${Math.min(batchStart + BATCH_SIZE, candidates.length)} of ${candidates.length})`);

    // Run batch in parallel
    const results = await Promise.allSettled(
      batch.map(({ q, idx }) => callClaude(apiKey, buildUserPrompt(q)).then(text => ({ idx, text })))
    );

    // Apply results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { idx, text } = result.value;
        questions[idx].e = text;
        successCount++;
        sinceSave++;
        console.log(`  ✓ idx=${idx} (${text.length} chars)`);
      } else {
        errorCount++;
        console.error(`  ✗ ERROR: ${result.reason.message}`);
      }
    }

    // Checkpoint save every SAVE_EVERY completions
    if (sinceSave >= SAVE_EVERY) {
      try {
        atomicWriteJson(QUESTIONS_PATH, questions);
        console.log(`  [checkpoint] Saved (${successCount} done so far)`);
        sinceSave = 0;
      } catch (e) {
        console.error(`  [checkpoint] Save failed: ${e.message}`);
      }
    }

    // Delay between batches (skip after last)
    if (batchStart + BATCH_SIZE < candidates.length) {
      await sleep(args.delay);
    }
  }

  // Final save (only if anything was written)
  if (successCount > 0) {
    try {
      atomicWriteJson(QUESTIONS_PATH, questions);
      console.log(`\nFinal save complete.`);
    } catch (e) {
      console.error(`ERROR: Final save failed: ${e.message}`);
      process.exit(1);
    }
  }

  console.log(`\nDone! ${successCount} explanations generated, ${errorCount} errors.`);
  if (errorCount > 0) console.log('Re-run to retry failed questions.');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
