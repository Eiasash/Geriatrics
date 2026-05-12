/**
 * tests/hebrewBidiSafety.test.js
 *
 * Two real-risk surfaces in one file:
 *
 *   1. innerHTML-safety helpers (escapeHtml, sanitize) — first line of
 *      defence against XSS in the single-file PWA. The
 *      check-innerhtml.py audit script statically pins call-sites; this
 *      test pins runtime behaviour on adversarial payloads (mixed
 *      quotes, surrogate pairs, repeated escapes).
 *
 *   2. heDir() — direction picker for mixed Hebrew + English + numbers
 *      + drug names. Replaced naive dir="auto" because dir="auto" uses
 *      first-strong character only, which flips Hebrew-majority lines
 *      to LTR when they start with IgG4-RD / MEN1 / CT / a number.
 *      The clinical content layer is heavily mixed (Hebrew prose with
 *      embedded English drug names + lab values), so any regression
 *      here visibly corrupts the question stem on screen.
 *
 * All three helpers are extracted from shlav-a-mega.html in-place — same
 * bytes as ship — so the regex extractors must stay in lockstep with
 * the source.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
let html;
let helpers;

/**
 * Pull the entire single line that begins with `function <name>(` from
 * the source. Each of the three helpers we test is intentionally a
 * one-liner in shlav-a-mega.html, so a per-line lookup is the simplest
 * extractor.
 */
function extractLine(prefix) {
  const lines = html.split('\n');
  for (const line of lines) {
    if (line.startsWith(prefix)) return line;
  }
  throw new Error('helper line not found: ' + prefix);
}

beforeAll(() => {
  html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');
  const blocks = [
    extractLine('function escapeHtml(s){'),
    extractLine('function sanitize(s){'),
    extractLine('function heDir(s){'),
  ].join('\n');
  // eslint-disable-next-line no-new-func
  const factory = new Function(blocks + '\nreturn { escapeHtml: escapeHtml, sanitize: sanitize, heDir: heDir };');
  helpers = factory();
});

