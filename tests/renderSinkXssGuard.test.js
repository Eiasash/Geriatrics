/**
 * Render-sink XSS guard for shlav-a-mega.html (monolith).
 *
 * Untrusted question content reaches the quiz renderer from three origins:
 *   - AI-generated questions (approveGeneratedQ -> samega_pending_qs)
 *   - imported custom questions (addAiChapterQs -> samega_custom_qs)
 *   - user-attached images (uploadQImage -> shlav_q_images / q.img)
 * None are sanitized at persistence, so the render sinks MUST escape.
 *
 * Before v10.64.157 the stem (qLang(q,'q')), option buttons, and image src
 * were interpolated raw. A crafted
 * `<img src=x onerror=...>` inside an imported pack executed on render.
 *
 * This guard pins that every such sink stays sanitize()-wrapped. It is a
 * source-scan (the render sinks are inside large h+=`...` builders that
 * are not cleanly extractable), plus a functional check on the real
 * sanitize() so the escape itself cannot silently weaken.
 *
 * Explanation / autopsy surfaces are covered separately by
 * aiAutopsyXss.test.js and are intentionally not re-checked here.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const html = readFileSync(
  resolve(import.meta.dirname, '..', 'shlav-a-mega.html'),
  'utf-8'
);

function count(hay, needle) {
  return hay.split(needle).length - 1;
}

describe('render-sink XSS guard — stem sinks are escaped', () => {
  it('no bare ${qLang(q,\'q\')} rendered as element content (</p> or </div>)', () => {
    expect(count(html, "${qLang(q,'q')}</p>"), 'raw stem in <p>').toBe(0);
    expect(count(html, "${qLang(q,'q')}</div>"), 'raw stem in <div>').toBe(0);
  });

  it('all stem content sinks use sanitize(qLang(q,\'q\'))', () => {
    // Primary quiz stem sink. The duplicate sudden-death stem path was removed.
    expect(count(html, "${sanitize(qLang(q,'q'))}</p>")).toBe(1);
  });

  it('the dir attribute still uses bare heDir(qLang(q,\'q\')) (must NOT be sanitized)', () => {
    // Sanitizing the direction input would be a bug; confirm it is untouched.
    expect(html).toContain('dir="${heDir(qLang(q,\'q\'))}"');
  });

  it('bookmark/track row truncates then escapes', () => {
    expect(count(html, '${t.substring(0,80)}'), 'raw truncated stem').toBe(0);
    expect(html).toContain('${sanitize(t.substring(0,80))}');
  });

  it('quiz option buttons escape option text and aria-label', () => {
    expect(html).not.toContain('aria-label="Option ${i+1}: ${o}">${o}</button>');
    expect(html).toContain('aria-label="Option ${origI+1}: ${sanitize(o)}"');
    expect(html).toContain('<span>${sanitize(o)}</span>');
  });
});

describe('render-sink XSS guard — image sinks are escaped', () => {
  it('no raw q.img in an img src', () => {
    expect(count(html, 'src="${q.img}"'), 'raw q.img src').toBe(0);
  });

  it('the quiz image sink uses sanitize(q.img)', () => {
    expect(count(html, 'src="${sanitize(q.img)}"')).toBe(1);
  });

  it('uploadQImage clamps the file extension to an allowlist', () => {
    // A crafted filename like foo.png"><script> must not reach q.img.
    expect(html).toContain("/^(png|jpg|jpeg|gif|webp)$/.test(_rawExt)?_rawExt:'png'");
    expect(html).not.toContain("const ext=file.name.split('.').pop()||'png';");
  });
});

describe('render-sink XSS guard — sanitize() escape is intact', () => {
  function getSanitize() {
    const m = html.match(/function sanitize\(s\)\{[^}]+\}/);
    if (!m) throw new Error('sanitize() not found');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(m[0] + '\nglobalThis._san = sanitize;', ctx);
    return ctx._san;
  }
  const sanitize = getSanitize();

  it('escapes the five HTML-significant characters', () => {
    expect(sanitize('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('neutralises an <img onerror=> payload', () => {
    const out = sanitize('<img src=x onerror=alert(1)>');
    expect(out).toContain('&lt;img');
    expect(out).not.toMatch(/<img/);
  });

  it('neutralises an attribute-breakout payload (\'">)', () => {
    const out = sanitize('foo.png"><script>alert(1)</script>');
    expect(out).not.toContain('"><');
    expect(out).not.toMatch(/<script/i);
  });
});
