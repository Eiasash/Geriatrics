/**
 * G8 (2026-07-18): callAI's proxy branch must invalidate the cached anonymous JWT
 * on a proxy 401/403 (revoked-but-unexpired token) and retry the proxy ONCE with a
 * freshly minted bearer, before falling through to the personal-key path. Without
 * this, getProxyBearer keeps returning the stale cached token for up to ~1h.
 *
 * These tests extract getProxyBearer + callAI from the monolith and run them with a
 * mocked fetch + localStorage. The happy path (proxy 200) must be unchanged.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SUPA_URL = "https://supa.test";
const SUPA_ANON = "anon-key";
const AI_PROXY = "https://proxy.test/api/claude";

let gpbSrc, callAISrc;

beforeAll(() => {
  const html = readFileSync(resolve(import.meta.dirname, "..", "shlav-a-mega.html"), "utf-8");
  gpbSrc = html.match(/async function getProxyBearer\(\)\{[\s\S]*?return 'Bearer '\+d\.access_token;\s*\}/)[0];
  callAISrc = html.match(/async function callAI\([\s\S]*?\}finally\{clearTimeout\(_timeoutId\);\}\s*\}/)[0];
});

class FakeAbort { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } }
const quietConsole = { warn() {}, log() {}, error() {} };

function makeLS(initial) {
  const store = { ...initial };
  const calls = { removed: [], set: [] };
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); calls.set.push(k); },
    removeItem: (k) => { delete store[k]; calls.removed.push(k); },
  };
  return { ls, store, calls };
}

function buildCallAI({ fetch, localStorage, getApiKey }) {
  const factory = new Function(
    "fetch", "AI_PROXY", "getApiKey", "AbortController", "setTimeout", "clearTimeout", "console", "localStorage", "SUPA_URL", "SUPA_ANON",
    `${gpbSrc}\n${callAISrc}\nreturn {callAI, getProxyBearer};`
  );
  return factory(fetch, AI_PROXY, getApiKey, FakeAbort, () => 0, () => {}, quietConsole, localStorage, SUPA_URL, SUPA_ANON);
}

describe("proxy JWT invalidation on 401/403 (G8)", () => {
  it("a proxy 401 clears samega_proxy_jwt, re-mints a fresh bearer, and retries the proxy once", async () => {
    const { ls, store, calls } = makeLS({
      samega_proxy_jwt: JSON.stringify({ token: "STALE", exp: Date.now() + 3600000 }),
    });
    const proxyAuths = [];
    const fetch = vi.fn(async (url, init) => {
      if (url === SUPA_URL + "/auth/v1/signup") {
        return { ok: true, status: 200, json: async () => ({ access_token: "FRESH", expires_in: 3600 }) };
      }
      if (url === AI_PROXY) {
        proxyAuths.push(init.headers["Authorization"]);
        if (init.headers["Authorization"] === "Bearer STALE") return { ok: false, status: 401, json: async () => ({}) };
        if (init.headers["Authorization"] === "Bearer FRESH") return { ok: true, status: 200, json: async () => ({ content: [{ text: "RETRY_OK" }] }) };
      }
      throw new Error("unexpected fetch " + url);
    });
    const getApiKey = vi.fn(() => "sk-personal"); // present, but must NOT be used
    const { callAI } = buildCallAI({ fetch, localStorage: ls, getApiKey });

    const out = await callAI([{ role: "user", content: "hi" }]);
    expect(out).toBe("RETRY_OK");
    expect(proxyAuths).toEqual(["Bearer STALE", "Bearer FRESH"]); // stale then fresh
    expect(calls.removed).toContain("samega_proxy_jwt");          // stale JWT invalidated
    expect(JSON.parse(store.samega_proxy_jwt).token).toBe("FRESH"); // fresh JWT cached
    expect(getApiKey).not.toHaveBeenCalled();                     // personal key untouched
  });

  it("happy path (proxy 200 on first try) is unchanged: no re-mint, no retry, JWT untouched", async () => {
    const { ls, store, calls } = makeLS({
      samega_proxy_jwt: JSON.stringify({ token: "GOOD", exp: Date.now() + 3600000 }),
    });
    const fetch = vi.fn(async (url, init) => {
      if (url === AI_PROXY && init.headers["Authorization"] === "Bearer GOOD") {
        return { ok: true, status: 200, json: async () => ({ content: [{ text: "HAPPY" }] }) };
      }
      throw new Error("should not reach " + url);
    });
    const getApiKey = vi.fn(() => "sk-personal");
    const { callAI } = buildCallAI({ fetch, localStorage: ls, getApiKey });

    const out = await callAI([{ role: "user", content: "hi" }]);
    expect(out).toBe("HAPPY");
    expect(fetch).toHaveBeenCalledTimes(1);                     // no signup, no retry
    expect(calls.removed).not.toContain("samega_proxy_jwt");    // JWT untouched
    expect(JSON.parse(store.samega_proxy_jwt).token).toBe("GOOD");
    expect(getApiKey).not.toHaveBeenCalled();
  });

  it("if the retry also 401s, it falls through to the personal-key path (fail-safe, unchanged)", async () => {
    const { ls, calls } = makeLS({
      samega_proxy_jwt: JSON.stringify({ token: "STALE", exp: Date.now() + 3600000 }),
    });
    const fetch = vi.fn(async (url) => {
      if (url === SUPA_URL + "/auth/v1/signup") return { ok: true, status: 200, json: async () => ({ access_token: "FRESH2", expires_in: 3600 }) };
      if (url === AI_PROXY) return { ok: false, status: 401, json: async () => ({}) }; // both attempts 401
      if (url === "https://api.anthropic.com/v1/messages") return { ok: true, status: 200, json: async () => ({ content: [{ text: "PERSONAL_OK" }] }) };
      throw new Error("unexpected " + url);
    });
    const getApiKey = vi.fn(() => "sk-personal");
    const { callAI } = buildCallAI({ fetch, localStorage: ls, getApiKey });

    const out = await callAI([{ role: "user", content: "hi" }]);
    expect(out).toBe("PERSONAL_OK");
    expect(calls.removed).toContain("samega_proxy_jwt"); // still invalidated once
    expect(getApiKey).toHaveBeenCalled();                // fell through to personal key
  });
});
