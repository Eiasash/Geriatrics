#!/usr/bin/env node
// verify_questions.mjs — answer-key ⟺ explanation consistency judge.
//
// Eias's rule (2026-06-06): a model re-checks each question's marked answer key
// against its own explanation. A "conflict" is a question whose explanation's
// clinical reasoning clearly concludes a DIFFERENT option is correct than the
// one(s) the key accepts. Conflicts are the *unresolvable minority* — we DELETE
// them, we do NOT flag for human review.
//
// Decision rule (BINARY, locked — do not retune to squeak under the gate):
//   conflicts / total <  0.10  -> auto-DELETE conflicts, write survivors back.
//   conflicts / total >= 0.10  -> STOP. Write nothing. Exit 1. Report the rate.
//
// The accepted set for each Q is {c} ∪ c_accept (c_accept already includes c in
// this dataset). The judge is asked whether the explanation supports ANY accepted
// index — an explanation that endorses a legitimate c_accept alternative is NOT a
// conflict. API/parse failures ABSTAIN (never counted as a conflict — we do not
// delete on a network error).
//
// Usage:
//   node scripts/verify_questions.mjs data/highyield.generated.json [--limit N] [--dry-run]
//
//   --limit N   judge only the first N (validation pass; never writes when set)
//   --dry-run   judge all, report, but do not modify the file
//
// Model: claude-sonnet-4-6 via the Toranot proxy (x-api-secret). temperature 0.

import fs from 'fs';

const TORANOT_URL = 'https://toranot.netlify.app/api/claude';
const TORANOT_DEFAULT_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const KEY = process.env.TORANOT_API_SECRET || TORANOT_DEFAULT_SECRET;
const MODEL = process.env.VERIFY_MODEL || 'claude-sonnet-4-6';
const CONCURRENCY = Number(process.env.VERIFY_CONCURRENCY || 6);
const STOP_THRESHOLD = 0.10; // >= 10% conflicts -> STOP

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const limitArg = args.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg ? Number(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1]) : null;
const DRY_RUN = args.includes('--dry-run') || LIMIT != null; // --limit never writes

if (!file) { console.error('usage: node scripts/verify_questions.mjs <file.json> [--limit N] [--dry-run]'); process.exit(2); }

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYS = [
  'You are a board-certified geriatrician auditing a medical multiple-choice question bank.',
  'You are given a question, its lettered options, the set of answer letters the KEY accepts as correct, and a written explanation that was generated for this question.',
  'Your ONLY job: decide whether the explanation\'s clinical reasoning is CONSISTENT with the key — i.e. the explanation argues for (or is at least compatible with) one of the accepted answer letters.',
  'A CONFLICT exists ONLY when the explanation clearly and specifically concludes that a DIFFERENT, non-accepted option is the correct answer (it names or describes a different option as correct, contradicting the key).',
  'NOT a conflict: a thin/terse explanation, an explanation that merely restates the question, an explanation that is vague, or one that supports any accepted letter. When unsure, it is CONSISTENT.',
  'Reply with STRICT JSON only, no prose: {"consistent": true|false, "explanation_endorses": "<single letter A-F, or NONE if it does not clearly point at one option>", "confidence": 0-100}',
].join(' ');

function buildUser(q) {
  const opts = q.o.map((o, i) => `${LETTERS[i]}. ${o}`).join('\n');
  const accepted = (Array.isArray(q.c_accept) && q.c_accept.length ? q.c_accept : [q.c])
    .filter((i) => Number.isInteger(i) && i >= 0 && i < q.o.length)
    .map((i) => LETTERS[i]);
  return [
    `QUESTION:\n${q.q}`,
    `OPTIONS:\n${opts}`,
    `KEY ACCEPTS: ${accepted.join(', ')}`,
    `EXPLANATION:\n${q.e}`,
    'Is the explanation consistent with the key? Reply with the strict JSON only.',
  ].join('\n\n');
}

function parseVerdict(text) {
  if (!text) return null;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (typeof o.consistent !== 'boolean') return null;
    return o;
  } catch { return null; }
}

