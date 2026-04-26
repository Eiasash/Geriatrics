import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname || ".", "..");
const chapters = JSON.parse(
  readFileSync(resolve(root, "data/grs8_chapters.json"), "utf8"),
);
const qPages = JSON.parse(
  readFileSync(resolve(root, "data/grs8_question_pages.json"), "utf8"),
);
const questions = JSON.parse(
  readFileSync(resolve(root, "data/questions.json"), "utf8"),
);

describe("grs8 question mapping (v10.36.3 Fix B)", () => {
  it("every chapter has a questions array of integers in 1..333", () => {
    for (const [id, ch] of Object.entries(chapters)) {
      expect(Array.isArray(ch.questions), `ch ${id} missing questions array`).toBe(true);
      for (const q of ch.questions) {
        expect(Number.isInteger(q), `ch ${id} non-int q ${q}`).toBe(true);
        expect(q, `ch ${id} q ${q} out of 1..333`).toBeGreaterThanOrEqual(1);
        expect(q).toBeLessThanOrEqual(333);
      }
    }
  });

  it("data/grs8_question_pages.json has exactly 333 entries with sane page values", () => {
    const keys = Object.keys(qPages);
    expect(keys.length).toBe(333);
    const expected = new Set();
    for (let i = 1; i <= 333; i++) expected.add(String(i));
    for (const k of keys) {
      expect(expected.has(k), `unexpected key ${k}`).toBe(true);
      const v = qPages[k];
      expect(Number.isInteger(v), `Q${k} page not int: ${v}`).toBe(true);
      expect(v, `Q${k} page out of bounds: ${v}`).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(300);
    }
  });

  it("every t='GRS8' bank Q ref contains Q#NNN where NNN appears in some chapter's questions array", () => {
    const allQNums = new Set();
    for (const ch of Object.values(chapters)) {
      for (const q of ch.questions || []) allQNums.add(q);
    }
    const grs8Bank = questions.filter((q) => q.t === "GRS8");
    expect(grs8Bank.length, "expected ≥1 GRS8-tagged bank Q").toBeGreaterThanOrEqual(1);
    for (const q of grs8Bank) {
      const ref = q.ref || "";
      const m = ref.match(/Q#(\d+)\b/);
      expect(m, `bank Q with t='GRS8' missing Q#NNN in ref: ${ref.slice(0, 100)}`).toBeTruthy();
      const n = Number(m[1]);
      expect(allQNums.has(n), `Q#${n} from ref not found in any chapter's questions array`).toBe(true);
    }
  });

  it("every chapter's per-Q PDF anchors are distinct enough to scatter (≥80% unique pages within multi-Q chapters)", () => {
    let multiCount = 0;
    let goodCount = 0;
    for (const ch of Object.values(chapters)) {
      const qs = ch.questions || [];
      if (qs.length < 3) continue;
      multiCount++;
      const pages = qs.map((q) => qPages[String(q)]).filter(Boolean);
      const uniq = new Set(pages).size;
      if (uniq / pages.length >= 0.8) goodCount++;
    }
    expect(multiCount).toBeGreaterThan(40);
    expect(goodCount / multiCount, `only ${goodCount}/${multiCount} chapters have ≥80% distinct anchors`).toBeGreaterThanOrEqual(0.9);
  });
});
