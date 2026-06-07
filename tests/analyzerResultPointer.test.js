// Regression guard for the analyzer's gate pointers.
//
// Two DISTINCT pointers, two distinct meanings — the #339 follow-up fix
// stopped conflating them:
//   1. home-of-record (RESULT_HOME_OF_RECORD_GATE) — which gate the bounded-run
//      RESULT is APPENDED to. That is the REPAIR gate (SHIP clause). Origin of
//      issue #338: it had drifted to the pre-registration gate.
//   2. binding provenance (BOUND_ON_MAIN_GATE / the `boundOnMainGate` result
//      field) — which gate the verdict LOGIC (G2–G5) DERIVES FROM. That is the
//      ORIGINAL pre-registration gate. #339 mistakenly pointed this field at the
//      home-of-record gate; this guard pins it back to provenance.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'analyze_pick_representativeness.mjs'), 'utf8');

describe('analyzer gate pointers (#338 home-of-record + #339 provenance)', () => {
  it('home-of-record is the REPAIR gate (single source of truth)', () => {
    expect(SRC).toContain("const RESULT_HOME_OF_RECORD_GATE = 'docs/AUDIT8_G5_REPAIR_GATE.md'");
  });

  it('binding provenance is the PRE-REGISTRATION gate (single source of truth)', () => {
    expect(SRC).toContain("const BOUND_ON_MAIN_GATE = 'docs/AUDIT8_PRE_REGISTERED_GATE.md'");
  });

  it('boundOnMainGate reports PROVENANCE via the constant, not a hardcoded path', () => {
    expect(SRC).toMatch(/boundOnMainGate:\s*BOUND_ON_MAIN_GATE/);
    // and is NOT the home-of-record constant (that conflation was the #339 bug)
    expect(SRC).not.toMatch(/boundOnMainGate:\s*RESULT_HOME_OF_RECORD_GATE/);
  });

  it('the append NOTE (home-of-record) uses the REPAIR-gate constant, not pre-registration', () => {
    expect(SRC).toMatch(/RESULT section is appended[\s\S]{0,60}RESULT_HOME_OF_RECORD_GATE/);
    expect(SRC).not.toMatch(/RESULT section is appended[\s\S]{0,80}AUDIT8_PRE_REGISTERED/);
  });

  it('preserves the verdict-logic provenance in the binding-spec header', () => {
    expect(SRC).toMatch(/Binding spec:\s*docs\/AUDIT8_PRE_REGISTERED_GATE\.md/);
  });
});
