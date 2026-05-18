// Audit-8 — pure numerical methods for the pick-channel representativeness
// analyzer. NO domain logic, NO I/O, NO randomness, NO time, NO network.
// Every export is a deterministic pure function. Standard methods only
// (Numerical Recipes / Abramowitz–Stegun / Holm 1979); nothing carried
// from the set-aside web-draft scripts. Unit-pinned in
// tests/audit8Stats.test.js against hand/scipy-known constants.
//
// Binding spec: docs/AUDIT8_PRE_REGISTERED_GATE.md (#233 G4 + D1–D4).
// Crosswalk: docs/AUDIT8_ANALYSIS_TOOLING_CROSSWALK.md.

// ----------------------------------------------------------------------
// Special functions
// ----------------------------------------------------------------------

// ln Γ(x) — Lanczos approximation, g=7, n=9. Accurate to ~1e-13 for x>0.
const LANCZOS_G = 7;
const LANCZOS_C = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
export function lnGamma(x) {
  if (!Number.isFinite(x)) return NaN;
  if (x < 0.5) {
    // Reflection: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_C[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_C[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Regularized lower incomplete gamma P(s,x) via series (x < s+1) /
// upper Q(s,x) via Lentz continued fraction (x >= s+1). NR §6.2.
export function regularizedGammaP(s, x) {
  if (x < 0 || s <= 0) return NaN;
  if (x === 0) return 0;
  if (x < s + 1) {
    // Series
    let ap = s;
    let sum = 1 / s;
    let del = sum;
    for (let n = 0; n < 1000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + s * Math.log(x) - lnGamma(s));
  }
  return 1 - regularizedGammaQ(s, x);
}
export function regularizedGammaQ(s, x) {
  if (x < 0 || s <= 0) return NaN;
  if (x === 0) return 1;
  if (x < s + 1) return 1 - regularizedGammaP(s, x);
  // Lentz continued fraction
  const TINY = 1e-300;
  let b = x + 1 - s;
  let c = 1 / TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - s);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + s * Math.log(x) - lnGamma(s)) * h;
}

// erf via the exact identity erf(x) = sign(x)·P(½, x²), reusing the
// high-accuracy regularized lower incomplete gamma above (~1e-15) — the
// same routine the χ² tail is pinned on. Sharper than the A&S 7.1.26
// rational approx; one fewer numerical method for the reviewer to trust.
export function erf(z) {
  if (z === 0) return 0;
  const s = z < 0 ? -1 : 1;
  return s * regularizedGammaP(0.5, z * z);
}
export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}
// Two-sided p from a z-score.
export function twoSidedZP(z) {
  return 2 * (1 - normalCdf(Math.abs(z)));
}