describe('escapeHtml — XSS defence', () => {
  it('escapes the canonical < > & " \' set', () => {
    expect(helpers.escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(helpers.escapeHtml(`a"b'c&d`)).toBe('a&quot;b&#39;c&amp;d');
  });
  it('handles null/undefined as empty string', () => {
    expect(helpers.escapeHtml(null)).toBe('');
    expect(helpers.escapeHtml(undefined)).toBe('');
  });
  it('coerces non-strings via String()', () => {
    expect(helpers.escapeHtml(42)).toBe('42');
    expect(helpers.escapeHtml(true)).toBe('true');
  });
  it('idempotent under encoding-then-decoding inputs (no double-decode)', () => {
    // already-encoded entities should round-trip with their & re-escaped
    expect(helpers.escapeHtml('&lt;')).toBe('&amp;lt;');
  });
  it('escapes attribute-breaking quotes', () => {
    expect(helpers.escapeHtml('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)');
  });
  it('preserves Hebrew letters untouched', () => {
    expect(helpers.escapeHtml('שלום עולם')).toBe('שלום עולם');
  });
  it('handles surrogate pairs (emoji / CJK)', () => {
    expect(helpers.escapeHtml('💊 קלופידוגרל')).toBe('💊 קלופידוגרל');
  });
  it('escapes mixed Hebrew + injection payload', () => {
    expect(helpers.escapeHtml('המטופל <img src=x onerror=alert(1)>')).toBe(
      'המטופל &lt;img src=x onerror=alert(1)&gt;',
    );
  });
});

describe('sanitize — same surface, different code path', () => {
  it('escapes the canonical set in same order as escapeHtml', () => {
    expect(helpers.sanitize('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });
  it('null/undefined → empty string (no NaN, no "null")', () => {
    expect(helpers.sanitize(null)).toBe('');
    expect(helpers.sanitize(undefined)).toBe('');
    expect(helpers.sanitize('')).toBe('');
  });
  it('preserves multi-byte chars (Hebrew + Arabic + emoji)', () => {
    expect(helpers.sanitize('שלום السلام 🩺')).toBe('שלום السلام 🩺');
  });
  it('blocks JS-protocol-like injection (string-only — DOM still needs href filter)', () => {
    // sanitize does not strip "javascript:", but it does prevent the
    // attribute-break that would otherwise let the URL be honoured.
    expect(helpers.sanitize('javascript:alert(1)')).toBe('javascript:alert(1)');
    // The protective bit: the surrounding context can't break out
    expect(helpers.sanitize('"javascript:alert(1)"')).toContain('&quot;');
  });
  it('matches escapeHtml byte-for-byte on a representative payload', () => {
    const payload = `<x a="b" c='d'>&amp;`;
    expect(helpers.sanitize(payload)).toBe(helpers.escapeHtml(payload));
  });
});

describe('heDir — Hebrew/English direction picker for mixed clinical text', () => {
  it('pure Hebrew → rtl', () => {
    expect(helpers.heDir('המטופל בן 82')).toBe('rtl');
  });
  it('pure English → ltr', () => {
    expect(helpers.heDir('Clopidogrel 75 mg PO')).toBe('ltr');
  });
  it('Hebrew majority with embedded English drug name → rtl', () => {
    // The exact bug heDir was written to fix: dir="auto" flipped this to ltr
    expect(helpers.heDir('המטופל קיבל Clopidogrel 75 מ"ג')).toBe('rtl');
  });
  it('Hebrew prose starting with English acronym → still rtl when Hebrew-majority', () => {
    // "MEN1 / IgG4-RD / CT" — the failure mode that motivated heDir.
    // The exact threshold is he/(he+en) >= 0.25 → rtl, so a stem with
    // a bit of Hebrew but mostly English will still be ltr; what we
    // care about is that a Hebrew-MAJORITY line never goes ltr.
    expect(helpers.heDir('CT הראש הראה דימום תת-עכבישי')).toBe('rtl');
    expect(helpers.heDir('IgG4-RD היא מחלה דלקתית כרונית של מבוגרים')).toBe('rtl');
    expect(helpers.heDir('MEN1 כולל היפר-פאראתירואידיזם, גידולי לבלב, ואדנומה היפופיזרית')).toBe('rtl');
  });
  it('English-majority with one Hebrew word → ltr (matches >=0.25 threshold)', () => {
    // 1 Hebrew word, 9 English words → 1/(1+9) = 10%, well below 25% → ltr
    expect(helpers.heDir('The patient developed dyspnea after קלופידוגרל infusion last night for ACS')).toBe('ltr');
  });
  it('numbers + symbols only → auto (no strong direction)', () => {
    expect(helpers.heDir('75 mg ÷ 1.5 = 50')).toBe('ltr'); // English letters tip it
    expect(helpers.heDir('75 / 1.5 = 50')).toBe('auto');
    expect(helpers.heDir('   ')).toBe('auto');
    expect(helpers.heDir('')).toBe('auto');
  });
  it('null/undefined → auto', () => {
    expect(helpers.heDir(null)).toBe('auto');
    expect(helpers.heDir(undefined)).toBe('auto');
  });
  it('coerces non-string input', () => {
    expect(helpers.heDir(42)).toBe('auto');
  });
  it('threshold bug-hunt: line with exactly ~25% Hebrew goes rtl, not ltr', () => {
    // 5 Hebrew letters + 15 English letters = 5/20 = 25% — boundary
    // Boundary inclusive: >= 0.25 → rtl
    expect(helpers.heDir('שלוםא Clopidogrel mg')).toBe('rtl');
  });
  it('clinically realistic mixed-content lines from the question bank', () => {
    expect(helpers.heDir('בן 78, סוכרת, יל"ד, קיבל Metformin ו-Lisinopril')).toBe('rtl');
    expect(helpers.heDir('פרפור פרוזדורים → CHA₂DS₂-VASc = 4')).toBe('rtl');
    // 4 Hebrew chars vs 27 English = 13% Hebrew, below the 25% threshold → ltr
    expect(helpers.heDir('אבחנה: NPH (normal pressure hydrocephalus)')).toBe('ltr');
    // ...but a Hebrew-led variant flips it back to rtl (Hebrew word added)
    expect(helpers.heDir('אבחנה ראשית: NPH מים יתר במוח')).toBe('rtl');
  });
});

describe('innerHTML-safety regressions — pin sanitize is called on user-derived strings', () => {
  it('sanitize is referenced at every confirmModal call site (static pin)', () => {
    // Hard-pin: the only way confirmModal can be safe is if the
    // message goes through sanitize() before innerHTML insertion.
    const cm = html.match(/function confirmModal\([^\)]*\)\{[\s\S]+?\}/);
    expect(cm).not.toBeNull();
    expect(cm[0]).toMatch(/sanitize\(msg\)/);
  });
  it('document has at least one dir="auto" + unicode-bidi:plaintext pairing', () => {
    // Required by hard-constraint § D.7: every Hebrew text container
    // needs both. We check that the vocabulary appears at all (the
    // existing visualOverhaul2026 + trackViewMarkup tests pin the
    // specific containers).
    expect(html).toMatch(/dir="auto"/);
    expect(html).toMatch(/unicode-bidi:\s*plaintext/);
  });
});

describe('Distractor Autopsy — bidi correctness (v10.64.110 regression pins)', () => {
  // Catches the v10.64.109-and-earlier bug class where the autopsy block
  // flattened multi-paragraph AI output into a single bidi context with
  // .replace(/\n/g,'<br>'). English labels ("Wrong because:") then pulled
  // adjacent Hebrew lines to LTR, making them render backwards.

  it('aiAutopsy() never uses bulk \\n→<br> replacement (forces per-line rendering)', () => {
    const fn = html.match(/async function aiAutopsy\([\s\S]+?\nrender\(\);\n\}/);
    expect(fn, 'aiAutopsy function not found — has it been renamed?').not.toBeNull();
    expect(fn[0], 'aiAutopsy regressed to bulk \\n→<br> — split by line and wrap each in <div dir="…"> instead').not.toMatch(/replace\(\/\\n\/g,\s*['"]<br>['"]\)/);
  });

  it('aiAutopsy() emits per-line dir-aware divs (split-then-map pattern)', () => {
    const fn = html.match(/async function aiAutopsy\([\s\S]+?\nrender\(\);\n\}/);
    expect(fn).not.toBeNull();
    // Must split the AI text by newline AND wrap each line with its own dir attr.
    expect(fn[0]).toMatch(/split\(['"]\\n['"]\)/);
    expect(fn[0]).toMatch(/dir="\$\{heDir\(/);
  });

  it('English autopsy labels ("Wrong because:" / "Would be correct if:" / "Correct because:") are <bdi>-isolated', () => {
    // English labels embedded in mixed Hebrew/English runs must be wrapped
    // in <bdi> so they cannot pull adjacent Hebrew text to LTR. Both the
    // pre-generated DIS render path AND the AI on-demand path must isolate.
    // v10.64.111: "Correct because:" added alongside the existing two labels.
    const wrongBecauseSites = html.match(/Wrong because:<\/b>/g) || [];
    const wouldBeSites = html.match(/Would be correct if:<\/b>/g) || [];
    const correctBecauseSites = html.match(/Correct because:<\/b>/g) || [];
    expect(wrongBecauseSites.length, 'at least one Wrong because: label expected').toBeGreaterThan(0);
    expect(wouldBeSites.length, 'at least one Would be correct if: label expected').toBeGreaterThan(0);
    expect(correctBecauseSites.length, 'at least one Correct because: label expected').toBeGreaterThan(0);
    // The whole label including </b></bdi> must appear at every site.
    const wrongBecauseWrapped = (html.match(/Wrong because:<\/b><\/bdi>/g) || []).length;
    const wouldBeWrapped = (html.match(/Would be correct if:<\/b><\/bdi>/g) || []).length;
    const correctBecauseWrapped = (html.match(/Correct because:<\/b><\/bdi>/g) || []).length;
    expect(wrongBecauseWrapped).toBe(wrongBecauseSites.length);
    expect(wouldBeWrapped).toBe(wouldBeSites.length);
    expect(correctBecauseWrapped).toBe(correctBecauseSites.length);
  });

  it('the DIS-render forEach uses heDir(line) per-line, not heDir(rationale+opt) on outer', () => {
    // Outer container must be dir="auto" so each inner line resolves its own
    // direction. The old pattern heDir((_rationale||'')+opt) gave the whole
    // row one direction, breaking when rationale started with English.
    expect(html, 'DIS-render row container regressed — outer should be dir="auto"').not.toMatch(/dir="\$\{heDir\(\(_rationale\|\|''\)\+opt\)\}"/);
  });
});
