#!/usr/bin/env node
/**
 * Harrison/Hazzard Hebrew ?[Hebrew] baseline scan (Geriatrics).
 *
 * Context: regressionGuards.test.js only runs the wrong-side punctuation
 * check against PAST_EXAM_TAGS. Hazzard / Harrison / Hazzard-suppl /
 * Exam-tagged questions (AI-generated, large pool) skip that gate, so
 * any `?[Hebrew]` artifact is invisible to CI.
 *
 * Enumerates every occurrence of `?` immediately preceding a Hebrew
 * letter (U+0590–U+05FF) in non-past-exam questions, writes a CSV
 * baseline to docs/harrison-hebrew-baseline.csv, and prints summary
 * counts per tag.
 *
 * Usage:  node scripts/harrison-hebrew-baseline.cjs
 *         node scripts/harrison-hebrew-baseline.cjs --strict
 *         HARRISON_HEBREW_BASELINE=10 node scripts/... --strict
 *
 * Output: docs/harrison-hebrew-baseline.csv
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Q_PATH = path.join(ROOT, 'data', 'questions.json');
const OUT_PATH = path.join(ROOT, 'docs', 'harrison-hebrew-baseline.csv');

// Mirrors Geriatrics regressionGuards.test.js PAST_EXAM_TAGS.
const PAST_EXAM_TAGS = new Set([
  '2020', '2021', '2021-Jun', '2022', '2023-Jun', '2023-Sep',
  '2024-May', '2024-Sep', '2025-Jun',
]);

const BAD_PUNCT_RE = /\?[\u0590-\u05FF]/g;

function scan() {
  const questions = JSON.parse(fs.readFileSync(Q_PATH, 'utf-8'));
  const rows = [];
  const byTag = new Map();
  questions.forEach((q, i) => {
    if (PAST_EXAM_TAGS.has(q.t)) return;
    const fields = [['q', q.q], ...(q.o || []).map((o, k) => [`o[${k}]`, o])];
    for (const [field, text] of fields) {
      if (!text) continue;
      const matches = [...String(text).matchAll(BAD_PUNCT_RE)];
      if (!matches.length) continue;
      byTag.set(q.t, (byTag.get(q.t) || 0) + matches.length);
      matches.forEach(m => {
        const at = m.index;
        const ctx = String(text).slice(Math.max(0, at - 20), at + 22);
        rows.push({
          idx: i,
          tag: q.t || '',
          field,
          offset: at,
          snippet: ctx.replace(/\s+/g, ' ').trim(),
        });
      });
    }
  });
  return { rows, byTag, total: questions.length };
}

function writeCsv(rows) {
  const header = 'idx,tag,field,offset,snippet\n';
  const escape = (s) => {
    const v = String(s == null ? '' : s);
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const body = rows
    .map(r => [r.idx, r.tag, r.field, r.offset, r.snippet].map(escape).join(','))
    .join('\n');
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, header + body + '\n', 'utf-8');
}

function main() {
  const { rows, byTag, total } = scan();
  writeCsv(rows);
  console.log(`scanned ${total} questions`);
  console.log(`wrote ${rows.length} ?[Hebrew] rows → ${path.relative(ROOT, OUT_PATH)}`);
  if (byTag.size === 0) {
    console.log('no ?[Hebrew] violations in non-past-exam tags');
  } else {
    console.log('by tag:');
    for (const [tag, n] of [...byTag.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${(tag || '(untagged)').padEnd(18)} ${n}`);
    }
  }

  if (process.argv.includes('--strict')) {
    const envVar = process.env.HARRISON_HEBREW_BASELINE;
    const budget = envVar ? Number(envVar) : rows.length;
    if (!Number.isFinite(budget)) {
      console.error('--strict requires HARRISON_HEBREW_BASELINE env as integer');
      process.exit(2);
    }
    if (rows.length > budget) {
      console.error(`FAIL: ${rows.length} violations > baseline ${budget}`);
      process.exit(1);
    }
    console.log(`OK: ${rows.length} <= baseline ${budget}`);
  }
}

main();
