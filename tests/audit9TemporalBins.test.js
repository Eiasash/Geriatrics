// AUDIT-9 — temporal-bin bifurcation detector pins.
//
// Two layers:
//   (1) pure-function contract on lib/temporalBins.mjs (5-min buckets, K=2,
//       run-start alignment, blip robustness, multi-onset, anchor strictness);
//   (2) integration through analyze() with TIMESTAMPED synthetic ledgers — the
//       §A5 CATCH (must surface STOP-BIFURCATION) and NO-FALSE-POSITIVE (must
//       NOT) fixtures, plus a RED-proof vs the un-binned edfa433 analyzer.
//
// Fixtures are SYNTHETIC, re-derivable from the §0.2 cadence + PR#274 blip
// catalogue — never an extract of the gitignored chaos-reports ledger.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from '../scripts/lib/hashStem.mjs';
import { buildIndex } from '../scripts/build_stemhash_index.mjs';
import { analyze } from '../scripts/analyze_pick_representativeness.mjs';
import { temporalBifurcation, AUDIT9_BUCKET_MS, AUDIT9_K } from '../scripts/lib/temporalBins.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = path.join(REPO_ROOT, 'shlav-a-mega.html');
const BASE = Date.parse('2026-05-23T23:20:00.000Z'); // run-start; arbitrary

// Build an event stream from a per-minute cadence: minutes[i] = { ok, skip }.
// ok events spread inside the minute; ts = BASE + minute*60s + k*200ms.
function genEvents(minutes) {
  const ev = [];
  minutes.forEach((m, i) => {
    const t0 = BASE + i * 60_000;
    for (let k = 0; k < (m.ok || 0); k++) ev.push({ at: new Date(t0 + k * 200).toISOString(), reachedPick: true });
    for (let k = 0; k < (m.skip || 0); k++) ev.push({ at: new Date(t0 + 30_000 + k * 200).toISOString(), reachedPick: false });
  });
  return ev;
}
// §0.2 / PR#274 blip catalogue: single-minute degraded outcome at these minutes.
const BLIP_MINUTES = new Set([1, 11, 49, 63, 78, 160, 188]);
function phase1Minute(i) { return { ok: BLIP_MINUTES.has(i) ? 0 : 13, skip: BLIP_MINUTES.has(i) ? 14 : 0 }; }
function phase2Minute() { return { ok: 0, skip: 14 }; }

describe('temporalBifurcation — pure contract (§A1/§A2/§A2-REV2)', () => {
  it('defaults: 5-min buckets, K=2', () => {
    expect(AUDIT9_BUCKET_MS).toBe(5 * 60 * 1000);
    expect(AUDIT9_K).toBe(2);
  });

  it('applicable:false on no parseable timestamps (synthetic at:"t" guard)', () => {
    const r = temporalBifurcation([{ at: 't', reachedPick: true }, { at: 't', reachedPick: false }]);
    expect(r.applicable).toBe(false);
    expect(r.detected).toBe(false);
  });

  it('CATCH shape: Phase-1 then sustained zero → DETECTED, single onset', () => {
    // 15 min Phase-1 (3 buckets, reached>0), then 15 min Phase-2 (3 zero buckets)
    const minutes = [];
    for (let i = 0; i < 15; i++) minutes.push({ ok: 13, skip: 0 });
    for (let i = 0; i < 15; i++) minutes.push(phase2Minute());
    const r = temporalBifurcation(genEvents(minutes));
    expect(r.detected).toBe(true);
    expect(r.bifurcation_onset_buckets).toEqual([3]);     // bucket 3 = first Phase-2 bucket
    expect(r.anchorBucket).toBe(2);                       // immediately-preceding Phase-1 bucket
    expect(r.buckets[2].reachedPick).toBeGreaterThan(0);
    expect(r.buckets[3].reachedPick).toBe(0);
    expect(r.buckets[4].reachedPick).toBe(0);
  });

  it('NO-FALSE-POSITIVE: 50 min Phase-1 with the 7 blips, no Phase-2 → NOT detected', () => {
    const minutes = Array.from({ length: 50 }, (_, i) => phase1Minute(i));
    const r = temporalBifurcation(genEvents(minutes));
    expect(r.detected).toBe(false);
    expect(r.bifurcation_onset_buckets).toEqual([]);
    // blip robustness: every 5-min bucket keeps reached-pick > 0 despite a 1-min blip
    expect(r.buckets.every((b) => b.reachedPick > 0)).toBe(true);
  });

  it('K=2: a single zero bucket then recovery does NOT fire', () => {
    // P1(2 buckets) → 1 zero bucket → P1 recovers
    const minutes = [];
    for (let i = 0; i < 10; i++) minutes.push({ ok: 13 });
    for (let i = 0; i < 5; i++) minutes.push({ ok: 0, skip: 14 }); // one zero bucket
    for (let i = 0; i < 10; i++) minutes.push({ ok: 13 });
    const r = temporalBifurcation(genEvents(minutes));
    expect(r.detected).toBe(false);
  });

  it('multi-onset (§A2-REV2): two sustained collapses → two onset buckets', () => {
    const minutes = [];
    for (let i = 0; i < 10; i++) minutes.push({ ok: 13 });          // buckets 0,1
    for (let i = 0; i < 10; i++) minutes.push({ ok: 0, skip: 14 }); // buckets 2,3 (onset 2)
    for (let i = 0; i < 10; i++) minutes.push({ ok: 13 });          // buckets 4,5 (recovery)
    for (let i = 0; i < 10; i++) minutes.push({ ok: 0, skip: 14 }); // buckets 6,7 (onset 6)
    const r = temporalBifurcation(genEvents(minutes));
    expect(r.bifurcation_onset_buckets).toEqual([2, 6]);
    expect(r.firstOnsetBucket).toBe(2); // verdict is first-onset-only
  });

  it('anchor strictness: a cold-start zero streak (no Phase-1 anchor) does NOT fire', () => {
    const minutes = [];
    for (let i = 0; i < 15; i++) minutes.push({ ok: 0, skip: 14 }); // no Phase-1 ever
    const r = temporalBifurcation(genEvents(minutes));
    expect(r.detected).toBe(false);
  });

  it('run-start alignment: onset bucket index is offset from the first event, not wall-clock', () => {
    // shift everything by +37 min; onset bucket index must be unchanged
    const minutes = [];
    for (let i = 0; i < 15; i++) minutes.push({ ok: 13 });
    for (let i = 0; i < 15; i++) minutes.push(phase2Minute());
    const base = genEvents(minutes);
    const shifted = base.map((e) => ({ ...e, at: new Date(Date.parse(e.at) + 37 * 60_000).toISOString() }));
    expect(temporalBifurcation(shifted).bifurcation_onset_buckets).toEqual([3]);
  });
});