async function judge(q, retries = 3) {
  const body = {
    model: MODEL,
    max_tokens: 200,
    temperature: 0,
    system: SYS,
    messages: [{ role: 'user', content: buildUser(q) }],
  };
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(TORANOT_URL, {
        method: 'POST',
        headers: { 'x-api-secret': KEY, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) { await sleep((attempt + 1) * 1500); continue; }
      if (!res.ok) { lastErr = new Error(`proxy ${res.status}: ${(await res.text()).slice(0, 160)}`); break; }
      const data = await res.json();
      const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
      const v = parseVerdict(text);
      if (!v) { lastErr = new Error('unparseable: ' + text.slice(0, 120)); continue; }
      return v;
    } catch (e) { lastErr = e; await sleep((attempt + 1) * 800); }
  }
  return { __abstain: true, __err: String(lastErr && lastErr.message || lastErr) };
}

// Bounded-concurrency map preserving input order.
async function mapPool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if ((i + 1) % 25 === 0) process.stderr.write(`  judged ${i + 1}/${items.length}\n`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

(async () => {
  const all = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(all)) { console.error('file is not a JSON array'); process.exit(2); }
  const subset = LIMIT != null ? all.slice(0, LIMIT) : all;
  console.error(`[verify] judging ${subset.length}/${all.length} questions, model=${MODEL}, concurrency=${CONCURRENCY}${DRY_RUN ? ' (DRY-RUN, no writes)' : ''}`);

  const verdicts = await mapPool(subset, CONCURRENCY, (q) => judge(q));

  const conflicts = [];
  const abstains = [];
  verdicts.forEach((v, i) => {
    if (v.__abstain) { abstains.push({ i, err: v.__err }); return; }
    // conflict = explanation clearly endorses a specific NON-accepted option.
    const accepted = new Set((Array.isArray(subset[i].c_accept) && subset[i].c_accept.length ? subset[i].c_accept : [subset[i].c]).map((x) => LETTERS[x]));
    const endorses = String(v.explanation_endorses || 'NONE').trim().toUpperCase();
    const isConflict = v.consistent === false && /^[A-F]$/.test(endorses) && !accepted.has(endorses);
    if (isConflict) conflicts.push({ i, endorses, accepted: [...accepted], confidence: v.confidence, q: String(subset[i].q).slice(0, 70) });
  });

  const total = subset.length;
  const rate = conflicts.length / total;
  console.error(`\n[verify] total=${total} conflicts=${conflicts.length} abstains=${abstains.length} rate=${(rate * 100).toFixed(2)}%`);
  if (abstains.length) console.error(`[verify] WARNING ${abstains.length} abstentions (API/parse failures): ${JSON.stringify(abstains.slice(0, 5))}`);
  if (conflicts.length) console.error('[verify] conflict samples:\n' + conflicts.slice(0, 10).map((c) => `  #${c.i} key=${c.accepted} expl->${c.endorses} conf=${c.confidence} :: ${c.q}`).join('\n'));

  const summary = { file, total, conflicts: conflicts.length, abstains: abstains.length, rate, threshold: STOP_THRESHOLD, conflict_indices: conflicts.map((c) => c.i) };

  if (rate >= STOP_THRESHOLD) {
    console.error(`\n[verify] STOP — conflict rate ${(rate * 100).toFixed(2)}% >= ${STOP_THRESHOLD * 100}%. Writing nothing.`);
    console.log(JSON.stringify({ ...summary, action: 'STOP' }, null, 2));
    process.exit(1);
  }

  if (DRY_RUN) {
    console.error(`\n[verify] under threshold — would delete ${conflicts.length}. (no write: ${LIMIT != null ? '--limit' : '--dry-run'})`);
    console.log(JSON.stringify({ ...summary, action: 'DRY_RUN' }, null, 2));
    return;
  }

  // Delete conflicts, preserve original order of survivors.
  const conflictSet = new Set(conflicts.map((c) => c.i));
  const survivors = all.filter((_, i) => !conflictSet.has(i));
  fs.writeFileSync(file, JSON.stringify(survivors, null, 2) + '\n', 'utf8');
  console.error(`\n[verify] DELETED ${conflicts.length} conflicts. ${survivors.length} survivors written to ${file}.`);
  console.log(JSON.stringify({ ...summary, action: 'DELETED', survivors: survivors.length }, null, 2));
})();
