/**
 * XSS property test for the aiAutopsy post-sanitize formatting chain in
 * shlav-a-mega.html (monolithic).
 *
 * Pipeline: callAI() → sanitize() → replace chain → innerHTML.
 *
 * The replace chain injects raw <b>/<span>/<br> on top of already-escaped
 * text. Invariant: any `<`/`>`/"/' originating from the AI output must
 * still be escaped after formatting. The only literal tags allowed are
 * the formatter's own.
 *
 * Because Geriatrics has no module extraction, this test pulls the REAL
 * `sanitize` + the `safeTxt.replace(...)` chain out of the HTML via
 * regex and re-runs them — so if someone edits either in the source,
 * these tests cover the exact new behaviour.
 *
 * Mirrors InternalMedicine/tests/aiAutopsyXss.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const html = readFileSync(
  resolve(import.meta.dirname, '..', 'shlav-a-mega.html'),
  'utf-8'
);

// Pull the ACTUAL source of both sanitize() and the replace chain out of
// shlav-a-mega.html and assemble them into a testable harness.
function buildHarness() {
  // sanitize()
  const sanMatch = html.match(/function sanitize\(s\)\{[^}]+\}/);
  if (!sanMatch) throw new Error('sanitize() not found in shlav-a-mega.html');

  // The replace chain (exact formatter used by aiAutopsy).
  // Capture from `safeTxt.replace(` through the final `.replace(/\n/g,'<br>');`
  const chainMatch = html.match(
    /const formatted=safeTxt\.replace\([\s\S]*?\.replace\(\/\\n\/g,'<br>'\);/
  );
  if (!chainMatch) throw new Error('formatAutopsy replace chain not found');

  const src = `
    ${sanMatch[0]}
    function formatAutopsy(safeTxt){
      ${chainMatch[0]}
      return formatted;
    }
    function pipe(raw){ return formatAutopsy(sanitize(raw)); }
  `;
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx; // exposes sanitize, formatAutopsy, pipe
}

const { sanitize, formatAutopsy, pipe } = buildHarness();

describe('shlav-a-mega.html — aiAutopsy formatter tag inventory', () => {
  it('wraps ✗ in <b style="color:#dc2626">', () => {
    expect(formatAutopsy('✗ foo')).toContain('<b style="color:#dc2626">✗</b>');
  });

  it('wraps "Wrong because:" in a red span', () => {
    expect(formatAutopsy('Wrong because: x')).toContain(
      '<span style="color:#b91c1c">Wrong because:</span>'
    );
  });

  it('wraps "Would be correct if:" in a green span', () => {
    expect(formatAutopsy('Would be correct if: y')).toContain(
      '<span style="color:#059669">Would be correct if:</span>'
    );
  });

  it('converts \\n to <br>', () => {
    expect(formatAutopsy('a\nb')).toBe('a<br>b');
  });
});

describe('shlav-a-mega.html — aiAutopsy XSS invariants', () => {
  it('sanitize escapes <, >, &, ", \' (pre-format guarantee)', () => {
    expect(sanitize(`<script>"'&`)).toBe('&lt;script&gt;&quot;&#39;&amp;'.replace(
      '&amp;',
      '&amp;'
    ));
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
    const literalLt = out.match(/</g) || [];
    // Only the formatter's own tags contribute literal `<`: <b>, </b>, <span>, </span>.
    expect(literalLt.length).toBe(4);
    expect(out).toContain('&lt;img');
    expect(out).not.toMatch(/<img/);
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
      const stripped = out
        .replace(/<b style="color:#dc2626">✗<\/b>/g, '')
        .replace(/<span style="color:#b91c1c">Wrong because:<\/span>/g, '')
        .replace(/<span style="color:#059669">Would be correct if:<\/span>/g, '')
        .replace(/<br>/g, '');
      expect(stripped, `fixture: ${f}`).not.toMatch(/<[a-zA-Z/!?]/);
      expect(stripped, `fixture: ${f}`).not.toMatch(/[a-zA-Z"'/]>/);
      const rawDouble = stripped.match(/"/g) || [];
      const rawSingle = stripped.match(/'/g) || [];
      expect(rawDouble.length, `fixture: ${f} (raw ")`).toBe(0);
      expect(rawSingle.length, `fixture: ${f} (raw ')`).toBe(0);
    }
  });

  it('sanitize-then-format contract check — formatter tags survive unescaped', () => {
    const out = pipe('✗ foo');
    expect(out).toMatch(/<b style="color:#dc2626">/);
    expect(out).not.toMatch(/&lt;b style=/);
  });
});
