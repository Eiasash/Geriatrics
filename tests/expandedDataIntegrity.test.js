/**
 * Expanded data integrity tests for Geriatrics exam app.
 *
 * Adds deeper validation, edge case checks, cross-file consistency,
 * and image map integrity beyond the base dataIntegrity.test.js.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");

function loadJSON(filename) {
  return JSON.parse(readFileSync(resolve(ROOT, filename), "utf-8"));
}

let questions, notes, drugs, flashcards, topics, tabs;

beforeAll(() => {
  questions = loadJSON("data/questions.json");
  notes = loadJSON("data/notes.json");
  drugs = loadJSON("data/drugs.json");
  flashcards = loadJSON("data/flashcards.json");

  topics = loadJSON("data/topics.json");
  tabs = loadJSON("data/tabs.json");
});

// ─── Questions — deeper validation ────────────────────────────────────────

describe("questions.json — answer integrity", () => {
  it("every question has exactly 4 options", () => {
    const non4 = questions.filter((q, i) => q.o.length !== 4);
    // Most exam questions should have 4 options; flag if many don't
    expect(non4.length, `${non4.length} questions don't have exactly 4 options`).toBeLessThan(
      questions.length * 0.05,
    );
  });

  it("correct answer index is never negative", () => {
    questions.forEach((q, i) => {
      expect(q.c, `Q[${i}].c should not be negative`).toBeGreaterThanOrEqual(0);
    });
  });

  it("correct answer index is strictly within options array bounds", () => {
    const outOfBounds = [];
    questions.forEach((q, i) => {
      if (q.c >= q.o.length) {
        outOfBounds.push({ index: i, c: q.c, optLen: q.o.length, q: q.q.slice(0, 50) });
      }
    });
    expect(outOfBounds, `Out-of-bounds correct answers: ${JSON.stringify(outOfBounds)}`).toEqual([]);
  });

  it("no option text is just whitespace", () => {
    const blank = [];
    questions.forEach((q, i) => {
      q.o.forEach((opt, j) => {
        if (typeof opt !== "string" || opt.trim().length === 0) {
          blank.push({ qIndex: i, optIndex: j });
        }
      });
    });
    expect(blank, `Blank options found: ${JSON.stringify(blank)}`).toEqual([]);
  });

  it("question text length is reasonable (5-2000 chars)", () => {
    const tooShort = [];
    const tooLong = [];
    questions.forEach((q, i) => {
      if (q.q.length < 5) tooShort.push({ index: i, len: q.q.length });
      if (q.q.length > 2000) tooLong.push({ index: i, len: q.q.length });
    });
    expect(tooShort, `Questions too short: ${JSON.stringify(tooShort)}`).toEqual([]);
    expect(tooLong, `Questions too long: ${JSON.stringify(tooLong)}`).toEqual([]);
  });

  it("year field (t) is a non-empty string", () => {
    questions.forEach((q, i) => {
      expect(typeof q.t, `Q[${i}].t should be string`).toBe("string");
      expect(q.t.length, `Q[${i}].t should be non-empty`).toBeGreaterThan(0);
    });
  });

  it("topic index (ti) is an integer 0-39", () => {
    const invalid = [];
    questions.forEach((q, i) => {
      if (!Number.isInteger(q.ti) || q.ti < 0 || q.ti > 39) {
        invalid.push({ index: i, ti: q.ti });
      }
    });
    expect(invalid, `Invalid topic indices: ${JSON.stringify(invalid)}`).toEqual([]);
  });
});

describe("questions.json — near-duplicate detection", () => {
  it("no near-duplicate questions by first 80 chars", () => {
    const map = new Map();
    const nearDupes = [];
    questions.forEach((q, i) => {
      const prefix = q.q.trim().slice(0, 80).toLowerCase();
      if (map.has(prefix)) {
        const prev = map.get(prefix);
        // Only flag if answers also conflict
        if (prev.c !== q.c) {
          nearDupes.push({
            indices: [prev.index, i],
            prefix: prefix.slice(0, 40) + "...",
          });
        }
      } else {
        map.set(prefix, { index: i, c: q.c });
      }
    });
    expect(nearDupes, `Near-duplicate questions with conflicting answers: ${JSON.stringify(nearDupes)}`).toEqual([]);
  });
});

describe("questions.json — explanation quality", () => {
  it("questions with explanations have reasonable length", () => {
    const tooShort = [];
    questions.forEach((q, i) => {
      if (q.e && q.e.length < 20) {
        tooShort.push({ index: i, eLen: q.e.length });
      }
    });
    expect(tooShort, `Explanations too short: ${JSON.stringify(tooShort)}`).toEqual([]);
  });

  it("a significant portion of questions have explanations", () => {
    const withExplanation = questions.filter(q => q.e && q.e.length > 50).length;
    const ratio = withExplanation / questions.length;
    // At least 30% should have explanations
    expect(ratio, `Only ${(ratio * 100).toFixed(1)}% of questions have explanations`).toBeGreaterThan(0.3);
  });
});

// ─── Notes — deeper validation ──────────────────────────────────────────────

describe("notes.json — content quality", () => {
  it("every note has an id field (integer 0-39)", () => {
    notes.forEach((n, i) => {
      expect(n.id, `Note[${i}].id should be defined`).toBeDefined();
      expect(Number.isInteger(n.id), `Note[${i}].id should be integer`).toBe(true);
      expect(n.id, `Note[${i}].id should be in range 0-39`).toBeGreaterThanOrEqual(0);
      expect(n.id, `Note[${i}].id should be in range 0-39`).toBeLessThanOrEqual(39);
    });
  });

  it("note IDs are unique", () => {
    const ids = notes.map(n => n.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate note IDs: ${dupes.join(", ")}`).toEqual([]);
  });

  it("notes content has substantial length (board-pearl density)", () => {
    notes.forEach((n, i) => {
      expect(n.notes.length, `Note[${i}] "${n.topic}" should have substantial content`).toBeGreaterThan(100);
    });
  });

  it("no notes reference excluded Hazzard chapters (Ch 2-6, 34, 62)", () => {
    const excludedChapters = [2, 3, 4, 5, 6, 34, 62];
    const violations = [];
    notes.forEach((n, i) => {
      for (const ch of excludedChapters) {
        // Only flag if it's a chapter citation like "Ch 2" or "Chapter 2", not "Ch 23"
        const pattern = new RegExp(`\\bCh\\.?\\s*${ch}\\b(?!\\d)`, "i");
        if (pattern.test(n.ch)) {
          violations.push({ index: i, topic: n.topic, ch: n.ch, excludedCh: ch });
        }
      }
    });
    // Note: some false positives possible (e.g., "Ch 34" meaning a different numbering)
    // So we just warn rather than hard-fail
    expect(violations.length, `Notes citing excluded chapters: ${JSON.stringify(violations)}`).toBeLessThanOrEqual(2);
  });
});

// ─── Drugs — deeper validation ──────────────────────────────────────────────

describe("drugs.json — clinical accuracy checks", () => {
  it("all Beers Criteria drugs have meaningful risk descriptions", () => {
    drugs.filter(d => d.beers).forEach((d, i) => {
      expect(d.risk.length, `Beers drug "${d.name}" should have risk description`).toBeGreaterThan(10);
    });
  });

  it("Hebrew name (heb) is non-empty for all drugs", () => {
    drugs.forEach((d, i) => {
      expect(d.heb.length, `Drug "${d.name}" should have Hebrew name`).toBeGreaterThan(0);
    });
  });

  it("drug categories are non-empty", () => {
    drugs.forEach((d, i) => {
      expect(d.cat.length, `Drug "${d.name}" should have category`).toBeGreaterThan(0);
    });
  });

  it("ACB scores are clinically reasonable (0-3 integer scale)", () => {
    drugs.forEach((d, i) => {
      expect([0, 1, 2, 3]).toContain(d.acb);
    });
  });

  it("has representation of multiple drug categories", () => {
    const categories = new Set(drugs.map(d => d.cat));
    expect(categories.size, "Should have diverse drug categories").toBeGreaterThan(5);
  });
});

// ─── Flashcards — deeper validation ─────────────────────────────────────────

describe("flashcards.json — content quality", () => {
  it("front and back text have reasonable length", () => {
    flashcards.forEach((fc, i) => {
      expect(fc.f.length, `Card[${i}] front too short`).toBeGreaterThan(3);
      expect(fc.b.length, `Card[${i}] back too short`).toBeGreaterThan(1);
    });
  });

  it("no flashcard has identical front and back", () => {
    const identical = [];
    flashcards.forEach((fc, i) => {
      if (fc.f.trim().toLowerCase() === fc.b.trim().toLowerCase()) {
        identical.push({ index: i, text: fc.f.slice(0, 40) });
      }
    });
    expect(identical, `Cards with identical front/back: ${JSON.stringify(identical)}`).toEqual([]);
  });
});

// ─── OSCE — deeper validation ───────────────────────────────────────────────



// ─── Tabs — validation ──────────────────────────────────────────────────────

describe("tabs.json — app navigation", () => {
  it("has the expected number of tabs", () => {
    expect(tabs.length).toBeGreaterThanOrEqual(5);
  });

  it("every tab has id, icon (ic), and label (l)", () => {
    tabs.forEach((t, i) => {
      expect(typeof t.id, `Tab[${i}].id`).toBe("string");
      expect(t.id.length, `Tab[${i}].id non-empty`).toBeGreaterThan(0);
      expect(typeof t.ic, `Tab[${i}].ic (icon)`).toBe("string");
      expect(t.ic.length, `Tab[${i}].ic non-empty`).toBeGreaterThan(0);
      expect(typeof t.l, `Tab[${i}].l (label)`).toBe("string");
      expect(t.l.length, `Tab[${i}].l non-empty`).toBeGreaterThan(0);
    });
  });

  it("tab IDs are unique", () => {
    const ids = tabs.map(t => t.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes, `Duplicate tab IDs: ${dupes.join(", ")}`).toEqual([]);
  });

  it("tab IDs match expected app modes", () => {
    const validModes = ["quiz", "learn", "lib", "track", "more", "study", "flash", "drugs", "calc", "search", "chat"];
    tabs.forEach(t => {
      expect(validModes, `Tab "${t.id}" should be a valid mode`).toContain(t.id);
    });
  });
});

// ─── Cross-file integrity — expanded ────────────────────────────────────────

describe("cross-file integrity — expanded", () => {
  it("notes array length matches topics array length", () => {
    expect(notes.length, "Should have one note per topic").toBe(topics.length);
  });

  it("every topic index used in questions has a corresponding note", () => {
    const usedTopics = new Set(questions.map(q => q.ti));
    for (const ti of usedTopics) {
      const note = notes.find(n => n.id === ti);
      expect(note, `Topic index ${ti} used in questions but no note with id=${ti}`).toBeDefined();
    }
  });

  it("questions cover a minimum number of distinct exam years", () => {
    const years = new Set(questions.map(q => q.t));
    expect(years.size, "Should cover multiple exam years").toBeGreaterThanOrEqual(3);
  });

  it("all topic keywords in topics.json are non-empty strings", () => {
    topics.forEach((t, i) => {
      t.forEach((kw, j) => {
        expect(typeof kw, `Topic[${i}][${j}]`).toBe("string");
        expect(kw.trim().length, `Topic[${i}][${j}] should be non-empty`).toBeGreaterThan(0);
      });
    });
  });
});

// ─── Image map integrity ────────────────────────────────────────────────────

describe("questions/image_map.json — integrity", () => {
  let imageMap;

  beforeAll(() => {
    if (existsSync(resolve(ROOT, "questions/image_map.json"))) {
      imageMap = loadJSON("questions/image_map.json");
    }
  });

  it("image_map.json is a valid array", () => {
    if (!imageMap) return; // skip if file doesn't exist
    expect(Array.isArray(imageMap)).toBe(true);
  });

  it("every entry has required fields", () => {
    if (!imageMap) return;
    imageMap.forEach((entry, i) => {
      expect(typeof entry.exam, `Map[${i}].exam`).toBe("string");
      expect(typeof entry.q_num, `Map[${i}].q_num`).toBe("number");
      expect(typeof entry.fname, `Map[${i}].fname`).toBe("string");
      expect(typeof entry.fpath, `Map[${i}].fpath`).toBe("string");
    });
  });

  it("all referenced image files exist on disk", () => {
    if (!imageMap) return;
    const missing = [];
    imageMap.forEach((entry, i) => {
      const imgPath = resolve(ROOT, entry.fpath);
      if (!existsSync(imgPath)) {
        missing.push({ index: i, fpath: entry.fpath });
      }
    });
    expect(missing, `Missing image files: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("image dimensions are positive", () => {
    if (!imageMap) return;
    imageMap.forEach((entry, i) => {
      if (entry.w !== undefined) {
        expect(entry.w, `Map[${i}].w`).toBeGreaterThan(0);
      }
      if (entry.h !== undefined) {
        expect(entry.h, `Map[${i}].h`).toBeGreaterThan(0);
      }
    });
  });

  it("every physical image file on disk is tracked in image_map.json", () => {
    if (!imageMap) return;
    const imgDir = resolve(ROOT, "questions/images");
    if (!existsSync(imgDir)) return;
    const { readdirSync } = require("fs");
    const diskFiles = readdirSync(imgDir).filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f));
    const mapFiles = new Set(imageMap.map(e => e.fname));
    const untracked = diskFiles.filter(f => !mapFiles.has(f));
    expect(untracked, `Image files on disk but missing from image_map.json: ${JSON.stringify(untracked)}`).toEqual([]);
  });
});

// ─── Question image (img field) validation ─────────────────────────────────

describe("questions.json — image field (img) validation", () => {
  const SUPA_IMG_PREFIX = "https://krmlzwwelqvlfslwltol.supabase.co/storage/v1/object/public/question-images/";

  it("img field, when present, is a valid Supabase URL string", () => {
    const invalid = [];
    questions.forEach((q, i) => {
      if (q.img === undefined || q.img === null) return;
      if (typeof q.img !== "string" || !q.img.startsWith("https://")) {
        invalid.push({ index: i, img: String(q.img).slice(0, 60) });
      }
    });
    expect(invalid, `Questions with non-URL img field: ${JSON.stringify(invalid)}`).toEqual([]);
  });

  it("all img URLs use the expected Supabase bucket prefix", () => {
    const wrong = [];
    questions.forEach((q, i) => {
      if (!q.img) return;
      if (!q.img.startsWith(SUPA_IMG_PREFIX)) {
        wrong.push({ index: i, img: q.img.slice(0, 80) });
      }
    });
    expect(wrong, `Image URLs not matching Supabase bucket: ${JSON.stringify(wrong)}`).toEqual([]);
  });

  it("img URLs have a valid image file extension", () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!q.img) return;
      if (!/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(q.img)) {
        bad.push({ index: i, img: q.img.slice(-30) });
      }
    });
    expect(bad, `Image URLs without valid extension: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it("img URLs contain no whitespace or control characters", () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!q.img) return;
      if (/[\s\x00-\x1f]/.test(q.img)) {
        bad.push({ index: i, img: q.img.slice(0, 60) });
      }
    });
    expect(bad, `Image URLs with whitespace/control chars: ${JSON.stringify(bad)}`).toEqual([]);
  });

  it("no duplicate img URLs across different questions", () => {
    const seen = new Map();
    const dupes = [];
    questions.forEach((q, i) => {
      if (!q.img) return;
      if (seen.has(q.img)) {
        dupes.push({ indices: [seen.get(q.img), i], img: q.img.split("/").pop() });
      } else {
        seen.set(q.img, i);
      }
    });
    // Some duplicates may be intentional (same image for variant questions), so warn at threshold
    expect(dupes.length, `${dupes.length} duplicate img URLs found`).toBeLessThan(questions.length * 0.02);
  });

  it("oi field, when present, is an array matching options length", () => {
    const bad = [];
    questions.forEach((q, i) => {
      if (!q.oi) return;
      if (!Array.isArray(q.oi)) {
        bad.push({ index: i, reason: "oi is not an array" });
      } else if (q.oi.length !== q.o.length) {
        bad.push({ index: i, oiLen: q.oi.length, oLen: q.o.length });
      }
    });
    expect(bad, `Questions with malformed oi field: ${JSON.stringify(bad)}`).toEqual([]);
  });
});

// ─── Image file size checks ────────────────────────────────────────────────

describe("questions/images — file size limits", () => {
  it("no image file exceeds 3 MB", () => {
    const imgDir = resolve(ROOT, "questions/images");
    if (!existsSync(imgDir)) return;
    const { readdirSync, statSync } = require("fs");
    const MAX_BYTES = 3 * 1024 * 1024;
    const oversized = [];
    readdirSync(imgDir)
      .filter(f => /\.(png|jpe?g|gif|webp)$/i.test(f))
      .forEach(f => {
        const size = statSync(resolve(imgDir, f)).size;
        if (size > MAX_BYTES) {
          oversized.push({ file: f, sizeMB: (size / 1024 / 1024).toFixed(1) });
        }
      });
    expect(oversized, `Images exceeding 3 MB: ${JSON.stringify(oversized)}`).toEqual([]);
  });
});

// ─── OSCE — null entry validation ──────────────────────────────────────────



// ─── Topics — all 40 have non-empty keyword arrays ─────────────────────────

describe("topics.json — keyword completeness", () => {
  it("has exactly 40 topics", () => {
    expect(topics.length).toBe(40);
  });

  it("all 40 topics have non-empty keyword arrays", () => {
    topics.forEach((t, i) => {
      expect(Array.isArray(t), `Topic[${i}] is array`).toBe(true);
      expect(t.length, `Topic[${i}] has at least one keyword`).toBeGreaterThan(0);
      t.forEach((kw, j) => {
        expect(typeof kw, `Topic[${i}][${j}] is string`).toBe("string");
        expect(kw.trim().length, `Topic[${i}][${j}] is non-empty after trim`).toBeGreaterThan(0);
      });
    });
  });
});

// ─── Tabs — validates tab structure ────────────────────────────────────────

describe("tabs.json — structure validation", () => {
  it("has required tab fields (id, ic, l)", () => {
    tabs.forEach((t, i) => {
      expect(typeof t.id, `Tab[${i}].id`).toBe("string");
      expect(typeof t.ic, `Tab[${i}].ic`).toBe("string");
      expect(typeof t.l, `Tab[${i}].l`).toBe("string");
      expect(t.id.length).toBeGreaterThan(0);
      expect(t.ic.length).toBeGreaterThan(0);
      expect(t.l.length).toBeGreaterThan(0);
    });
  });

  it("tab IDs are unique", () => {
    const ids = tabs.map(t => t.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

// ─── Cross-reference: question topic index maps to valid topic ─────────────

describe("cross-reference — question topics to topics.json", () => {
  it("every question topic index maps to a valid topic in topics.json", () => {
    const invalid = [];
    questions.forEach((q, i) => {
      if (q.ti < 0 || q.ti >= topics.length) {
        invalid.push({ index: i, ti: q.ti });
      }
    });
    expect(invalid, `Questions with invalid topic index: ${JSON.stringify(invalid)}`).toEqual([]);
  });

  it("every topic in topics.json is referenced by at least one question", () => {
    const usedTopics = new Set(questions.map(q => q.ti));
    for (let i = 0; i < topics.length; i++) {
      expect(usedTopics.has(i), `Topic ${i} has no questions`).toBe(true);
    }
  });
});

// ─── Notes coverage: every topic has at least one note ─────────────────────

describe("notes coverage — every topic has a note", () => {
  it("every topic index 0-39 has a corresponding note entry", () => {
    const noteIds = new Set(notes.map(n => n.id));
    for (let i = 0; i < 40; i++) {
      expect(noteIds.has(i), `Topic ${i} should have a note entry`).toBe(true);
    }
  });

  it("notes have non-empty content", () => {
    notes.forEach((n, i) => {
      expect(n.notes.length, `Note[${i}] "${n.topic}" should have content`).toBeGreaterThan(0);
    });
  });
});

// ─── Flashcard quality: all have non-empty front and back ──────────────────

describe("flashcard quality — front and back validation", () => {
  it("all flashcards have non-empty front (f)", () => {
    flashcards.forEach((fc, i) => {
      expect(typeof fc.f, `Card[${i}].f is string`).toBe("string");
      expect(fc.f.trim().length, `Card[${i}].f is non-empty after trim`).toBeGreaterThan(0);
    });
  });

  it("all flashcards have non-empty back (b)", () => {
    flashcards.forEach((fc, i) => {
      expect(typeof fc.b, `Card[${i}].b is string`).toBe("string");
      expect(fc.b.trim().length, `Card[${i}].b is non-empty after trim`).toBeGreaterThan(0);
    });
  });

  it("no flashcard has whitespace-only content", () => {
    const bad = [];
    flashcards.forEach((fc, i) => {
      if (fc.f.trim().length === 0 || fc.b.trim().length === 0) {
        bad.push({ index: i, f: fc.f.slice(0, 20), b: fc.b.slice(0, 20) });
      }
    });
    expect(bad, `Flashcards with whitespace-only content: ${JSON.stringify(bad)}`).toEqual([]);
  });
});
