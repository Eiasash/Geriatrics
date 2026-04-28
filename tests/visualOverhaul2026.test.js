/**
 * v10.52.0 visual overhaul guards.
 *
 * Three features shipped in v10.52.0 — this file pins the wiring so future
 * refactors don't silently rip them out:
 *
 *   1. Topic Heatmap (Track view): a single SVG-styled grid of all 46 TOPICS
 *      coloured by FSRS retention probability (Cividis-derived 5-step palette).
 *      Cell click → setTopicFilt + tab='quiz'. RTL-aware via dir="auto".
 *
 *   2. Wrong-answer review mode: dedicated buildPool branch driven by S.wrongQs
 *      (qIdx → {ts, streak}). Quiz tab surfaces a "Review wrong (N)" CTA.
 *      Wrong on check() → entry added/refreshed; correct → streak++; ≥2 → drop.
 *
 *   3. Source-link in explanations: parseQuestionRef() turns the per-question
 *      `ref` field into structured citations rendered as deep-link buttons that
 *      open the in-app Hazzard/Harrison reader at the right chapter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

describe('v10.52.0 — Topic Heatmap', () => {
  it('renderTopicHeatmap function is defined', () => {
    expect(html).toMatch(/function\s+renderTopicHeatmap\s*\(/);
  });
  it('getTopicMastery aggregates FSRS retention per topic', () => {
    expect(html).toMatch(/function\s+getTopicMastery\s*\(/);
    // Must use fsrsR + lastReview to compute retention.
    expect(html).toMatch(/fsrsR\(/);
  });
  it('Cividis-derived 5-step colorblind-safe palette exists', () => {
    expect(html).toMatch(/_HEAT_PALETTE\s*=\s*\[/);
    // Cividis dark anchor (~#00224e) and bright anchor (~#fee838) appear.
    expect(html).toMatch(/#00224e/i);
    expect(html).toMatch(/#fee838/i);
  });
  it('heatmap is wired into _rtTop()', () => {
    expect(html).toMatch(/h\+=\s*renderTopicHeatmap\(\)/);
  });
  it('heatmap cells use dir="auto" for RTL Hebrew topic names', () => {
    // The heatmap function block must contain a dir="auto" attribute.
    const idx = html.indexOf('function renderTopicHeatmap');
    expect(idx).toBeGreaterThan(0);
    const slice = html.slice(idx, idx + 4000);
    expect(slice).toMatch(/dir="auto"/);
  });
  it('heatmap cells deep-link to the topic-filtered quiz', () => {
    const idx = html.indexOf('function renderTopicHeatmap');
    const slice = html.slice(idx, idx + 4000);
    expect(slice).toMatch(/setTopicFilt\(/);
    expect(slice).toMatch(/tab='quiz'/);
  });
});

describe('v10.52.0 — Wrong-answer review mode', () => {
  it('S.wrongQs is initialised at boot', () => {
    expect(html).toMatch(/S\.wrongQs\s*=\s*\{\}/);
  });
  it('getWrongReviewCount + getWrongReviewPool helpers exist', () => {
    expect(html).toMatch(/function\s+getWrongReviewCount\s*\(/);
    expect(html).toMatch(/function\s+getWrongReviewPool\s*\(/);
  });
  it("buildPool routes filt==='wrong' to the wrong-review pool", () => {
    expect(html).toMatch(/filt===['"]wrong['"]/);
    // The branch must call getWrongReviewPool().
    const m = html.match(/if\(filt===['"]wrong['"]\)[\s\S]{0,400}?getWrongReviewPool\(\)/);
    expect(m, 'wrong filt branch must call getWrongReviewPool()').not.toBeNull();
  });
  it('check() adds wrong Qs to S.wrongQs and resets streak', () => {
    // The wrong branch (S.qNo++) must touch S.wrongQs with ts+streak.
    expect(html).toMatch(/S\.wrongQs\[pool\[qi\]\]\s*=\s*\{\s*ts\s*:\s*Date\.now\(\)\s*,\s*streak\s*:\s*0\s*\}/);
  });
  it('correct answer increments streak and removes once ≥2', () => {
    // Look for the streak-bump + delete logic in the correct branch.
    expect(html).toMatch(/streak\s*=\s*\(?_w\.streak.*?\)?\s*\+\s*1/);
    expect(html).toMatch(/_w\.streak\s*>=\s*2/);
    expect(html).toMatch(/delete\s+S\.wrongQs\[pool\[qi\]\]/);
  });
  it('Quiz tab exposes a "Review wrong (N)" CTA wired to setFilt(\'wrong\')', () => {
    expect(html).toMatch(/Review wrong/);
    expect(html).toMatch(/setFilt\(['"]wrong['"]\)/);
  });
  it('IMA_WEIGHTS is referenced by the wrong-review priority sort', () => {
    // Pool is ordered by recency × IMA topic weight.
    const idx = html.indexOf('function getWrongReviewPool');
    expect(idx).toBeGreaterThan(0);
    const slice = html.slice(idx, idx + 1200);
    expect(slice).toMatch(/IMA_WEIGHTS/);
  });
});

describe('v10.52.0 — Source-link in explanations', () => {
  it('parseQuestionRef helper is defined', () => {
    expect(html).toMatch(/function\s+parseQuestionRef\s*\(/);
  });
  it('openRefCitation opens the right reader (haz/har)', () => {
    expect(html).toMatch(/function\s+openRefCitation\s*\(/);
    const idx = html.indexOf('function openRefCitation');
    const slice = html.slice(idx, idx + 1000);
    expect(slice).toMatch(/openHazzardChapter/);
    expect(slice).toMatch(/openHarrisonChapter/);
    expect(slice).toMatch(/libSec\s*=\s*['"]haz-pdf['"]/);
    expect(slice).toMatch(/libSec\s*=\s*['"]harrison['"]/);
  });
  it('explanation block renders ref deep-link buttons via openRefCitation', () => {
    expect(html).toMatch(/openRefCitation\(['"]\$\{rc\.src\}['"]\s*,\s*\$\{rc\.ch\}\)/);
  });
  it('parseQuestionRef parses a typical Hazzard + Harrison combined ref', () => {
    // Reconstruct the parser in isolation by extracting it from the HTML and
    // evaluating with no closure deps. Keeps the test hermetic.
    const m = html.match(/function\s+parseQuestionRef\s*\([\s\S]*?\n\}/);
    expect(m, 'parseQuestionRef source extractable').not.toBeNull();
    // eslint-disable-next-line no-new-func
    const parseQuestionRef = new Function(`${m[0]}; return parseQuestionRef;`)();
    const refs = parseQuestionRef(
      'Hazzard Ch 52 — OSTEOARTHRITIS · Harrison Ch 382 — Approach to Articular and Musculoskeletal Disease'
    );
    expect(refs).toHaveLength(2);
    expect(refs[0]).toMatchObject({ src: 'haz', ch: 52 });
    expect(refs[0].title).toMatch(/OSTEOARTHRITIS/);
    expect(refs[1]).toMatchObject({ src: 'har', ch: 382 });
    expect(refs[1].title).toMatch(/Articular/);
  });
  it('parseQuestionRef tolerates lone Hazzard refs with no Harrison side', () => {
    const m = html.match(/function\s+parseQuestionRef\s*\([\s\S]*?\n\}/);
    // eslint-disable-next-line no-new-func
    const parseQuestionRef = new Function(`${m[0]}; return parseQuestionRef;`)();
    const refs = parseQuestionRef('Hazzard Ch 7 — DECISION MAKING');
    expect(refs).toHaveLength(1);
    expect(refs[0].src).toBe('haz');
    expect(refs[0].ch).toBe(7);
  });
  it('parseQuestionRef returns [] for empty/garbage input', () => {
    const m = html.match(/function\s+parseQuestionRef\s*\([\s\S]*?\n\}/);
    // eslint-disable-next-line no-new-func
    const parseQuestionRef = new Function(`${m[0]}; return parseQuestionRef;`)();
    expect(parseQuestionRef('')).toEqual([]);
    expect(parseQuestionRef(null)).toEqual([]);
    expect(parseQuestionRef('not a ref at all')).toEqual([]);
  });
});

describe('v10.52.0 — version trinity', () => {
  it('shlav-a-mega.html APP_VERSION is 10.55.0', () => {
    expect(html).toMatch(/APP_VERSION\s*=\s*['"]10\.55\.0['"]/);
  });
  it('sw.js CACHE key is shlav-a-v10.55.0', () => {
    const sw = readFileSync(resolve(rootDir, 'sw.js'), 'utf-8');
    expect(sw).toMatch(/CACHE\s*=\s*['"]shlav-a-v10\.55\.0['"]/);
  });
  it('package.json version is 10.55.0', () => {
    const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
    expect(pkg.version).toBe('10.55.0');
  });
});
