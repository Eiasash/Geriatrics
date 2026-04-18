/**
 * Tests for the Israeli regulatory drill feature (Geri).
 *
 * Validates:
 *   1. data/regulatory.json exists and parses
 *   2. Every qIdx in REG is an integer pointing at a real question
 *   3. Tagged questions actually contain regulatory keywords (no garbage)
 *   4. The tagger script (scripts/tag_regulatory.cjs) is idempotent
 *   5. shlav-a-mega.html wires the filter (global REG, filt === 'regulatory'
 *      branch in buildPool, 🏛️ תקנות pill in filts row, REG in data loader)
 *   6. sw.js includes data/regulatory.json in JSON_DATA_URLS
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');

const REG_PATH = resolve(ROOT, 'data', 'regulatory.json');
const Q_PATH = resolve(ROOT, 'data', 'questions.json');
const HTML_PATH = resolve(ROOT, 'shlav-a-mega.html');
const SW_PATH = resolve(ROOT, 'sw.js');

describe('regulatory.json artifact', () => {
  it('exists and parses as an array', () => {
    expect(existsSync(REG_PATH)).toBe(true);
    const reg = JSON.parse(readFileSync(REG_PATH, 'utf-8'));
    expect(Array.isArray(reg)).toBe(true);
    expect(reg.length).toBeGreaterThan(50); // expect ~242
  });

  it('contains only valid question indices', () => {
    const qs = JSON.parse(readFileSync(Q_PATH, 'utf-8'));
    const reg = JSON.parse(readFileSync(REG_PATH, 'utf-8'));
    for (const idx of reg) {
      expect(Number.isInteger(idx)).toBe(true);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(qs.length);
    }
  });

  it('tagged questions actually match at least one regulatory keyword', () => {
    const qs = JSON.parse(readFileSync(Q_PATH, 'utf-8'));
    const reg = JSON.parse(readFileSync(REG_PATH, 'utf-8'));
    // Sample 20 random tagged questions; each must match a strong keyword
    const strongKeywords = [
      /ייפוי\s*כוח\s*מתמשך/, /ייפוי\s*כח\s*מתמשך/, /מקבל\s*החלטות/,
      /הנחיות\s*רפואיות\s*מקדימות/, /חוק\s*החולה\s*הנוטה\s*למות/,
      /סיעוד\s*מורכב/, /חוזר\s*מנכ/, /אפוטרופ/, /כושר\s*(נהיגה|לנהוג)/,
      /כשירות/, /\bcapacity\b/i, /\bguardianship\b/i, /power\s+of\s+attorney/i,
      /advance\s+directive/i, /נהיגה/, /חובת\s*דיווח/,
    ];
    const sample = reg.slice(0, 20);
    for (const idx of sample) {
      const q = qs[idx];
      const text = [q.q, ...(q.o || []), q.e || ''].join(' ');
      const hit = strongKeywords.some(rx => rx.test(text));
      expect(hit, `q[${idx}] has no regulatory keyword match: ${q.q.slice(0, 80)}`).toBe(true);
    }
  });

  it('tagger script is idempotent (running again produces same set)', () => {
    const before = JSON.parse(readFileSync(REG_PATH, 'utf-8'));
    execSync('node scripts/tag_regulatory.cjs', { cwd: ROOT, stdio: 'pipe' });
    const after = JSON.parse(readFileSync(REG_PATH, 'utf-8'));
    expect(after.sort((a, b) => a - b)).toEqual(before.sort((a, b) => a - b));
  });
});

describe('shlav-a-mega.html wiring', () => {
  const html = readFileSync(HTML_PATH, 'utf-8');

  it('declares a global REG array', () => {
    expect(html).toMatch(/let\s+REG\s*=\s*\[\]/);
  });

  it('loads regulatory.json in the data loader map', () => {
    expect(html).toMatch(/REG:\s*['"]regulatory\.json['"]/);
  });

  it('assigns REG from the loader results', () => {
    expect(html).toMatch(/varName\s*===\s*['"]REG['"]\s*\)\s*REG\s*=\s*results/);
  });

  it('has a regulatory branch in buildPool', () => {
    expect(html).toMatch(/filt\s*===\s*['"]regulatory['"]/);
  });

  it('has a 🏛️ תקנות pill in the filter row', () => {
    expect(html).toContain("['regulatory'");
    expect(html).toContain('🏛️');
    expect(html).toContain('תקנות');
  });
});

describe('sw.js cache manifest', () => {
  const sw = readFileSync(SW_PATH, 'utf-8');

  it('includes data/regulatory.json in JSON_DATA_URLS', () => {
    expect(sw).toContain('data/regulatory.json');
  });
});
