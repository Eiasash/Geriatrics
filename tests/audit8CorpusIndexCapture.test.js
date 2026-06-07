// Audit-8 CERT — corpus-index capture (B1 re-opened). Pins the qIdx
// fast-path that lets the analyzer resolve which dup-group member was
// served, recovering covariates (notably `t`) that a stem-hash bucket
// cannot carry. SYNTHETIC fixtures only (pre-registration invariant).
//
// Binding spec: docs/AUDIT8_G5_REPAIR_GATE.md §CERT.
// RED-proof: the qIdx fast-path does not exist on the pre-CERT analyzer,
// so the WITH-qIdx assertions fail there (t stays STOP-JOIN-NONDETERMINABLE)
// and pass on CERT — same fixture, qIdx presence flips t-determinability.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from '../scripts/lib/hashStem.mjs';
import { buildIndex } from '../scripts/build_stemhash_index.mjs';
import { analyze, joinRow } from '../scripts/analyze_pick_representativeness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(REPO_ROOT, 'shlav-a-mega.html'); // real 12 TOPIC_GROUPS

let TMP;
beforeAll(() => { TMP = mkdtempSync(path.join(os.tmpdir(), 'audit8cert-')); });
afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

let caseSeq = 0;
// Synthetic questions.json + report dir → analyze() result. `withQIdx`
// stamps each DROP/RETAIN row with qIdx = its canonical index (what the
// CERT-instrumented bot captures); omitted = a pre-CERT ledger.
function runCase({ questions, dropSpecs, retainSpecs, withQIdx = false }) {
  const dir = path.join(TMP, `cc${caseSeq++}`);
  mkdirSync(dir, { recursive: true });
  const qPath = path.join(dir, 'questions.json');
  writeFileSync(qPath, JSON.stringify(questions));
  const idx = buildIndex({ questionsPath: qPath, htmlPath: HTML });

  const sh = (i) => hashStem(normStem(String(questions[i].q)));
  const bugs = [];
  dropSpecs.forEach((qi) => bugs.push({
    at: 't', type: 'ai-parse-error', context: 'pick', dropCtx: 'pick-parse-error',
    stemHash: sh(qi), stem: String(questions[qi].q).slice(0, 300), optCount: 4,
    ...(withQIdx ? { qIdx: qi } : {}),
  }));
  const summary = { config: {}, startedAt: 't', finishedAt: 't', workers: [{ workerId: 1, qsAnswered: dropSpecs.length + retainSpecs.length, actions: [], bugs, extractNull: 0 }] };
  writeFileSync(path.join(dir, 'chaos-doctor-v4-TEST.json'), JSON.stringify(summary));

  const jl = retainSpecs.map((qi) => JSON.stringify({
    at: 't', schema: 'v4', workerId: 1, stemHash: sh(qi),
    stem: String(questions[qi].q).slice(0, 300), disagrees: false, judge: { app_answer_correct: true },
    ...(withQIdx ? { qIdx: qi } : {}),
  }));
  writeFileSync(path.join(dir, 'medical_findings_ai_v4.jsonl'), jl.join('\n') + '\n');

  return analyze({ reportDir: dir, index: idx, questionsPath: qPath });
}

// ── Direct joinRow unit tests (fast-path mechanics + P3 cross-check) ──────
describe('CERT joinRow qIdx fast-path', () => {
  // dup group [1,2] disagrees on BOTH `t` and `broken` (the recoverable shape)
  const index = {
    byHash: { H1: [0], DUP: [1, 2] },
    rows: [
      { stem_len: 10, ti: 0, topic_group: 0, bilingual: false, t: 'A', c_accept: false, broken: false },
      { stem_len: 20, ti: 1, topic_group: 1, bilingual: true, t: 'B', c_accept: false, broken: true },
      { stem_len: 20, ti: 1, topic_group: 1, bilingual: true, t: 'C', c_accept: false, broken: false },
    ],
  };
  const qNorm = ['unique alpha stem', 'shared beta stem', 'shared beta stem'];

  it('qIdx in bucket → resolves the SINGLE served member (t + broken recovered)', () => {
    const j = joinRow('DUP', null, index, qNorm, 1);
    expect(j.joined).toBe(true);
    expect(j.via).toBe('qIdx');
    expect(j.bucketSize).toBe(1);
    expect(j.covs.t).toBe('B');        // member-1's t — recovered (bucket alone can't)
    expect(j.covs.broken).toBe(true);  // member-1's broken — recovered
    expect(Object.keys(j.covs).sort()).toEqual(['bilingual', 'broken', 'c_accept', 'stem_len', 't', 'topic_group']);
  });
  it('a DIFFERENT in-bucket qIdx resolves the OTHER member', () => {
    const j = joinRow('DUP', null, index, qNorm, 2);
    expect(j.via).toBe('qIdx');
    expect(j.covs.t).toBe('C');
    expect(j.covs.broken).toBe(false);
  });
  it('P3 cross-check: qIdx NOT in the stemHash bucket → safe fallback (no fabricated t)', () => {
    const j = joinRow('DUP', null, index, qNorm, 99); // 99 ∉ byHash.DUP
    expect(j.via).toBe('stemHash');     // fell back to bucket join
    expect(j.bucketSize).toBe(2);
    expect('t' in j.covs).toBe(false);  // discordant → omitted, NOT recovered
    expect('broken' in j.covs).toBe(false);
    expect(j.covs.topic_group).toBe(1); // agreeing covariate still determinate
  });
  it('non-integer qIdx is ignored (defensive) → fallback', () => {
    const j = joinRow('DUP', null, index, qNorm, '1');
    expect(j.via).toBe('stemHash');
    expect('t' in j.covs).toBe(false);
  });
  it('absent qIdx → existing 4-arg behavior unchanged (backward-compat)', () => {
    const j = joinRow('DUP', null, index, qNorm);
    expect(j.via).toBe('stemHash');
    expect('t' in j.covs).toBe(false);
  });
  it('qIdx present but stemHash null → fallback (no bucket to cross-check against)', () => {
    const j = joinRow(null, 'unique alpha', index, qNorm, 0);
    expect(j.via).toBe('containment'); // resolved via stem slice, not qIdx
  });
});

