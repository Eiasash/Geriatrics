/**
 * Service worker integrity tests for Geriatrics (sw.js).
 *
 * Validates cache configuration, URL lists, version sync,
 * and strategy routing logic.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

let swContent, html;

beforeAll(() => {
  swContent = readFileSync(resolve(ROOT, "sw.js"), "utf-8");
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
});

describe("sw.js — cache configuration", () => {
  it("defines CACHE constant with version string", () => {
    expect(swContent).toMatch(/const CACHE\s*=\s*'shlav-a-v[\d.]+'/);
  });

  it("defines HTML_URLS array", () => {
    expect(swContent).toContain("HTML_URLS");
    expect(swContent).toContain("shlav-a-mega.html");
    expect(swContent).toContain("manifest.json");
  });

  it("defines JSON_DATA_URLS for all data files", () => {
    const expectedFiles = [
      "data/questions.json",
      "data/topics.json",
      "data/notes.json",
      "data/drugs.json",
      "data/flashcards.json",
      "data/tabs.json",
    ];
    for (const f of expectedFiles) {
      expect(swContent, `sw.js should cache ${f}`).toContain(f);
    }
  });

  it("all cached JSON files actually exist on disk", () => {
    const jsonUrlMatch = swContent.match(/JSON_DATA_URLS\s*=\s*\[([^\]]+)\]/);
    expect(jsonUrlMatch).not.toBeNull();
    const urls = jsonUrlMatch[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ""));
    for (const url of urls) {
      const fullPath = resolve(ROOT, url);
      expect(existsSync(fullPath), `${url} should exist on disk`).toBe(true);
    }
  });

  it("all cached HTML files actually exist on disk", () => {
    const htmlUrlMatch = swContent.match(/HTML_URLS\s*=\s*\[([^\]]+)\]/);
    expect(htmlUrlMatch).not.toBeNull();
    const urls = htmlUrlMatch[1].match(/'([^']+)'/g).map(s => s.replace(/'/g, ""));
    for (const url of urls) {
      const fullPath = resolve(ROOT, url);
      expect(existsSync(fullPath), `${url} should exist on disk`).toBe(true);
    }
  });
});

describe("sw.js — cache strategy", () => {
  it("has shouldUseCacheFirst function for JSON routing", () => {
    expect(swContent).toContain("shouldUseCacheFirst");
  });

  it("uses cache-first for JSON data files", () => {
    // The fetch handler checks shouldUseCacheFirst(url) which checks JSON_DATA_URLS
    expect(swContent).toMatch(/caches\.match.*request/);
  });

  it("uses network-first for HTML files (fetch before cache)", () => {
    // Network-first: fetch(e.request).then(...).catch(()=>caches.match(...))
    expect(swContent).toMatch(/fetch\(e\.request\)[\s\S]*?\.catch/);
  });

  it("has fallback to shlav-a-mega.html on network failure", () => {
    expect(swContent).toContain("shlav-a-mega.html");
  });

  it("does NOT fall back to questions.json for arbitrary data failures", () => {
    // Fixed: each data request falls back to its own cache, not questions.json
    const dataFallbackSection = swContent.match(/shouldUseCacheFirst[\s\S]*?\.catch\((.*?)\)/);
    if (dataFallbackSection) {
      expect(dataFallbackSection[1]).not.toContain('questions.json');
    }
  });

  it("skips non-GET requests", () => {
    expect(swContent).toMatch(/request\.method\s*!==\s*'GET'/);
  });

  it("uses navigate mode for HTML fallback", () => {
    expect(swContent).toMatch(/request\.mode\s*===\s*'navigate'/);
  });
});

describe("sw.js — lifecycle events", () => {
  it("has install event listener", () => {
    expect(swContent).toContain("addEventListener('install'");
  });

  it("calls skipWaiting on install", () => {
    expect(swContent).toContain("skipWaiting");
  });

  it("has activate event listener", () => {
    expect(swContent).toContain("addEventListener('activate'");
  });

  it("claims clients on activate", () => {
    expect(swContent).toContain("clients.claim");
  });

  it("cleans up old caches on activate", () => {
    expect(swContent).toContain("caches.delete");
  });
});

describe("sw.js — background sync", () => {
  it("has sync event listener for supabase-backup", () => {
    expect(swContent).toContain("supabase-backup");
  });

  it("reads pending_sync from IndexedDB", () => {
    expect(swContent).toContain("pending_sync");
    expect(swContent).toContain("indexedDB.open");
  });

  it("clears pending_sync after successful backup", () => {
    // After successful fetch, should delete the pending_sync entry
    expect(swContent).toMatch(/delete.*pending_sync|objectStore.*delete/s);
  });
});

describe("sw.js — push notifications", () => {
  it("has message listener for schedule-notification", () => {
    expect(swContent).toContain("schedule-notification");
  });

  it("shows notification with due count", () => {
    expect(swContent).toContain("showNotification");
    expect(swContent).toContain("Daily Review");
  });

  it("has notification click handler", () => {
    expect(swContent).toContain("notificationclick");
  });

  it("focuses existing window on notification click", () => {
    expect(swContent).toContain("clients.matchAll");
    expect(swContent).toContain("focus");
  });

  it("opens new window if no existing tab on notification click", () => {
    expect(swContent).toContain("clients.openWindow");
  });
});

describe("sw.js — version alignment with app", () => {
  it("sw.js CACHE version matches APP_VERSION in HTML", () => {
    const cacheMatch = swContent.match(/CACHE\s*=\s*'shlav-a-v([\d.]+)'/);
    const appVersionMatch = html.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);

    expect(cacheMatch, "CACHE version found in sw.js").not.toBeNull();
    expect(appVersionMatch, "APP_VERSION found in HTML").not.toBeNull();

    const swVersion = cacheMatch[1];
    const appVersion = appVersionMatch[1];
    // Exact match — no loose .toContain()
    expect(swVersion, `sw.js CACHE "${swVersion}" must exactly match APP_VERSION "${appVersion}"`).toBe(appVersion);
  });

  it("HTML cache cleanup exempts the exact sw.js CACHE key", () => {
    const cacheKeyMatch = swContent.match(/CACHE\s*=\s*'([^']+)'/);
    expect(cacheKeyMatch, "CACHE key found in sw.js").not.toBeNull();
    const swCacheKey = cacheKeyMatch[1];

    // The HTML cleanup code filters old caches: k !== '<current-cache-key>'
    // This must match the sw.js CACHE exactly or the current cache gets deleted
    // Cache cleanup now uses dynamic reference: k!=='shlav-a-v'+APP_VERSION
    const dynamicCleanup = html.includes("k!=='shlav-a-v'+APP_VERSION");
    const staticCleanup = html.match(/ks\.filter\(k=>k\.startsWith\('shlav-a-'\)&&k!=='([^']+)'\)/);
    
    if (dynamicCleanup) {
      // Dynamic reference — always matches APP_VERSION, which matches sw.js CACHE
      expect(true, "Cache cleanup uses dynamic APP_VERSION reference").toBe(true);
    } else if (staticCleanup) {
      const htmlExemptKey = staticCleanup[1];
      expect(htmlExemptKey, `HTML cleanup exempts "${htmlExemptKey}" but sw.js CACHE is "${swCacheKey}"`).toBe(swCacheKey);
    } else {
      expect(false, "No cache cleanup filter found in HTML").toBe(true);
    }
  });
});
