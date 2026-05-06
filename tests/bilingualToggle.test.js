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

  it('explanation render uses qLang(q,"e") for both heDir and remap', () => {
    expect(html).toMatch(/heDir\(qLang\(q,['"]e['"]\)\)/);
    expect(html).toMatch(/remapExplanationLetters\(qLang\(q,['"]e['"]\),_shuf\)/);
  });
});