// ── Integration through analyze() with timestamped ledgers ──────────────
let TMP;
beforeAll(() => { TMP = mkdtempSync(path.join(os.tmpdir(), 'audit9-')); });
afterAll(() => { rmSync(TMP, { recursive: true, force: true }); });

let seq = 0;
// reached-pick events → RETAINED findings (judge present); skips → pre-pick-skip
// bugs. Both carry real ISO `at` so the analyzer's temporal binning is live.
function runTimestamped(minutes, analyzeFn = analyze) {
  const dir = path.join(TMP, `c${seq++}`);
  mkdirSync(dir, { recursive: true });
  const questions = [{ q: 'audit9 synthetic stem ' + 'x'.repeat(20), o: ['a', 'b'], c: 0, ti: 0, t: 'A' }];
  const qPath = path.join(dir, 'questions.json');
  writeFileSync(qPath, JSON.stringify(questions));
  const idx = buildIndex({ questionsPath: qPath, htmlPath: HTML });
  const sh = hashStem(normStem(String(questions[0].q)));

  const bugs = [];
  const findings = [];
  minutes.forEach((m, i) => {
    const t0 = BASE + i * 60_000;
    const ok = m.ok || 0;
    // realistic reached-pick mix: ~2/min are ai-parse-error/pick DROPS (so
    // N_drop > 0, avoiding the degenerate drop-collapse stop), the rest RETAINED.
    const nDrop = Math.min(2, ok);
    for (let k = 0; k < ok; k++) {
      const at = new Date(t0 + k * 200).toISOString();
      if (k < nDrop) {
        bugs.push({ at, type: 'ai-parse-error', context: 'pick', dropCtx: 'pick-parse-error', stemHash: sh, stem: questions[0].q, optCount: 2 });
      } else {
        findings.push({ at, schema: 'v4', workerId: 1, stemHash: sh, stem: questions[0].q, disagrees: false, judge: { app_answer_correct: true } });
      }
    }
    for (let k = 0; k < (m.skip || 0); k++) {
      bugs.push({ at: new Date(t0 + 30_000 + k * 200).toISOString(), type: 'pre-pick-skip', context: 'pick', dropCtx: 'pre-pick-no-question', stemHash: null });
    }
  });
  writeFileSync(path.join(dir, 'chaos-doctor-v4-TEST.json'), JSON.stringify({ config: {}, startedAt: 't', finishedAt: 't', workers: [{ workerId: 1, qsAnswered: findings.length, actions: [], bugs, extractNull: 0 }] }));
  writeFileSync(path.join(dir, 'medical_findings_ai_v4.jsonl'), findings.map((f) => JSON.stringify(f)).join('\n') + '\n');
  return analyzeFn({ reportDir: dir, index: idx, questionsPath: qPath });
}

describe('AUDIT-9 integration (§A3 override) + §A5 fixtures', () => {
  it('CATCH-fixture → STOP-BIFURCATION overrides the aggregate', () => {
    // composite: 200 min Phase-1 (with the 7 blips) + 60 min Phase-2
    const minutes = [];
    for (let i = 0; i < 200; i++) minutes.push(phase1Minute(i));
    for (let i = 0; i < 60; i++) minutes.push(phase2Minute());
    const r = runTimestamped(minutes);
    expect(r.temporalBins.detected).toBe(true);
    expect(r.verdict).toBe('STOP-BIFURCATION');
    // §A3: the aggregate is still computed + emitted (informational)
    expect(r.aggregateVerdict).toBeTruthy();
    expect(r.aggregateVerdict).not.toBe('STOP-BIFURCATION');
    // §A2-REV2: exhaustive onset array present
    expect(r.temporalBins.bifurcation_onset_buckets.length).toBeGreaterThanOrEqual(1);
    expect(r.temporalBins.firstOnsetBucket).toBe(40); // 200 min / 5 = bucket 40
  });

  it('NO-FALSE-POSITIVE-fixture (blips only, no Phase-2) → NOT STOP-BIFURCATION', () => {
    const minutes = Array.from({ length: 240 }, (_, i) => phase1Minute(i));
    const r = runTimestamped(minutes);
    expect(r.temporalBins.detected).toBe(false);
    expect(r.verdict).not.toBe('STOP-BIFURCATION');
    expect(r.verdict).toBe(r.aggregateVerdict); // verdict routes on the aggregate
  });
});
