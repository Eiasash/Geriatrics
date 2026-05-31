import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Regression guard for the v10.64.143 dark-mode P1 fix (2026-05-31 suite-wide audit).
// Inverse dark-on-dark bug: notes terms, flashcard fronts, and any prose that hardcodes a
// dark inline color (#1e293b/#0f172a/#334155) collides 1:1 with the dark .card/.fc/body
// background → invisible. The monolith's <style> rescues them under body.dark + body.study;
// :not([style*=background]) skips legitimate light-islands (e.g. the white login button).
const html = readFileSync('shlav-a-mega.html', 'utf8');

describe('dark-mode inverse dark-on-dark fix (v10.64.143 audit P1)', () => {
  it('rescues hardcoded dark inline prose colors under body.dark + body.study, skipping islands', () => {
    for (const hex of ['1e293b', '0f172a', '334155']) {
      expect(html).toMatch(
        new RegExp(`body\\.dark \\[style\\*=";color:#${hex}"\\]:not\\(\\[style\\*="background"\\]\\)`)
      );
      expect(html).toMatch(
        new RegExp(`body\\.study \\[style\\*=";color:#${hex}"\\]:not\\(\\[style\\*="background"\\]\\)`)
      );
    }
    // the island-guard must be present so the white login button etc. stay legible
    expect(html).toContain(':not([style*="background"])');
  });
});