// ----------------------------------------------------------------------
// χ² test of independence (2×k) with the locked expected-cell-<5
// column-pooling rule applied BEFORE the test (gate G4.2 topic/D1 t).
// rows = [groupA counts per level, groupB counts per level].
// Returns chi2, df, p, cramersV, and the post-pool level labels.
// ----------------------------------------------------------------------
export function chiSquareIndependence(countsA, countsB, levels) {
  if (countsA.length !== countsB.length || countsA.length !== levels.length) {
    throw new Error('chiSquareIndependence: ragged inputs');
  }
  // Build column totals; pool any column whose MIN expected cell < 5
  // into a single "other" column. Locked rule: pool BEFORE the test.
  const grand =
    countsA.reduce((s, v) => s + v, 0) + countsB.reduce((s, v) => s + v, 0);
  const totA = countsA.reduce((s, v) => s + v, 0);
  const totB = countsB.reduce((s, v) => s + v, 0);
  if (grand === 0) return { chi2: 0, df: 0, p: 1, cramersV: 0, pooledLevels: [] };

  const keep = [];
  let poolA = 0;
  let poolB = 0;
  let pooledAny = false;
  for (let j = 0; j < levels.length; j++) {
    const colTot = countsA[j] + countsB[j];
    const eA = (totA * colTot) / grand;
    const eB = (totB * colTot) / grand;
    if (colTot > 0 && Math.min(eA, eB) >= 5) {
      keep.push(j);
    } else {
      poolA += countsA[j];
      poolB += countsB[j];
      pooledAny = true;
    }
  }
  const finA = keep.map((j) => countsA[j]);
  const finB = keep.map((j) => countsB[j]);
  const finLevels = keep.map((j) => levels[j]);
  if (pooledAny && poolA + poolB > 0) {
    finA.push(poolA);
    finB.push(poolB);
    finLevels.push('__other__');
  }
  const k = finA.length;
  if (k < 2) {
    // Degenerate after pooling — not testable; report null result.
    return { chi2: 0, df: 0, p: 1, cramersV: 0, pooledLevels: finLevels };
  }
  let chi2 = 0;
  for (let j = 0; j < k; j++) {
    const colTot = finA[j] + finB[j];
    const eA = (totA * colTot) / grand;
    const eB = (totB * colTot) / grand;
    if (eA > 0) chi2 += (finA[j] - eA) ** 2 / eA;
    if (eB > 0) chi2 += (finB[j] - eB) ** 2 / eB;
  }
  const df = k - 1; // (2-1)*(k-1)
  const p = regularizedGammaQ(df / 2, chi2 / 2);
  // Cramér's V; for a 2×k table min(r,c)-1 = 1.
  const cramersV = Math.sqrt(chi2 / (grand * 1));
  return { chi2, df, p, cramersV, pooledLevels: finLevels };
}

// ----------------------------------------------------------------------
// Fisher exact 2×2, two-sided (sum of all tables, fixed margins, whose
// hypergeometric prob <= prob(observed) * (1 + 1e-7) tolerance). φ /
// Cramér's V for 2×2 = |φ|.  table = [[a,b],[c,d]].
// ----------------------------------------------------------------------
function lnHypergeom(a, b, c, d) {
  const n = a + b + c + d;
  return (
    lnGamma(a + b + 1) +
    lnGamma(c + d + 1) +
    lnGamma(a + c + 1) +
    lnGamma(b + d + 1) -
    lnGamma(a + 1) -
    lnGamma(b + 1) -
    lnGamma(c + 1) -
    lnGamma(d + 1) -
    lnGamma(n + 1)
  );
}
export function fisherExact2x2(table) {
  const [[a, b], [c, d]] = table;
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = a + b + c + d;
  if (n === 0) return { p: 1, phi: 0, cramersV: 0 };
  const lpObs = lnHypergeom(a, b, c, d);
  const tol = Math.log(1 + 1e-7);
  // a ranges over max(0, c1-r2) .. min(r1, c1)
  const aMin = Math.max(0, c1 - r2);
  const aMax = Math.min(r1, c1);
  let p = 0;
  for (let ai = aMin; ai <= aMax; ai++) {
    const bi = r1 - ai;
    const ci = c1 - ai;
    const di = r2 - ci;
    const lp = lnHypergeom(ai, bi, ci, di);
    if (lp <= lpObs + tol) p += Math.exp(lp);
  }
  p = Math.min(1, p);
  const denom = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  const phi = denom === 0 ? 0 : (a * d - b * c) / denom;
  return { p, phi, cramersV: Math.abs(phi) };
}

