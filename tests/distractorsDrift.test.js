/**
 * Drift-guard tests for data/distractors.json (1,277+ entries).
 *
 * distractors.json maps question index (string) -> array of distractor rationales,
 * one per option. The array length must match the parent question's options length,
 * and every key must reference a valid question index. These invariants are currently
 * untested, so any future generator run that loses alignment would ship silently.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const DIST_PATH = resolve(ROOT, "data/distractors.json");

function loadJSON(p) {
  return JSON.parse(readFileSync(p, "utf-8"));
}

describe("data/distractors.json — drift guard", () => {
  if (!existsSync(DIST_PATH)) {
    it.skip("distractors.json not present — skipping", () => {});
    return;
  }

  let distractors, questions;

  beforeAll(() => {
    distractors = loadJSON(DIST_PATH);
    questions = loadJSON(resolve(ROOT, "data/questions.json"));
  });

  it("is a plain object (dict keyed by question index)", () => {
    expect(distractors).toBeTypeOf("object");
    expect(Array.isArray(distractors)).toBe(false);
    expect(distractors).not.toBeNull();
  });

  it("every key is a numeric string", () => {
    const bad = Object.keys(distractors).filter((k) => !/^\d+$/.test(k));
    expect(bad).toEqual([]);
  });

  it("every key references a valid question index", () => {
    const n = questions.length;
    const orphans = Object.keys(distractors).filter((k) => {
      const i = Number(k);
      return !Number.isInteger(i) || i < 0 || i >= n;
    });
    expect(orphans).toEqual([]);
  });

  it("every value is an array of strings", () => {
    const badType = Object.entries(distractors).filter(([, v]) => !Array.isArray(v));
    expect(badType).toEqual([]);
    const badItem = Object.entries(distractors).find(
      ([, v]) => Array.isArray(v) && v.some((s) => typeof s !== "string"),
    );
    expect(badItem).toBeUndefined();
  });

  it("distractor array length matches parent question's options length", () => {
    const mismatches = [];
    for (const [k, v] of Object.entries(distractors)) {
      const q = questions[Number(k)];
      if (!q || !Array.isArray(q.o)) continue;
      if (v.length !== q.o.length) {
        mismatches.push({ key: k, distLen: v.length, optLen: q.o.length });
      }
    }
    expect(mismatches).toEqual([]);
  });
});
