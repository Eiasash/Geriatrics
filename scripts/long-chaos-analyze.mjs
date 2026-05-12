#!/usr/bin/env node
// long-chaos-analyze.mjs — takes a chaos-reports/v4-long directory and
// produces three audit reports from medical_findings_ai_v4.jsonl:
//
//   1. explanation_soundness_review.md
//        Qs where judge.explanation_sound=false at conf >= 85
//        → candidates for explanation regen
//   2. citation_plausibility_review.md
//        Qs where source.citation_plausible=false (any conf)
//        → wrong chapter pointers (Track-R 1547 Hazzard realign verification)
//   3. answer_key_disagreement_review.md
//        Qs where judge.app_answer_correct=false at conf >= 90
//        AND correct_letter_if_app_wrong is set
//        → curator review candidates (DO NOT auto-flip — see CLAUDE.md
//          "110 curator overrides" section; ~70% of IMA-vs-textbook
//          conflicts in spot-checks favor textbook, but the 30% where IMA
//          is right means the signal is a triage queue, not a fix)
//
// Plus a top-level summary.md with all the rates.

import fs from 'node:fs';
import path from 'node:path';

const reportDir = process.argv[2];
if (!reportDir) {
  console.error('usage: long-chaos-analyze.mjs <report-dir>');
  process.exit(1);
}

const jsonlPath = path.join(reportDir, 'medical_findings_ai_v4.jsonl');
if (!fs.existsSync(jsonlPath)) {
  console.error(`no ledger at ${jsonlPath}`);
  process.exit(1);
}

const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
const findings = lines.map((ln) => {
  try { return JSON.parse(ln); } catch { return null; }
}).filter(Boolean);

const judged = findings.filter((f) => f.judge && !f.methodology);
const methodology = findings.filter((f) => f.methodology);
const withSource = judged.filter((f) => f.source);

// === Audit 1: explanation soundness ===
const explUnsound = judged.filter((f) => f.judge.explanation_sound === false && (f.judge.confidence || 0) >= 85);

// === Audit 2: citation plausibility ===
const citeImplausible = withSource.filter((f) => f.source.citation_plausible === false);

// === Audit 3: answer-key disagreements ===
const keyDisagree = judged.filter(
  (f) => f.judge.app_answer_correct === false
    && (f.judge.confidence || 0) >= 90
    && f.judge.correct_letter_if_app_wrong,
);

// === Topic coverage ===
const topics = {};
for (const f of findings) {
  const stem = (f.stem || '').slice(0, 60);
  topics[stem] = (topics[stem] || 0) + 1;
}
const repeatedStems = Object.entries(topics).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

function pct(n, d) { return d ? `${(100 * n / d).toFixed(1)}%` : '—'; }

const fmtFinding = (f, extras = []) => {
  const lines = [
    `### Q (stem hash ${(f.stem || '').slice(0, 12)})`,
    '',
    '**Stem:** ' + (f.stem || '').slice(0, 300),
    '',
    '**Options:**',
    ...(f.options || []).map((o, i) => `- ${'ABCD'[i]}. ${o.slice(0, 120)}`),
    '',
    `**AI pick:** ${f.aiLetter} (conf ${f.aiConf}) — ${(f.aiWhy || '').slice(0, 200)}`,
    `**App key:** ${f.appLetter} (idx ${f.appIdx})`,
    `**Disagree:** ${f.disagrees}`,
    ...extras,
    '',
  ];
  return lines.join('\n');
};

