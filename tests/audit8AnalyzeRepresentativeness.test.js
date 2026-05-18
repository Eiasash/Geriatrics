// Audit-8 analyzer logic pins — SYNTHETIC fixtures ONLY. Per the
// pre-registration invariant the analyzer is frozen blind to run data;
// these fixtures are hand-constructed, never a real chaos ledger. They
// exercise: G4.1 universe classification, G3/D3 join (exact-hash,
// dup-group covariate-discord drop, containment fallback, join-fail),
// `broken` vacuity, and every G4.5 verdict branch + the STOP branches.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from '../scripts/lib/hashStem.mjs';
import { buildIndex } from '../scripts/build_stemhash_index.mjs';
import { analyze, classifyUniverse, joinRow } from '../scripts/analyze_pick_representativeness.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(REPO_ROOT, 'shlav-a-mega.html'); // real 12 TOPIC_GROUPS

let TMP;
beforeAll(() => { TMP = mkdtempSync(path.join(os.tmpdir(), 'audit8-')); });
afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

let caseSeq = 0;
// Build a synthetic questions.json + a report dir, return analyze() result.
function runCase({ questions, dropSpecs, retainSpecs, aiErr = 0, prePick = 0, extractNull = 0, appIdxNull = 0 }) {
  const dir = path.join(TMP, `c${caseSeq++}`);
  mkdirSync(dir, { recursive: true });
  const qPath = path.join(dir, 'questions.json');
  writeFileSync(qPath, JSON.stringify(questions));
  const idx = buildIndex({ questionsPath: qPath, htmlPath: HTML });

  const sh = (i) => hashStem(normStem(String(questions[i].q)));
  const bugs = [];
  dropSpecs.forEach((qi) => bugs.push({
    at: 't', type: 'ai-parse-error', context: 'pick', dropCtx: 'pick-parse-error',
    stemHash: sh(qi), stem: String(questions[qi].q).slice(0, 300), optCount: 4,
  }));
  for (let i = 0; i < aiErr; i++) bugs.push({ at: 't', type: 'ai-error', context: 'pick', dropCtx: 'pick-ai-error', stemHash: sh(0) });
  for (let i = 0; i < prePick; i++) bugs.push({ at: 't', type: 'pre-pick-skip', context: 'pick', dropCtx: 'pre-pick-no-question', stemHash: null });

  const summary = { config: {}, startedAt: 't', finishedAt: 't', workers: [{ workerId: 1, qsAnswered: dropSpecs.length + retainSpecs.length, actions: [], bugs, extractNull }] };
  writeFileSync(path.join(dir, 'chaos-doctor-v4-TEST.json'), JSON.stringify(summary));

  const jl = [];
  retainSpecs.forEach((qi) => jl.push(JSON.stringify({
    at: 't', schema: 'v4', workerId: 1, stemHash: sh(qi),
    stem: String(questions[qi].q).slice(0, 300), disagrees: false, judge: { app_answer_correct: true },
  })));
  for (let i = 0; i < appIdxNull; i++) jl.push(JSON.stringify({
    at: 't', schema: 'v4', workerId: 1, stemHash: sh(0), stem: 'x',
    disagrees: null, judge: null, methodology: 'appIdx-null-post-check',
  }));
  writeFileSync(path.join(dir, 'medical_findings_ai_v4.jsonl'), jl.join('\n') + '\n');

  return analyze({ reportDir: dir, index: idx, questionsPath: qPath });
}

// covariate-varied question pool (ti maps into real TOPIC_GROUPS)
function pool(n, fn) {
  return Array.from({ length: n }, (_, i) => {
    const o = { q: `synthetic stem number ${i} ` + 'x'.repeat(20), o: ['a', 'b', 'c', 'd'], c: 0, ti: i % 12, t: `S${i % 4}` };
    return fn ? fn(o, i) : o;
  });
}

