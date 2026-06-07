// Audit-8 — FROZEN pick-channel representativeness analyzer.
//
// Binding spec: docs/AUDIT8_PRE_REGISTERED_GATE.md (#233 G2/G3/G4/G5 +
// DELTAS D1–D4). Clause⇄code map: docs/AUDIT8_ANALYSIS_TOOLING_CROSSWALK.md.
//
// PRE-REGISTRATION INVARIANT: authored blind to run data. No flag/env/code
// path tunes a test, threshold, covariate, or verdict from observed data.
// The only data-conditional behavior is the PRE-REGISTERED set: `broken`
// vacuity (N_broken_served==0 → drop from family), expected-cell-<5
// pooling, dup-group covariate-discord drop, join-fail exclusion, the G2
// power branch, the N_drop==0 STOP. Deterministic, read-only: flips no
// `q.c`, changes no `broken`, touches no Toranot file, appends NO RESULT
// to the gate doc (the bounded-run session does that per the gate SHIP
// clause) — writes only its own report file.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { corpusCanonicalSha } from './lib/corpusSha.mjs';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from './lib/hashStem.mjs';
import { buildIndex } from './build_stemhash_index.mjs';
import { temporalBifurcation } from './lib/temporalBins.mjs';
import {
  chiSquareIndependence,
  fisherExact2x2,
  mannWhitneyAndCliffs,
  holmBonferroni,
  logisticRegressionIRLS,
  zscore,
} from './lib/audit8Stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ALPHA = 0.05;
const FLOOR_DELTA = 0.15;   // G4.4: Cliff's |δ| floor (stem_len)
const FLOOR_V = 0.10;       // G4.4: Cramér's V floor (categoricals)
const MIN_N_DROP = 80;      // G2
const MIN_N_RETAIN = 200;   // G2
const JOIN_DETERMINATE_MIN = 0.99; // D3: per-covariate determinate-join rate
// R2/B2 (AUDIT8_G5_REPAIR_GATE §R2.0-REV1, branch B2): a dup-discordant cell
// (byte-identical stem served by the DOM, dup-group members disagreeing on a
// covariate) is STRUCTURALLY non-determinable — the stem-hash join key cannot
// carry the covariate. It is NOT a join-reliability failure. B2 re-derives the
// determinate denominator by excluding these structural cells; the
// determinable-subset rate is then trivially 1.0 (every joined row is either
// determinate or structurally non-determinable), so the HONEST signal is the
// STRUCTURAL FRACTION. Per §R2.0-REV1(d-iii) the denominator shrink may NOT, by
// itself, clear the gate: a structural fraction at/above this ceiling is a
// reportable limitation → STOP-JOIN-NONDETERMINABLE (gate NOT cleared).
const STRUCTURAL_NONDETERMINABLE_MAX = 1 - JOIN_DETERMINATE_MIN; // 0.01 (ceiling)
// Codex P2 (#327): `1 - 0.99` is 0.0100000000000000089 in IEEE-754, while an
// exact 1-in-100 structural fraction is 0.0100000000000000002, so a bare
// `structuralFraction >= STRUCTURAL_NONDETERMINABLE_MAX` does NOT fire at the
// documented "at/above 1%" knife-edge. Compare with a tolerance far below any
// meaningful step (0.5%) and far above float error (~1e-17) so the exact-1%
// ceiling routes to STOP-JOIN-NONDETERMINABLE as specified.
const STRUCTURAL_FRACTION_EPS = 1e-9;

const CATEGORICAL = ['topic_group', 't', 'bilingual', 'c_accept', 'broken'];
const ALL_COVS = ['stem_len', ...CATEGORICAL];

// Home-of-record gate for the bounded-run RESULT append (issue #338). The
// repair-gate cascade (R1.x → R3) appends its RESULT to the REPAIR gate — the
// gate that authors the bounded run — NOT the original representativeness
// pre-registration. (The verdict LOGIC this analyzer is bound to is still the
// original gate's G2–G5; see the "Binding spec" header — that provenance is
// unchanged.) Single source of truth so the pointer can't silently re-drift.
// Was a hardcoded mis-pointer at docs/AUDIT8_PRE_REGISTERED_GATE.md.
const RESULT_HOME_OF_RECORD_GATE = 'docs/AUDIT8_G5_REPAIR_GATE.md';

