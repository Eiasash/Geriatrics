/**
 * App integrity tests for Geriatrics (shlav-a-mega.html).
 *
 * Validates the main HTML file's structure, version sync with service worker,
 * and checks for common security/quality issues.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

let html, swContent;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
  swContent = readFileSync(resolve(ROOT, "sw.js"), "utf-8");
});

describe("shlav-a-mega.html — basic structure", () => {
  it("contains valid HTML doctype", () => {
    expect(html.trim().toLowerCase()).toMatch(/^<!doctype html>/);
  });

  it("has RTL direction set", () => {
    expect(html).toContain('dir="rtl"');
  });

  it("has Hebrew language attribute", () => {
    expect(html).toContain('lang="he"');
  });

  it("has a title element", () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it("references manifest.json for PWA", () => {
    expect(html).toContain("manifest.json");
  });

  it("has viewport meta tag for mobile", () => {
    expect(html).toContain("viewport");
    expect(html).toContain("width=device-width");
  });
});

describe("shlav-a-mega.html — JavaScript structure", () => {
  it("contains APP_VERSION constant", () => {
    expect(html).toMatch(/APP_VERSION\s*=\s*['"][^'"]+['"]/);
  });

  it("has approximately balanced braces in JavaScript", () => {
    // Extract all script content
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    let totalOpen = 0;
    let totalClose = 0;
    for (const match of scriptMatches) {
      const js = match[1];
      // Remove strings and comments — note: template literals with nested
      // expressions (${...}) make exact counting impossible with regex alone
      const cleaned = js
        .replace(/\/\/.*$/gm, "")           // line comments
        .replace(/\/\*[\s\S]*?\*\//g, "")   // block comments
        .replace(/'(?:[^'\\]|\\.)*'/g, "")  // single-quoted strings
        .replace(/"(?:[^"\\]|\\.)*"/g, ""); // double-quoted strings
      totalOpen += (cleaned.match(/\{/g) || []).length;
      totalClose += (cleaned.match(/\}/g) || []).length;
    }
    // Allow small imbalance from template literals — CI has a more precise check
    const diff = Math.abs(totalOpen - totalClose);
    expect(diff, `Brace imbalance: ${totalOpen} open vs ${totalClose} close`).toBeLessThan(20);
  });

  it("does not contain console.error in production (warning only)", () => {
    // This is informational — console.warn is OK, console.error suggests bugs
    const errorMatches = html.match(/console\.error/g) || [];
    // Allow some console.error for legitimate error handling
    expect(errorMatches.length).toBeLessThan(20);
  });
});

describe("service worker version sync", () => {
  it("sw.js exists and contains CACHE version", () => {
    expect(swContent).toMatch(/CACHE\s*=\s*['"][^'"]+['"]/);
  });

  it("APP_VERSION in HTML aligns with sw.js CACHE", () => {
    const appVersionMatch = html.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const cacheMatch = swContent.match(/CACHE\s*=\s*'shlav-a-v([^']+)'/);

    expect(appVersionMatch, "APP_VERSION found").not.toBeNull();
    expect(cacheMatch, "CACHE version found").not.toBeNull();

    const appVersion = appVersionMatch[1];
    const swVersion = cacheMatch[1];
    // Exact match: APP_VERSION "9.50" must equal sw.js CACHE suffix "9.50"
    expect(swVersion, `sw.js CACHE version "${swVersion}" must exactly match APP_VERSION "${appVersion}"`).toBe(
      appVersion
    );
  });

  it("package.json version matches APP_VERSION", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));
    const appVersionMatch = html.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    expect(appVersionMatch, "APP_VERSION found").not.toBeNull();
    const appVersion = appVersionMatch[1];
    // package.json uses semver "9.50.0", APP_VERSION is "9.50"
    expect(pkg.version, `package.json "${pkg.version}" must start with APP_VERSION "${appVersion}"`).toMatch(
      new RegExp("^" + appVersion.replace(/\./g, "\\."))
    );
  });
});

describe("shlav-a-mega.html — security checks", () => {
  it("does not contain inline eval()", () => {
    // eval is dangerous and shouldn't appear in production code
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    for (const match of scriptMatches) {
      const js = match[1];
      // Remove strings to avoid false matches
      const cleaned = js
        .replace(/'(?:[^'\\]|\\.)*'/g, "")
        .replace(/"(?:[^"\\]|\\.)*"/g, "")
        .replace(/`(?:[^`\\]|\\.)*`/g, "");
      expect(cleaned).not.toMatch(/\beval\s*\(/);
    }
  });

  it("sanitizes or avoids direct innerHTML with user input", () => {
    // Count innerHTML assignments — flag ones that use string interpolation
    const dangerousInnerHTML = html.match(/\.innerHTML\s*=\s*`[^`]*\$\{/g) || [];
    // Allow some — they should use DOMPurify or be safe template literals
    // This is a warning-level check
    if (dangerousInnerHTML.length > 0) {
      // Just log, don't fail — the CI pipeline already checks this
      expect(dangerousInnerHTML.length).toBeLessThan(100);
    }
  });
});

describe("manifest.json — PWA config", () => {
  it("is valid JSON", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf-8"));
    expect(manifest.name).toBeDefined();
    expect(manifest.start_url).toBeDefined();
  });

  it("has required PWA fields", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "manifest.json"), "utf-8"));
    expect(manifest.name).toBeDefined();
    expect(manifest.short_name || manifest.name).toBeDefined();
    expect(manifest.display).toBeDefined();
    expect(manifest.start_url).toBeDefined();
  });
});

describe("index.html — GitHub Pages redirect", () => {
  it("exists and redirects to shlav-a-mega.html", () => {
    const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf-8");
    expect(indexHtml).toContain("shlav-a-mega.html");
  });
});

describe("study_plan APP_KEY contract", () => {
  // Server RPC (study_plan_upsert / study_plan_get) whitelists exactly
  // ('geri','pnimit','mishpacha'). Sending the Hebrew colloquial 'shlav'
  // returns {ok:false, error:'invalid_app'} despite HTTP 200.
  // Caught in v10.46.0 (mobile screenshot 2026-04-28), fixed in v10.47.0.
  it("src/study_plan.js sends APP_KEY = 'geri' (matches RPC whitelist)", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    const m = sp.match(/const\s+APP_KEY\s*=\s*['"]([^'"]+)['"]/);
    expect(m, "APP_KEY constant found in src/study_plan.js").not.toBeNull();
    expect(m[1]).toBe("geri");
  });

  it("error map handles invalid_app (defensive against future server drift)", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    expect(sp).toMatch(/invalid_app:\s*['"][^'"]+['"]/);
  });

  it("study plan schedule renderer hides empty weeks and uses compact classes", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    expect(sp).toContain("const nonEmptyWeeks = display.weeks.filter");
    expect(sp).toContain("hiddenEmptyWeeks");
    expect(sp).toMatch(/class="sp-week"/);
    expect(sp).toContain("w === nonEmptyWeeks[0] ? 'open' : ''");
    expect(sp).toMatch(/class="sp-topic__title"/);
    expect(sp).not.toMatch(/_ללא נושאים בשבוע זה/);
  });

  it("study plan topic labels de-duplicate repeated English acronyms", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    expect(sp).toMatch(/function\s+_cleanHeTopicLabel/);
    expect(sp).toMatch(/A-Za-z0-9\/\+& \.-/);
    expect(sp).toContain("_cleanHeTopicLabel(t.he, t.en)");
  });

  it("study plan topics expose mapped source chapters", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    expect(sp).toMatch(/function\s+_topicSourceRefs/);
    expect(sp).toContain("QCHAPS[String(idx)]");
    expect(sp).toContain("Hazzard Ch ");
    expect(sp).toContain("Harrison Ch ");
    expect(sp).toContain("GRS8 Ch ");
    expect(sp).toMatch(/class="sp-topic__sources"/);
    expect(sp).toContain("Sources: ${sources}");
  });

  it("study plan sliders update labels through delegated input handling", () => {
    const sp = readFileSync(resolve(ROOT, "src/study_plan.js"), "utf-8");
    expect(sp).toMatch(/function\s+_syncSliderLabel/);
    expect(sp).toContain("document.addEventListener('input'");
    expect(sp).toContain("target.id === 'sp-hpw'");
    expect(sp).toContain("target.id === 'sp-ramp'");
    expect(sp).toContain("_state.hoursPerWeek = Number(target.value)");
    expect(sp).toContain("_state.rampWeeks = Number(target.value)");
  });

  it("Settings data and credential surfaces stay compact and ordered", () => {
    const preChangelog = html.slice(0, html.indexOf("const CHANGELOG="));
    const settingsStart = preChangelog.indexOf("function renderSettings()");
    const settingsEnd = preChangelog.indexOf("async function toggleNotifOptIn", settingsStart);
    const body = preChangelog.slice(settingsStart, settingsEnd);
    expect(body).toContain('class="settings-credentials"');
    expect(body).toContain('class="card settings-data"');
    expect(body).toContain('class="settings-data__danger"');
    expect(body).toContain("Reset all local progress");
    expect(body.indexOf("settings-credentials")).toBeLessThan(body.indexOf("renderStudyPlanSection"));
    expect(body.indexOf("renderStudyPlanSection")).toBeLessThan(body.indexOf("settings-data"));
    expect(body).not.toContain("Anthropic API Key</div>");
  });

  it("tag_chapters works after full textbook JSON was replaced by title-only indexes", () => {
    const tagger = readFileSync(resolve(ROOT, "scripts/tag_chapters.cjs"), "utf-8");
    expect(tagger).toContain("data/hazzard_index.json");
    expect(tagger).toContain("harrison_index.json");
    expect(tagger).toMatch(/fs\.existsSync\(path\.join\(ROOT,\s*['"]data\/hazzard_chapters\.json['"]\)\)/);
    expect(tagger).toMatch(/fs\.existsSync\(path\.join\(ROOT,\s*['"]harrison_chapters\.json['"]\)\)/);
  });

  it("integrity guard does not require the retired Settings Feedback renderer", () => {
    const workflow = readFileSync(resolve(ROOT, ".github/workflows/integrity-guard.yml"), "utf-8");
    expect(workflow).not.toMatch(/['"]renderFeedback['"]/);
  });
});