// ── analyze() RED-proof + backward-compat (P1 + P2) ───────────────────────
describe('CERT analyze() — qIdx resolves the t-discordant dup group', () => {
  // The §0.2 Defect-B shape: byte-identical stem, t differs across members.
  const dupQ = [
    { q: 'shared cert stem alpha xxxxxxxxxxxx', o: ['a', 'b'], c: 0, ti: 0, t: '2022-Jun-Basic' },
    { q: 'shared cert stem alpha xxxxxxxxxxxx', o: ['a', 'b'], c: 0, ti: 0, t: '2022-Jun-Subspec' },
  ];
  // drop + retain alternate between the two members at the SAME ratio → t is
  // determinate (2 levels) and unbiased once qIdx resolves the member.
  const drop = Array.from({ length: 100 }, (_, i) => i % 2); // 0,1,0,1...
  const ret = Array.from({ length: 250 }, (_, i) => i % 2);

  it('P1 (RED-proof): WITH qIdx → t determinate, NOT STOP-JOIN-NONDETERMINABLE', () => {
    const r = runCase({ questions: dupQ, dropSpecs: drop, retainSpecs: ret, withQIdx: true });
    expect(r.g3b2.perCovariate.t.nondeterminable).toBe(0);
    expect(r.g3b2.perCovariate.t.structuralFraction).toBe(0);
    expect(r.g3b2.nondeterminableViolations).not.toContain('t');
    expect(r.verdict).not.toBe('STOP-JOIN-NONDETERMINABLE'); // <-- fails on pre-CERT analyzer
  });

  it('P2 (backward-compat): WITHOUT qIdx → unchanged STOP-JOIN-NONDETERMINABLE on t', () => {
    const r = runCase({ questions: dupQ, dropSpecs: drop, retainSpecs: ret, withQIdx: false });
    expect(r.g3b2.perCovariate.t.structuralFraction).toBe(1);
    expect(r.g3b2.nondeterminableViolations).toContain('t');
    expect(r.verdict).toBe('STOP-JOIN-NONDETERMINABLE');
  });
});

// ── Instrument source pins (monolith attr + bot capture) ──────────────────
describe('CERT instrument source pins', () => {
  it('monolith _rqmQuestion stem renders data-qidx="${pool[qi]}"', () => {
    const html = readFileSync(path.join(REPO_ROOT, 'shlav-a-mega.html'), 'utf-8');
    expect(html).toMatch(/<p class="heb" data-qidx="\$\{pool\[qi\]\}"/);
  });
  it('bot extractQuestion reads data-qidx and returns qIdx', () => {
    const bot = readFileSync(path.join(REPO_ROOT, 'scripts/chaos-doctor-bot-v4.mjs'), 'utf-8');
    expect(bot).toMatch(/getAttribute\(['"]data-qidx['"]\)/);
    expect(bot).toMatch(/return \{ stem, options, qIdx \}/);
  });
  it('bot threads qIdx into the joined DROP + RETAIN ledger rows', () => {
    const bot = readFileSync(path.join(REPO_ROOT, 'scripts/chaos-doctor-bot-v4.mjs'), 'utf-8');
    // DROP row (ai-parse-error/pick) carries qIdx on its single line
    expect(bot).toMatch(/type: 'ai-parse-error', context: 'pick'[^\n]*qIdx: q\.qIdx/);
    // RETAIN finding object carries qIdx (greppable line)
    expect(bot).toMatch(/qIdx: q\.qIdx, \/\/ CERT/);
  });
});
