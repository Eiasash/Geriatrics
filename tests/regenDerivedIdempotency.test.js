/**
 * Idempotency gate for scripts/regen_derived.cjs.
 *
 * Asserts that running the regen script against committed canonical state
 * produces zero file changes. Failure means a PR modified data/questions.json
 * (or a ti field) without regenerating downstream derived files — the
 * denominator-invalidates-all-ratios bug class (PR #258 / v10.64.130 post-mortem).
 *
 * Fix when this fails: run `node scripts/regen_derived.cjs` and commit the
 * resulting changes to data/question_chapters.json, data/regulatory.json,
 * and/or data/syllabus_data.json.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

describe('regen_derived.cjs — derived files in sync with canonical', () => {
  it('--check exits 0 (no drift detected against committed state)', () => {
    let exitCode = 0;
    let stderr = '';
    let stdout = '';
    try {
      stdout = execSync('node scripts/regen_derived.cjs --check', {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      exitCode = e.status;
      stderr = (e.stderr || '').toString();
      stdout = (e.stdout || '').toString();
    }
    expect(
      exitCode,
      `regen_derived --check reported drift. stdout:\n${stdout}\nstderr:\n${stderr}\n\nFix: run \`node scripts/regen_derived.cjs\` and commit the changes.`
    ).toBe(0);
  });
});
