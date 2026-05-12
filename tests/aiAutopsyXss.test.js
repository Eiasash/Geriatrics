/**
 * XSS property test for the aiAutopsy post-sanitize formatting chain in
 * shlav-a-mega.html (monolithic).
 *
 * Pipeline: callAI() → sanitize() → split-by-line + per-line replace chain
 * + per-line <div dir=...> wrap → innerHTML.
 *
 * The replace chain injects raw <b>/<bdi>/<div> on top of already-escaped
 * text. Invariant: any `<`/`>`/"/' originating from the AI output must
 * still be escaped after formatting. The only literal tags allowed are
 * the formatter's own (and the wrapping <div dir="..."> the formatter adds
 * around each line).
 *
 * v10.64.110 rewrite: formatter changed from
 *   const formatted = safeTxt.replace(...).replace(...).replace(/\n/g,'<br>');
 * to
 *   const formatted = safeTxt.split('\n').map(line => {...}).join('');
 * because the bulk newline-to-br substitution flattened bidi context and
 * English labels pulled Hebrew lines to LTR. Tags also changed: ✗ and the
 * Wrong because:/Would be correct if: labels now wrapped in <bdi> so they
 * don't infect adjacent Hebrew runs.
 *
 * Because Geriatrics has no module extraction, this test pulls the REAL
 * `sanitize` + `heDir` + the line-by-line formatter out of the HTML and
 * re-runs them — so if someone edits either in the source, these tests
 * cover the exact new behaviour.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const html = readFileSync(
  resolve(import.meta.dirname, '..', 'shlav-a-mega.html'),
  'utf-8'
);

// Pull the ACTUAL source of sanitize(), heDir(), and the line-by-line formatter
// out of shlav-a-mega.html and assemble them into a testable harness.
function buildHarness() {
  // sanitize()
  const sanMatch = html.match(/function sanitize\(s\)\{[^}]+\}/);
  if (!sanMatch) throw new Error('sanitize() not found in shlav-a-mega.html');

  // heDir() — needed because the formatter uses it inside the map.
  // Has nested braces (for-loop body), so match line-bounded — heDir is all on one line.
  const heMatch = html.match(/function heDir\(s\)\{[^\n]+\}/);
  if (!heMatch) throw new Error('heDir() not found in shlav-a-mega.html');

  // The line-by-line formatter inside aiAutopsy(). Capture from
  // `const _lines=safeTxt.split('\n');` through the final `.join('');`.
  const chainMatch = html.match(
    /const _lines=safeTxt\.split\('\\n'\);[\s\S]*?\}\)\.join\(''\);/
  );
  if (!chainMatch) throw new Error('aiAutopsy line-by-line formatter not found');

  const src =
    sanMatch[0] + '\n' +
    heMatch[0] + '\n' +
    'function formatAutopsy(safeTxt){\n' +
    chainMatch[0] + '\n' +
    'return formatted;\n' +
    '}\n' +
    'function pipe(raw){ return formatAutopsy(sanitize(raw)); }\n';
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx; // exposes sanitize, heDir, formatAutopsy, pipe
}

const { sanitize, formatAutopsy, pipe } = buildHarness();

describe('shlav-a-mega.html — aiAutopsy formatter tag inventory (v10.64.110)', () => {
  it('wraps ✓ in <bdi><b style="color:#059669"> (bdi-isolated, v10.64.111)', () => {
    expect(formatAutopsy('✓ foo')).toContain('<bdi><b style="color:#059669">✓</b></bdi>');
  });

  it('wraps ✗ in <bdi><b style="color:#dc2626"> (bdi-isolated)', () => {
    expect(formatAutopsy('✗ foo')).toContain('<bdi><b style="color:#dc2626">✗</b></bdi>');
  });

  it('wraps "Correct because:" in <bdi><b style="color:#059669"> (bdi-isolated, v10.64.111)', () => {
    expect(formatAutopsy('Correct because: x')).toContain(
      '<bdi><b style="color:#059669">Correct because:</b></bdi>'
    );
  });

  it('wraps "Wrong because:" in <bdi><b style="color:#b91c1c"> (bdi-isolated)', () => {
    expect(formatAutopsy('Wrong because: x')).toContain(
      '<bdi><b style="color:#b91c1c">Wrong because:</b></bdi>'
    );
  });

  it('wraps "Would be correct if:" in <bdi><b style="color:#059669"> (bdi-isolated)', () => {
    expect(formatAutopsy('Would be correct if: y')).toContain(
      '<bdi><b style="color:#059669">Would be correct if:</b></bdi>'
    );
  });

  it('emits per-line <div dir="..."> wrappers, no <br>', () => {
    const out = formatAutopsy('a\nb');
    // Each line gets its own div with a dir attr.
    expect(out).toMatch(/<div dir="(?:auto|ltr|rtl)"[^>]*>a<\/div>/);
    expect(out).toMatch(/<div dir="(?:auto|ltr|rtl)"[^>]*>b<\/div>/);
    // No <br> in the output.
    expect(out).not.toMatch(/<br/);
  });

  it('every emitted line has unicode-bidi:isolate (each line resolves bidi independently)', () => {
    const out = formatAutopsy('line1\nline2\nline3');
    const divCount = (out.match(/<div dir="/g) || []).length;
    const isoCount = (out.match(/unicode-bidi:isolate/g) || []).length;
    expect(divCount).toBe(3);
    expect(isoCount).toBe(3);
  });
});

describe('shlav-a-mega.html — aiAutopsy XSS invariants (v10.64.110)', () => {
  it('sanitize escapes <, >, &, ", \' (pre-format guarantee)', () => {
    // Canonical order: & first, then the rest.
    expect(sanitize('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('neutralises raw <script> tags in AI output', () => {
    const out = pipe('<script>alert(1)</script>');
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain('&lt;script&gt;');
  });

  it('neutralises <img onerror=> inside autopsy bullet', () => {
    const out = pipe('✗ <img src=x onerror=alert(1)> — Wrong because: bad');
    expect(out).toContain('&lt;img');
    expect(out).not.toMatch(/<img/);
    // Attacker payload must not produce any unescaped tag. Allow only the
    // formatter's own tag names: div, bdi, b.
    const attackerLts = (out.match(/<(?!\/?(?:div|bdi|b)[\s>])/g) || []);
    expect(attackerLts, `unexpected raw < in: ${out}`).toEqual([]);
  });

  it('javascript: href is made inert (brackets escaped)', () => {
    const out = pipe('✗ <a href="javascript:alert(1)">link</a>');
    expect(out).not.toMatch(/<a\s/);
    expect(out).toContain('&lt;a');
    expect(out).toContain('&quot;javascript:alert(1)&quot;');
  });

  it('attribute-context breakout via "> fails — quotes and brackets escaped', () => {
    const out = pipe('"><svg onload=1>');
    expect(out).not.toContain('"><');
    expect(out).not.toMatch(/<svg/);
    expect(out).toContain('&quot;');
    expect(out).toContain('&lt;svg');
  });

  it('preserves Hebrew / Unicode content', () => {
    const out = pipe('✗ חולה — Wrong because: תסמונת');
    expect(out).toContain('חולה');
    expect(out).toContain('תסמונת');
  });

  it('property: no attacker payload builds a live tag across a fixture battery', () => {
    const fixtures = [
      '<script>',
      '"><script>a()</script>',
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      '"onmouseover="alert(1)',
      '\'"><iframe src=//evil>',
      '<a href=javascript:alert(1)>x</a>',
      '<style>body{background:url(javascript:alert(1))}</style>',
      '✗ Wrong because: <b onclick=x>y</b>',
      '<details open ontoggle=alert(1)>',
    ];
    for (const f of fixtures) {
      const out = pipe(f);
      // Strip the formatter's own legitimate tags before scanning for attacker residue.
      const stripped = out
        .replace(/<div dir="(?:auto|ltr|rtl)"[^>]*>/g, '')
        .replace(/<\/div>/g, '')
        .replace(/<bdi>/g, '')
        .replace(/<\/bdi>/g, '')
        .replace(/<b style="color:#dc2626">/g, '')
        .replace(/<b style="color:#b91c1c">/g, '')
        .replace(/<b style="color:#059669">/g, '')
        .replace(/<\/b>/g, '');
      expect(stripped, `fixture: ${f} — raw < remains`).not.toMatch(/<[a-zA-Z/!?]/);
      expect(stripped, `fixture: ${f} — raw > remains`).not.toMatch(/[a-zA-Z"'/]>/);
      const rawDouble = stripped.match(/"/g) || [];
      const rawSingle = stripped.match(/'/g) || [];
      expect(rawDouble.length, `fixture: ${f} (raw ")`).toBe(0);
      expect(rawSingle.length, `fixture: ${f} (raw ')`).toBe(0);
    }
  });

  it('sanitize-then-format contract check — formatter tags survive unescaped', () => {
    const out = pipe('✗ foo');
    expect(out).toMatch(/<bdi><b style="color:#dc2626">/);
    expect(out).not.toMatch(/&lt;bdi/);
    expect(out).not.toMatch(/&lt;b style=/);
  });
});