// Binding provenance — the gate whose verdict LOGIC (G2–G5 + D1–D4) this
// analyzer is bound to. That is the ORIGINAL representativeness
// pre-registration (see the "Binding spec" header), NOT the repair gate.
// Distinct concept from RESULT_HOME_OF_RECORD_GATE above: provenance answers
// "which gate defines the verdict semantics" (pre-reg); home-of-record answers
// "which gate the RESULT is appended to" (repair, SHIP clause). The
// `boundOnMainGate` result field reports THIS. (#339 follow-up: #339
// conflated the two and pointed this field at the home-of-record gate.)
const BOUND_ON_MAIN_GATE = 'docs/AUDIT8_PRE_REGISTERED_GATE.md';

// ---- CERT §CERT P5: corpus-identity gate (Codex P1 #342) ------------
// corpusCanonicalSha is imported from ./lib/corpusSha.mjs — SINGLE SOURCE OF
// TRUTH shared with the bot writer. The bot records the DEPLOYED corpus hash
// into corpus_sha256.txt at run start; the analyzer recomputes it for the corpus
// it indexes and trusts a captured qIdx ONLY when they match. The byHash
// membership check cannot tell WHICH byte-identical-stem member was served, so a
// reordered/changed corpus must VOID the fast-path (else it recovers the wrong
// member-level `t`). Absent record ⇒ NOT trusted (fail-closed; e.g. the pre-CERT
// R3 ledger).
function recordedCorpusSha(reportDir) {
  try { return readFileSync(path.join(reportDir, 'corpus_sha256.txt'), 'utf-8').trim() || null; }
  catch { return null; }
}

// ---- ledger ingestion ------------------------------------------------

function loadLedger(reportDir) {
  const files = readdirSync(reportDir);
  const summaries = files.filter((f) => /^chaos-doctor-v4-.*\.json$/.test(f));
  const jsonl = files.filter((f) => f === 'medical_findings_ai_v4.jsonl');
  if (!summaries.length) {
    throw new Error(`No chaos-doctor-v4-*.json summary in ${reportDir} — cannot recover the drop rows (gate G4.1 numerator).`);
  }
  const bugs = [];
  let extractNull = 0;
  for (const s of summaries) {
    const rep = JSON.parse(readFileSync(path.join(reportDir, s), 'utf-8'));
    for (const w of rep.workers || []) {
      extractNull += Number(w.extractNull || 0);
      for (const b of w.bugs || []) bugs.push(b);
    }
  }
  const findings = [];
  for (const j of jsonl) {
    const txt = readFileSync(path.join(reportDir, j), 'utf-8');
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try { findings.push(JSON.parse(t)); } catch { /* skip a torn final line */ }
    }
  }
  return { bugs, findings, extractNull };
}

// ---- G4.1 universe classification -----------------------------------

function classifyUniverse({ bugs, findings, extractNull }) {
  // DROPPED (=1): the ~11% invalid-parsed-pick at the :465 gate.
  const dropped = bugs.filter((b) => b.type === 'ai-parse-error' && b.context === 'pick');
  // Separate (NOT numerator): network/throw before parse — G4.1.
  const aiErrorPick = bugs.filter((b) => b.type === 'ai-error' && b.context === 'pick');
  // Excluded: pre-pick DOM/short-extract — keyed on TYPE, never on
  // context:'pick' alone (it shares context:'pick' with real drops).
  const prePickSkip = bugs.filter((b) => b.type === 'pre-pick-skip');
  // RETAINED (=0): reached the judge — main finding carries a judge
  // verdict + boolean `disagrees`.
  const retained = findings.filter((f) => f.judge != null && typeof f.disagrees === 'boolean');
  // appIdx-null: passed the pick gate, never reached the judge — neither
  // DROPPED nor RETAINED (separate count; carries stemHash so the
  // bookkeeping is non-silent, prestep item 5).
  const appIdxNull = findings.filter((f) => f.methodology === 'appIdx-null-post-check'
    || (f.judge == null && f.disagrees === null));
  return { dropped, retained, aiErrorPick, prePickSkip, appIdxNull, extractNull };
}

// ---- G3 / D3 join ----------------------------------------------------

