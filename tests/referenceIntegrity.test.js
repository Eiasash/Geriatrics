/**
 * Reference-integrity guard (v10.64.149).
 *
 * The 2026-05-31 content audit (§1d / §1e) asked for a ratchet that proves the
 * `q.ref` citations stay internally consistent. Two failure classes are guarded:
 *
 *  1. PHANTOM CHAPTERS (hard, == 0): every ref segment that names a textbook
 *     (Hazzard / Harrison, English "Ch N" or Hebrew "פרק N" form, with an optional
 *     "8e"/"22e" edition marker) must cite a chapter number that ACTUALLY EXISTS in
 *     that book — Hazzard 1..108 (data/hazzard_chapters.json) or Harrison 1..505
 *     (data/harrison_22e_toc.json, the existence index). A ref citing "Harrison Ch
 *     999" or a typo'd chapter is a real data bug; this is the catch.
 *
 *  2. GAP RATCHETS (must-not-grow): two intentional, audited gaps may shrink but
 *     never grow without explicit review —
 *       - EMPTY refs (75): the SZMC-Rescue Qs left unsourced per the anti-fabrication
 *         rule (#307 recovered 5 of the original 80 from `_refs_orig`; the rest have
 *         no real textbook source). A NEW empty ref means a new unsourced Q slipped in.
 *       - Harrison UNINDEXED-but-valid (219): Harrison chapters cited in refs that
 *         exist in the 505-chapter TOC but have no in-app reader content (only 69
 *         chapters are indexed in harrison_chapters.json — the rest are copyrighted
 *         and BLOCKED from inclusion, same wall as the oncology cluster). Growth here
 *         means more Qs point at a chapter the reader can't open — flag for review.
 *
 * Legitimate NON-chapter citations (Israeli law, USPSTF/ADA/CDC guidelines, clinical
 * trials, Brookdale demographic stats, page-only refs) produce no parseable book+chapter
 * segment and are correctly ignored by the phantom check — they are not textbook
 * chapter citations and must not be forced into one.
 *
 * Baselines captured 2026-06-01 on `main` after PR "ref-hygiene-ch14-guard" (which
 * dropped 9 boilerplate-mistagged "Harrison Ch 14 — Pain" halves from non-pain Qs and
 * canonicalized the glued "הריסון370" ref). If a legitimate change moves a baseline,
 * update the constant here IN THE SAME PR with a one-line note — do not silently widen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const rd = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf-8'));

const QZ = rd('data/questions.json');
const HAR_TOC = new Set(Object.keys(rd('data/harrison_22e_toc.json')).filter((k) => /^\d+$/.test(k)).map(Number)); // existence (1..505)
const HAR_CONTENT = new Set(Object.keys(rd('harrison_chapters.json')).filter((k) => /^\d+$/.test(k)).map(Number)); // in-app reader (69)
const HAZ = new Set(Object.keys(rd('data/hazzard_chapters.json')).filter((k) => /^\d+$/.test(k)).map(Number)); // 1..108

// 2026-06-01 baselines — ratchet ceilings (may shrink, must not grow without review).
const EMPTY_REF_BASELINE = 75;        // SZMC-Rescue intentionally-unsourced Qs
const HAR_UNINDEXED_BASELINE = 219;   // cited Harrison chapters with no reader content (copyright-blocked)

// Book token (English + Hebrew spellings) → optional edition marker (8e/22e) →
// required Ch/פרק keyword → 1-3 digit chapter number.
const SEG = /(Hazzard|Harrison|הזארד|הזרד|הריסון)\s*(?:\d{1,2}e\b)?\s*(?:Ch\.?|פרק|chapter)\s*\.?\s*(\d{1,3})\b/gi;
// GLUED: book token fused DIRECTLY to a number with no separator/keyword (e.g.
// "הריסון370" before this PR de-glued it). This is the exact de-gluing regression
// class — without it the guard would not catch a re-introduced "הריסון999" (it has
// no Ch/פרק keyword, so SEG skips it). The \b after the digits prevents matching an
// edition marker like "Hazzard8e" (8 has no word-boundary before "e"). (Codex #317 P2.)
const GLUED = /(Hazzard|Harrison|הזארד|הזרד|הריסון)(\d{1,3})\b/gi;
const isHaz = (b) => ['hazzard', 'הזארד', 'הזרד'].includes(b.toLowerCase());

function scan() {
  const phantom = [];
  const harUnindexed = new Set();
  let empty = 0;
  const classify = (i, ref, bookTok, chStr) => {
    const haz = isHaz(bookTok);
    const ch = Number(chStr);
    const universe = haz ? HAZ : HAR_TOC;
    if (!universe.has(ch)) {
      phantom.push(`idx ${i}: cites ${haz ? 'Hazzard' : 'Harrison'} Ch ${ch} (does not exist) — ${JSON.stringify(ref).slice(0, 70)}`);
    } else if (!haz && !HAR_CONTENT.has(ch)) {
      harUnindexed.add(`${i}:${ch}`);
    }
  };
  QZ.forEach((q, i) => {
    const ref = (q.ref || '').trim();
    if (!ref) { empty++; return; }
    for (const re of [SEG, GLUED]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(ref)) !== null) classify(i, ref, m[1], m[2]);
    }
  });
  return { phantom, empty, harUnindexed: harUnindexed.size };
}

describe('reference integrity (q.ref chapter resolvability)', () => {
  const { phantom, empty, harUnindexed } = scan();

  it('zero phantom chapters — every cited textbook chapter exists in its book', () => {
    expect(
      phantom,
      `Ref cites a chapter that does not exist:\n${phantom.join('\n')}\n` +
        'Hazzard has chapters 1-108, Harrison 22e has 1-505. Fix the chapter number ' +
        '(verify against data/hazzard_chapters.json / data/harrison_22e_toc.json).'
    ).toEqual([]);
  });

  it(`empty refs do not grow past the SZMC-Rescue baseline (${EMPTY_REF_BASELINE})`, () => {
    // <= is intentional: recovering a ref from _refs_orig shrinks this (good).
    expect(
      empty,
      `${empty} questions have an empty ref (baseline ${EMPTY_REF_BASELINE}). A NEW unsourced ` +
        'question slipped in — add its source ref, or (if genuinely sourceless per the ' +
        'anti-fabrication rule) raise EMPTY_REF_BASELINE in the same PR with a note.'
    ).toBeLessThanOrEqual(EMPTY_REF_BASELINE);
  });

  it(`Harrison unindexed-but-valid citations do not grow past baseline (${HAR_UNINDEXED_BASELINE})`, () => {
    // Harrison chapters cited but not in the in-app reader (copyrighted, blocked).
    // Growth = more Qs pointing at a chapter the reader can't open → review.
    expect(
      harUnindexed,
      `${harUnindexed} Qs cite a Harrison chapter with no in-app reader content (baseline ` +
        `${HAR_UNINDEXED_BASELINE}). Either the chapter PDF was added to harrison_chapters.json ` +
        '(then this shrinks — good) or a new Q cites an unreadable chapter (review the citation).'
    ).toBeLessThanOrEqual(HAR_UNINDEXED_BASELINE);
  });
});
