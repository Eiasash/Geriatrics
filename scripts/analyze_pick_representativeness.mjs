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
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from './lib/hashStem.mjs';
import { buildIndex } from './build_stemhash_index.mjs';
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

const CATEGORICAL = ['topic_group', 't', 'bilingual', 'c_accept', 'broken'];
const ALL_COVS = ['stem_len', ...CATEGORICAL];

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
function joinRow(stemHashVal, stemSlice, index, qNorm) {
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

  // Join every dropped + retained row; per-covariate determinate tallies.
  const joinTally = {};       // cov → {determinate, attempted}
  for (const c of ALL_COVS) joinTally[c] = { determinate: 0, attempted: 0 };
  let joinFailDrop = 0;
  let joinFailRetain = 0;

  function project(rows, isDrop) {
    // → { byCov: {cov:[values]}, _rows:[per-row determinate covmap], nJoined }
    const byCov = {};
    for (const c of ALL_COVS) byCov[c] = [];
    const _rows = [];
    let nJoined = 0;
    for (const r of rows) {
      const j = joinRow(r.stemHash, r.stem, index, qNorm);
      if (!j.joined) { if (isDrop) joinFailDrop++; else joinFailRetain++; continue; }
      nJoined++;
      _rows.push(j.covs); // determinate-only covariate map for this row
      for (const c of ALL_COVS) {
        joinTally[c].attempted++;
        if (c in j.covs) {
          joinTally[c].determinate++;
          byCov[c].push(j.covs[c]);
        }
      }
    }
    return { byCov, _rows, nJoined };
  }
  const D = project(u.dropped, true);
  const R = project(u.retained, false);

  const Ndrop = D.nJoined;
  const Nretain = R.nJoined;

  // Pre-registered STOP: instrument live but the drop population is empty
  // is NOT an expected branch (G2).
  if (u.dropped.length === 0) {
    return stopReport('N_drop==0 — drop-rate-collapsed finding (not a verdict). '
      + 'Instrument is live (STEP 0.2 re-passed) yet zero ai-parse-error/pick rows. '
      + 'Per G2 this is itself a finding → STOP, report.', { ledger: summarize(u), Ndrop, Nretain });
  }

  // D3: per-covariate determinate-join rate ≥ 99%. A covariate below the
  // floor is join-unreliable → dropped from the family + flagged; if ANY
  // is violated the analyzer refuses to route a verdict (D3 "do not
  // route" intent — replaces the unsatisfiable global ≥95% STOP).
  const joinRates = {};
  const joinViolations = [];
  for (const c of ALL_COVS) {
    const t = joinTally[c];
    const rate = t.attempted ? t.determinate / t.attempted : 0;
    joinRates[c] = { rate, ...t };
    if (rate < JOIN_DETERMINATE_MIN) joinViolations.push(c);
  }

  // ---- the 6-covariate marginal family (G4.2 + D1 + D2) -------------
  // broken vacuity (D2): N_broken_served over the joined universe.
  const brokenServed =
    D.byCov.broken.filter((v) => v === true).length +
    R.byCov.broken.filter((v) => v === true).length;
  const brokenVacuous = brokenServed === 0;

  const tests = {}; // cov → {test, stat, p, effect, effectName, floor, ...}

  // stem_len — Mann–Whitney U + Cliff's δ
  if (!joinViolations.includes('stem_len')) {
    const mw = mannWhitneyAndCliffs(D.byCov.stem_len, R.byCov.stem_len);
    tests.stem_len = {
      test: 'mann-whitney-u', U: mw.U, z: mw.z, p: mw.p,
      effectName: "cliff's-delta", effect: mw.delta, floor: FLOOR_DELTA,
      nDrop: mw.n1, nRetain: mw.n2,
    };
  }

  // categorical χ² (topic_group, t) with locked <5 pooling
  for (const c of ['topic_group', 't']) {
    if (joinViolations.includes(c)) continue;
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
    if (joinViolations.includes(c)) continue;
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
  const logistic = runLogisticSensitivity(D, R, brokenVacuous, joinViolations);

  // ---- G4.5 verdict (keyed ONLY on the primary marginal family) -----
  const anyBiasSignal = family.some((k) => tests[k].biasSignal);
  const anyHolmSig = family.some((k) => tests[k].holmReject);
  const powered = Ndrop >= MIN_N_DROP && Nretain >= MIN_N_RETAIN;

  let verdict;
  if (joinViolations.length) {
    verdict = 'STOP-JOIN-INTEGRITY'; // D3: do not route on an unreliable join
  } else if (anyBiasSignal) {
    verdict = 'BIASED';
  } else if (anyHolmSig) {
    verdict = 'DETECTABLE-BUT-NEGLIGIBLE';
  } else if (powered) {
    verdict = 'REPRESENTATIVE';
  } else {
    verdict = 'INCONCLUSIVE';
  }

  return {
    schema: 'audit8-representativeness-result/1',
    generatedBy: 'scripts/analyze_pick_representativeness.mjs',
    boundOnMainGate: 'docs/AUDIT8_PRE_REGISTERED_GATE.md (#233 G4 + D1–D4)',
    verdict,
    g2: { Ndrop, Nretain, MIN_N_DROP, MIN_N_RETAIN, powered },
    g3d3: {
      perCovariateDeterminateJoinRate: joinRates,
      threshold: JOIN_DETERMINATE_MIN,
      violations: joinViolations,
      joinFailDrop, joinFailRetain,
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
      return 'D3: ≥1 covariate determinate-join rate < 99% → do NOT route a verdict. '
        + 'Report the offending covariate(s); the bounded run/instrument join must be '
        + 'repaired (e.g. strengthen normStem) before a representativeness verdict stands.';
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
  if (result.g5route) console.log('G5     :', result.g5route);
  console.log('wrote  :', out);
  console.log('NOTE: this analyzer produces the verdict only. The RESULT section is appended '
    + 'to docs/AUDIT8_PRE_REGISTERED_GATE.md by the bounded-run session (gate SHIP clause), '
    + 'after web-lane fresh-eye review.');
}
