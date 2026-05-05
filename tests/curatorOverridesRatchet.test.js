/**
 * Curator-override ratchet test.
 *
 * Pins the questions where the dataset's `q.c` is medically correct but
 * disagrees with IMA's published answer key. These are documented in
 * `.audit_logs/curator_overrides.json` (machine-readable registry) and
 * narratively in `.audit_logs/TRACK_J_FINDINGS.md`,
 * `TRACK_L_FINDINGS.md`, `TRACK_O_P_FINDINGS.md`.
 *
 * Why this exists: across Tracks J + L + O (2026-05-04), 16 c-disagreements
 * were triangulated (clinical reasoning + IMA + Track-A AI) and 0 flips
 * warranted — IMA's published key is medically wrong in ~70% of cases.
 * A future "helpful" audit could silently flip these back toward IMA's wrong
 * key, undoing the curator's correction. This test fails loud if any pinned
 * override no longer matches expectation.
 *
 * Coverage: 16 of ~110 documented overrides (Tracks J+L+O). The remaining
 * 94 prior overrides live in unstructured per-tag evidence sheets at
 * `.audit_logs/review/{tag}.md`. They can be machine-extracted and appended
 * to `curator_overrides.json` in a future pass — the ratchet floor today
 * is the 16 that have clean structured source.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

function loadJSON(filename) {
  return JSON.parse(readFileSync(resolve(ROOT, filename), "utf-8"));
}

let questions, registry;

beforeAll(() => {
  questions = loadJSON("data/questions.json");
  registry = loadJSON(".audit_logs/curator_overrides.json");
});

describe("Curator-override ratchet", () => {
  it("registry exists and pins at least the 110 documented overrides", () => {
    expect(registry).toBeTruthy();
    expect(registry.overrides).toBeInstanceOf(Array);
    expect(registry.overrides.length).toBeGreaterThanOrEqual(110);
  });

  it("registry meta documents purpose + appendability", () => {
    expect(registry._meta).toBeTruthy();
    expect(registry._meta.purpose).toMatch(/curator override/i);
    expect(registry._meta.appendable).toBe(true);
  });

  // Per-entry: idx exists in questions, q.c matches expected, c_accept
  // shape matches if specified. This is the actual ratchet — flipping any
  // pinned q.c will fail this test loudly with the offending idx.
  it("every override entry's q.c matches expected_c", () => {
    const failures = [];
    for (const entry of registry.overrides) {
      const q = questions[entry.idx];
      if (!q) {
        failures.push(
          `idx=${entry.idx} (${entry.track}/${entry.tag}/q#${entry.qnum}): missing from questions.json`,
        );
        continue;
      }
      if (q.c !== entry.expected_c) {
        failures.push(
          `idx=${entry.idx} (${entry.track}/${entry.tag}/q#${entry.qnum}): expected c=${entry.expected_c}, got c=${q.c} — ${entry.topic_short}`,
        );
      }
    }
    expect(failures, failures.join("\n  ")).toEqual([]);
  });

  it("c_accept arrays match registry where pinned", () => {
    const failures = [];
    for (const entry of registry.overrides) {
      if (!entry.expected_c_accept) continue;
      const q = questions[entry.idx];
      if (!q) continue; // already failed above
      const actual = q.c_accept || null;
      const expected = entry.expected_c_accept;
      if (
        !Array.isArray(actual) ||
        actual.length !== expected.length ||
        !expected.every((v, i) => v === actual[i])
      ) {
        failures.push(
          `idx=${entry.idx}: expected c_accept=${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
        );
      }
    }
    expect(failures, failures.join("\n  ")).toEqual([]);
  });

  it("primary c is in c_accept when c_accept is present (registry consistency)", () => {
    for (const entry of registry.overrides) {
      if (!entry.expected_c_accept) continue;
      expect(
        entry.expected_c_accept,
        `registry idx=${entry.idx}: expected_c=${entry.expected_c} not in expected_c_accept ${JSON.stringify(entry.expected_c_accept)}`,
      ).toContain(entry.expected_c);
    }
  });

  it("track tags are recognized (J/L/N/O/P from fresh audit, registry-94 from bulk import)", () => {
    const allowed = new Set(["J", "L", "N", "O", "P", "registry-94"]);
    for (const entry of registry.overrides) {
      expect(allowed, `idx=${entry.idx} unexpected track ${entry.track}`).toContain(entry.track);
    }
  });

  it("idx + qnum are non-negative integers", () => {
    for (const entry of registry.overrides) {
      expect(Number.isInteger(entry.idx)).toBe(true);
      expect(entry.idx).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(entry.qnum)).toBe(true);
      expect(entry.qnum).toBeGreaterThanOrEqual(1);
    }
  });
});
