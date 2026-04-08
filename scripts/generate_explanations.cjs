#!/usr/bin/env node
'use strict';

/**
 * generate_explanations.js — Bulk AI explanation generator for geriatrics MCQs
 *
 * Usage:
 *   node generate_explanations.js [options]
 *
 * Options:
 *   --dry-run        Print what would be done without calling API or writing files
 *   --limit N        Process only the first N questions lacking explanations
 *   --topic N        Process only questions with ti === N
 *   --delay N        Milliseconds between API calls (default: 1000)
 *   --help           Show this help message
 *
 * API key resolution order:
 *   1. ANTHROPIC_API_KEY environment variable
 *   2. ../config.json (JSON file with { "apiKey": "sk-..." })
 *
 * Example:
 *   ANTHROPIC_API_KEY=sk-ant-... node generate_explanations.js --limit 10
 *   node generate_explanations.js --topic 5 --dry-run
 */

const fs   = require('fs');
const https = require('https');
const path  = require('path');

// ─── Constants ───────────────────────────────────────────────────────────────

const QUESTIONS_PATH = path.resolve(__dirname, '..', 'questions.json');
const CACHE_PATH     = path.resolve(__dirname, '..', 'explanations_cache.json');
const CONFIG_PATH    = path.resolve(__dirname, '..', 'config.json');
const SAVE_EVERY     = 10; // write progress every N completions

const MODEL          = 'claude-opus-4-6';
const MAX_TOKENS     = 600;

const SYSTEM_PROMPT =
  'You are a senior geriatrician preparing a colleague for the Israeli IMA Shlav A (שלב א) geriatrics board exam. ' +
  'Generate a concise clinical explanation (3-5 sentences, max 500 tokens) for the correct answer. ' +
  'Structure: ✅ נכון (LETTER): one-line reason → then clinical mechanism (cite Hazzard\'s/Harrison\'s if relevant) → ' +
  '❌ briefly destroy each wrong answer (one line each) → 📌 פנינת מבחן: one exam-extractable takeaway. ' +
  'Write in Hebrew. Drug names and medical terms in Latin script. Be direct, mechanism-based, no hedging.';

// ─── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, topic: null, delay: 1000 };
  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--dry-run':  args.dryRun = true; break;
      case '--limit':    args.limit  = parseInt(argv[++i], 10); break;
      case '--topic':    args.topic  = parseInt(argv[++i], 10); break;
      case '--delay':    args.delay  = parseInt(argv[++i], 10); break;
      case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[0]);
        process.exit(0);
        break;
      default:
        console.warn(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

// ─── API key loading ─────────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
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

// ─── Atomic JSON write ───────────────────────────────────────────────────────

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ─── Claude API call ─────────────────────────────────────────────────────────

function callClaude(apiKey, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body)
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
            reject(new Error(`Unexpected response: ${data}`));
          }
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}. Raw: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timed out after 30s'));
    });
    req.write(body);
    req.end();
  });
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

function buildUserPrompt(q) {
  const lines = [`Question: ${q.q}`];

  if (Array.isArray(q.o) && q.o.length > 0) {
    lines.push(`Options: ${q.o.join(' | ')}`);
    const correctText = typeof q.c === 'number' && q.o[q.c] != null
      ? q.o[q.c]
      : (q.a || '(unknown)');
    lines.push(`Correct answer: ${correctText}`);
  } else if (q.a) {
    lines.push(`Correct answer: ${q.a}`);
  }

  return lines.join('\n');
}