// Returns, per row, a map covariate→value where DETERMINATE, else the
// covariate is absent (D3: a dup group agreeing on X joins determinately
// to X; only covariate-discordant dup cells are dropped — per covariate,
// not whole-row). `joined:false` ⇒ no hash/containment match at all
// (G3 join failure: counted, excluded, never imputed).
function joinRow(stemHashVal, stemSlice, index, qNorm, qIdxVal, qIdxTrusted) {
  // CERT (AUDIT8_G5_REPAIR_GATE §CERT): served-question corpus-index fast-path.
  // A ledger row carrying a determinate corpus index resolves to the SINGLE
  // served dup-group member — recovering covariates (notably `t`) that a
  // stem-hash bucket cannot carry.
  // POINT-OF-USE GATE (Codex P1 #342): the fast-path fires ONLY when
  // `qIdxTrusted` — the caller's corpus-identity verdict (recorded deployed-corpus
  // hash == indexed-corpus hash, §CERT P5). The byHash membership check below is
  // necessary but NOT sufficient: every byte-identical-stem dup member shares the
  // bucket, so against a reordered/drifted corpus membership passes for the WRONG
  // member. Only corpus identity makes the captured index member-level sound;
  // without it (drift, or no recorded hash) qIdxTrusted is false → bucket join.
  if (qIdxTrusted && Number.isInteger(qIdxVal) && index.rows[qIdxVal] && stemHashVal != null) {
    const hashBucket = index.byHash[String(stemHashVal)];
    if (hashBucket && hashBucket.includes(qIdxVal)) {
      const covs = {};
      for (const c of ALL_COVS) covs[c] = index.rows[qIdxVal][c];
      return { joined: true, via: 'qIdx', bucketSize: 1, covs };
    }
  }
  let bucket = stemHashVal != null ? index.byHash[String(stemHashVal)] : undefined;
  let via = 'stemHash';
  if (!bucket || !bucket.length) {
    // Fallback (2): normalized stem-slice containment.
    if (!stemSlice) return { joined: false };
    const needle = normStem(stemSlice);
    if (!needle) return { joined: false };
    const hits = [];
    for (let i = 0; i < qNorm.length; i++) {
      const hay = qNorm[i];
      if (hay && (hay.includes(needle) || needle.includes(hay))) hits.push(i);
      if (hits.length > 8) break; // ambiguous enough; treated as a dup bucket
    }
    if (!hits.length) return { joined: false };
    bucket = hits;
    via = 'containment';
  }
  const covs = {};
  for (const c of ALL_COVS) {
    const v0 = JSON.stringify(index.rows[bucket[0]][c]);
    const agree = bucket.every((i) => JSON.stringify(index.rows[i][c]) === v0);
    if (agree) covs[c] = index.rows[bucket[0]][c]; // determinate for X
    // else: covariate-discordant dup cell → omit X for this row (D3)
  }
  return { joined: true, via, bucketSize: bucket.length, covs };
}

function buildQNorm(index, questionsPath) {
  // For the containment fallback we need the normalized canonical text.
  // Re-read questions.json so the index stays lean and questions.json is
  // the single source for stem text.
  const QZ = JSON.parse(readFileSync(questionsPath, 'utf-8'));
  return QZ.map((r) => normStem(String(r.q == null ? '' : r.q)));
}

// ---- main analysis ---------------------------------------------------

