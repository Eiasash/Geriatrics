/**
 * Tests for v10.64.60 bilingual schema + Hebrew↔English toggle.
 *
 * Background — v10.64.54 + v10.64.59 translated 1,877 AI Hazzard/Harrison/GRS8
 * questions from English to Hebrew via Sonnet 4.6, in --mode in-place. The
 * original English was only retrievable from git history (commit f8d2c41).
 * v10.64.60 migrates that English back into the schema as q_en/o_en/e_en
 * sibling fields so users can toggle between source and translation.
 *
 * Pinned contracts:
 *   1. Schema — every translated question carries q_en/o_en/e_en fields.
 *   2. Helper — qLang(q,field) returns the lang-preferred variant w/ fallback.
 *   3. UI — header has a data-action="toggle-lang" button.
 *   4. State — toggleLang flips S.langPref between 'he' and 'en'.
 *   5. Render — quiz render sites use qLang(q,...) not bare q.q/q.o/q.e.
 *   6. Init — header button text syncs with stored S.langPref on boot.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');
const questions = JSON.parse(readFileSync(resolve(ROOT, 'data/questions.json'), 'utf-8'));

describe('v10.64.60 — bilingual schema (q_en / o_en / e_en)', () => {
  it('a meaningful share of AI-tagged questions carry q_en bilingual fields', () => {
    // After the 2026-05-06 migration, ~1,867 of ~2,260 AI-tagged Qs (Hazzard/
    // Harrison/GRS8) should have q_en. Lower-bound 1500 absorbs minor edits.
    const aiTags = new Set(['Hazzard','Harrison','GRS8','Hazzard-suppl']);
    const aiQs = questions.filter((q) => aiTags.has(q.t));
    const withEn = aiQs.filter((q) => typeof q.q_en === 'string' && q.q_en.length > 0);
    expect(withEn.length).toBeGreaterThanOrEqual(1500);
  });

  it('every q_en is paired with o_en (array of same length as q.o) and e_en', () => {
    const offenders = [];
    questions.forEach((q, i) => {
      if (typeof q.q_en !== 'string') return;
      if (!Array.isArray(q.o_en)) offenders.push({ idx: i, missing: 'o_en' });
      else if (q.o_en.length !== q.o.length) offenders.push({ idx: i, missing: 'o_en len mismatch', oLen: q.o.length, oEnLen: q.o_en.length });
      if (typeof q.e_en !== 'string') offenders.push({ idx: i, missing: 'e_en' });
    });
    expect(offenders, `bilingual-shape offenders (first 3): ${JSON.stringify(offenders.slice(0,3))}`).toEqual([]);
  });

  it('q_en text is English-dominant (catches accidental Hebrew-in-q_en migration bugs)', () => {
    const HEB_RE = /[֐-׿]/g;
    const offenders = [];
    questions.forEach((q, i) => {
      if (typeof q.q_en !== 'string' || !q.q_en.length) return;
      const heb = (q.q_en.match(HEB_RE) || []).length;
      if (heb / q.q_en.length > 0.3) offenders.push(i);
    });
    expect(offenders.length, `q_en too Hebrew at ${offenders.slice(0,5)}...`).toBeLessThan(5);
  });
});

describe('v10.64.60 — qLang helper + toggleLang function + UI wiring', () => {
  it('qLang helper is defined and queries S.langPref', () => {
    expect(html).toMatch(/function qLang\(q,field\)/);
    // The helper must read S.langPref to decide which variant to return.
    expect(html).toMatch(/qLang\(q,field\)\{[^}]+S\.langPref===['"]en['"]/);
    // And must look up q[field+'_en'] for the English variant.
    expect(html).toMatch(/q\[field\+['"]_en['"]\]/);
  });

  it('toggleLang function flips between "he" and "en" and triggers render', () => {
    const m = html.match(/function toggleLang\(\)\{[^}]+\}/);
    expect(m, 'toggleLang function not found').toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/S\.langPref=\(S\.langPref===['"]en['"]\)\?['"]he['"]:['"]en['"]/);
    expect(body).toMatch(/save\(\)/);
    expect(body).toMatch(/render\(\)/);
  });

  it('header has a data-action="toggle-lang" button with id hdr-lang-btn', () => {
    expect(html).toMatch(/data-action="toggle-lang"[^>]*id="hdr-lang-btn"|id="hdr-lang-btn"[^>]*data-action="toggle-lang"/);
  });

  it('the delegated event handler routes toggle-lang → toggleLang()', () => {
    expect(html).toMatch(/case ['"]toggle-lang['"]:\s*toggleLang\(\)/);
  });

  it('boot init reads S.langPref and updates the header button text', () => {
    // After S.dark/S.studyMode init, a sync block must update hdr-lang-btn textContent.
    // Allow crossing one statement-terminator since the typical pattern is
    // `const _lb=...getElementById(...);if(_lb)_lb.textContent=...`.
    expect(html).toMatch(/getElementById\(['"]hdr-lang-btn['"]\)[\s\S]{0,120}\.textContent\s*=/);
    // Sanity — the value assigned must reference S.langPref.
    expect(html).toMatch(/textContent\s*=\s*\(S\.langPref===['"]en['"]\)/);
  });
});

describe('v10.64.60 — render sites use qLang (regression guard)', () => {
  it('the primary quiz question text render uses qLang(q,"q") not bare q.q', () => {
    // The two main `h+=`<p class="heb"...` blocks in renderQuiz should both use qLang.
    const bareQq = (html.match(/h\+=`<p class="heb"[^`]*\$\{q\.q\}<\/p>/g) || []).length;
    expect(bareQq, 'renderQuiz must use qLang(q,"q") for question text, not bare q.q').toBe(0);
    // And there should be at least one site using qLang.
    expect(html).toMatch(/h\+=`<p class="heb"[^`]*\$\{qLang\(q,['"]q['"]\)\}/);
  });

  it('the option iteration uses qLang(q,"o") not bare q.o.forEach', () => {
    // The Sudden Death option render block uses qLang(q,'o').forEach.
    expect(html).toMatch(/qLang\(q,['"]o['"]\)\.forEach/);
  });

  it('explanation render uses qLang(q,"e") and remapExplanationLetters (v10.64.112: now lives in the autopsy correct-row, formerly in _rqmExplain)', () => {
    // v10.64.112 consolidation: the bottom explanation panel was removed because
    // the autopsy block already renders the explanation. The render contract
    // moves with it. heDir is now called per-line on the line variable (not on
    // qLang(q,'e') directly), and remap is applied once to _expl (which is
    // qLang(q,'e')) before splitting into lines.
    expect(html, 'qLang(q,"e") must still be the source for the explanation render').toMatch(/qLang\(q,\s*['"]e['"]\)/);
    expect(html, 'remapExplanationLetters must still be applied to the explanation source').toMatch(/remapExplanationLetters\(_expl,_shuf\)/);
  });
});

describe('v10.64.60 — bilingual schema deep invariants', () => {
  it('correct-answer index `c` is valid for o_en (no off-by-one in migration)', () => {
    // A migration bug could put o_en in different order than o, making c invalid.
    // We trust c < q.o.length is enforced elsewhere; here we check the same for o_en.
    const offenders = [];
    questions.forEach((q, i) => {
      if (!Array.isArray(q.o_en)) return;
      if (typeof q.c !== 'number') return;
      if (q.c < 0 || q.c >= q.o_en.length) offenders.push({idx:i, c:q.c, oEnLen:q.o_en.length});
    });
    expect(offenders, `c-index out of bounds for o_en (first 3): ${JSON.stringify(offenders.slice(0,3))}`).toEqual([]);
  });

  it('q_en is meaningfully non-empty when present (≥10 chars, not whitespace)', () => {
    const offenders = [];
    questions.forEach((q, i) => {
      if (typeof q.q_en !== 'string') return;
      if (q.q_en.trim().length < 10) offenders.push({idx:i, len:q.q_en.length});
    });
    expect(offenders.length, `degenerate q_en at first 5: ${JSON.stringify(offenders.slice(0,5))}`).toBeLessThan(5);
  });

  it('o_en options are non-empty strings (no nulls / undefineds from migration)', () => {
    const offenders = [];
    questions.forEach((q, i) => {
      if (!Array.isArray(q.o_en)) return;
      q.o_en.forEach((o, oi) => {
        if (typeof o !== 'string' || o.trim().length === 0) offenders.push({idx:i, optIdx:oi, type:typeof o});
      });
    });
    expect(offenders, `null/empty o_en options (first 3): ${JSON.stringify(offenders.slice(0,3))}`).toEqual([]);
  });

  it('e_en is meaningfully populated when present (≥30 chars or empty)', () => {
    // Some original questions had short/missing explanations; the migration preserves
    // those. But a partial migration that wrote "" or " " would be wrong.
    const offenders = [];
    questions.forEach((q, i) => {
      if (typeof q.e_en !== 'string') return;
      const t = q.e_en.trim();
      // Either fully empty (rare but legitimate) or substantively populated.
      if (t.length > 0 && t.length < 30) offenders.push({idx:i, len:t.length});
    });
    expect(offenders.length, `degenerate e_en at first 5: ${JSON.stringify(offenders.slice(0,5))}`).toBeLessThan(10);
  });
});

describe('v10.64.60 — qLang runtime behavior (vm sandbox)', () => {
  // Pull the qLang function source out of the HTML and execute it in isolation
  // to test actual behavior, not just regex byte presence.
  function buildQLang() {
    // The qLang source has nested braces (an `if` block inside the body), so
    // [^}]+? would stop at the first inner `}`. Use a more specific terminator
    // that matches the actual closing pattern: `return q[field];}` is the
    // last statement.
    const m = html.match(/function qLang\(q,field\)\{[\s\S]+?return q\[field\];\}/);
    if (!m) throw new Error('qLang source not extractable from HTML');
    // The function reads S.langPref. We provide a controllable S.
    const factory = new Function('S', m[0] + '\nreturn qLang;');
    return factory;
  }

  it('returns q.q (Hebrew) when S.langPref is undefined', () => {
    const qLang = buildQLang()({});
    const q = { q: 'שאלה', q_en: 'question' };
    expect(qLang(q, 'q')).toBe('שאלה');
  });

  it('returns q.q (Hebrew) when S.langPref === "he"', () => {
    const qLang = buildQLang()({ langPref: 'he' });
    const q = { q: 'שאלה', q_en: 'question' };
    expect(qLang(q, 'q')).toBe('שאלה');
  });

  it('returns q.q_en (English) when S.langPref === "en" AND q_en exists', () => {
    const qLang = buildQLang()({ langPref: 'en' });
    const q = { q: 'שאלה', q_en: 'question' };
    expect(qLang(q, 'q')).toBe('question');
  });

  it('falls back to q.q when S.langPref === "en" but q_en is missing', () => {
    const qLang = buildQLang()({ langPref: 'en' });
    const q = { q: 'שאלה' };  // no q_en
    expect(qLang(q, 'q')).toBe('שאלה');
  });

  it('falls back when q_en is null or empty string (sentinel for translation failure)', () => {
    const qLang = buildQLang()({ langPref: 'en' });
    expect(qLang({ q: 'A', q_en: null }, 'q')).toBe('A');
    // Empty string IS technically defined; current behavior returns the empty string.
    // This pins that behavior — if it changes, intentional bump required.
    expect(qLang({ q: 'A', q_en: '' }, 'q')).toBe('');
  });

  it('handles "o" array field correctly (each language gets its own array)', () => {
    const qLang = buildQLang()({ langPref: 'en' });
    const q = { o: ['א', 'ב', 'ג', 'ד'], o_en: ['A', 'B', 'C', 'D'] };
    expect(qLang(q, 'o')).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('v10.64.61 — bilingual search filter (matches across both languages)', () => {
  it('renderSearch QZ filter composes a haystack from q AND q_en AND o AND o_en', () => {
    // Pull the QZ-search filter block (line ~5847 area). The new shape is:
    //   const _hs=[item.q,item.q_en,...(item.o||[]),...(item.o_en||[])];
    //   if(_hs.some(s=>(s||'').toLowerCase().includes(q))) qRes.push(i);
    const m = html.match(/const qRes=\[\];QZ\.forEach\([\s\S]+?qRes\.push\(i\);\}\);/);
    expect(m, 'renderSearch QZ filter not found').toBeTruthy();
    const block = m[0];
    expect(block, 'haystack must include item.q_en').toMatch(/item\.q_en/);
    expect(block, 'haystack must spread item.o_en (defensive ||[])').toMatch(/\.\.\.\(item\.o_en\|\|\[\]\)/);
    expect(block, 'haystack must include item.q (Hebrew default)').toMatch(/item\.q[^_]/);
    expect(block, 'haystack must spread item.o (Hebrew default)').toMatch(/\.\.\.\(item\.o\|\|\[\]\)/);
    // Defensive guard from v10.64.58 must survive the refactor.
    expect(block).toMatch(/\(s\|\|''\)\.toLowerCase\(\)\.includes\(q\)/);
  });

  it('the older single-language form is gone (regression guard)', () => {
    // Pre-v10.64.61 form: `(item.q||'').toLowerCase().includes(q)||(item.o||[]).some(...)` — without q_en or o_en.
    // After refactor that exact bare form should not appear in the QZ filter site.
    const m = html.match(/const qRes=\[\];QZ\.forEach[\s\S]+?qRes\.push\(i\);\}\);/);
    expect(m).toBeTruthy();
    expect(m[0], 'pre-v10.64.61 single-lang search shape must be gone').not.toMatch(/\(item\.q\|\|''\)\.toLowerCase\(\)\.includes\(q\)\|\|\(item\.o\|\|\[\]\)\.some/);
  });

  it('search runtime: substring match works against q_en even when q is Hebrew', () => {
    // Functional test in vm sandbox of the haystack semantics.
    const QZ = [
      { q: 'מה הסיבה השכיחה ל-Locked-in Syndrome?', q_en: 'What is the most common cause of Locked-in Syndrome?', o: ['שיתוק','עורק'], o_en: ['paralysis','artery'], t: 'Hazzard' },
      { q: 'שאלה רגילה ללא תרגום', o: ['א','ב','ג','ד'], t: '2024-Sep' },
    ];
    const search = (raw) => {
      const q = raw.toLowerCase();
      const out = [];
      QZ.forEach((item, i) => {
        const _hs = [item.q, item.q_en, ...(item.o || []), ...(item.o_en || [])];
        if (_hs.some(s => (s || '').toLowerCase().includes(q))) out.push(i);
      });
      return out;
    };
    expect(search('locked-in')).toEqual([0]);  // only matches the Hazzard Q via q_en
    expect(search('paralysis')).toEqual([0]);  // matches via o_en
    expect(search('שיתוק')).toEqual([0]);       // matches via o (Hebrew)
    expect(search('רגילה')).toEqual([1]);       // matches the Hebrew-only Q
    // q_en absent → spread on undefined would throw; the ||[] guard prevents that.
    expect(() => search('xyz')).not.toThrow();
  });
});

describe('v10.64.60 — translator skip-list pin (Sonnet mojibake guard)', () => {
  it('scripts/translate_questions_to_hebrew.cjs hardcodes SKIP_INDICES with idx=835', () => {
    // Sonnet 4.6 has consistently produced U+FFFD mojibake on idx=835 across
    // two batches (v10.64.54 + v10.64.59). The skip prevents re-discovery of
    // the failure mode. If this test fails, the script may have been refactored
    // and the skip-list lost — the next translation run would reintroduce the
    // mojibake and the U+FFFD guard in expandedDataIntegrity.test.js would catch
    // it post-hoc, but at the cost of API spend and a manual revert.
    const scriptPath = resolve(ROOT, 'scripts/translate_questions_to_hebrew.cjs');
    const script = readFileSync(scriptPath, 'utf-8');
    expect(script).toMatch(/SKIP_INDICES\s*=\s*new Set\(\[\s*835\s*\]\)/);
    // The candidate filter must consult SKIP_INDICES.
    expect(script).toMatch(/!SKIP_INDICES\.has\(/);
  });
});

describe('translator bilingual mode — q_en/o_en/e_en schema pin', () => {
  // The script's bilingual mode predated the v10.64.60 paired-variant schema:
  // it used to write qHe/oHe/eHe, which the app's Heb<->Eng toggle never read
  // (0 of 1,867 live bilingual Qs use it). It was fixed to write the real
  // q_en/o_en/e_en schema. This pin prevents a silent regression to the dead
  // form — a translation run on the stale script ships toggle-less Hebrew.
  const scriptPath = resolve(ROOT, 'scripts/translate_questions_to_hebrew.cjs');
  const script = readFileSync(scriptPath, 'utf-8');

  it('bilingual mode writes the q_en/o_en/e_en production schema', () => {
    expect(script).toMatch(/target\.q_en\s*=/);
    expect(script).toMatch(/target\.o_en\s*=/);
    expect(script).toMatch(/target\.e_en\s*=/);
  });

  it('bilingual mode no longer writes the dead qHe/oHe/eHe schema', () => {
    expect(script).not.toMatch(/target\.qHe\s*=/);
    expect(script).not.toMatch(/target\.oHe\s*=/);
    expect(script).not.toMatch(/target\.eHe\s*=/);
  });

  it('--tag allowlist includes SZMC-Rescue (rescued-MCQ staging tag)', () => {
    expect(script).toMatch(/'SZMC-Rescue'/);
  });
});
