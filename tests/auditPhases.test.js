/**
 * Regression tests for audit Phases 1–7.
 *
 * Validates that extracted modules exist, inline handlers were converted,
 * CSP directives are present, shared scripts exist, and no brittle
 * update-check patterns remain.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

let html, swContent, swUpdate, storage;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
  swContent = readFileSync(resolve(ROOT, "sw.js"), "utf-8");
  swUpdate = readFileSync(resolve(ROOT, "src", "sw-update.js"), "utf-8");
  storage = readFileSync(resolve(ROOT, "src", "storage.js"), "utf-8");
});

// ── Phase 1: Update banner dismiss fix ──
describe("Phase 1 — update banner dismiss", () => {
  it("dismissUpdateBanner function exists in sw-update.js", () => {
    expect(swUpdate).toMatch(/function dismissUpdateBanner\s*\(/);
  });

  it("dismiss button uses data-action, not inline DISMISS_KEY reference", () => {
    // The Phase 1 bug: inline onclick referenced block-scoped DISMISS_KEY
    expect(swUpdate).not.toContain("onclick=\"localStorage.setItem(DISMISS_KEY");
  });

  it("dismissUpdateBanner sets the dismiss key via closure, not inline", () => {
    expect(swUpdate).toMatch(/localStorage\.setItem\(_swDismissKey/);
  });

  it("applyUpdate clears the dismiss key before reload", () => {
    expect(swUpdate).toMatch(/localStorage\.removeItem\(_swDismissKey\)/);
  });

  it("dismiss key is per-version (includes appVersion)", () => {
    expect(swUpdate).toContain("'shlav_update_dismissed_'+appVersion");
  });

  it("first-install silence: showUpdateBanner guarded by controller check", () => {
    expect(swUpdate).toContain("navigator.serviceWorker.controller");
  });
});

// ── Phase 2: SW update logic extraction ──
describe("Phase 2 — sw-update.js extraction", () => {
  it("src/sw-update.js exists", () => {
    expect(existsSync(resolve(ROOT, "src", "sw-update.js"))).toBe(true);
  });

  it("exposes initSWUpdate function", () => {
    expect(swUpdate).toMatch(/function initSWUpdate\s*\(/);
  });

  it("exposes applyUpdate function", () => {
    expect(swUpdate).toMatch(/function applyUpdate\s*\(/);
  });

  it("exposes showUpdateBanner function", () => {
    expect(swUpdate).toMatch(/function showUpdateBanner\s*\(/);
  });

  it("HTML loads src/sw-update.js via script tag", () => {
    expect(html).toContain('src="src/sw-update.js"');
  });

  it("HTML calls initSWUpdate(APP_VERSION)", () => {
    expect(html).toContain("initSWUpdate(APP_VERSION)");
  });

  it("sw.js caches src/sw-update.js for offline use", () => {
    expect(swContent).toContain("src/sw-update.js");
  });

  it("no proactive fetch('sw.js') version-check pattern in HTML", () => {
    expect(html).not.toMatch(/fetch\s*\(\s*['"]sw\.js['"]\s*,\s*\{[^}]*cache\s*:\s*['"]no-store['"]/);
  });

  it("no regex version comparison against sw.js content in HTML", () => {
    // The old brittle pattern: fetching sw.js and regex-matching its version
    expect(html).not.toMatch(/sw\.js[\s\S]{0,200}\.match\s*\(\s*\/.*CACHE/);
  });
});

// ── Phase 3: Shell-level inline handler delegation ──
describe("Phase 3 — data-action delegation", () => {
  it("header buttons use data-action instead of onclick", () => {
    const headerMatch = html.match(/<div class="hdr"[\s\S]*?<\/div>/);
    expect(headerMatch).not.toBeNull();
    const header = headerMatch[0];
    expect(header).toContain('data-action="toggle-study"');
    expect(header).toContain('data-action="toggle-dark"');
    expect(header).toContain('data-action="show-help"');
    expect(header).not.toMatch(/onclick="toggle(StudyMode|Dark)\(\)"/);
    expect(header).not.toContain('onclick="showHelp()"');
  });

  it("update banner buttons use data-action", () => {
    expect(swUpdate).toContain('data-action="apply-update"');
    expect(swUpdate).toContain('data-action="dismiss-update"');
    expect(swUpdate).not.toContain('onclick="applyUpdate()"');
    expect(swUpdate).not.toContain('onclick="dismissUpdateBanner()"');
  });

  it("help overlay close button uses data-action", () => {
    expect(html).toContain('data-action="close-overlay"');
    expect(html).not.toContain("onclick=\"this.closest('#help-overlay').remove()\"");
  });

  it("delegated click listener exists on document.body", () => {
    expect(html).toContain("document.body.addEventListener('click'");
    expect(html).toContain("data-action");
    expect(html).toContain("btn.dataset.action");
  });
});

// ── Phase 4: CSP directives ──
describe("Phase 4 — CSP hardening", () => {
  it("has Content-Security-Policy meta tag", () => {
    expect(html).toContain("Content-Security-Policy");
  });

  it("includes object-src 'none'", () => {
    expect(html).toMatch(/object-src\s+'none'/);
  });

  it("includes base-uri 'self'", () => {
    expect(html).toMatch(/base-uri\s+'self'/);
  });

  it("includes frame-ancestors 'none'", () => {
    expect(html).toMatch(/frame-ancestors\s+'none'/);
  });

  it("includes form-action 'self'", () => {
    expect(html).toMatch(/form-action\s+'self'/);
  });
});

// ── Phase 5: Shared validation scripts ──
describe("Phase 5 — shared validation scripts", () => {
  const scripts = [
    "scripts/check-version-sync.py",
    "scripts/check-innerhtml.py",
    "scripts/check-brace-balance.py",
  ];

  for (const script of scripts) {
    it(`${script} exists`, () => {
      expect(existsSync(resolve(ROOT, script))).toBe(true);
    });
  }

  it("check-version-sync.py checks APP_VERSION, sw.js, and package.json", () => {
    const py = readFileSync(resolve(ROOT, "scripts/check-version-sync.py"), "utf-8");
    expect(py).toContain("APP_VERSION");
    expect(py).toContain("sw.js");
    expect(py).toContain("package.json");
  });

  it("check-brace-balance.py reads shlav-a-mega.html", () => {
    const py = readFileSync(resolve(ROOT, "scripts/check-brace-balance.py"), "utf-8");
    expect(py).toContain("shlav-a-mega.html");
  });
});

// ── Phase 6: Local verify script ──
describe("Phase 6 — npm run verify", () => {
  it("package.json has a verify script", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.verify).toBeDefined();
  });

  it("verify script runs shared validation scripts", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.verify).toContain("check-version-sync.py");
    expect(pkg.scripts.verify).toContain("check-brace-balance.py");
    expect(pkg.scripts.verify).toContain("vitest run");
  });
});

// ── Phase 7: Storage module extraction ──
describe("Phase 7 — src/storage.js extraction", () => {
  it("src/storage.js exists", () => {
    expect(existsSync(resolve(ROOT, "src", "storage.js"))).toBe(true);
  });

  it("exports lsGet function", () => {
    expect(storage).toMatch(/function lsGet\s*\(/);
  });

  it("exports lsSet function", () => {
    expect(storage).toMatch(/function lsSet\s*\(/);
  });

  it("lsGet handles JSON parse errors gracefully", () => {
    expect(storage).toContain("try");
    expect(storage).toContain("JSON.parse");
    expect(storage).toContain("localStorage.removeItem");
  });

  it("lsSet wraps setItem with try/catch", () => {
    expect(storage).toContain("JSON.stringify");
    expect(storage).toContain("localStorage.setItem");
  });

  it("HTML loads src/storage.js via script tag", () => {
    expect(html).toContain('src="src/storage.js"');
  });

  it("sw.js caches src/storage.js for offline use", () => {
    expect(swContent).toContain("src/storage.js");
  });

  it("HTML uses lsGet for localStorage reads", () => {
    expect(html).toMatch(/lsGet\s*\(/);
  });

  it("HTML uses lsSet for localStorage writes", () => {
    expect(html).toMatch(/lsSet\s*\(/);
  });

  it("scoped safeJSONParse was removed from HTML", () => {
    expect(html).not.toContain("function safeJSONParse");
  });
});