// === Write reports ===
const summary = [
  '# Long chaos run — audit summary',
  '',
  `- Total findings recorded: **${findings.length}**`,
  `- Successfully judged: **${judged.length}** (${pct(judged.length, findings.length)})`,
  `- Methodology events: ${methodology.length} (${pct(methodology.length, findings.length)})`,
  `- Source-checks fired: ${withSource.length} (${pct(withSource.length, judged.length)} of judged)`,
  '',
  '## Audit-class hit rates',
  '',
  `| Audit | Hits | of base | Output file |`,
  `|---|---:|---:|---|`,
  `| 1. Unsound explanations (conf≥85) | ${explUnsound.length} | ${pct(explUnsound.length, judged.length)} of judged | \`explanation_soundness_review.md\` |`,
  `| 2. Implausible citations | ${citeImplausible.length} | ${pct(citeImplausible.length, withSource.length)} of source-checked | \`citation_plausibility_review.md\` |`,
  `| 3. Key disagreements (conf≥90) | ${keyDisagree.length} | ${pct(keyDisagree.length, judged.length)} of judged | \`answer_key_disagreement_review.md\` |`,
  '',
  '## Coverage',
  '',
  `- Distinct question stems sampled: **${Object.keys(topics).length}**`,
  `- Stems sampled >1×: ${repeatedStems.length}`,
  ...(repeatedStems.length
    ? ['', 'Top repeated stems:', ...repeatedStems.slice(0, 5).map(([s, n]) => `- ×${n}: ${s}`)]
    : []),
  '',
  '## Triage rule (load-bearing)',
  '',
  'Audit 3 (key disagreements) is a **triage queue, not a fix**. Per CLAUDE.md "110 curator overrides" stanza, ~70% of IMA-vs-textbook conflicts in spot-checks favor textbook — but the 30% where IMA is right means each flagged Q needs human curator review against the audit_logs/curator_overrides.json registry before any `q.c` flip. Do NOT auto-apply.',
  '',
  'Audits 1 and 2 are fix-class: the hits are direct candidates for explanation regen and chapter-ref realignment, respectively.',
  '',
].join('\n');

fs.writeFileSync(path.join(reportDir, 'summary.md'), summary);

fs.writeFileSync(
  path.join(reportDir, 'explanation_soundness_review.md'),
  '# Audit 1: Unsound explanations (conf ≥ 85)\n\n' +
  `Total flagged: **${explUnsound.length}** of ${judged.length} judged.\n\n` +
  (explUnsound.length === 0
    ? '_No unsound explanations at the conf≥85 threshold. Either explanations are solid or the sample is small._\n'
    : explUnsound.map((f) => fmtFinding(f, [
        `**Judge confidence:** ${f.judge.confidence}`,
        `**Issue:** ${f.judge.issue || '(none reported)'}`,
      ])).join('\n---\n\n')),
);

fs.writeFileSync(
  path.join(reportDir, 'citation_plausibility_review.md'),
  '# Audit 2: Implausible citations\n\n' +
  `Total flagged: **${citeImplausible.length}** of ${withSource.length} source-checked.\n\n` +
  (citeImplausible.length === 0
    ? '_No implausible citations flagged. Track-R Hazzard realignment passes spot-check._\n'
    : citeImplausible.map((f) => fmtFinding(f, [
        `**Citation:** \`${f.citation}\``,
        `**Source note:** ${f.source?.note || '(none)'}`,
        `**Source confidence:** ${f.source?.confidence}`,
      ])).join('\n---\n\n')),
);

fs.writeFileSync(
  path.join(reportDir, 'answer_key_disagreement_review.md'),
  '# Audit 3: Answer-key disagreements (conf ≥ 90) — TRIAGE QUEUE, NOT A FIX\n\n' +
  '**Read first:** per the CLAUDE.md "110 curator overrides" stanza, ~70% of IMA-vs-textbook conflicts in spot-checks favor textbook. The 30% where IMA is right means each flagged Q needs human curator review against `.audit_logs/curator_overrides.json` before any flip. **DO NOT auto-apply.**\n\n' +
  `Total flagged: **${keyDisagree.length}** of ${judged.length} judged.\n\n` +
  (keyDisagree.length === 0
    ? '_No high-confidence key disagreements. Curator overrides + recent reframe campaigns hold._\n'
    : keyDisagree.map((f) => fmtFinding(f, [
        `**Judge confidence:** ${f.judge.confidence}`,
        `**Judge claims correct:** ${f.judge.correct_letter_if_app_wrong}`,
        `**Issue:** ${f.judge.issue || '(none reported)'}`,
      ])).join('\n---\n\n')),
);

console.log(`Wrote 4 files to ${reportDir}/`);
console.log('  - summary.md');
console.log('  - explanation_soundness_review.md');
console.log('  - citation_plausibility_review.md');
console.log('  - answer_key_disagreement_review.md');
console.log();
console.log('Top-line stats:');
console.log(`  judged=${judged.length} methodology=${methodology.length} source-checks=${withSource.length}`);
console.log(`  flags: explanation-unsound=${explUnsound.length} cite-implausible=${citeImplausible.length} key-disagree=${keyDisagree.length}`);
