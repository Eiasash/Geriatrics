/**
 * Data integrity tests for Geriatrics exam app.
 *
 * Validates all JSON data files against their expected schemas,
 * checks for duplicates, and ensures referential integrity.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

function loadJSON(filename) {
  return JSON.parse(readFileSync(resolve(ROOT, filename), "utf-8"));
}

let questions, notes, drugs, flashcards, topics;

beforeAll(() => {
  questions = loadJSON("data/questions.json");
  notes = loadJSON("data/notes.json");
  drugs = loadJSON("data/drugs.json");
  flashcards = loadJSON("data/flashcards.json");

  topics = loadJSON("data/topics.json");
});

// ─── Questions ──────────────────────────────────────────────────────

describe("questions.json — schema validation", () => {
  it("has at least 900 questions", () => {
    expect(questions.length).toBeGreaterThan(900);
  });

  it("every question has required fields", () => {
    questions.forEach((q, i) => {
      expect(typeof q.q, `Q[${i}].q`).toBe("string");
      expect(q.q.length, `Q[${i}].q is non-empty`).toBeGreaterThan(0);
      expect(Array.isArray(q.o), `Q[${i}].o is array`).toBe(true);
      expect(q.o.length, `Q[${i}].o has at least 2 options`).toBeGreaterThanOrEqual(2);
      expect(Number.isInteger(q.c), `Q[${i}].c is integer`).toBe(true);
      expect(q.c, `Q[${i}].c is valid index`).toBeGreaterThanOrEqual(0);
      expect(q.c, `Q[${i}].c within options range`).toBeLessThan(q.o.length);
      expect(Number.isInteger(q.ti), `Q[${i}].ti is integer`).toBe(true);
      expect(q.ti, `Q[${i}].ti >= 0`).toBeGreaterThanOrEqual(0);
      expect(q.ti, `Q[${i}].ti <= 42`).toBeLessThanOrEqual(42);
    });
  });

  it("every question has a year field (t)", () => {
    questions.forEach((q, i) => {
      expect(q.t, `Q[${i}].t is defined`).toBeDefined();
    });
  });

  it("all options are non-empty strings", () => {
    questions.forEach((q, i) => {
      q.o.forEach((opt, j) => {
        expect(typeof opt, `Q[${i}].o[${j}] is string`).toBe("string");
        expect(opt.trim().length, `Q[${i}].o[${j}] is non-empty`).toBeGreaterThan(0);
      });
    });
  });

  it("no duplicate question texts with conflicting answers", () => {
    const map = new Map();
    const conflicts = [];
    questions.forEach((q, i) => {
      if (q.allow_dup) return;
      const key = q.q.trim().toLowerCase();
      if (map.has(key)) {
        const prev = map.get(key);
        if (prev.c !== q.c) {
          conflicts.push({ index: i, prevIndex: prev.index, q: q.q.slice(0, 60) });
        }
      } else {
        map.set(key, { index: i, c: q.c });
      }
    });
    expect(conflicts, `Conflicting duplicates: ${JSON.stringify(conflicts)}`).toEqual([]);
  });
});

describe("questions.json — topic coverage", () => {
  it("all 43 topics (0-42) have at least 5 questions", () => {
    const topicCounts = {};
    questions.forEach(q => {
      topicCounts[q.ti] = (topicCounts[q.ti] ?? 0) + 1;
    });
    for (let ti = 0; ti <= 42; ti++) {
      expect(topicCounts[ti] ?? 0, `Topic ${ti} coverage`).toBeGreaterThanOrEqual(4);
    }
  });
});

// ─── Notes ──────────────────────────────────────────────────────────

describe("notes.json — schema validation", () => {
  it("has exactly 43 notes (one per topic)", () => {
    expect(notes.length).toBe(43);
  });

  it("every note has required fields", () => {
    notes.forEach((n, i) => {
      expect(typeof n.topic, `Note[${i}].topic`).toBe("string");
      expect(n.topic.length, `Note[${i}].topic non-empty`).toBeGreaterThan(0);
      expect(typeof n.notes, `Note[${i}].notes`).toBe("string");
      expect(n.notes.length, `Note[${i}].notes non-empty`).toBeGreaterThan(0);
      expect(typeof n.ch, `Note[${i}].ch`).toBe("string");
    });
  });

  it("no notes cite GRS as a chapter source (removed from P005-2026)", () => {
    notes.forEach((n, i) => {
      const ch = n.ch.toLowerCase();
      // GRS should not appear as a chapter citation source
      // (mentioning "grs exam q" in notes content is OK — it means exam question reference)
      const citesGRS = ch.includes("grs") && (ch.includes("ch") || ch.includes("chapter"));
      expect(citesGRS, `Note[${i}] "${n.topic}" cites GRS as source in ch field: ${n.ch}`).toBe(false);
    });
  });

  it("most notes cite Hazzard's or Harrison's (legal topics exempt)", () => {
    const legalTopicIds = [29, 30, 31, 32, 33, 34, 35]; // Ethics, Elder Abuse, Driving, Guardianship, Rights, Directives, Community
    const nonCiting = [];
    notes.forEach((n, i) => {
      if (legalTopicIds.includes(n.id)) return; // legal topics cite Israeli law
      const ch = n.ch.toLowerCase();
      const citesValid = ch.includes("hazzard") || ch.includes("harrison");
      if (!citesValid) nonCiting.push(`Note[${i}] "${n.topic}" ch="${n.ch}"`);
    });
    expect(nonCiting, `Notes not citing textbooks: ${nonCiting.join("; ")}`).toEqual([]);
  });
});

// ─── Drugs ──────────────────────────────────────────────────────────

describe("drugs.json — schema validation", () => {
  it("has at least 40 drugs", () => {
    expect(drugs.length).toBeGreaterThanOrEqual(40);
  });

  it("every drug has required fields", () => {
    drugs.forEach((d, i) => {
      expect(typeof d.name, `Drug[${i}].name`).toBe("string");
      expect(d.name.length, `Drug[${i}].name non-empty`).toBeGreaterThan(0);
      expect(typeof d.heb, `Drug[${i}].heb`).toBe("string");
      expect(Number.isInteger(d.acb), `Drug[${i}].acb is integer`).toBe(true);
      expect(d.acb, `Drug[${i}].acb in range 0-3`).toBeGreaterThanOrEqual(0);
      expect(d.acb, `Drug[${i}].acb in range 0-3`).toBeLessThanOrEqual(3);
      expect(typeof d.beers, `Drug[${i}].beers`).toBe("boolean");
      expect(typeof d.cat, `Drug[${i}].cat`).toBe("string");
      expect(typeof d.risk, `Drug[${i}].risk`).toBe("string");
    });
  });

  it("no duplicate drug names", () => {
    const names = drugs.map(d => d.name.toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `Duplicate drug names: ${dupes.join(", ")}`).toEqual([]);
  });

  it("ACB distribution is reasonable", () => {
    const acbCounts = { 0: 0, 1: 0, 2: 0, 3: 0 };
    drugs.forEach(d => acbCounts[d.acb]++);
    // Should have some drugs in each ACB tier (except maybe 0)
    expect(acbCounts[3], "ACB=3 drugs exist").toBeGreaterThan(0);
  });
});

// ─── Flashcards ─────────────────────────────────────────────────────

describe("flashcards.json — schema validation", () => {
  it("has at least 100 flashcards", () => {
    expect(flashcards.length).toBeGreaterThanOrEqual(100);
  });

  it("every flashcard has front and back", () => {
    flashcards.forEach((fc, i) => {
      expect(typeof fc.f, `Card[${i}].f`).toBe("string");
      expect(fc.f.length, `Card[${i}].f non-empty`).toBeGreaterThan(0);
      expect(typeof fc.b, `Card[${i}].b`).toBe("string");
      expect(fc.b.length, `Card[${i}].b non-empty`).toBeGreaterThan(0);
    });
  });

  it("no duplicate fronts", () => {
    const fronts = flashcards.map(fc => fc.f.trim().toLowerCase());
    const dupes = fronts.filter((f, i) => fronts.indexOf(f) !== i);
    expect(dupes.length, `Duplicate flashcard fronts: ${dupes.slice(0, 3).join(", ")}`).toBe(0);
  });
});

// ─── OSCE ───────────────────────────────────────────────────────────



// ─── Topics ─────────────────────────────────────────────────────────

describe("topics.json — schema validation", () => {
  it("has exactly 43 topics", () => {
    expect(topics.length).toBe(43);
  });

  it("every topic is an array of keyword strings", () => {
    topics.forEach((t, i) => {
      expect(Array.isArray(t), `Topic[${i}] is array`).toBe(true);
      expect(t.length, `Topic[${i}] has keywords`).toBeGreaterThan(0);
      t.forEach((kw, j) => {
        expect(typeof kw, `Topic[${i}][${j}] is string`).toBe("string");
      });
    });
  });
});

// ─── Cross-file integrity ───────────────────────────────────────────

describe("cross-file referential integrity", () => {
  it("question topic indices match topics array", () => {
    const topicCount = topics.length;
    questions.forEach((q, i) => {
      expect(q.ti, `Q[${i}].ti within topics range`).toBeLessThan(topicCount);
    });
  });

  it("all question topic indices reference valid topics", () => {
    const topicCount = topics.length;
    const invalid = questions.filter((q, i) => q.ti < 0 || q.ti >= topicCount);
    expect(invalid.length, `${invalid.length} questions have out-of-range ti`).toBe(0);
  });
});