function analyze({ reportDir, index, questionsPath }) {
  const ledger = loadLedger(reportDir);
  const u = classifyUniverse(ledger);
  const qNorm = buildQNorm(index, questionsPath);

  // CERT §CERT P5 — corpus-identity gate (Codex P1 #342): trust qIdx ONLY when
  // the corpus we index canonically matches the DEPLOYED corpus the run recorded
  // (corpus_sha256.txt). Otherwise (drift / no record) void the fast-path →
  // conservative bucket join (no fabricated member-level t in a reordered corpus).
  const recordedSha = recordedCorpusSha(reportDir);
  const currentSha = corpusCanonicalSha(questionsPath);
  const qIdxTrusted = recordedSha != null && recordedSha === currentSha;

  // Join every dropped + retained row; per-covariate determinate tallies.
  const joinTally = {};       // cov → {determinate, attempted, nondeterminable}
  for (const c of ALL_COVS) joinTally[c] = { determinate: 0, attempted: 0, nondeterminable: 0 };
  let joinFailDrop = 0;
  let joinFailRetain = 0;

  function project(rows, isDrop) {
    // → { byCov: {cov:[values]}, _rows:[per-row determinate covmap], nJoined }
    const byCov = {};
    for (const c of ALL_COVS) byCov[c] = [];
    const _rows = [];
    let nJoined = 0;
    for (const r of rows) {
      const j = joinRow(r.stemHash, r.stem, index, qNorm, r.qIdx, qIdxTrusted);
      if (!j.joined) { if (isDrop) joinFailDrop++; else joinFailRetain++; continue; }
      nJoined++;
      _rows.push(j.covs); // determinate-only covariate map for this row
      for (const c of ALL_COVS) {
        joinTally[c].attempted++;
        if (c in j.covs) {
          joinTally[c].determinate++;
          byCov[c].push(j.covs[c]);
        } else if (j.bucketSize > 1) {
          // R2/B2: joined to a dup bucket but the covariate disagrees across
          // members → structurally non-determinable (not a join failure).
          joinTally[c].nondeterminable++;
        }
      }
    }
    return { byCov, _rows, nJoined };
  }
  const D = project(u.dropped, true);
  const R = project(u.retained, false);

  const Ndrop = D.nJoined;
  const Nretain = R.nJoined;

  // AUDIT-9: temporal-bin the per-event reached-pick stream (5-min,
  // run-start-aligned, K=2). Computed BEFORE the N_drop==0 pre-check so a
  // bifurcation is surfaced even on a degenerate ledger (§A3: STOP-BIFURCATION
  // overrides the aggregate; here it also overrides the drop-collapse stop —
  // the bifurcation is the more load-bearing finding). reached-pick = reached
  // the pick step (dropped + ai-error/pick + retained + appIdx-null);
  // pre-pick-skip = excluded (the Phase-2 lock-in signature).
  const temporal = temporalBifurcation([
    ...u.dropped.map((e) => ({ at: e.at, reachedPick: true })),
    ...u.aiErrorPick.map((e) => ({ at: e.at, reachedPick: true })),
    ...u.retained.map((e) => ({ at: e.at, reachedPick: true })),
    ...u.appIdxNull.map((e) => ({ at: e.at, reachedPick: true })),
    ...u.prePickSkip.map((e) => ({ at: e.at, reachedPick: false })),
  ]);
  const temporalBinsOut = {
    note: 'AUDIT-9 §A1–A3: 5-min run-start-aligned buckets, K=2. '
      + 'STOP-BIFURCATION overrides the aggregate (§A3); bifurcation_onset_buckets exhaustive (§A2-REV2).',
    bucketMs: temporal.bucketMs,
    K: temporal.K,
    applicable: temporal.applicable,
    detected: temporal.detected,
    nBuckets: temporal.nBuckets,
    anchorBucket: temporal.anchorBucket,
    firstOnsetBucket: temporal.firstOnsetBucket,
    bifurcation_onset_buckets: temporal.bifurcation_onset_buckets,
    buckets: temporal.buckets,
  };

  // Pre-registered STOP: instrument live but the drop population is empty
  // is NOT an expected branch (G2). AUDIT-9: if a bifurcation is also detected,
  // STOP-BIFURCATION is the more load-bearing finding and overrides it.
  if (u.dropped.length === 0) {
    const base = stopReport('N_drop==0 — drop-rate-collapsed finding (not a verdict). '
      + 'Instrument is live (STEP 0.2 re-passed) yet zero ai-parse-error/pick rows. '
      + 'Per G2 this is itself a finding → STOP, report.', { ledger: summarize(u), Ndrop, Nretain, temporalBins: temporalBinsOut });
    if (temporal.detected) { base.verdict = 'STOP-BIFURCATION'; base.aggregateVerdict = 'STOP'; base.g5route = g5RouteFor('STOP-BIFURCATION'); }
    return base;
  }

  // D3: per-covariate determinate-join rate ≥ 99%. A covariate below the
  // floor is join-unreliable → dropped from the family + flagged; if ANY
  // is violated the analyzer refuses to route a verdict (D3 "do not
  // route" intent — replaces the unsatisfiable global ≥95% STOP).
  // R2/B2: split the old single `rate < 0.99 → join violation` check into two
  // honestly-attributed signals.
  //   • determinableRate = determinate / (attempted − structurally-nondeterminable).
  //     With the current join semantics every joined non-determinate cell IS
  //     structural, so this is trivially 1.0 — which is exactly why the naive
  //     denominator shrink would clear the gate (§R2.0-REV1(d) forbids that).
  //   • structuralFraction = nondeterminable / attempted — the HONEST signal.
  // A covariate routes STOP only if (a) its determinable-subset rate is genuinely
  // below floor (join unreliability — STOP-JOIN-INTEGRITY), or (b) its structural
  // fraction is at/above the materiality ceiling (STOP-JOIN-NONDETERMINABLE: the
  // covariate is structurally non-analyzable for a material fraction — a
  // reportable limitation, NOT a cleared gate).
  const joinRates = {};
  const joinViolations = [];            // genuine join unreliability
  const nondeterminableViolations = []; // B2: material structural non-determinability
  for (const c of ALL_COVS) {
    const t = joinTally[c];
    const determinableAttempted = t.attempted - t.nondeterminable;
    const determinableRate = determinableAttempted ? t.determinate / determinableAttempted : 1;
    const structuralFraction = t.attempted ? t.nondeterminable / t.attempted : 0;
    const rate = t.attempted ? t.determinate / t.attempted : 0; // legacy D3 rate (reported, not routed)
    joinRates[c] = { rate, determinableRate, structuralFraction, ...t };
    if (determinableRate < JOIN_DETERMINATE_MIN) joinViolations.push(c);
    else if (structuralFraction >= STRUCTURAL_NONDETERMINABLE_MAX - STRUCTURAL_FRACTION_EPS) nondeterminableViolations.push(c);
  }
  // Union of covariates that cannot enter the analysis family (either reason).
  const unusableCovs = [...joinViolations, ...nondeterminableViolations];

  // ---- the 6-covariate marginal family (G4.2 + D1 + D2) -------------
  // broken vacuity (D2): N_broken_served over the joined universe.
  const brokenServed =
    D.byCov.broken.filter((v) => v === true).length +
    R.byCov.broken.filter((v) => v === true).length;
  const brokenVacuous = brokenServed === 0;

  const tests = {}; // cov → {test, stat, p, effect, effectName, floor, ...}

  // stem_len — Mann–Whitney U + Cliff's δ
  if (!unusableCovs.includes('stem_len')) {
    const mw = mannWhitneyAndCliffs(D.byCov.stem_len, R.byCov.stem_len);
    tests.stem_len = {
      test: 'mann-whitney-u', U: mw.U, z: mw.z, p: mw.p,
      effectName: "cliff's-delta", effect: mw.delta, floor: FLOOR_DELTA,
      nDrop: mw.n1, nRetain: mw.n2,
    };
  }

  // categorical χ² (topic_group, t) with locked <5 pooling
  for (const c of ['topic_group', 't']) {
    if (unusableCovs.includes(c)) continue;
    const levels = [...new Set([...D.byCov[c], ...R.byCov[c]].map(String))].sort();
    const cntD = levels.map((L) => D.byCov[c].filter((v) => String(v) === L).length);
    const cntR = levels.map((L) => R.byCov[c].filter((v) => String(v) === L).length);
    const x = chiSquareIndependence(cntD, cntR, levels);
    tests[c] = {
      test: 'chi-square-2xk', chi2: x.chi2, df: x.df, p: x.p,
      effectName: "cramers-v", effect: x.cramersV, floor: FLOOR_V,
      levelsAfterPooling: x.pooledLevels.length,
    };
  }

  // binary Fisher exact (bilingual, c_accept, broken[unless vacuous])
  for (const c of ['bilingual', 'c_accept', 'broken']) {
    if (unusableCovs.includes(c)) continue;
    if (c === 'broken' && brokenVacuous) continue;
    const a = D.byCov[c].filter((v) => v === true).length;
    const b = D.byCov[c].filter((v) => v === false).length;
    const cc = R.byCov[c].filter((v) => v === true).length;
    const d = R.byCov[c].filter((v) => v === false).length;
    const f = fisherExact2x2([[a, b], [cc, d]]);
    tests[c] = {
      test: 'fisher-exact-2x2', table: [[a, b], [cc, d]], p: f.p,
      effectName: "cramers-v(phi)", effect: Math.abs(f.phi), floor: FLOOR_V,
    };
  }

  // ---- G4.3 Holm across the PRIMARY marginal family ----------------
  const family = Object.keys(tests);
  const holm = holmBonferroni(family.map((k) => ({ key: k, p: tests[k].p })), ALPHA);
  const holmByKey = Object.fromEntries(holm.map((h) => [h.key, h]));
  for (const k of family) {
    tests[k].pAdj = holmByKey[k].pAdj;
    tests[k].holmReject = holmByKey[k].reject;
    const meetsFloor = Math.abs(tests[k].effect) >= tests[k].floor;
    tests[k].meetsFloor = meetsFloor;
    tests[k].biasSignal = holmByKey[k].reject && meetsFloor; // G4.4
  }

  // ---- G4.3 logistic SENSITIVITY (surfaced reconciliation: the family,
  // not the 4-era formula — verdict-NEUTRAL; see crosswalk) -----------
  const logistic = runLogisticSensitivity(D, R, brokenVacuous, unusableCovs);

  // ---- G4.5 verdict (keyed ONLY on the primary marginal family) -----
  const anyBiasSignal = family.some((k) => tests[k].biasSignal);
  const anyHolmSig = family.some((k) => tests[k].holmReject);
  const powered = Ndrop >= MIN_N_DROP && Nretain >= MIN_N_RETAIN;

  // The pooled aggregate verdict (the frozen 6-branch chain). Still computed
  // and emitted as informational even when STOP-BIFURCATION overrides it.
  let aggregateVerdict;
  if (joinViolations.length) {
    aggregateVerdict = 'STOP-JOIN-INTEGRITY'; // D3: do not route on a genuinely unreliable join
  } else if (nondeterminableViolations.length) {
    // R2/B2: the join is reliable on its determinable subset, but a covariate
    // is structurally non-determinable for a material fraction. The gate is NOT
    // cleared by the denominator shrink (§R2.0-REV1(d-iii)); it is re-attributed.
    aggregateVerdict = 'STOP-JOIN-NONDETERMINABLE';
  } else if (anyBiasSignal) {
    aggregateVerdict = 'BIASED';
  } else if (anyHolmSig) {
    aggregateVerdict = 'DETECTABLE-BUT-NEGLIGIBLE';
  } else if (powered) {
    aggregateVerdict = 'REPRESENTATIVE';
  } else {
    aggregateVerdict = 'INCONCLUSIVE';
  }

  // AUDIT-9 §A3 (+ §A3-REV1): STOP-BIFURCATION is evaluated FIRST and OVERRIDES
  // the aggregate, whichever of the SIX aggregate branches it is
  // (STOP-JOIN-INTEGRITY, STOP-JOIN-NONDETERMINABLE, BIASED,
  // DETECTABLE-BUT-NEGLIGIBLE, REPRESENTATIVE, INCONCLUSIVE). Letting the
  // aggregate route while bifurcation is merely "informational" is the exact
  // failure mode #238 demonstrated and is FORBIDDEN.
  const verdict = temporal.detected ? 'STOP-BIFURCATION' : aggregateVerdict;

  return {
    schema: 'audit8-representativeness-result/1',
    generatedBy: 'scripts/analyze_pick_representativeness.mjs',
    // Provenance: the gate whose verdict LOGIC (G2–G5) this result derives
    // from — the original pre-registration, NOT the home-of-record repair gate.
    boundOnMainGate: BOUND_ON_MAIN_GATE,
    verdict,
    // AUDIT-9: the pooled aggregate verdict, kept as informational even when
    // STOP-BIFURCATION overrides it (so a reader sees what the pooled rate said).
    aggregateVerdict,
    // AUDIT-9 temporal-bin (docs/AUDIT9_PRE_REGISTERED_GATE.md). 5-min,
    // run-start-aligned; K=2 consecutive reached-pick=0 after a >0 anchor.
    // bifurcation_onset_buckets is EXHAUSTIVE (§A2-REV2); the verdict is
    // first-onset-only. applicable:false when no parseable timestamps (e.g.
    // synthetic fixtures) — the temporal verdict never fires there.
    temporalBins: temporalBinsOut,
    g2: { Ndrop, Nretain, MIN_N_DROP, MIN_N_RETAIN, powered },
    // CERT §CERT P5: corpus-identity gate. qIdxTrusted=false ⇒ the qIdx
    // fast-path was voided (corpus drift, or no recorded hash) → bucket-join
    // fallback. Member-level t-recovery is valid only when qIdxTrusted=true.
    corpusIdentity: { recordedSha, currentSha, qIdxTrusted },
    g3d3: {
      perCovariateDeterminateJoinRate: joinRates,
      threshold: JOIN_DETERMINATE_MIN,
      violations: joinViolations,
      joinFailDrop, joinFailRetain,
    },
    // R2/B2: determinate-denominator re-derivation. Reports the structural
    // non-determinability that the legacy single-rate D3 check conflated with
    // join unreliability. Per §R2.0-REV1(d): the excluded (structural) count is
    // reported beside the rate; the determinable-subset is scoped; a material
    // structural fraction is a reportable limitation, NOT a cleared gate.
    g3b2: {
      note: 'B2 determinate-denominator re-derivation (AUDIT8_G5_REPAIR_GATE §R2.0-REV1). '
        + 'structuralFraction >= structuralThreshold → STOP-JOIN-NONDETERMINABLE (gate NOT cleared by shrink).',
      structuralThreshold: STRUCTURAL_NONDETERMINABLE_MAX,
      nondeterminableViolations,
      perCovariate: Object.fromEntries(ALL_COVS.map((c) => [c, {
        determinate: joinTally[c].determinate,
        nondeterminable: joinTally[c].nondeterminable,
        attempted: joinTally[c].attempted,
        determinableRate: joinRates[c].determinableRate,
        structuralFraction: joinRates[c].structuralFraction,
      }])),
    },
    family,
    brokenVacuous, brokenServed,
    tests,
    logisticSensitivity: logistic,
    ledger: summarize(u),
    g5route: g5RouteFor(verdict),
  };
}

