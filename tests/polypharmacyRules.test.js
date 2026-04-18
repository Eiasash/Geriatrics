/**
 * Tests for the expanded polypharmacy clash engine in shlav-a-mega.html.
 *
 * Extracts getSTOPPWarnings + calcACBTotal via vm.runInContext so edits to
 * the HTML source are automatically covered.
 *
 * Also validates data/drugs.json shape integrity.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const ROOT = resolve(import.meta.dirname, '..');

function extract(html, startNeedle, endNeedle) {
  const s = html.indexOf(startNeedle);
  if (s < 0) throw new Error('needle not found: ' + startNeedle);
  const e = html.indexOf(endNeedle, s);
  if (e < 0) throw new Error('end needle not found: ' + endNeedle);
  return html.slice(s, e);
}

let ctx;

beforeAll(() => {
  const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');
  const drugs = JSON.parse(readFileSync(resolve(ROOT, 'data', 'drugs.json'), 'utf-8'));

  const stoppFn = extract(
    html,
    'function getSTOPPWarnings(){',
    '// ===== VOICE-TO-TEXT'
  );
  const acbFn = extract(
    html,
    'function calcACBTotal(){',
    '\nfunction getSTOPPWarnings'
  );

  const src = `
    const DRUGS = ${JSON.stringify(drugs)};
    let medBasket = [];
    ${acbFn}
    ${stoppFn}
    globalThis.DRUGS = DRUGS;
    globalThis.setBasket = (names) => { medBasket = names.slice(); };
    globalThis.getSTOPPWarnings = getSTOPPWarnings;
    globalThis.calcACBTotal = calcACBTotal;
  `;
  ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
});

beforeEach(() => {
  ctx.setBasket([]);
});

describe('data/drugs.json', () => {
  it('has at least 100 drugs (expanded from baseline 53)', () => {
    expect(ctx.DRUGS.length).toBeGreaterThanOrEqual(100);
  });
  it('every drug has required shape', () => {
    for (const d of ctx.DRUGS) {
      expect(typeof d.name).toBe('string');
      expect(typeof d.heb).toBe('string');
      expect([0, 1, 2, 3]).toContain(d.acb);
      expect(typeof d.beers).toBe('boolean');
      expect(typeof d.cat).toBe('string');
      expect(typeof d.risk).toBe('string');
    }
  });
  it('all names unique (case-insensitive)', () => {
    const seen = new Set();
    for (const d of ctx.DRUGS) {
      const k = d.name.toLowerCase();
      expect(seen.has(k), `duplicate drug: ${d.name}`).toBe(false);
      seen.add(k);
    }
  });
  it('contains key geri drugs added in expansion', () => {
    const names = ctx.DRUGS.map(d => d.name);
    for (const needed of ['Lisinopril', 'Furosemide', 'Carvedilol', 'Atorvastatin',
      'Warfarin', 'Apixaban', 'Omeprazole', 'Levothyroxine', 'Gabapentin', 'Tramadol']) {
      expect(names, `missing ${needed}`).toContain(needed);
    }
  });
});

describe('getSTOPPWarnings — core rules', () => {
  it('flags dual anticholinergic', () => {
    ctx.setBasket(['Oxybutynin', 'Diphenhydramine']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Dual anticholinergic/.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags benzo + opioid', () => {
    ctx.setBasket(['Lorazepam', 'Tramadol']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /respiratory depression/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags dual antiplatelet', () => {
    ctx.setBasket(['Aspirin', 'Clopidogrel']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Dual antiplatelet/i.test(x.text))).toBe(true);
  });

  it('flags anticoag + antiplatelet', () => {
    ctx.setBasket(['Apixaban', 'Aspirin']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Anticoagulant \+ Antiplatelet/i.test(x.text))).toBe(true);
  });

  it('flags triple whammy (ACE + diuretic + NSAID)', () => {
    ctx.setBasket(['Lisinopril', 'Furosemide', 'Ibuprofen']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /TRIPLE WHAMMY/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags ACE + K-sparing (hyperkalemia)', () => {
    // Need spironolactone in DRUGS — may not be present yet
    ctx.setBasket(['Lisinopril']);
    // Add a fake spironolactone-name-only hit via basket string even if not in DRUGS
    ctx.setBasket(['Lisinopril', 'Spironolactone']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /hyperkalemia/i.test(x.text))).toBe(true);
  });

  it('flags ChEI + anticholinergic conflict', () => {
    ctx.setBasket(['Donepezil', 'Oxybutynin']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /cholinesterase/i.test(x.text) && x.level === 'high')).toBe(true);
  });
});

describe('getSTOPPWarnings — new rules (v9.65)', () => {
  it('flags 3+ CNS-active fall-risk drugs', () => {
    ctx.setBasket(['Lorazepam', 'Tramadol', 'Trazodone']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Falls\/fractures risk/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags 2 fall-risk drugs at med severity', () => {
    ctx.setBasket(['Lorazepam', 'Gabapentin']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Dual fall-risk/i.test(x.text))).toBe(true);
  });

  it('flags QT stack (citalopram + haloperidol)', () => {
    ctx.setBasket(['Citalopram', 'Haloperidol']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /QT-prolongation/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags serotonin syndrome risk (SSRI + tramadol)', () => {
    ctx.setBasket(['Sertraline', 'Tramadol']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Serotonin-syndrome/i.test(x.text))).toBe(true);
  });

  it('flags digoxin + loop (hypokalemia → tox)', () => {
    ctx.setBasket(['Digoxin', 'Furosemide']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Digoxin \+ loop/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags digoxin + amiodarone (50-70% level rise)', () => {
    ctx.setBasket(['Digoxin', 'Amiodarone']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /amiodarone/i.test(x.text) && /digoxin/i.test(x.text))).toBe(true);
  });

  it('flags warfarin + NSAID', () => {
    ctx.setBasket(['Warfarin', 'Ibuprofen']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Warfarin \+ NSAID/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags warfarin + amiodarone INR spike', () => {
    ctx.setBasket(['Warfarin', 'Amiodarone']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /INR will spike/i.test(x.text))).toBe(true);
  });

  it('flags simvastatin + diltiazem (rhabdo risk)', () => {
    ctx.setBasket(['Simvastatin', 'Diltiazem']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /myopathy|rhabdo/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('flags clopidogrel + omeprazole CYP2C19', () => {
    ctx.setBasket(['Clopidogrel', 'Omeprazole']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /CYP2C19/i.test(x.text))).toBe(true);
  });

  it('flags levothyroxine + PPI absorption issue', () => {
    ctx.setBasket(['Levothyroxine', 'Pantoprazole']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Levothyroxine absorption/i.test(x.text))).toBe(true);
  });

  it('flags beta-blocker + non-DHP CCB bradycardia', () => {
    ctx.setBasket(['Metoprolol', 'Diltiazem']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Beta-blocker \+ non-DHP/i.test(x.text) && x.level === 'high')).toBe(true);
  });

  it('reports Beers-drug count', () => {
    ctx.setBasket(['Diphenhydramine', 'Lorazepam']);
    const w = ctx.getSTOPPWarnings();
    expect(w.some(x => /Beers-listed/i.test(x.text))).toBe(true);
  });

  it('empty basket → no warnings', () => {
    ctx.setBasket([]);
    expect(ctx.getSTOPPWarnings()).toEqual([]);
  });
});

describe('calcACBTotal', () => {
  it('sums ACB scores correctly', () => {
    ctx.setBasket(['Oxybutynin' /*3*/, 'Diphenhydramine' /*3*/, 'Quetiapine' /*1*/]);
    expect(ctx.calcACBTotal()).toBe(7);
  });
  it('ignores unknown names gracefully', () => {
    ctx.setBasket(['NotADrug']);
    expect(ctx.calcACBTotal()).toBe(0);
  });
});
