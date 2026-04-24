/**
 * Tests for src/storage.js — the lsGet/lsSet localStorage helpers.
 *
 * Regression: lsSet used to swallow every exception and return nothing, so
 * a QuotaExceededError on iOS Safari (5MB cap) silently dropped study
 * progress without any indication to the caller. We now return a boolean
 * and log a single warning. These tests pin that contract.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

let lsGet, lsSet;

beforeAll(() => {
  const code = readFileSync(join(__dirname, "..", "src", "storage.js"), "utf-8");
  // Provide a localStorage shim; individual tests override setItem/getItem.
  const fakeLocalStorage = {
    _store: new Map(),
    getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
    setItem(k, v) { this._store.set(k, String(v)); },
    removeItem(k) { this._store.delete(k); },
    clear() { this._store.clear(); },
  };
  const factory = new Function(
    "localStorage",
    "console",
    code + "\nreturn {lsGet,lsSet,_fakeLocalStorage:localStorage};"
  );
  const ctx = factory(fakeLocalStorage, console);
  lsGet = ctx.lsGet;
  lsSet = ctx.lsSet;
  globalThis.__fakeLocalStorage = fakeLocalStorage;
});

beforeEach(() => {
  globalThis.__fakeLocalStorage._store.clear();
});

describe("lsGet", () => {
  it("returns the parsed value when the key is present", () => {
    globalThis.__fakeLocalStorage.setItem("k", JSON.stringify({ a: 1 }));
    expect(lsGet("k", null)).toEqual({ a: 1 });
  });

  it("returns the fallback when the key is missing", () => {
    expect(lsGet("missing", { fallback: true })).toEqual({ fallback: true });
  });

  it("returns the fallback and clears the corrupted entry when JSON is malformed", () => {
    globalThis.__fakeLocalStorage._store.set("bad", "{not-json");
    const out = lsGet("bad", 42);
    expect(out).toBe(42);
    expect(globalThis.__fakeLocalStorage.getItem("bad")).toBeNull();
  });

  it("returns fallback when stored value is literal null (nullish coalescing)", () => {
    globalThis.__fakeLocalStorage.setItem("n", "null");
    expect(lsGet("n", "default")).toBe("default");
  });
});

describe("lsSet", () => {
  it("returns true on successful write", () => {
    expect(lsSet("ok", { x: 1 })).toBe(true);
    expect(lsGet("ok", null)).toEqual({ x: 1 });
  });

  it("returns false when localStorage.setItem throws QuotaExceededError", () => {
    const ls = globalThis.__fakeLocalStorage;
    const original = ls.setItem.bind(ls);
    ls.setItem = () => {
      const err = new Error("quota");
      err.name = "QuotaExceededError";
      throw err;
    };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(lsSet("x", { big: true })).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      ls.setItem = original;
      warnSpy.mockRestore();
    }
  });

  it("returns false when JSON.stringify fails (circular reference)", () => {
    const circ = {};
    circ.self = circ;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(lsSet("circ", circ)).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("never throws — callers can rely on the boolean return", () => {
    const ls = globalThis.__fakeLocalStorage;
    const original = ls.setItem.bind(ls);
    ls.setItem = () => { throw new Error("generic failure"); };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(() => lsSet("k", 1)).not.toThrow();
    } finally {
      ls.setItem = original;
      warnSpy.mockRestore();
    }
  });
});