function runLogisticSensitivity(D, R, brokenVacuous, joinViolations) {
  // dropped ~ z(stem_len) + bilingual + c_accept + broken? + C(topic_group) + C(t_pooled)
  // (the locked family — see crosswalk's surfaced reconciliation; this is
  // SENSITIVITY only, the G4.5 verdict never reads it.)
  const usable = ['stem_len', 'topic_group', 't', 'bilingual', 'c_accept', 'broken']
    .filter((c) => !joinViolations.includes(c))
    .filter((c) => !(c === 'broken' && brokenVacuous));
  // Build a row only when ALL usable covariates are determinate for it,
  // so the design matrix is rectangular and honest (no imputation).
  const rows = [];
  const y = [];
  const collect = (P, label) => {
    for (let i = 0; i < P._rows.length; i++) {
      const rec = P._rows[i];
      if (usable.every((c) => c in rec)) { rows.push(rec); y.push(label); }
    }
  };
  if (!D._rows || !R._rows) return { skipped: 'per-row covariate vectors unavailable' };
  collect(D, 1); collect(R, 0);
  if (rows.length < 30 || new Set(y).size < 2) {
    return { skipped: `insufficient complete-case rows (n=${rows.length})` };
  }
  // Categorical dummies (drop-first) for topic_group and t.
  const catLevels = {};
  for (const c of ['topic_group', 't']) {
    if (!usable.includes(c)) continue;
    catLevels[c] = [...new Set(rows.map((r) => String(r[c])))].sort();
  }
  const stemZ = zscore(rows.map((r) => r.stem_len));
  const X = rows.map((r, i) => {
    const xr = [];
    if (usable.includes('stem_len')) xr.push(stemZ[i]);
    if (usable.includes('bilingual')) xr.push(r.bilingual ? 1 : 0);
    if (usable.includes('c_accept')) xr.push(r.c_accept ? 1 : 0);
    if (usable.includes('broken')) xr.push(r.broken ? 1 : 0);
    for (const c of ['topic_group', 't']) {
      if (!usable.includes(c)) continue;
      const lv = catLevels[c];
      for (let k = 1; k < lv.length; k++) xr.push(String(r[c]) === lv[k] ? 1 : 0);
    }
    return xr;
  });
  const fit = logisticRegressionIRLS(X, y, { maxIter: 100, tol: 1e-9 });
  // Label the non-intercept terms in order.
  const terms = ['(intercept)'];
  if (usable.includes('stem_len')) terms.push('z(stem_len)');
  if (usable.includes('bilingual')) terms.push('bilingual');
  if (usable.includes('c_accept')) terms.push('c_accept');
  if (usable.includes('broken')) terms.push('broken');
  for (const c of ['topic_group', 't']) {
    if (!usable.includes(c)) continue;
    const lv = catLevels[c];
    for (let k = 1; k < lv.length; k++) terms.push(`${c}=${lv[k]}`);
  }
  return {
    note: 'SENSITIVITY ONLY — G4.3 locks the verdict OFF the logistic. '
      + 'Model = the locked 6-cov family (crosswalk surfaced reconciliation), not the 4-era formula.',
    n: rows.length, converged: fit.converged, reason: fit.reason,
    terms,
    coef: fit.coef, se: fit.se, z: fit.z, p: fit.p,
  };
}