describe('G4.1 universe classification', () => {
  it('partitions DROPPED / RETAINED / ai-error / pre-pick / appIdx-null', () => {
    const u = classifyUniverse({
      bugs: [
        { type: 'ai-parse-error', context: 'pick' },
        { type: 'ai-parse-error', context: 'pick' },
        { type: 'ai-error', context: 'pick' },
        { type: 'pre-pick-skip', context: 'pick' },
        { type: 'action-error', context: 'doctor-pick' }, // ignored
      ],
      findings: [
        { judge: { x: 1 }, disagrees: true },
        { judge: { x: 1 }, disagrees: false },
        { judge: null, disagrees: null, methodology: 'appIdx-null-post-check' },
      ],
      extractNull: 7,
    });
    expect(u.dropped.length).toBe(2);
    expect(u.aiErrorPick.length).toBe(1);
    expect(u.prePickSkip.length).toBe(1);
    expect(u.retained.length).toBe(2);
    expect(u.appIdxNull.length).toBe(1);
    expect(u.extractNull).toBe(7);
  });
});

describe('G3/D3 join', () => {
  const index = {
    byHash: { H1: [0], DUP: [1, 2] },
    rows: [
      { stem_len: 10, ti: 0, topic_group: 0, bilingual: false, t: 'A', c_accept: false, broken: false },
      { stem_len: 20, ti: 1, topic_group: 1, bilingual: true, t: 'B', c_accept: false, broken: true },
      { stem_len: 20, ti: 1, topic_group: 1, bilingual: true, t: 'B', c_accept: false, broken: false }, // disagrees on `broken` only
    ],
  };
  const qNorm = ['unique alpha stem', 'shared beta stem', 'shared beta stem'];

  it('exact stemHash, single bucket → all covariates determinate', () => {
    const j = joinRow('H1', null, index, qNorm);
    expect(j.joined).toBe(true);
    expect(j.via).toBe('stemHash');
    expect(j.covs.broken).toBe(false);
    expect(Object.keys(j.covs).sort()).toEqual(['bilingual', 'broken', 'c_accept', 'stem_len', 't', 'topic_group']);
  });
  it('dup bucket: agreeing covariates determinate, discordant one DROPPED (D3)', () => {
    const j = joinRow('DUP', null, index, qNorm);
    expect(j.joined).toBe(true);
    expect(j.covs.topic_group).toBe(1);   // agree → determinate
    expect('broken' in j.covs).toBe(false); // discordant → omitted
  });
  it('no hash → containment fallback on the stem slice', () => {
    const j = joinRow('NOPE', 'unique alpha', index, qNorm);
    expect(j.joined).toBe(true);
    expect(j.via).toBe('containment');
  });
  it('no hash, no containment → join failure (never imputed)', () => {
    const j = joinRow('NOPE', 'totally absent text', index, qNorm);
    expect(j.joined).toBe(false);
  });
});

