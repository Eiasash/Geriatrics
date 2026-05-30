import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

// Regression guard for the v10.64.139 header restructure (ported from FM v1.25.4).
// Old bug: .dm-btn icons were position:absolute right:Npx top:50%, overlapping the RTL
// title + timestamp. This shipped THREE times (v94/95/96 padding/RTL hacks) because
// nothing guarded it. These tests fail if the header reverts to absolute positioning.
// Geri is single-file: CSS + markup both live in shlav-a-mega.html.
const html = readFileSync('shlav-a-mega.html', 'utf8');
const HDR = (html.match(/<div class="hdr"[\s\S]*?<div class="ct"/) || [html])[0];
const dmBtnRule = (html.match(/\.dm-btn\s*\{[^}]+\}/) || [''])[0];

describe('header layout — flex, no absolute-icon overlap (v10.64.139 regression guard)', () => {
  it('.dm-btn base rule is NOT absolutely positioned', () => {
    expect(dmBtnRule).toBeTruthy();
    expect(dmBtnRule).not.toContain('position:absolute');
    expect(dmBtnRule).toContain('position:static');
  });
  it('.dm-btn base rule keeps the a11y white-on-tint contrast (must not regress)', () => {
    expect(dmBtnRule).toContain('color:#fff');
    expect(dmBtnRule).toContain('background:rgba(255,255,255,0.12)');
  });
  it('header uses flex containers .hdr-bar + .dm-row', () => {
    expect(html).toMatch(/\.hdr-bar\s*\{[^}]*display:flex/);
    expect(html).toMatch(/\.dm-row\s*\{[^}]*display:flex/);
    expect(HDR).toContain('class="hdr-bar"');
    expect(HDR).toContain('class="dm-row"');
  });
  it('no header .dm-btn carries an inline right:Npx absolute offset (the old overlap mechanism)', () => {
    expect(HDR).not.toMatch(/<button class="dm-btn"[^>]*style="[^"]*\bright:\s*\d+px/);
  });
  it('all header action buttons live inside .dm-row', () => {
    const dmRow = (HDR.match(/<div class="dm-row">[\s\S]*?<\/div>/) || [''])[0];
    expect(dmRow).toContain('data-action="toggle-study"');
    expect(dmRow).toContain('data-action="toggle-dark"');
    expect(dmRow).toContain('data-action="toggle-lang"');
    expect(dmRow).toContain('data-action="show-help"');
    expect(dmRow).toContain('data-action="goto-account"');
  });
});
