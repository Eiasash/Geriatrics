/**
 * v10.38.4 regression: inline `onclick="..."` handlers must not reference
 * variables that only exist in closure scope.
 *
 * Original bug (v10.36.x → v10.38.3): the Hazzard and Harrison in-app readers
 * built button HTML inside a function where `ch = _hazData[String(hazChOpen)]`
 * was a `const` local. The onclick attributes wrote `ch.title` *as bare JS*:
 *
 *   onclick="quizMeOnChapter(harChOpen, ch.title)"
 *
 * When the user actually tapped the button, the click handler ran in *global*
 * scope where `ch` does not exist, throwing `ReferenceError: ch is not
 * defined`. The Quiz, Generate Qs, and Summary buttons all silently failed.
 *
 * Fix: substitute the title at template-build time, properly encoded for both
 * the HTML-attribute layer (sanitize → &quot; etc.) and the JS-string-literal
 * layer (JSON.stringify → "..."):
 *
 *   onclick="quizMeOnChapter(harChOpen, ${sanitize(JSON.stringify(ch.title))})"
 *
 * After build, the runtime attribute contains the encoded string literal —
 * no bare `ch.` reference at click time.
 *
 * Lock: this test asserts no `onclick="..."` attribute contains a bare
 * `ch.<word>` reference. References inside `${...}` interpolation are fine
 * (those evaluate at template-build time when `ch` is in scope).
 *
 * This test generalizes `grs8RowBindingFormat.test.js` to the broader pattern
 * of closure-scoped local vars leaking into inline event handlers.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

// Strip everything inside ${...} (template-literal interpolations) so the
// remaining text is only what ends up in the live attribute string.
function stripTemplateInterpolations(s) {
  // Handle nested ${} (e.g. ${sanitize(JSON.stringify(ch.title))} contains parens).
  // Simple counter-based scan since regex can't match balanced delimiters.
  let out = '';
  let i = 0;
  while (i < s.length) {
    if (s[i] === '$' && s[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < s.length && depth > 0) {
        if (s[i] === '{') depth++;
        else if (s[i] === '}') depth--;
        i++;
      }
    } else {
      out += s[i++];
    }
  }
  return out;
}

describe('Inline onclick closure-leak guard (v10.38.4 lock)', () => {
  it('no onclick="..." references a bare `ch.<word>` outside ${...}', () => {
    const onclickRe = /onclick="([^"]*)"/g;
    const offenders = [];
    let m;
    while ((m = onclickRe.exec(html)) !== null) {
      const body = m[1];
      const stripped = stripTemplateInterpolations(body);
      // After stripping interpolations, any `ch.<word>` left must be a bare ref.
      if (/\bch\.[a-zA-Z_$]/.test(stripped)) {
        const lineNo = html.slice(0, m.index).split('\n').length;
        offenders.push({ line: lineNo, body: body.slice(0, 140) });
      }
    }
    if (offenders.length) {
      const detail = offenders
        .map(o => `  L${o.line}: ${o.body}`)
        .join('\n');
      throw new Error(
        `Found ${offenders.length} onclick handler(s) with bare ch.* reference ` +
        `(closure-scoped local leaking into global click handler):\n${detail}\n` +
        `Fix: substitute at template time, e.g. \`onclick="fn(\${sanitize(JSON.stringify(ch.title))})"\`.`
      );
    }
    expect(offenders.length).toBe(0);
  });

  it('Hazzard reader Quiz/Generate/Summary buttons substitute title at template time', () => {
    // Sanity: the three Hazzard buttons must use the encoded-substitution pattern.
    const expected = [
      /onclick="quizMeOnChapter\(hazChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
      /onclick="generateQuestionsFromChapter\('haz',hazChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
      /onclick="aiSummarizeChapter\(hazChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
    ];
    for (const re of expected) {
      expect(html, `Hazzard button missing title-substitution: ${re}`).toMatch(re);
    }
  });

  it('Harrison reader Quiz/Generate/Summary buttons substitute title at template time', () => {
    const expected = [
      /onclick="quizMeOnChapter\(harChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
      /onclick="generateQuestionsFromChapter\('har',harChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
      /onclick="aiSummarizeChapter\(harChOpen,\$\{sanitize\(JSON\.stringify\(ch\.title\)\)\}\)"/,
    ];
    for (const re of expected) {
      expect(html, `Harrison button missing title-substitution: ${re}`).toMatch(re);
    }
  });
});
