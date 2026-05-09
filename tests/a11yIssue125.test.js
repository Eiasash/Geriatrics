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
