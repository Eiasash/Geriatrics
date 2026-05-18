// AUDIT8 instrument PRE-STEP — pick-channel + comparator identity.
// Pins the join key the AUDIT8 representativeness bounded run depends on
// (docs/AUDIT8_PRESTEP_INSTRUMENT_GATE.md). This is the test STEP 0.2
// re-evaluates before the paid bounded run is authorized.
//
// Two-sided instrument (merged gate G0 + D4):
//   DROP side  — :466 ai-parse-error/pick (PRIMARY, the ~11% drop) gets
//                stemHash + stem(300) + optCount + dropCtx; :458
//                ai-error/pick gets stemHash + dropCtx; the pre-pick
//                early return gets a distinct, EXCLUDABLE tagged row.
//   JUDGED side — the recordFinding `finding` object and the appIdx-null
//                methodology recordFinding both get stemHash, keyed on the
//                IDENTICAL hashStem(normStem(...)) the offline join uses.
//
// Source-pinned to the producer (mirrors chaosBotV4PickDropInvariant) +
// shared-module determinism vectors.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashStem, normStem } from '../scripts/lib/hashStem.mjs';

const BOT = readFileSync(
  fileURLToPath(new URL('../scripts/chaos-doctor-bot-v4.mjs', import.meta.url)),
  'utf8',
);

describe('AUDIT8 instrument: shared hashStem/normStem (single source of truth)', () => {
  it('hashStem is deterministic and matches the pinned djb2 vectors', () => {
    // Hand-verified djb2 (h0=5381): "" -> 5381 ;
    // "a" (97) -> ((5381<<5)+5381+97)|0 = 177670.
    expect(hashStem('')).toBe('5381');
    expect(hashStem('a')).toBe('177670');
    expect(hashStem('abc')).toBe(hashStem('abc'));      // deterministic
    expect(hashStem('שאלה גריאטרית')).toBe(hashStem('שאלה גריאטרית')); // unicode-stable
  });

  it('normStem collapses whitespace so a DOM-scraped stem and the dataset `q` hash equal', () => {
    expect(normStem('  a   b\n c ')).toBe('a b c');
    expect(normStem('a\t\tb')).toBe('a b');
    expect(hashStem(normStem('a  b'))).toBe(hashStem(normStem('a b')));
    expect(hashStem(normStem('שאלה\n\nכאן'))).toBe(hashStem(normStem('שאלה כאן')));
  });

  it('normStem is null/undefined-safe (never throws on a missing stem)', () => {
    expect(normStem(null)).toBe('');
    expect(normStem(undefined)).toBe('');
    expect(() => hashStem(normStem(null))).not.toThrow();
  });
});

describe('AUDIT8 instrument: bot is source-pinned to the shared, normalized key', () => {
  it('hashStem is imported from the shared module, NOT re-inlined (no drift)', () => {
    expect(BOT).toMatch(
      /import\s*\{[^}]*\bhashStem\b[^}]*\bnormStem\b[^}]*\}\s*from\s*'\.\/lib\/hashStem\.mjs'/,
    );
    // the inline djb2 (old :160-165) must be gone — two copies drift.
    expect(/function\s+hashStem\s*\(/.test(BOT)).toBe(false);
  });

  it('every stem hash in the bot is the NORMALIZED hash (both code paths)', () => {
    // main path (was :450) + pre-pick path must both hash normStem(q.stem).
    const norm = [...BOT.matchAll(/hashStem\(\s*normStem\(\s*q\.stem\s*\)\s*\)/g)];
    expect(norm.length).toBeGreaterThanOrEqual(2);
    // no raw hashStem(q.stem) without normStem (would break the join).
    expect(/hashStem\(\s*q\.stem\s*\)/.test(BOT)).toBe(false);
  });
});

describe('AUDIT8 instrument: DROP side carries recoverable identity', () => {
  it('the ai-parse-error/pick PRIMARY drop row carries dropCtx + stemHash + stem(300) + optCount', () => {
    const m = BOT.match(/type:\s*'ai-parse-error'\s*,\s*context:\s*'pick'[^}]*}/);
    expect(m, 'ai-parse-error/pick push not found').toBeTruthy();
    expect(m[0]).toMatch(/dropCtx:\s*'pick-parse-error'/);
    expect(m[0]).toMatch(/\bstemHash\b/);
    expect(m[0]).toMatch(/stem:\s*q\.stem\.slice\(\s*0\s*,\s*300\s*\)/);
    expect(m[0]).toMatch(/optCount:\s*q\.options\.length/);
  });

  it('the ai-error/pick drop row carries dropCtx + stemHash', () => {
    const m = BOT.match(/type:\s*'ai-error'\s*,\s*context:\s*'pick'[^}]*}/);
    expect(m, 'ai-error/pick push not found').toBeTruthy();
    expect(m[0]).toMatch(/dropCtx:\s*'pick-ai-error'/);
    expect(m[0]).toMatch(/\bstemHash\b/);
  });

  it('the pre-pick early return is a DISTINCT, EXCLUDABLE tagged row (not a pick-parse event)', () => {
    const m = BOT.match(/type:\s*'pre-pick-skip'[\s\S]*?\}\)/);
    expect(m, 'pre-pick-skip push not found').toBeTruthy();
    // distinct type so the analyzer DROPPED filter
    // (type in {ai-parse-error,ai-error} AND context==='pick') EXCLUDES it.
    // dropCtx is a ternary over the two excludable pre-pick sub-contexts.
    expect(m[0]).toMatch(/dropCtx:/);
    expect(m[0]).toMatch(/'pre-pick-short-extract'/);
    expect(m[0]).toMatch(/'pre-pick-no-question'/);
    // honest denominator counter wired alongside it.
    expect(BOT).toMatch(/log\.extractNull\s*=\s*\(log\.extractNull\s*\|\|\s*0\)\s*\+\s*1/);
    expect(BOT).toMatch(/const log = \{[^}]*extractNull:\s*0/);
  });
});

describe('AUDIT8 instrument: JUDGED/comparator side carries the same key', () => {
  it('the main recordFinding `finding` object carries stemHash', () => {
    const m = BOT.match(/const finding = \{[\s\S]*?\};/);
    expect(m, 'finding object not found').toBeTruthy();
    expect(m[0]).toMatch(/\bstemHash\b/);
  });

  it('the appIdx-null methodology recordFinding object carries stemHash', () => {
    const m = BOT.match(/recordFinding\(\{[\s\S]*?methodology:\s*'appIdx-null-post-check'/);
    expect(m, 'appIdx-null recordFinding not found').toBeTruthy();
    expect(m[0]).toMatch(/\bstemHash\b/);
  });
});
