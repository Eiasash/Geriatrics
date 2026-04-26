/**
 * v10.36.2 regression: GRS8 row onclick binding must quote the chapter id.
 *
 * Original bug (v10.36 → v10.36.1):
 *   Renderer spread order let info.id = "grs8-ch01" (string) win over the
 *   parsed numeric key, then `onclick="openGrs8Chapter(${e.id})"` produced
 *   the literal HTML `onclick="openGrs8Chapter(grs8-ch01)"`. The browser
 *   parser read the hyphen as JS subtraction on undefined `grs8`, throwing
 *   ReferenceError on every row tap.
 *
 * Lock: every inline `openGrs8Chapter(${...})` template literal must wrap
 * the interpolation in single quotes. Numeric literals (e.g.
 * `openGrs8Chapter(1)`) are also acceptable — they have no identifier
 * collision risk.
 *
 * Regex matches the entire `openGrs8Chapter(...)` argument and asserts it
 * is either a quoted string or a bare numeric literal. A future refactor
 * that re-introduces an unquoted ${...} blows this test up.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

describe('GRS8 row onclick — chapter id format (v10.36.2 lock)', () => {
  it('every openGrs8Chapter(...) inline call has its arg quoted or a numeric literal', () => {
    // Find every onclick="...openGrs8Chapter(ARG)..." occurrence and capture
    // the literal text passed as the argument. We intentionally scope to
    // attribute strings (HTML onclick handlers) — that's where the unquoted
    // ${...} bug lives.
    const re = /onclick="[^"]*?openGrs8Chapter\(([^)]+)\)[^"]*"/g;
    let m;
    const args = [];
    while ((m = re.exec(html)) !== null) args.push(m[1].trim());
    expect(args.length, 'expected ≥1 inline openGrs8Chapter onclick site').toBeGreaterThanOrEqual(1);
    for (const arg of args) {
      const isQuotedString = /^'\$\{[^}]+\}'$/.test(arg) || /^'[^']+'$/.test(arg) || /^"[^"]+"$/.test(arg);
      const isNumericLiteral = /^\d+$/.test(arg);
      expect(
        isQuotedString || isNumericLiteral,
        'openGrs8Chapter(' + arg + ') — chapter id must be quoted or a numeric literal (a raw ${...} would crash on string ids like "grs8-ch01")'
      ).toBe(true);
    }
  });
});