// ----------------------------------------------------------------------
// Mann–Whitney U + tie-corrected normal-approx two-sided p, and Cliff's
// δ — both from one O((n+m) log(n+m)) rank pass over the pooled sample,
// so U and δ are guaranteed mutually consistent (δ = 2U/(n*m) - 1).
// ----------------------------------------------------------------------
export function mannWhitneyAndCliffs(aRaw, bRaw) {
  const a = aRaw.filter(Number.isFinite);
  const b = bRaw.filter(Number.isFinite);
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) {
    return { U: NaN, z: NaN, p: NaN, delta: NaN, n1, n2 };
  }
  const pooled = [];
  for (const v of a) pooled.push({ v, g: 0 });
  for (const v of b) pooled.push({ v, g: 1 });
  pooled.sort((x, y) => x.v - y.v);
  // Average ranks with tie handling.
  const ranks = new Array(pooled.length);
  let i = 0;
  let tieSum = 0; // sum of (t^3 - t) for tie correction
  while (i < pooled.length) {
    let j = i;
    while (j + 1 < pooled.length && pooled[j + 1].v === pooled[i].v) j++;
    const avg = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[k] = avg;
    const t = j - i + 1;
    if (t > 1) tieSum += t * t * t - t;
    i = j + 1;
  }
  let rankSumA = 0;
  for (let k = 0; k < pooled.length; k++) if (pooled[k].g === 0) rankSumA += ranks[k];
  const U1 = rankSumA - (n1 * (n1 + 1)) / 2; // U for group A
  const N = n1 + n2;
  const muU = (n1 * n2) / 2;
  // Tie-corrected variance.
  const varU =
    (n1 * n2 / 12) *
    (N + 1 - tieSum / (N * (N - 1)));
  let z = 0;
  if (varU > 0) {
    // Continuity correction toward the mean.
    const diff = U1 - muU;
    const cc = diff === 0 ? 0 : Math.sign(diff) * 0.5;
    z = (diff - cc) / Math.sqrt(varU);
  }
  const p = varU > 0 ? twoSidedZP(z) : 1;
  // Cliff's δ = (#A>B - #A<B)/(n1 n2) = 2U1/(n1 n2) - 1 when U1 counts
  // A-over-B with ties contributing 0.5 (the average-rank U does exactly
  // this), so this identity holds under ties too.
  const delta = (2 * U1) / (n1 * n2) - 1;
  return { U: U1, z, p, delta, n1, n2 };
}

// ----------------------------------------------------------------------
// Holm–Bonferroni step-down across a family. Input: array of {key,p}.
// Returns same order with {key, p, pAdj, reject} at α. Monotone pAdj.
// ----------------------------------------------------------------------
export function holmBonferroni(tests, alpha = 0.05) {
  const m = tests.length;
  if (m === 0) return [];
  const idx = tests.map((t, k) => k).sort((x, y) => tests[x].p - tests[y].p);
  const out = tests.map((t) => ({ key: t.key, p: t.p, pAdj: NaN, reject: false }));
  let stillRejecting = true;
  let runningMax = 0;
  for (let rank = 0; rank < m; rank++) {
    const k = idx[rank];
    const factor = m - rank;
    const adj = Math.min(1, Math.max(runningMax, tests[k].p * factor));
    runningMax = adj;
    out[k].pAdj = adj;
    if (stillRejecting && tests[k].p <= alpha / factor) {
      out[k].reject = true;
    } else {
      stillRejecting = false;
    }
  }
  return out;
}

