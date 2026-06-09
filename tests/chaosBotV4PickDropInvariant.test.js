// audit-7 PICK-CHANNEL invariant — the RUN behind the source-read in
// docs/AUDIT7_PRE_REGISTERED_GATE.md (#232, "Verified mechanism", L406-417).
//
// Load-bearing claim being pinned:
//   A pick that FAILS to parse logs `ai-parse-error/context=pick` and
//   `return { advanced:false }` BEFORE the `disagrees` computation.
//   Therefore an invalid pick can never produce a `disagrees:true` finding
//   row. Contamination of the audit-3/4/5/7 `disagrees` population is
//   DROP / selection-bias only.
//
// AUDIT8 G5(a) update (2026-06-09): the validity gate moved from an inline
// `if (aiIdx == null || out-of-range)` check to `if (pickResult.failed)`,
// where `pickResult` is the return of `pickWithShapeRetry` (the layered
// parser + one corrective retry). The range check is now encoded inside
// `parsePickLetter` (its letter→idx table is built to `optCount`, so a
// resolved idx is always in range). The INVARIANT — drop lexically BEFORE
// the `disagrees` compute — is UNCHANGED; only the gate's syntactic form
// changed. The gate-body bound is widened to 600 (the two-branch
// api-error/parse drop emit measures 489 chars).
//
// Goes RED if a future edit:
//   (a) deletes the invalid-pick gate's early `return { advanced:false }`,
//       or moves the `disagrees` compute above it          [assert 1, 2];
//   (b) re-points the canonical `disagrees` variable away from the gated
//       compute, or forks a 2nd variable literally named `disagrees`
//       (the referent of the finding-object shorthand)        [assert 3];
//   (c) writes any non-`null` value into a finding row's `disagrees:`
//       field — including a parallel variable under ANY name  [assert 4];
//   (d) mutates a `.disagrees` property post-construction      [assert 5].
//
// Honest scope: this is a source-structure guard. Assertions 3-5 pin
// EVERY channel by which a value reaches a finding row's `disagrees`
// field — the object-literal `disagrees:` value, the shorthand's
// referent, and post-hoc property mutation. It does NOT flag a parallel
// `disagrees`-ish variable that never reaches a finding: such a variable
// is harmless by construction, so catching it is not the invariant.
// A full dataflow proof would need a parser; the invariant pinned here
// is precisely the one that gates whether a spurious value can land in
// an adjudicated finding.
//
// Source-pinned to the producer: scripts/chaos-doctor-bot-v4.mjs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new URL('../scripts/chaos-doctor-bot-v4.mjs', import.meta.url)),
  'utf8',
);

// `pickResult.failed` is unique to the invalid-pick validity gate, so this
// does not collide with the other `return { advanced: false }` sites.
// Body-length bound: 200 -> 300 (AUDIT8 instrument PRE-STEP) -> 600 (AUDIT8
// G5(a)). The invariant THIS regex pins is *lexical ordering* — the
// invalid-pick gate's early `return { advanced: false }` precedes the
// `disagrees` compute (assert 2 enforces the ordering independently via
// offset comparison). The bound is incidental headroom, not the load-bearing
// property; the gate body grew because the G5(a) drop emit forks two
// branches (api-error vs parse hard-fail). 600 covers the measured 489-char
// body with margin while still tripping on a genuinely large logic insertion
// between gate and return.
const INVALID_PICK_GATE =
  /if\s*\(\s*pickResult\.failed\s*\)\s*\{[\s\S]{0,600}?return\s*\{\s*advanced:\s*false/;
const DISAGREES_DECL = /\b(?:const|let|var)\s+disagrees\s*=/g;
// the canonical gated compute (spans two lines in source).
const CANONICAL_COMPUTE =
  /\bconst\s+disagrees\s*=\s*appDisplayIdx\s*!=\s*null[\s\S]{0,140}?pickAgreesWithApp\s*\(/;

describe('audit-7 pick-channel: invalid pick DROPs, never spurious-disagrees', () => {
  it('1. invalid-pick validity gate early-returns { advanced: false }', () => {
    expect(INVALID_PICK_GATE.test(SRC)).toBe(true);
  });

  it('2. the `disagrees` compute is lexically AFTER the gate return', () => {
    const gate = SRC.match(INVALID_PICK_GATE);
    const disagreesAt = SRC.search(/\b(?:const|let|var)\s+disagrees\s*=/);
    expect(gate).not.toBeNull();
    expect(disagreesAt).toBeGreaterThan(-1);
    // end-of-match ~= offset of the gate's `return advanced:false`.
    expect(disagreesAt).toBeGreaterThan(gate.index + gate[0].length);
  });

  it('3. exactly one `disagrees` variable, and it IS the gated compute', () => {
    // pins the referent of the finding-object `disagrees` shorthand.
    expect([...SRC.matchAll(DISAGREES_DECL)].length).toBe(1);
    expect(CANONICAL_COMPUTE.test(SRC)).toBe(true);
  });

  it('4. every `disagrees:` finding-row value is the literal `null`', () => {
    // name-agnostic consumer pin: catches `disagrees: true`,
    // `disagrees: <anyParallelVar>`, `disagrees: judgeThing`, etc.
    const values = [...SRC.matchAll(/\bdisagrees\s*:\s*([^,}\n]+)/g)];
    expect(values.length).toBeGreaterThan(0); // the methodology-guard row
    for (const m of values) expect(m[1].trim()).toBe('null');
  });

  it('5. no `.disagrees` property is mutated post-construction', () => {
    // a finding's `disagrees` may only be set in the object literal,
    // never via `finding.disagrees = x` after the fact.
    expect(/\.\s*disagrees\s*=(?!=)/.test(SRC)).toBe(false);
  });
});
