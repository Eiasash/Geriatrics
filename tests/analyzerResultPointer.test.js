// Regression guard for issue #338 — the analyzer's bounded-run RESULT home-of-record
// pointer drifted (it hardcoded the original representativeness gate
// AUDIT8_PRE_REGISTERED_GATE.md instead of the REPAIR gate that authors the
// bounded run). A mis-pointer silently re-routes the next cascade's RESULT to the
// wrong doc. This pins the home-of-record at the REPAIR gate while preserving the
// verdict-logic provenance (which legitimately IS the original gate).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'scripts', 'analyze_pick_representativeness.mjs'), 'utf8');

describe('analyzer RESULT home-of-record pointer (#338)', () => {
  it('defines the home-of-record as the REPAIR gate (single source of truth)', () => {
    expect(SRC).toContain("const RESULT_HOME_OF_RECORD_GATE = 'docs/AUDIT8_G5_REPAIR_GATE.md'");
  });

  it('boundOnMainGate + the stdout NOTE use the constant, not a hardcoded gate path', () => {
    expect(SRC).toMatch(/boundOnMainGate:\s*RESULT_HOME_OF_RECORD_GATE/);
    // the NOTE interpolates the constant rather than naming a gate literally
    expect(SRC).toMatch(/RESULT section is appended[\s\S]{0,60}RESULT_HOME_OF_RECORD_GATE/);
  });

  it('does NOT mis-point boundOnMainGate or the append NOTE at the pre-registration gate', () => {
    // The only legitimate AUDIT8_PRE_REGISTERED references are provenance comments
    // (the "Binding spec" header + the #338 fix note). Neither boundOnMainGate's
    // value nor the appended-to NOTE may name it.
    expect(SRC).not.toMatch(/boundOnMainGate:\s*'[^']*AUDIT8_PRE_REGISTERED/);
    expect(SRC).not.toMatch(/RESULT section is appended[\s\S]{0,80}AUDIT8_PRE_REGISTERED/);
  });

  it('preserves the verdict-logic provenance (binding spec header still cites the original gate)', () => {
    expect(SRC).toMatch(/Binding spec:\s*docs\/AUDIT8_PRE_REGISTERED_GATE\.md/);
  });
});
