/**
 * Guards TOPIC_REF → hazzard_chapters.json coverage.
 *
 * Every TOPIC_REF entry with s:'haz' has a .ch that powers the
 * "📖 Read: Hazzard Ch X — you're weak here" button in the quiz view
 * (calling openHazzardChapter). If .ch doesn't exist as a key in
 * data/hazzard_chapters.json the button silently lands on empty content.
 *
 * The section-mismatch bug shipped in 9.61 (libSec='harrison' for 'haz'
 * refs) is prevented by a source-level grep in regressionGuards.test.js;
 * this test is the second layer — proving the chapters themselves exist.
 *
 * Geriatrics is monolithic, so we extract TOPIC_REF by regex and eval it
 * in a vm sandbox to cover the exact bytes that ship.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const chapters = JSON.parse(
  readFileSync(resolve(rootDir, 'data/hazzard_chapters.json'), 'utf-8'),
);

/**
 * Extract `const TOPIC_REF = { ... };` block from the HTML monolith.
 * Balance-aware so comments and nested braces don't throw it off.
 */
function extractTopicRef(src) {
  const marker = 'const TOPIC_REF=';
  const i = src.indexOf(marker);
  if (i < 0) throw new Error('TOPIC_REF declaration not found in shlav-a-mega.html');
  const openBrace = src.indexOf('{', i);
  let depth = 0;
  let end = -1;
  for (let j = openBrace; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { end = j; break; }
    }
  }
  if (end < 0) throw new Error('Could not balance TOPIC_REF braces');
  return src.slice(openBrace, end + 1);
}

const literal = extractTopicRef(html);
const ctx = { TOPIC_REF: null };
vm.createContext(ctx);
vm.runInContext(`TOPIC_REF = ${literal};`, ctx);
const TOPIC_REF = ctx.TOPIC_REF;

describe('TOPIC_REF → Hazzard chapter coverage', () => {
  it('extracted at least one entry (regex sanity check)', () => {
    expect(Object.keys(TOPIC_REF).length).toBeGreaterThan(0);
  });

  it('every Hazzard ref (.s==="haz") resolves to a chapter in hazzard_chapters.json', () => {
    const misses = [];
    for (const [ti, ref] of Object.entries(TOPIC_REF)) {
      if (!ref || ref.s !== 'haz') continue;
      if (!chapters[String(ref.ch)]) {
        misses.push({ ti, ch: ref.ch, label: ref.l });
      }
    }
    expect(
      misses,
      `TOPIC_REF entries pointing at nonexistent chapters: ${JSON.stringify(misses, null, 2)}`,
    ).toEqual([]);
  });

  it('every Hazzard ref has a positive integer .ch and a label', () => {
    for (const [ti, ref] of Object.entries(TOPIC_REF)) {
      if (!ref || ref.s !== 'haz') continue;
      expect(Number.isInteger(ref.ch), `TOPIC_REF[${ti}].ch is not an integer`).toBe(true);
      expect(ref.ch, `TOPIC_REF[${ti}].ch must be positive`).toBeGreaterThan(0);
      expect(typeof ref.l, `TOPIC_REF[${ti}].l must be a string`).toBe('string');
      expect(ref.l.length, `TOPIC_REF[${ti}].l must be non-empty`).toBeGreaterThan(0);
    }
  });

  it('TOPIC_REF only uses the whitelisted source keys {haz, notes}', () => {
    const allowedSources = new Set(['haz', 'notes']);
    for (const [ti, ref] of Object.entries(TOPIC_REF)) {
      if (!ref) continue;
      expect(
        allowedSources.has(ref.s),
        `TOPIC_REF[${ti}].s="${ref.s}" — expected 'haz' or 'notes'`,
      ).toBe(true);
    }
  });

  it('the quiz-view read-chapter button wires to libSec=haz-pdf (not the wrong section)', () => {
    // Regression guard for 9.61 bug where button set libSec='harrison' for Hazzard refs.
    const readButtonMatches = html.match(
      /onclick="[^"]*📖[^"]*"|onclick="tab='lib';libSec='[^']+';openHazzardChapter/g,
    );
    // Find any button that calls openHazzardChapter — it MUST route through libSec='haz-pdf'
    const badRoutes = [];
    const regex = /onclick="([^"]*openHazzardChapter[^"]*)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      const onclick = m[1];
      // If onclick sets libSec to anything other than haz-pdf, flag it.
      const libSecSet = onclick.match(/libSec='([^']+)'/);
      if (libSecSet && libSecSet[1] !== 'haz-pdf') {
        badRoutes.push({ onclick, wrongSec: libSecSet[1] });
      }
    }
    expect(
      badRoutes,
      `openHazzardChapter calls routed through wrong libSec: ${JSON.stringify(badRoutes, null, 2)}`,
    ).toEqual([]);
  });
});
