#!/usr/bin/env node
// Audit-6 Option-0 (2026-05-18) — CLI: bucket judge parse-failures from a
// chaos-doctor-bot-v4 JSONL ledger into the audit-6 ternary.
//
// Usage:
//   node scripts/bucketJudgeParseFailures.mjs <ledger.jsonl> [more.jsonl ...]
//
// Reads bot bug-log JSONL (one JSON object per line — the bot's log.bugs
// entries), filters ai-parse-error/context=judge, applies the rule from
// scripts/lib/bucketParseFailures.mjs (single source of truth, unit-pinned
// by tests/chaosBotV4BucketRule.test.js), prints a JSON summary.
//
// This is the "bucket" half of the audit-6 "run one bounded sample,
// bucket" step — it is read-only and FREE (operates on whatever ledger
// already exists). The bounded SAMPLE itself (paid judge calls) is a
// user-triggered op: `scripts/long-chaos-run.sh` (proxy mode), then point
// this at chaos-reports/v4/<run>/medical_findings_ai_v4.jsonl or the
// bug-log it writes. Mirror of the audit-5 oracle's print-JSON style.

import { readFileSync } from 'node:fs';
import { summarizeLedger } from './lib/bucketParseFailures.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('usage: node scripts/bucketJudgeParseFailures.mjs <ledger.jsonl> [...]');
  process.exit(2);
}

const rows = [];
for (const f of files) {
  let raw;
  try {
    raw = readFileSync(f, 'utf8');
  } catch (e) {
    console.error(`cannot read ${f}: ${e.message}`);
    process.exit(2);
  }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    try { rows.push(JSON.parse(s)); } catch { /* skip non-JSON lines */ }
  }
}

const summary = summarizeLedger(rows);
console.log(JSON.stringify(summary, null, 2));

// Operator verdict. The DECISION INPUT is the UNDERLYING population
// (every first-attempt failure) — NOT the residual. The residual +
// reconciliation are printed as diagnostics, never as the routing basis.
const c = summary.counts;
const rc = summary.residual_counts;
const rec = summary.reconciliation;
console.log(
  `\n# UNDERLYING (decision input — ${summary.total} first-attempt judge failures):\n` +
  `  truncation(a)=${c.truncation} -> Geri max_tokens, ZERO Toranot | ` +
  `genuine_prose(b)=${c.genuine_prose} -> the ONLY Toranot conversation | ` +
  `wrong_shape=${c.wrong_shape} -> Geri prompt/schema | ` +
  `ambiguous=${c.ambiguous} -> eyeball THIS bucket's raw text | ` +
  `empty=${c.empty} unknown=${c.unknown}`,
);
console.log(
  `# residual (diagnostic — recovered:false, ≡ retry's class-dependent miss): ` +
  `trunc=${rc.truncation} prose=${rc.genuine_prose} wrong=${rc.wrong_shape} ` +
  `ambig=${rc.ambiguous} empty=${rc.empty} unk=${rc.unknown}`,
);
console.log(
  `# reconciliation: firstfail(recovered:false)=${rec.firstfail_unrecovered} ` +
  `vs ai-parse-error=${rec.ai_parse_error} -> ${rec.match ? 'OK' : 'MISMATCH (instrument drift / pre-instrument ledger)'}`,
);
if (summary.total === 0) {
  console.log(
    '# NOTE: 0 underlying rows. A pre-instrument ledger cannot answer the ' +
    'audit-6 question — run a fresh bounded long-chaos-run.sh; there is no shortcut.',
  );
}