describe('G4.5 verdict branches (synthetic)', () => {
  it('STOP when N_drop==0 (instrument live, drop-rate collapsed)', () => {
    const q = pool(30);
    const r = runCase({ questions: q, dropSpecs: [], retainSpecs: q.map((_, i) => i) });
    expect(r.verdict).toBe('STOP');
    expect(r.reason).toMatch(/drop-rate-collapsed|N_drop==0/);
  });

  it('REPRESENTATIVE — same covariate distribution, powered, broken vacuous', () => {
    // drop & retain reference the SAME cyclic multiset (counts are exact
    // multiples of pool size) → identical relative covariate distribution.
    const q = pool(50, (o, i) => ({ ...o, q_en: i % 2 ? 'en' : undefined }));
    const drop = Array.from({ length: 100 }, (_, i) => i % 50); // 2× each
    const ret = Array.from({ length: 250 }, (_, i) => i % 50);  // 5× each
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r.brokenVacuous).toBe(true);          // no broken served → dropped from family
    expect(r.family).not.toContain('broken');
    expect(r.g2.powered).toBe(true);
    expect(r.verdict).toBe('REPRESENTATIVE');
  });

  it('INCONCLUSIVE — same distribution but under-powered (N_drop<80)', () => {
    const q = pool(10, (o, i) => ({ ...o, q_en: i % 2 ? 'en' : undefined }));
    const drop = Array.from({ length: 20 }, (_, i) => i % 10);  // 2× each, <80
    const ret = Array.from({ length: 220 }, (_, i) => i % 10);  // 22× each
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r.g2.powered).toBe(false);
    expect(r.verdict).toBe('INCONCLUSIVE');
  });

  it('BIASED — strong stem_len separation (|δ|=1, Holm-sig)', () => {
    // short-stem questions 0..24, long-stem 25..49
    const q = Array.from({ length: 50 }, (_, i) => ({
      q: i < 25 ? `short ${i}` : `long ${i} ` + 'y'.repeat(600),
      o: ['a', 'b'], c: 0, ti: i % 12, t: `S${i % 3}`,
    }));
    const drop = Array.from({ length: 90 }, (_, i) => 25 + (i % 25)); // all long
    const ret = Array.from({ length: 220 }, (_, i) => i % 25);        // all short
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r.tests.stem_len.biasSignal).toBe(true);
    expect(Math.abs(r.tests.stem_len.effect)).toBeGreaterThanOrEqual(0.15);
    expect(r.verdict).toBe('BIASED');
  });

  it('DETECTABLE-BUT-NEGLIGIBLE — bilingual Holm-sig but |φ|<0.10 at large N', () => {
    // two question variants: bilingual vs not; everything else identical.
    // equal-length stems (differ by one trailing char only) so stem_len
    // is non-significant and ONLY `bilingual` carries the small signal.
    const q = [
      { q: 'variant stem A', o: ['a', 'b'], c: 0, ti: 0, t: 'A', q_en: 'en' }, // idx0 bilingual=true
      { q: 'variant stem B', o: ['a', 'b'], c: 0, ti: 0, t: 'A' },             // idx1 bilingual=false
    ];
    // drop: 50% bilingual; retain: 56% bilingual → small φ, tiny p at N=1500
    const drop = Array.from({ length: 1500 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const ret = Array.from({ length: 1500 }, (_, i) => (i % 25 < 14 ? 0 : 1)); // 14/25 = 56%
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r.tests.bilingual.holmReject).toBe(true);
    expect(r.tests.bilingual.meetsFloor).toBe(false);
    expect(r.tests.bilingual.biasSignal).toBe(false);
    expect(r.verdict).toBe('DETECTABLE-BUT-NEGLIGIBLE');
  });

  it('STOP-JOIN-INTEGRITY — a covariate determinate-join rate < 99% (D3)', () => {
    // idx0 & idx1 are byte-identical `q` (same stemHash, a dup group) but
    // disagree on `broken` only → every routed row is broken-indeterminate.
    const q = [
      { q: 'identical dup stem text', o: ['a', 'b'], c: 0, ti: 0, t: 'A', broken: true },
      { q: 'identical dup stem text', o: ['a', 'b'], c: 0, ti: 0, t: 'A' }, // broken:false
    ];
    const drop = Array.from({ length: 100 }, () => 0);
    const ret = Array.from({ length: 250 }, () => 0);
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r.g3d3.violations).toContain('broken');
    expect(r.verdict).toBe('STOP-JOIN-INTEGRITY');
  });
});

describe('logistic sensitivity is verdict-neutral', () => {
  it('present in the result but the verdict never reads it', () => {
    const q = pool(50, (o, i) => ({ ...o, q_en: i % 2 ? 'en' : undefined }));
    const drop = Array.from({ length: 100 }, (_, i) => i % 50);
    const ret = Array.from({ length: 250 }, (_, i) => i % 50);
    const r = runCase({ questions: q, dropSpecs: drop, retainSpecs: ret });
    expect(r).toHaveProperty('logisticSensitivity');
    // REPRESENTATIVE reached purely on the marginal family + G2 N.
    expect(r.verdict).toBe('REPRESENTATIVE');
  });
});