function summarize(u) {
  return {
    N_dropped_ai_parse_error_pick: u.dropped.length,
    N_ai_error_pick_separate: u.aiErrorPick.length,
    N_pre_pick_skip_excluded: u.prePickSkip.length,
    N_extractNull_counter: u.extractNull,
    N_retained_judged: u.retained.length,
    N_appIdxNull_excluded: u.appIdxNull.length,
  };
}

function g5RouteFor(verdict) {
  switch (verdict) {
    case 'STOP-BIFURCATION':
      return 'AUDIT-9: a Phase-1 → Phase-2 bifurcation was detected (≥2 consecutive '
        + '5-min buckets with zero reached-pick after a non-zero anchor). The pooled '
        + 'aggregate is informational ONLY and does NOT route (§A3). Do NOT route a '
        + 'representativeness verdict: the run did not sustain pick-step arrivals, so the '
        + 'judged subsample is not representative of the intended population. Surface '
        + 'bifurcation_onset_buckets; the bot-resilience fix (R1.6) + a fresh bounded run '
        + 'are the path. item 2 remains blocked.';
    case 'REPRESENTATIVE':
      return 'G5: disagrees population unbiased on tested axes; close the pick-channel '
        + 'representativeness horizon; horizon item 2 (Geri judge max_tokens) UNBLOCKED '
        + '(own session+gate). No retroactive re-adjudication.';
    case 'DETECTABLE-BUT-NEGLIGIBLE':
      return 'G5: route as REPRESENTATIVE for the horizon (item 2 unblocked) PLUS a recorded '
        + 'caveat stating the bounded bias magnitude (below-floor effect sizes + CIs). No re-run.';
    case 'BIASED':
      return 'G5: biased subsample on the named axis/axes. Triggers (each own session/gate, '
        + 'none in this lane): (a) pick-side robustness hardening; (b) retroactive-reach '
        + 'characterization (DOCUMENT, do not auto-rerun; no q.c flip, no broken change); '
        + '(c) horizon item 2 stays gated behind the de-bias.';
    case 'INCONCLUSIVE':
      return 'G5: report histogram + power analysis; recommend a specifically sized larger '
        + 'bounded run (state target N_drop); force NO verdict; trigger NO downstream; '
        + 'item 2 remains blocked.';
    case 'STOP-JOIN-INTEGRITY':
      return 'D3: ≥1 covariate determinable-subset join rate < 99% → do NOT route a verdict. '
        + 'Report the offending covariate(s); the bounded run/instrument join must be '
        + 'repaired (e.g. strengthen normStem) before a representativeness verdict stands.';
    case 'STOP-JOIN-NONDETERMINABLE':
      return 'R2/B2: ≥1 covariate is structurally non-determinable for a material fraction '
        + '(dup-discordant byte-identical-stem cells; the stem-hash key cannot carry the '
        + 'covariate). The join is reliable on its determinable subset, but per §R2.0-REV1(d-iii) '
        + 'the denominator shrink does NOT clear the gate — the structural fraction is a reportable '
        + 'limitation. Route NO representativeness verdict on the affected covariate(s); to proceed, '
        + 'either drop the structurally-non-determinable covariate from the family (own gated decision, '
        + 'NOT authorized here) or capture the served-question corpus index so t becomes determinable. '
        + 'item 2 remains blocked.';
    default:
      return 'unknown';
  }
}

