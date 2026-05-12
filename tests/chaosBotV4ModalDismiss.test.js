// Regression pin for v10.64.115 modal-dismiss fix on chaos-doctor-bot v4.
// The help-overlay autoshow + 9 other auto-modals (per v10.64.49 deferred
// help guard) sit at z-index:9999 over the quiz card and intercept all
// pointer events on button.qo. Without explicit dismissal the bot's first-Q
// click times out and detectAppCorrectIdx returns null forever (verified
// 100% reproduction in v10.64.114 smoke before this fix).
//
// This pin asserts that ensureOnPracticeQuiz dismisses modals BEFORE the
// optsCount/checkVisible check, and lists the canonical modal IDs.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../scripts/chaos-doctor-bot-v4.mjs'),
  'utf8',
);

// Pull just the ensureOnPracticeQuiz function body for tight grep
function extractFunc(name) {
  const re = new RegExp(`async function ${name}\\b[\\s\\S]*?\\n}\\n`, 'm');
  const m = SRC.match(re);
  if (!m) throw new Error(`could not locate ${name}`);
  return m[0];
}

const FN = extractFunc('ensureOnPracticeQuiz');

describe('chaos-doctor-bot v4 — modal-dismiss pin (v10.64.115)', () => {
  it('ensureOnPracticeQuiz exists', () => {
    expect(FN.length).toBeGreaterThan(200);
  });

  it('dismisses modals BEFORE checking optsCount / checkVisible', () => {
    const dismissIdx = FN.indexOf('modal-dismiss');
    const optsIdx = FN.indexOf('optsCount');
    expect(dismissIdx).toBeGreaterThan(0);
    expect(optsIdx).toBeGreaterThan(0);
    expect(dismissIdx).toBeLessThan(optsIdx);
  });

  it('lists the canonical 10 auto-modal IDs from the v10.64.49 guard', () => {
    // help-overlay + the 9 in the deferred-help guard list (#feModal,
    // #sdModal, #miModal, #mockPicker, #examModal, #mexModal,
    // #postLoginRstModal, #rstModal — and modalIds list also includes
    // help-overlay itself).
    const expected = ['help-overlay', 'feModal', 'sdModal', 'miModal', 'mockPicker', 'examModal', 'mexModal', 'postLoginRstModal', 'rstModal'];
    for (const id of expected) {
      expect(FN).toContain(`'${id}'`);
    }
  });

  it('prefers closeTopModal() helper, falls back to DOM removal', () => {
    expect(FN).toMatch(/typeof\s+closeTopModal\s*===\s*'function'/);
    expect(FN).toMatch(/getElementById\([^)]*\)\?\.remove/);
  });

  it('emits a modal-dismiss action when modals are found', () => {
    expect(FN).toMatch(/type:\s*'modal-dismiss'/);
  });

  it('waits briefly after dismiss so re-render completes before optsCount check', () => {
    // The sleep(400) between dismiss and optsCount is load-bearing — gives
    // the render() call following modal removal a tick to commit.
    const dismissBlock = FN.slice(FN.indexOf('modal-dismiss'), FN.indexOf('optsCount'));
    expect(dismissBlock).toMatch(/sleep\(\d+\)/);
  });
});
