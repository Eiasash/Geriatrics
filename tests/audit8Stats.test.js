// Audit-8 pure-stats pins. Reference constants are scipy / hand-computed
// (Numerical Recipes, Wikipedia logistic example, Holm 1979). If any of
// these drift the representativeness verdict is untrustworthy — this file
// is the falsifier for scripts/lib/audit8Stats.mjs.
import { describe, it, expect } from 'vitest';
import {
  lnGamma, regularizedGammaQ, regularizedGammaP, erf, normalCdf, twoSidedZP,
  chiSquareIndependence, fisherExact2x2, mannWhitneyAndCliffs,
  holmBonferroni, logisticRegressionIRLS, zscore,
} from '../scripts/lib/audit8Stats.mjs';

const near = (a, b, tol = 1e-4) => expect(Math.abs(a - b)).toBeLessThan(tol);

describe('special functions', () => {
  it('lnGamma matches known values', () => {
    near(lnGamma(5), Math.log(24), 1e-7);          // Γ(5)=4!=24
    near(lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-7); // Γ(½)=√π
    near(lnGamma(1), 0, 1e-9);
  });
  it('regularized incomplete gamma = χ² survival at the canonical crit values', () => {
    near(regularizedGammaQ(0.5, 3.841 / 2), 0.05, 1e-3); // χ²=3.841 df=1
    near(regularizedGammaQ(1, 5.991 / 2), 0.05, 1e-3);   // χ²=5.991 df=2
    near(regularizedGammaQ(0.5, 10.828 / 2), 0.001, 5e-4); // χ²=10.828 df=1
    expect(regularizedGammaQ(0.5, 0)).toBe(1);
    near(regularizedGammaP(1, 1) + regularizedGammaQ(1, 1), 1, 1e-12);
  });
  it('erf / normalCdf / twoSidedZP', () => {
    near(erf(0), 0, 1e-9);
    near(erf(1), 0.8427007, 1e-5);
    near(normalCdf(0), 0.5, 1e-9);
    near(normalCdf(1.959964), 0.975, 1e-3);
    near(twoSidedZP(1.959964), 0.05, 1e-3);
    near(erf(2), 0.99532227, 1e-6);
    near(twoSidedZP(0), 1, 1e-9);
  });
});

describe('chi-square 2×k with locked <5 pooling', () => {
  it('no-pooling table: known χ², df, Cramér V, p', () => {
    const r = chiSquareIndependence([10, 20], [20, 10], ['x', 'y']);
    near(r.chi2, 6.6667, 1e-3);
    expect(r.df).toBe(1);
    near(r.cramersV, 0.33333, 1e-4);
    near(r.p, 0.00982, 1e-3); // scipy chi2.sf(6.6667,1)
  });
  it('sparse column is pooled into __other__ BEFORE the test', () => {
    const r = chiSquareIndependence([10, 20, 1], [20, 10, 0], ['x', 'y', 'z']);
    expect(r.pooledLevels).toContain('__other__');
    expect(r.pooledLevels).not.toContain('z');
  });
});

describe('Fisher exact 2×2 two-sided', () => {
  it('lady-tasting-tea [[3,1],[1,3]] → p≈0.4857, φ=0.5', () => {
    const f = fisherExact2x2([[3, 1], [1, 3]]);
    near(f.p, 0.4857142857, 1e-4);
    near(f.phi, 0.5, 1e-9);
    near(f.cramersV, 0.5, 1e-9);
  });
  it('perfect separation [[10,0],[0,10]] → tiny p, |φ|=1', () => {
    const f = fisherExact2x2([[10, 0], [0, 10]]);
    expect(f.p).toBeLessThan(1e-4);
    near(Math.abs(f.phi), 1, 1e-9);
  });
});

describe('Mann–Whitney U + Cliff δ (one consistent rank pass)', () => {
  it('complete separation a<b → U=0, δ=-1', () => {
    const m = mannWhitneyAndCliffs([1, 2, 3], [4, 5, 6]);
    expect(m.U).toBe(0);
    near(m.delta, -1, 1e-12);
  });
  it('complete separation a>b → δ=+1', () => {
    const m = mannWhitneyAndCliffs([4, 5, 6], [1, 2, 3]);
    near(m.delta, 1, 1e-12);
  });
  it('identical samples → δ=0, p=1', () => {
    const m = mannWhitneyAndCliffs([1, 2, 3], [1, 2, 3]);
    near(m.delta, 0, 1e-12);
    near(m.p, 1, 1e-9);
  });
  it('δ = 2U/(n1 n2) - 1 identity holds', () => {
    const a = [3, 1, 4, 1, 5, 9, 2, 6];
    const b = [2, 7, 1, 8, 2, 8];
    const m = mannWhitneyAndCliffs(a, b);
    near(m.delta, (2 * m.U) / (a.length * b.length) - 1, 1e-12);
  });
});

describe('Holm–Bonferroni step-down', () => {
  it('classic step-down: only the smallest passes', () => {
    const h = holmBonferroni([{ key: 'a', p: 0.001 }, { key: 'b', p: 0.04 }, { key: 'c', p: 0.03 }]);
    const by = Object.fromEntries(h.map((x) => [x.key, x]));
    expect(by.a.reject).toBe(true);
    expect(by.b.reject).toBe(false);
    expect(by.c.reject).toBe(false);
    near(by.a.pAdj, 0.003, 1e-9);
  });
  it('all tiny → all reject; pAdj monotone & ≤1', () => {
    const h = holmBonferroni([{ key: 'a', p: 0.001 }, { key: 'b', p: 0.001 }]);
    expect(h.every((x) => x.reject)).toBe(true);
    expect(h.every((x) => x.pAdj <= 1)).toBe(true);
  });
});

describe('logistic IRLS', () => {
  it('Wikipedia hours-studied dataset → published MLE', () => {
    const hours = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 4, 4.25, 4.5, 4.75, 5, 5.5];
    const pass = [0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1];
    const fit = logisticRegressionIRLS(hours.map((h) => [h]), pass, { maxIter: 100, tol: 1e-10 });
    expect(fit.converged).toBe(true);
    near(fit.coef[0], -4.0777, 0.02);  // intercept
    near(fit.coef[1], 1.5046, 0.02);   // slope
  });
  it('reports non-convergence honestly on perfect separation (no silent regularize)', () => {
    const x = [[-3], [-2], [-1], [1], [2], [3]];
    const y = [0, 0, 0, 1, 1, 1];
    const fit = logisticRegressionIRLS(x, y, { maxIter: 25 });
    expect(fit.converged).toBe(false);
  });
});

describe('zscore', () => {
  it('mean→0, sample-sd scaling', () => {
    const z = zscore([1, 2, 3, 4, 5]);
    near(z.reduce((s, v) => s + v, 0) / z.length, 0, 1e-12);
    near(z[0], -1.2649, 1e-3);
  });
});
