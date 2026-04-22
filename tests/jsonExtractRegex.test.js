/**
 * Guard: shlav-a-mega.html must use `/\{[\s\S]*\}/` for AI JSON extraction.
 *
 * The sibling Pnimit + Mishpacha repos were hit by a state-rename find/replace
 * that turned `\s\S` into `\s\G.S` in src/ai/explain.js, silently breaking
 * the teach-back grader. Geriatrics currently uses the correct form in two
 * places (teach-back + bulk-generation); this test locks that in.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(process.cwd(), 'shlav-a-mega.html'), 'utf-8');

describe('JSON-extract regex health (shlav-a-mega.html)', () => {
  it('contains the correct [\\s\\S] class at every use site', () => {
    const correct = (html.match(/\[\\s\\S\]/g) || []).length;
    expect(correct).toBeGreaterThanOrEqual(2);
  });

  it('never contains the corrupted [\\s\\G.S] class', () => {
    // `\G` is not a meaningful JS regex token inside `[]`; if this pattern
    // appears it means a G-prefix find/replace touched the regex text.
    expect(html).not.toMatch(/\[\\s\\G\.S\]/);
  });

  it('never logs "Report G.save failed" (should be "Report save failed")', () => {
    // Same find/replace class that corrupted the regex also hit string
    // literals. Keep the log message canonical.
    expect(html).not.toMatch(/Report G\.save failed/);
  });
});
