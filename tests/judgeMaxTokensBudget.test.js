// audit-7 regression guard for the judge token budget.
//
// In R3, ~101 judge calls truncated at stop_reason=max_tokens with
// first_branch=no_brace: RL'd-in JSON preamble exhausted the 400-token budget
// before the model emitted even a '{', so neither the brace-balanced
// extractJson nor the one corrective retry could recover (38 residual hard
// ai-parse-errors, which feed N_drop). SYS_DOCTOR_JUDGE already demands
// JSON-only and the preamble defies it; assistant-prefill is NOT available on
// this stack (the proxy's Sonnet 4.6 returns 400 on prefill — deploy-primitives
// §4). The budget is therefore the lever. This guard pins it at >= 1024 so a
// silent revert to 400 (which reopens the truncation class) fails CI. The bound
// is a floor, not an exact value — future upward tuning stays green.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOT = fs.readFileSync(path.join(ROOT, 'scripts', 'chaos-doctor-bot-v4.mjs'), 'utf8');
const VAL = fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'judgeShapeValidator.mjs'), 'utf8');

const MIN_JUDGE_BUDGET = 1024;

describe('audit-7 judge token budget (>= 1024)', () => {
  it('judgeWithShapeRetry default maxTokens is >= 1024', () => {
    const m = VAL.match(/maxTokens\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_JUDGE_BUDGET);
  });

  it('the chaos-bot judge call passes maxTokens >= 1024 (and not the pick/explain/source budgets)', () => {
    // Isolate the judgeWithShapeRetry({ ... }) call block so we read the JUDGE
    // budget specifically, not the pick (250) / explain (400) / source (300) ones.
    const block = BOT.match(/judgeWithShapeRetry\(\{[\s\S]*?\}\)/);
    expect(block).not.toBeNull();
    const m = block[0].match(/maxTokens:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_JUDGE_BUDGET);
  });
});
