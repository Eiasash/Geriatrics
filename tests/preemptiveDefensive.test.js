/**
 * Tests for v10.64.58 pre-emptive defensive guards (FM-class chaos-pattern parity).
 *
 * Background — FM 7-hour chaos run on 2026-05-05 surfaced 5,135 pageerrors
 * across two crash classes that all three medical PWAs share architecturally:
 *   (a) toLowerCase() on undefined fields when one bad data record is present
 *       — 4,890 pageerrors, fixed in FM v1.21.13 (a) / IM v10.4.16
 *   (b) flashcard render dereferencing FLASH[NaN] when FLASH is empty
 *       — 245 pageerrors, fixed in FM v1.21.13 (b)
 *
 * Geri's data integrity tests guarantee both cannot crash on today's data, but
 * the defensive wraps make Geri categorically chaos-resilient regardless of
 * future data drift, partial loads, or parser-bleed edge cases.
 *
 * This test pins the deployed bytes for both patches so a refactor cannot
 * silently regress to the bare .toLowerCase() / FLASH[i] forms.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(ROOT, 'shlav-a-mega.html'), 'utf-8');

describe('v10.64.58 (a) — search-filter (field||\'\').toLowerCase() defensive', () => {
  it('renderSearch QZ filter wraps item.q and item.o with (field||\'\').toLowerCase()', () => {
    // Locate the search-filter block. Marker: "// Search questions" comment.
    const m = html.match(/const q=srchQ\.toLowerCase\(\);[\s\S]+?const dRes=DRUGS\.filter[\s\S]+?\}\)\s*;/);
    expect(m, 'search filter block not found').toBeTruthy();
    const block = m[0];
    // QZ filter: item.q and item.o must be defensive-wrapped.
    expect(block).toMatch(/\(item\.q\|\|''\)\.toLowerCase\(\)/);
    expect(block).toMatch(/\(item\.o\|\|\[\]\)\.some/);
    expect(block).toMatch(/\(o\|\|''\)\.toLowerCase\(\)/);
    // Bare forms must NOT survive (regression guard).
    expect(block).not.toMatch(/[^|]item\.q\.toLowerCase/);
    expect(block).not.toMatch(/item\.o\.some\(o=>o\.toLowerCase/);
  });

  it('renderSearch NOTES filter wraps n.topic and n.notes', () => {
    const m = html.match(/const nRes=NOTES\.filter[\s\S]+?\}\)\s*;/);
    expect(m, 'NOTES filter block not found').toBeTruthy();
    const block = m[0];
    expect(block).toMatch(/\(n\.topic\|\|''\)\.toLowerCase\(\)/);
    expect(block).toMatch(/\(n\.notes\|\|''\)\.toLowerCase\(\)/);
    expect(block).not.toMatch(/[^|]n\.topic\.toLowerCase/);
    expect(block).not.toMatch(/[^|]n\.notes\.toLowerCase/);
  });

  it('renderSearch DRUGS filter wraps d.name, d.heb, d.risk', () => {
    const m = html.match(/const dRes=DRUGS\.filter[\s\S]+?\}\)\s*;/);
    expect(m, 'DRUGS filter block not found').toBeTruthy();
    const block = m[0];
    expect(block).toMatch(/\(d\.name\|\|''\)\.toLowerCase\(\)/);
    expect(block).toMatch(/\(d\.heb\|\|''\)/);
    expect(block).toMatch(/\(d\.risk\|\|''\)\.toLowerCase\(\)/);
  });
});

describe('v10.64.58 (b) — flashcard bounds-check + activeIdx fallback', () => {
  it('renderFlash bails early when FLASH is empty/missing', () => {
    // Capture the function body up to and including the const f=FLASH[activeIdx]||FLASH[0] line.
    const m = html.match(/function renderFlash\(\)\{[\s\S]+?const f=FLASH\[activeIdx\][^;]*;/);
    expect(m, 'renderFlash function not found').toBeTruthy();
    const block = m[0];
    // The defensive early return — FLASH[NaN].f would throw without this.
    expect(block).toMatch(/!FLASH\|\|FLASH\.length===0/);
    // The placeholder return must come BEFORE the FLASH[activeIdx] dereference.
    const guardIdx = block.search(/!FLASH\|\|FLASH\.length===0/);
    const derefIdx = block.search(/FLASH\[activeIdx\]/);
    expect(guardIdx, 'guard must precede dereference').toBeLessThan(derefIdx);
  });

  it('renderFlash falls back to FLASH[0] when activeIdx is out of bounds', () => {
    // Marker: const f=FLASH[activeIdx]||FLASH[0];
    const m = html.match(/const f=FLASH\[activeIdx\]\|\|FLASH\[0\]/);
    expect(m, 'FLASH[0] fallback not found').toBeTruthy();
  });

  it('the bare const f=FLASH[activeIdx]; form is NOT present (regression guard)', () => {
    // The pre-v10.64.58 form was just `const f=FLASH[activeIdx];` with no fallback.
    // This regex matches the bare form WITHOUT the ||FLASH[0] suffix.
    expect(html).not.toMatch(/const f=FLASH\[activeIdx\];\s*\n/);
  });
});

describe('v10.64.58 — sibling-parity claim is honest', () => {
  it('CHANGELOG entry references FM v1.21.13 (sibling-paired)', () => {
    // Match up to `],` (the array terminator after the entry) — non-greedy `\]` alone
    // would catch the first `]` inside the entry text (e.g. inside `o[]` or `FLASH[0]`).
    const m = html.match(/'10\.64\.58'\s*:\s*\[[\s\S]+?\],\n/);
    expect(m, 'v10.64.58 CHANGELOG entry not found').toBeTruthy();
    expect(m[0]).toMatch(/FM v1\.21\.13/);
    // Both crash classes (a) and (b) must be referenced.
    expect(m[0]).toMatch(/\(a\)/);
    expect(m[0]).toMatch(/\(b\)/);
  });
});
