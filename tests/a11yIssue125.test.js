/**
 * Accessibility regression tests for issue #125 (v10.64.82).
 *
 * Pins the four incremental a11y fixes shipped in v10.64.82:
 *  1. <html> root carries dir="rtl" (explicit document direction)
 *  2. ✕ remove-image button has aria-label
 *  3. skip-link uses #2563eb (WCAG AA 4.78:1) not #3b82f6 (3.68:1)
 *  4. duplicate IDs reportInput / fbStatus / aiVerifyResult have been deduped
 *
 * Each test is a regression guard — if any of these fixes is reverted, this
 * suite fails before the regression reaches users.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
let html;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
});

describe("a11y issue #125 — v10.64.82 fixes", () => {
  it("html root has dir=\"rtl\" attribute", () => {
    // Match the opening <html> tag specifically.
    const m = html.match(/<html\b([^>]*)>/);
    expect(m).toBeTruthy();
    expect(m[1]).toContain('dir="rtl"');
    expect(m[1]).toContain('lang="he"');
  });

  it("remove-image ✕ button has aria-label", () => {
    // The unique signature of that button is the removeQImage onclick.
    // Pin that the rendered string still includes an aria-label attribute.
    const buttonRegex = /<button[^>]*onclick="event\.stopPropagation\(\);removeQImage[^"]*"[^>]*>/;
    const match = html.match(buttonRegex);
    expect(match).toBeTruthy();
    expect(match[0]).toMatch(/aria-label\s*=\s*"[^"]+"/);
  });

  it("skip-link uses WCAG-AA contrast color (#2563eb, not #3b82f6)", () => {
    // Find the .skip-link CSS rule. Must use a blue that hits ≥4.5:1 against #fff.
    const ruleMatch = html.match(/\.skip-link\s*\{[^}]+\}/);
    expect(ruleMatch).toBeTruthy();
    expect(ruleMatch[0]).toContain("#2563eb");
    expect(ruleMatch[0]).not.toContain("#3b82f6");
  });

  it("no duplicate id=\"reportInput\" in markup", () => {
    const matches = html.match(/id="reportInput"/g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("no duplicate id=\"fbStatus\" in markup", () => {
    const matches = html.match(/id="fbStatus"/g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  it("no duplicate id=\"aiVerifyResult\" in markup", () => {
    const matches = html.match(/id="aiVerifyResult"/g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});

describe("a11y issue #125 — v10.64.83 contrast follow-up", () => {
  it("light-mode --fg3 is slate-500 (100 116 139), not slate-400 (148 163 184)", () => {
    // Match the light-mode :root declaration (line ~144). The previous
    // slate-400 value rendered ~2.45:1 against the near-white --bg, well
    // below WCAG AA 4.5:1 for normal text. Slate-500 hits 4.50:1 (hairline AA).
    const m = html.match(/--bg:248 250 252;--bg2:241 245 249;--bg3:255 255 255;--fg:30 41 59;--fg2:[^;]+;--fg3:([^;]+);/);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe("100 116 139");
    expect(m[1]).not.toContain("148 163 184");
  });

  it("light-mode --fg2 is slate-700 (71 85 105), not slate-500 (100 116 139)", () => {
    // After --fg3 bumped to slate-500, --fg2 must move to slate-700 to
    // preserve the 3-level hierarchy (--fg → --fg2 → --fg3) AND to pass
    // WCAG AA on borderline surfaces (slate-200 cards). slate-700 vs --bg
    // is 9.7:1 (AAA).
    const m = html.match(/--bg:248 250 252;--bg2:241 245 249;--bg3:255 255 255;--fg:30 41 59;--fg2:([^;]+);/);
    expect(m).toBeTruthy();
    expect(m[1].trim()).toBe("71 85 105");
  });

  it(".dm-btn light-mode default uses theme fg, not hardcoded white", () => {
    // The base rule should now use rgb(var(--fg)). The original hardcoded
    // color:#fff is preserved only inside body.dark override.
    const baseRuleMatch = html.match(/\.dm-btn\s*\{[^}]+\}/);
    expect(baseRuleMatch).toBeTruthy();
    expect(baseRuleMatch[0]).toContain("color:rgb(var(--fg))");
    expect(baseRuleMatch[0]).not.toMatch(/color:#fff(?!\s*[}])/);
  });

  it(".dm-btn has a body.dark override that restores white text", () => {
    // The dark-mode visual must be preserved — white-on-tint pattern.
    expect(html).toMatch(/body\.dark\s+\.dm-btn\s*\{[^}]*color:#fff/);
    expect(html).toMatch(/body\.dark\s+\.dm-btn\s*\{[^}]*background:rgba\(255,255,255,0\.08\)/);
  });

  it("header h1 has color:rgb(var(--fg)) inline style (theme-aware)", () => {
    // The "Shlav A Mega" h1 was inheriting white from a parent rule meant
    // for dark mode. Inline color uses the theme variable so the title is
    // dark-on-light AND light-on-dark.
    const h1Match = html.match(/<h1[^>]*>Shlav A Mega/);
    expect(h1Match).toBeTruthy();
    expect(h1Match[0]).toContain("color:rgb(var(--fg))");
  });
});

describe("a11y issue #125 — v10.64.84 account-button JS override fix", () => {
  it("updateAccountChip logged-out branch clears inline overrides instead of setting white", () => {
    // The function's `else` branch (no logged-in user) previously set
    // btn.style.background='rgba(255,255,255,0.08)' + btn.style.color='#fff'
    // unconditionally, defeating the v10.64.83 .dm-btn CSS rule for the 👤
    // button specifically. Fix: clear the inline styles so the cascade applies.
    const fnMatch = html.match(/function updateAccountChip\([^]*?^\}/m);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch[0];
    const elseBlockMatch = fn.match(/\}\s*else\s*\{[^]*?\}/);
    expect(elseBlockMatch).toBeTruthy();
    const elseBlock = elseBlockMatch[0];
    expect(elseBlock).toContain("btn.style.background=''");
    expect(elseBlock).toContain("btn.style.color=''");
    expect(elseBlock).not.toContain("rgba(255,255,255,0.08)");
    expect(elseBlock).not.toMatch(/btn\.style\.color\s*=\s*['"]#fff['"]/);
  });

  it("logged-in branch still sets the teal account chip (intentional override preserved)", () => {
    // Don't accidentally regress the logged-in visual — teal background +
    // white initial letter is the intended logged-in indicator.
    const fnMatch = html.match(/function updateAccountChip\([^]*?^\}/m);
    expect(fnMatch).toBeTruthy();
    const fn = fnMatch[0];
    expect(fn).toContain("'#0D7377'");
  });
});