// ─── Sleep helper ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Load questions
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

  if (!Array.isArray(questions)) {
    console.error('ERROR: questions.json must be a JSON array.');
    process.exit(1);
  }

  // Sanity check
  if (questions.length < 10) {
    console.warn(`WARNING: questions.json has only ${questions.length} entries — file may be empty or corrupted. Aborting.`);
    process.exit(1);
  }

  console.log(`Loaded ${questions.length} questions from questions.json`);

  // Load explanations cache
  let exCache = {};
  try { exCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
  console.log(`Loaded ${Object.keys(exCache).length} cached explanations`);

  // Filter candidates — skip if already has good explanation in q.e OR in cache
  let candidates = questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ q, idx }) => {
      if (q.e && q.e.trim() !== '') return false;
      const cached = exCache[String(idx)];
      if (cached && cached.text && cached.text.includes('מנגנון') ) return false; // already has clinical detail
      return true;
    });

  if (args.topic !== null) {
    candidates = candidates.filter(({ q }) => q.ti === args.topic);
    console.log(`Filtered to topic ${args.topic}: ${candidates.length} questions need explanations`);
  } else {
    console.log(`Questions needing explanations: ${candidates.length}`);
  }

  if (args.limit !== null) {
    candidates = candidates.slice(0, args.limit);
    console.log(`Applying --limit ${args.limit}: processing ${candidates.length} questions`);
  }

  if (candidates.length === 0) {
    console.log('No questions to process. All done!');
    process.exit(0);
  }

  // Dry-run mode
  if (args.dryRun) {
    console.log('\n--- DRY RUN MODE --- (no API calls, no writes)\n');
    candidates.forEach(({ q, idx }, i) => {
      const prompt = buildUserPrompt(q);
      console.log(`[${i + 1}/${candidates.length}] Would generate explanation for question index ${idx} (ti=${q.ti})`);
      console.log(`  Prompt preview: ${prompt.slice(0, 120).replace(/\n/g, ' ')}...`);
    });
    console.log('\nDry run complete.');
    process.exit(0);
  }

  // Load API key for real run
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error(
      'ERROR: No API key found.\n' +
      '  Set ANTHROPIC_API_KEY environment variable, or create ../config.json with {"apiKey":"sk-..."}'
    );
    process.exit(1);
  }

  // Process questions
  let successCount = 0;
  let errorCount   = 0;
  let savesSinceCheckpoint = 0;

  for (let i = 0; i < candidates.length; i++) {
    const { q, idx } = candidates[i];
    const label = `[${i + 1}/${candidates.length}]`;

    console.log(`${label} Generating explanation for question index ${idx} (ti=${q.ti})...`);

    const userPrompt = buildUserPrompt(q);

    try {
      const explanation = await callClaude(apiKey, SYSTEM_PROMPT, userPrompt);
      questions[idx].e = explanation;
      exCache[String(idx)] = { text: explanation };
      successCount++;
      savesSinceCheckpoint++;
      console.log(`${label} Done. (${explanation.length} chars)`);
    } catch (err) {
      errorCount++;
      console.error(`${label} ERROR: ${err.message} — skipping this question.`);
    }

    // Periodic save every SAVE_EVERY completions
    if (savesSinceCheckpoint >= SAVE_EVERY) {
      try {
        atomicWriteJson(QUESTIONS_PATH, questions);
        atomicWriteJson(CACHE_PATH, exCache);
        console.log(`  [checkpoint] Saved progress (${successCount} explanations so far)`);
        savesSinceCheckpoint = 0;
      } catch (writeErr) {
        console.error(`  [checkpoint] WARNING: Failed to save checkpoint: ${writeErr.message}`);
      }
    }

    // Rate limiting: wait between calls (skip after last item)
    if (i < candidates.length - 1) {
      await sleep(args.delay);
    }
  }

  // Final save
  try {
    atomicWriteJson(QUESTIONS_PATH, questions);
    atomicWriteJson(CACHE_PATH, exCache);
    console.log(`\nFinal save complete.`);
  } catch (writeErr) {
    console.error(`ERROR: Final save failed: ${writeErr.message}`);
    process.exit(1);
  }

  console.log(`\nDone! ${successCount} explanations generated, ${errorCount} errors.`);
  if (errorCount > 0) {
    console.log('Re-run the script to retry failed questions.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