function stopReport(reason, extra) {
  return { schema: 'audit8-representativeness-result/1', verdict: 'STOP', reason, ...extra };
}

// ---- CLI -------------------------------------------------------------
function parseArgs() {
  const a = process.argv;
  const get = (flag, def) => { const i = a.indexOf(flag); return i !== -1 ? a[i + 1] : def; };
  return {
    reportDir: get('--report-dir', null),
    indexPath: get('--index', null),
    out: get('--out', null),
    questionsPath: get('--questions', path.join(REPO_ROOT, 'data', 'questions.json')),
    htmlPath: get('--html', path.join(REPO_ROOT, 'shlav-a-mega.html')),
  };
}

export { analyze, classifyUniverse, joinRow, loadLedger };

const isMain = process.argv[1] && process.argv[1].endsWith('analyze_pick_representativeness.mjs');
if (isMain) {
  const args = parseArgs();
  if (!args.reportDir) {
    console.error('usage: node scripts/analyze_pick_representativeness.mjs --report-dir <dir> [--index <idx.json>] [--out <result.json>]');
    process.exit(2);
  }
  const index = args.indexPath
    ? JSON.parse(readFileSync(args.indexPath, 'utf-8'))
    : buildIndex({ questionsPath: args.questionsPath, htmlPath: args.htmlPath });
  const result = analyze({ reportDir: args.reportDir, index, questionsPath: args.questionsPath });
  const out = args.out || path.join(args.reportDir, 'audit8_representativeness_result.json');
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log('═══ AUDIT-8 pick-channel representativeness ═══');
  console.log('VERDICT:', result.verdict);
  if (result.reason) console.log('reason :', result.reason);
  if (result.g2) console.log('G2     :', JSON.stringify(result.g2));
  if (result.ledger) console.log('ledger :', JSON.stringify(result.ledger));
  if (result.g3d3) console.log('join   : violations=' + JSON.stringify(result.g3d3.violations));
  if (result.g3b2) console.log('B2     : nondeterminable=' + JSON.stringify(result.g3b2.nondeterminableViolations)
    + ' (structuralThreshold=' + result.g3b2.structuralThreshold + ')');
  if (result.temporalBins) console.log('AUDIT-9: detected=' + result.temporalBins.detected
    + ' onsets=' + JSON.stringify(result.temporalBins.bifurcation_onset_buckets)
    + ' (aggregate=' + result.aggregateVerdict + ', applicable=' + result.temporalBins.applicable + ')');
  if (result.g5route) console.log('G5     :', result.g5route);
  console.log('wrote  :', out);
  console.log('NOTE: this analyzer produces the verdict only. The RESULT section is appended '
    + 'to ' + RESULT_HOME_OF_RECORD_GATE + ' by the bounded-run session (gate SHIP clause), '
    + 'after fresh-eye / Codex review.');
}
