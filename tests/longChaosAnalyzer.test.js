// Smoke test for long-chaos-analyze.mjs — runs against a synthetic JSONL
// of known shape and verifies the four output files exist with the expected
// flag counts. Pure file-IO + spawn, no chaos run required.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(__dirname, '..');
const ANALYZER = path.join(REPO, 'scripts/long-chaos-analyze.mjs');

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'long-chaos-fixture-'));
  // 5 synthetic findings exercising every output bucket
  const findings = [
    // (1) clean Q — judged, agree, sound expl, plausible cite
    {
      stem: 'Q1 stem ' + 'a'.repeat(50),
      options: ['A opt', 'B opt', 'C opt', 'D opt'],
      aiLetter: 'B', aiIdx: 1, aiConf: 90, aiWhy: 'because',
      appIdx: 1, appDisplayIdx: 1, appLetter: 'B', disagrees: false,
      judge: { app_answer_correct: true, explanation_sound: true, confidence: 95, issue: null },
      source: { citation_plausible: true, confidence: 88, note: 'fits chapter' },
      citation: 'Hazzard Ch 43',
    },
    // (2) unsound explanation at high conf (Audit 1 hit)
    {
      stem: 'Q2 stem ' + 'b'.repeat(50),
      options: ['A', 'B', 'C', 'D'],
      aiLetter: 'A', aiIdx: 0, aiConf: 70,
      appIdx: 0, appLetter: 'A', disagrees: false,
      judge: { app_answer_correct: true, explanation_sound: false, confidence: 92, issue: 'mechanism is reversed' },
    },
    // (3) implausible citation (Audit 2 hit)
    {
      stem: 'Q3 stem ' + 'c'.repeat(50),
      options: ['A', 'B', 'C', 'D'],
      aiLetter: 'C', aiIdx: 2, aiConf: 85,
      appIdx: 2, appLetter: 'C', disagrees: false,
      judge: { app_answer_correct: true, explanation_sound: true, confidence: 90, issue: null },
      source: { citation_plausible: false, confidence: 80, note: 'chapter is about a different topic' },
      citation: 'Hazzard Ch 9000',
    },
    // (4) key disagreement at conf>=90 with claimed correct (Audit 3 hit)
    {
      stem: 'Q4 stem ' + 'd'.repeat(50),
      options: ['A', 'B', 'C', 'D'],
      aiLetter: 'B', aiIdx: 1, aiConf: 95,
      appIdx: 0, appLetter: 'A', disagrees: true,
      judge: { app_answer_correct: false, explanation_sound: true, confidence: 95, issue: 'key is wrong', correct_letter_if_app_wrong: 'B' },
    },
    // (5) methodology event — should not be counted in judged
    {
      stem: 'Q5 stem ' + 'e'.repeat(50),
      options: ['A', 'B', 'C', 'D'],
      aiLetter: 'D', aiIdx: 3,
      appIdx: null, disagrees: null,
      judge: null, source: null,
      methodology: 'appIdx-null-post-check',
    },
  ];
  const jsonl = findings.map((f) => JSON.stringify(f)).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'medical_findings_ai_v4.jsonl'), jsonl);
  return dir;
}

describe('long-chaos-analyze.mjs', () => {
  const dir = makeFixture();

  it('runs against a synthetic ledger without crashing', () => {
    const out = execFileSync('node', [ANALYZER, dir], { encoding: 'utf8' });
    expect(out).toMatch(/Wrote 4 files/);
    expect(out).toMatch(/judged=4 methodology=1/);
    expect(out).toMatch(/explanation-unsound=1 cite-implausible=1 key-disagree=1/);
  });

  it('writes all four expected output files', () => {
    for (const f of ['summary.md', 'explanation_soundness_review.md', 'citation_plausibility_review.md', 'answer_key_disagreement_review.md']) {
      expect(fs.existsSync(path.join(dir, f))).toBe(true);
    }
  });

  it('summary.md reports correct top-line counts', () => {
    const md = fs.readFileSync(path.join(dir, 'summary.md'), 'utf8');
    expect(md).toMatch(/Total findings recorded: \*\*5\*\*/);
    expect(md).toMatch(/Successfully judged: \*\*4\*\*/);
    expect(md).toMatch(/Methodology events: 1/);
    expect(md).toMatch(/Source-checks fired: 2/);
  });

  it('Audit 1 (unsound) flags Q2 only at conf>=85', () => {
    const md = fs.readFileSync(path.join(dir, 'explanation_soundness_review.md'), 'utf8');
    expect(md).toMatch(/Total flagged: \*\*1\*\*/);
    expect(md).toMatch(/mechanism is reversed/);
  });

  it('Audit 2 (implausible cite) flags Q3 only', () => {
    const md = fs.readFileSync(path.join(dir, 'citation_plausibility_review.md'), 'utf8');
    expect(md).toMatch(/Total flagged: \*\*1\*\*/);
    expect(md).toMatch(/Hazzard Ch 9000/);
  });

  it('Audit 3 (key disagreement) flags Q4 only AND surfaces the "DO NOT auto-apply" guard', () => {
    const md = fs.readFileSync(path.join(dir, 'answer_key_disagreement_review.md'), 'utf8');
    expect(md).toMatch(/Total flagged: \*\*1\*\*/);
    expect(md).toMatch(/key is wrong/);
    expect(md).toMatch(/DO NOT auto-apply/);
    expect(md).toMatch(/curator_overrides\.json/);
  });
});