// ----------------------------------------------------------------------
// Logistic regression via IRLS (Newton–Raphson). X = array of feature
// rows (NO intercept column — added here). y ∈ {0,1}. Returns coef
// (index 0 = intercept), Wald se/z/p, convergence flag. Honest about
// non-convergence (separation) — does NOT silently regularize; the
// analyzer reports `converged:false` rather than fabricate estimates.
// ----------------------------------------------------------------------
function solveLinearSystem(Araw, braw) {
  // Gaussian elimination with partial pivoting. Returns null if singular.
  const n = braw.length;
  const A = Araw.map((row, i) => [...row, braw[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  // Elimination above+below leaves a diagonal system: x[i] = A[i][n]/A[i][i].
  return A.map((row, i) => row[n] / row[i]);
}
function matInvSym(Araw) {
  // Invert via Gauss–Jordan; returns null if singular. Used for the
  // Wald covariance (XᵀWX)⁻¹.
  const n = Araw.length;
  const A = Araw.map((row) => [...row]);
  const I = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [I[col], I[piv]] = [I[piv], I[col]];
    const d = A[col][col];
    for (let c = 0; c < n; c++) {
      A[col][c] /= d;
      I[col][c] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let c = 0; c < n; c++) {
        A[r][c] -= f * A[col][c];
        I[r][c] -= f * I[col][c];
      }
    }
  }
  return I;
}
export function logisticRegressionIRLS(X, y, opts = {}) {
  const maxIter = opts.maxIter ?? 50;
  const tol = opts.tol ?? 1e-8;
  const nObs = y.length;
  if (nObs === 0 || X.length !== nObs) {
    return { coef: [], se: [], z: [], p: [], converged: false, iterations: 0, reason: 'empty' };
  }
  const k = X[0].length; // feature count (no intercept)
  const d = k + 1;
  const design = X.map((row) => [1, ...row]);
  let beta = new Array(d).fill(0);
  let converged = false;
  let iter = 0;
  for (iter = 1; iter <= maxIter; iter++) {
    // Build XᵀWX and Xᵀ(y-μ)
    const XtWX = Array.from({ length: d }, () => new Array(d).fill(0));
    const Xtz = new Array(d).fill(0);
    let maxW = 0;
    for (let i = 0; i < nObs; i++) {
      let eta = 0;
      for (let j = 0; j < d; j++) eta += design[i][j] * beta[j];
      const mu = 1 / (1 + Math.exp(-eta));
      const w = Math.max(mu * (1 - mu), 1e-10);
      maxW = Math.max(maxW, w);
      const resid = y[i] - mu;
      for (let j = 0; j < d; j++) {
        Xtz[j] += design[i][j] * resid;
        for (let l = 0; l < d; l++) XtWX[j][l] += design[i][j] * w * design[i][l];
      }
    }
    const step = solveLinearSystem(XtWX, Xtz);
    if (!step) {
      return { coef: beta, se: [], z: [], p: [], converged: false, iterations: iter, reason: 'singular-information-matrix' };
    }
    let maxDelta = 0;
    for (let j = 0; j < d; j++) {
      beta[j] += step[j];
      maxDelta = Math.max(maxDelta, Math.abs(step[j]));
    }
    if (!beta.every(Number.isFinite)) {
      return { coef: beta, se: [], z: [], p: [], converged: false, iterations: iter, reason: 'diverged-separation' };
    }
    if (maxDelta < tol) {
      converged = true;
      break;
    }
  }
  // Wald covariance = (XᵀWX)⁻¹ at the MLE.
  const XtWX = Array.from({ length: d }, () => new Array(d).fill(0));
  for (let i = 0; i < nObs; i++) {
    let eta = 0;
    for (let j = 0; j < d; j++) eta += design[i][j] * beta[j];
    const mu = 1 / (1 + Math.exp(-eta));
    const w = Math.max(mu * (1 - mu), 1e-10);
    for (let j = 0; j < d; j++)
      for (let l = 0; l < d; l++) XtWX[j][l] += design[i][j] * w * design[i][l];
  }
  const cov = matInvSym(XtWX);
  const se = cov ? beta.map((_, j) => Math.sqrt(Math.max(cov[j][j], 0))) : new Array(d).fill(NaN);
  const z = beta.map((bj, j) => (se[j] > 0 ? bj / se[j] : NaN));
  const p = z.map((zj) => (Number.isFinite(zj) ? twoSidedZP(zj) : NaN));
  return { coef: beta, se, z, p, converged, iterations: iter, reason: converged ? 'ok' : 'max-iter' };
}

// Standardize a numeric vector (z-score) — for the logistic stem_len term.
export function zscore(arr) {
  const v = arr.filter(Number.isFinite);
  const n = v.length;
  if (n === 0) return arr.map(() => 0);
  const mean = v.reduce((s, x) => s + x, 0) / n;
  const sd =
    Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1)) || 1;
  return arr.map((x) => (Number.isFinite(x) ? (x - mean) / sd : 0));
}
