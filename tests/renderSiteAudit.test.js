/**
 * Render-site audit + ratchet for the v10.64.60 bilingual toggle rollout.
 *
 * v10.64.60 refactored 6 primary render sites in renderQuiz to use qLang(q,...)
 * so the Hebrew↔English toggle takes effect on the active question. ~20 OTHER
 * render sites (track view, library, share, mock review, flashcard reveal,
 * bookmark display, AI prompts) still access q.q / q.o / q.e directly and
 * therefore render in the default Hebrew regardless of the toggle.
 *
 * Some bare accesses are INTENTIONAL — auto-tagging, dedup helpers, regex pool
 * matching, AI-prompt construction operate on the source data, not the user's
 * preferred render language. Those should stay bare.
 *
 * This file is a RATCHET, not a strict gate:
 *   - Counts must NOT increase (a new ${q.q} silently slipped in fails).
 *   - Counts SHOULD decrease over time as more render sites get qLang'd.
 *   - When a count goes down, bump the bound (lower numbers = more coverage).
 *
 * If a future session refactors more render surfaces (track view, library,
 * share text), the bare-access count will drop, this test will pass, and the
 * bound can be tightened in the same PR.
 *
 * The categorization comments below help future-Claude understand which sites
 * are "must refactor" vs "must stay bare". When in doubt, lean toward qLang —
 * if the rendered output is shown to a user via DOM, they'd benefit from the
 * toggle respecting their preference.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

describe('v10.64.60 render-site audit (ratchets)', () => {
  it('bare q.q accesses in HTML template-strings (heDir / sanitize / interpolation)', () => {
    // Patterns counted:
    //   ${q.q}           — bare interpolation in a template literal
    //   sanitize(q.q)    — sanitized but still bare
    //   heDir(q.q)       — direction helper, still bare
    // NOT counted (intentionally bare, internal logic):
    //   q.q.toLowerCase / q.q.includes / q.q.match / q.q.replace — search/regex
    //   q.q+' '+         — auto-tagging string concat
    //   q.q===           — equality check
    //   q.q.trim()       — pre-AI-prompt normalization
    const patterns = [
      /\$\{q\.q\}/g,
      /\$\{q\.q\.|sanitize\(q\.q\)/g,
      /heDir\(q\.q\)/g,
    ];
    const total = patterns.reduce((sum, p) => sum + (html.match(p) || []).length, 0);
    // 2026-05-12 update (v10.64.109): refactored flashcard reveal and
    // track-view bookmark to use qLang(q,'q'). Bare-access count dropped
    // from 12 → 8. Remaining: 1 AI autopsy prompt (intentional — operates
    // on source data, not user toggle) + 7 internal logic uses.
    const RATCHET = 8;
    expect(total, `bare q.q template-string accesses; expected ≤${RATCHET}`).toBeLessThanOrEqual(RATCHET);
  });

  it('bare q.o array accesses (forEach / map / [idx]) anywhere in source', () => {
    // Patterns counted:
    //   q.o.forEach(  — option iteration in render or analysis
    //   q.o.map(      — option transform
    //   q.o[<idx>]    — direct option lookup
    //   q.o.length    — length check (frequently legitimate; tracked anyway)
    //   q.o.join(     — flatten for AI prompt or share text
    // We count ALL occurrences and ratchet — many are intentional non-render
    // sites. The point is to detect a NEW one being added without notice.
    const patterns = [
      /q\.o\.forEach\(/g,
      /q\.o\.map\(/g,
      /q\.o\[[a-zA-Z_]/g,
      /q\.o\.length/g,
      /q\.o\.join\(/g,
    ];
    const total = patterns.reduce((sum, p) => sum + (html.match(p) || []).length, 0);
    // 2026-05-06 baseline after v10.64.60: 33 bare q.o accesses across the
    // monolith. As of 2026-05-12 (v10.64.109) the actual count is 20 —
    // prior PRs trimmed it without bumping the ratchet. Tightening now.
    // Remaining are AI prompt construction, voice narration, mock review,
    // and option counting (legitimate). Render sites in renderQuiz that
    // need qLang have already been refactored.
    const RATCHET = 20;
    expect(total, `bare q.o accesses; expected ≤${RATCHET}`).toBeLessThanOrEqual(RATCHET);
  });

  it('bare q.e accesses in HTML template-strings', () => {
    // Patterns counted (template-string render contexts only):
    //   ${q.e}          — interpolation
    //   sanitize(q.e)   — sanitized but bare
    //   heDir(q.e)      — direction helper, bare
    // NOT counted: q.e_issue (different field), q.eFlag (different field),
    // q.e? truthiness checks, !q.e bail-outs, q.e.length checks.
    const patterns = [
      /\$\{q\.e\}/g,
      /sanitize\(q\.e\)/g,
      /heDir\(q\.e\)/g,
    ];
    const total = patterns.reduce((sum, p) => sum + (html.match(p) || []).length, 0);
    // 2026-05-06 baseline after v10.64.60: 2 (mock-review path + AI autopsy
    // explanation reference). Both deferred to a future minor release.
    const RATCHET = 2;
    expect(total, `bare q.e template-string accesses; expected ≤${RATCHET}`).toBeLessThanOrEqual(RATCHET);
  });

  it('qLang(q, ...) adoption count (must NOT decrease; should grow over time)', () => {
    const calls = (html.match(/qLang\(q,\s*['"][a-zA-Z_]+['"]\)/g) || []).length;
    // 2026-05-12 (v10.64.112): floor adjusted 13 → 12 after consolidating the
    // bottom explanation panel into the autopsy block. The duplicate panel had
    // two qLang(q,'e') calls (heDir + remap); the autopsy adds one. Net -1.
    // 2026-06-12 (v10.64.168): floor adjusted 12 → 7 after deleting the
    // duplicate Sudden Death and On-Call render surfaces.
    // If a refactor accidentally REMOVES a qLang call without good reason, this
    // catches it. To intentionally remove one, lower this floor.
    const FLOOR = 7;
    expect(calls, `qLang() call count; expected ≥${FLOOR}`).toBeGreaterThanOrEqual(FLOOR);
  });
});

describe('v10.64.60 audit — surface-area inventory (informational)', () => {
  it('reports the deferred-refactor render surfaces present in HTML', () => {
    // This is a soft test — it always passes, but emits diagnostics about
    // which surfaces still bypass qLang. Helps planning v10.64.61 scope.
    const surfaces = {
      'flashcard reveal (renderFlash)': /renderFlash[\s\S]{0,900}\$\{q\.q\}/.test(html),
      'mock review block': /h\+='[^']*\$\{i\+1\}\.\s*'\+sanitize\(q\.q\)/.test(html) || /mock-review[\s\S]{0,500}sanitize\(q\.q\)/.test(html),
      'track-view bookmark display': /track-bk__row[^`]*\$\{q\.q/.test(html) || /track-bk__row[^`]*q\.q\.substring/.test(html),
      'AI autopsy prompt': /AI flagged[\s\S]{0,800}\$\{q\.q\}/.test(html) || /Question:\s*\$\{q\.q\}/.test(html),
    };
    const deferred = Object.entries(surfaces).filter(([, present]) => present).map(([name]) => name);
    // Always passes — informational. The list is logged for triage.
    if (deferred.length > 0) {
      console.log('[v10.64.60 audit] render surfaces still bypassing qLang:', JSON.stringify(deferred, null, 2));
    }
    expect(deferred.length).toBeGreaterThanOrEqual(0);  // tautology — informational
  });

  it('S.langPref is a known string when set (defensive contract for callers)', () => {
    // qLang reads S.langPref directly. The valid values are 'en' and 'he'.
    // Anything else falls back to default-Hebrew (treated as if undefined).
    // toggleLang only ever sets it to one of those two. This pins the
    // toggleLang body so a future bug like `S.langPref='english'` can't slip.
    const m = html.match(/function toggleLang\(\)\{[^}]+\}/);
    expect(m).toBeTruthy();
    // Must assign one of the two strings, not anything else.
    expect(m[0]).toMatch(/S\.langPref=\(S\.langPref===['"]en['"]\)\?['"]he['"]:['"]en['"]/);
    // Must not assign any other token like 'english', 'hebrew', true, false.
    expect(m[0]).not.toMatch(/S\.langPref\s*=\s*['"](english|hebrew|true|false)['"]/);
  });
});
