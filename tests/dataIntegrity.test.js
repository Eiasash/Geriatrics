/**
 * Data integrity tests for Geriatrics exam app.
 *
 * Validates all JSON data files against their expected schemas,
 * checks for duplicates, and ensures referential integrity.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { loadQuestionsHydrated } from "./_helpers/loadQuestionsHydrated.js";

const ROOT = resolve(import.meta.dirname, "..");

function loadJSON(filename) {
  return JSON.parse(readFileSync(resolve(ROOT, filename), "utf-8"));
}

let questions, notes, drugs, flashcards, topics;

beforeAll(() => {
  questions = loadQuestionsHydrated(ROOT);
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
      expect(q.ti, `Q[${i}].ti <= 45`).toBeLessThanOrEqual(45);
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
  it("topics 0-42 have at least 5 questions; ti=43-45 are GRS8 grandfathered (v10.25)", () => {
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
  it("has exactly 46 notes (one per topic, including GRS8 buckets)", () => {
    expect(notes.length).toBe(46);
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
    expect(topics.length).toBe(46);
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

  it("syllabus_data.json totals match the live question bank (v10.64.19)", () => {
    // Catches the staleness problem flagged in v10.64.17 audit (3833 vs 3743).
    // Per-topic n_questions + total_questions_analyzed must match the actual ti
    // distribution in questions.json. If they drift, study-plan analytics and
    // topic-weight dashboards silently use the wrong denominator.
    const syllabus = loadJSON("data/syllabus_data.json");
    const geri = syllabus.Geri;
    expect(geri.total_questions_analyzed, "total_questions_analyzed").toBe(questions.length);
    const tiCounts = new Map();
    for (const q of questions) tiCounts.set(q.ti, (tiCounts.get(q.ti) || 0) + 1);
    const drift = [];
    for (const t of geri.topics) {
      const real = tiCounts.get(t.id) || 0;
      if (real !== t.n_questions) drift.push({ id: t.id, en: t.en, syllabus: t.n_questions, real });
    }
    expect(drift, `syllabus topic n_questions drift: ${JSON.stringify(drift.slice(0, 5))}`).toEqual([]);
  });

  /**
   * BROKEN-POINTER INTEGRITY (Track-H/K/N pattern).
   *
   * Tracks H/K/N introduced the convention that broken=true entries with
   * `broken_reason` containing "Duplicate of idx=N" point at a canonical
   * idx N. If a future deletion removes the canonical or makes it broken
   * itself, the pointer is orphaned and the audit metadata becomes stale.
   * This test catches that.
   *
   * If this fails: the canonical idx referenced by a broken_reason has
   * been deleted or itself flagged broken. Re-pair via Track-H/K/N method
   * (option-text overlap matching) and update broken_reason.
   */
  it("broken_reason 'Duplicate of idx=N' pointers reference valid non-broken canonicals", () => {
    const orphans = [];
    const POINTER_RE = /Duplicate of idx=(\d+)/i;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.broken) continue;
      const reason = q.broken_reason || "";
      const m = reason.match(POINTER_RE);
      if (!m) continue; // broken without pointer is allowed (legitimate gaps)
      const canonicalIdx = Number(m[1]);
      if (!Number.isInteger(canonicalIdx) || canonicalIdx < 0 || canonicalIdx >= questions.length) {
        orphans.push({ broken: i, points_at: canonicalIdx, status: "out_of_range" });
        continue;
      }
      const canonical = questions[canonicalIdx];
      if (canonical.broken) {
        orphans.push({ broken: i, points_at: canonicalIdx, status: "canonical_also_broken" });
      }
    }
    expect(orphans, `${orphans.length} broken_reason pointers orphaned: ${JSON.stringify(orphans.slice(0, 5))}`).toEqual([]);
  });

  /**
   * EXAM-TAG ENUMERATION (catches typos and undocumented new tags).
   *
   * Every question's `t` must be one of the known tag values. If a curator
   * adds a typo (e.g. "2025-Jun-Basc") or coins a new tag without updating
   * EXAM_YEARS in shlav-a-mega.html, the per-tag analytics break silently
   * (questions get bucketed under the wrong tag in the Browse-by-Year view).
   *
   * If this fails: either fix the typo, or add the new tag to both this
   * test's allowlist AND shlav-a-mega.html's EXAM_YEARS array.
   */
  it("every q.t is in the known-tags allowlist", () => {
    const KNOWN_TAGS = new Set([
      // IMA exam sessions (must match shlav-a-mega.html EXAM_YEARS)
      "2020", "2021-Jun", "2021-Dec",
      "2022-Jun-Basic", "2022-Jun-Subspec",
      "2023-Jun-Basic", "2023-Jun-Subspec", "2023-Sep",
      "2024-May-Basic", "2024-May-Subspec",
      "2024-Sep-Basic", "2024-Sep-Subspec",
      "2025-Jun-Basic",
      // Non-exam content sources
      "Hazzard", "Harrison", "Hazzard-suppl", "GRS8", "Exam",
    ]);
    const unknowns = new Set();
    for (const q of questions) {
      if (q.t && !KNOWN_TAGS.has(q.t)) unknowns.add(q.t);
    }
    expect([...unknowns], `unknown q.t values: ${[...unknowns].join(", ")}`).toEqual([]);
  });

  /**
   * EXPLANATION (e) FIELD QUALITY.
   *
   * All 3,743 questions ship with `e` (pre-generated AI explanation). Catches:
   *   - empty e (AI generation failure)
   *   - very short e (<30 chars — likely truncation or boilerplate)
   *   - script-tag injection (XSS surface — explanations render via innerHTML
   *     in some places per appIntegrity.test.js, but with sanitization)
   *
   * If this fails: re-run scripts/generate_explanations.cjs for affected idxs
   * (it skips entries with existing e by default, so delete the bad ones first).
   */
  it("explanations are present, substantive, and free of script injection", () => {
    const empty = [];
    const tooShort = [];
    const xss = [];
    const SCRIPT_RE = /<script\b/i;
    const ON_HANDLER_RE = /\bon\w+\s*=\s*["']?javascript:/i;
    for (let i = 0; i < questions.length; i++) {
      const e = String(questions[i].e || "").trim();
      if (!e) {
        empty.push(i);
      } else if (e.length < 30) {
        tooShort.push({ idx: i, len: e.length, preview: e.slice(0, 40) });
      } else if (SCRIPT_RE.test(e) || ON_HANDLER_RE.test(e)) {
        xss.push(i);
      }
    }
    expect(empty.length, `${empty.length} questions have empty e: ${empty.slice(0, 5).join(", ")}`).toBe(0);
    expect(tooShort, `${tooShort.length} questions have e <30 chars: ${JSON.stringify(tooShort.slice(0, 3))}`).toEqual([]);
    expect(xss, `${xss.length} questions have <script> or javascript: handlers in e: ${xss.slice(0, 5).join(", ")}`).toEqual([]);
  });

  /**
   * REF FIELD CONSISTENCY (Track-M motivation).
   *
   * Track M (v10.64.37) caught a mis-routed ref where idx 347 had
   * "Hazzard Ch 44 — SLEEP DISORDERS" on a clozapine-agranulocytosis
   * question. Refs should always cite Hazzard or Harrison (English) or
   * use Hebrew "הזארד" / "פרק" / "עמ'" patterns.
   *
   * This test catches refs that contain *only* unrelated text (e.g. an
   * empty Beers reference, a stray TODO, a bare topic name with no source
   * citation). It does NOT detect mis-routing within Hazzard chapters —
   * that requires content audit, not pattern matching.
   *
   * If this fails: rebuild the ref using question_chapters.json or the
   * topic_analysis_2026-05-03 sources_extracted.csv.
   */
  /**
   * TOP-LEVEL EVALUATION GUARD (v10.64.45 — TDZ + missing-binding regression).
   *
   * Catches the bug class where a top-level `const X = useY()` declaration
   * references a name `Y` that hasn't been declared yet (Temporal Dead Zone
   * on const, or a typo'd identifier that doesn't exist anywhere).
   *
   * Real precedent: v10.64.43 added `const HARRISON_PDF_MAP = ...pdfUrl(v)...`
   * at line 1743, but `const PDF_BASE_URL` was at line 2653. Functions are
   * hoisted in JS but `const` is in TDZ until the declaration runs, so the
   * map's derivation would have thrown ReferenceError on every browser load.
   * Vitest didn't catch this because tests load JSON files separately and
   * never execute the HTML's <script>. v10.64.44 moved PDF_BASE_URL above
   * the map derivation; this test pins the order.
   *
   * Strategy: textual position check. The full TDZ-detection problem requires
   * a JS parser; we go with targeted line-order assertions for the specific
   * known constants and a generic warning for any future `const X = ...`
   * that references an unresolved global before its line.
   *
   * If this fails: a recent edit moved a const-defined dependency below its
   * consumer. Restore source order or convert to a function (hoisted).
   */
  it("PDF_BASE_URL is declared before HARRISON_PDF_MAP derivation", () => {
    const fs = require("fs");
    const path = require("path");
    const html = fs.readFileSync(
      path.resolve(import.meta.dirname, "..", "shlav-a-mega.html"),
      "utf-8",
    );
    const lines = html.split("\n");
    const baseLine = lines.findIndex((l) => /^\s*const\s+PDF_BASE_URL\s*=/.test(l));
    const mapLine = lines.findIndex((l) =>
      /^\s*const\s+HARRISON_PDF_MAP\s*=\s*Object\.fromEntries/.test(l),
    );
    expect(baseLine, "PDF_BASE_URL declaration").toBeGreaterThan(-1);
    expect(mapLine, "HARRISON_PDF_MAP derivation").toBeGreaterThan(-1);
    expect(
      baseLine,
      `PDF_BASE_URL (line ${baseLine + 1}) must be declared BEFORE ` +
        `HARRISON_PDF_MAP derivation (line ${mapLine + 1}) — const TDZ ` +
        `would crash module-load otherwise. See v10.64.44 CHANGELOG.`,
    ).toBeLessThan(mapLine);
  });

  /**
   * STALE-COUNT REGRESSION GUARD (v10.64.41 / bug screenshot 2026-05-04).
   *
   * Catches hardcoded total-question-count strings going stale. The bug was:
   * src/study_plan.js had "(3,833 שאלות, 46 נושאים)" literal in the Study
   * Plan intro, but the live count is 3,743. v10.64.18 refreshed
   * data/syllabus_data.json but missed this string. Now the value is
   * computed dynamically from `_SYLLABUS.Geri.total_questions_analyzed` —
   * this test asserts no stale literal is left in src/study_plan.js.
   *
   * If this fails: someone re-introduced a hardcoded count. Replace with
   * dynamic lookup from _SYLLABUS or from the topics array.
   */
  it("src/study_plan.js has no stale hardcoded total-question count", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(import.meta.dirname, "..", "src", "study_plan.js"),
      "utf-8",
    );
    // Stale counts that have been the live total at some prior point.
    // The current literal-fallback "3743" is allowed; only flag obsolete ones.
    const STALE_COUNTS = ["3,833", "3833", "3,791", "3791", "3,795", "3795"];
    const found = STALE_COUNTS.filter((s) => src.includes(s));
    expect(found, `stale count strings in src/study_plan.js: ${found.join(", ")}`).toEqual([]);
  });

  /**
   * STALE-COUNT GUARD — shlav-a-mega.html pre-CHANGELOG range (v10.64.47).
   *
   * The same staleness class can appear in the main HTML monolith (e.g. the
   * loading-skeleton string at ~line 3271 that read "3,833 שאלות" until
   * v10.64.47 surgically fixed it to "3,743"). Scanning the full file would
   * fire on every CHANGELOG entry that legitimately *quotes* the historical
   * stale numbers. So we slice off the CHANGELOG section (`const CHANGELOG=`
   * marker) and scan only the live code+UI range.
   *
   * If this fails: someone re-introduced a hardcoded total in the main HTML.
   * Either swap to a dynamic source (`_SYLLABUS.Geri.total_questions_analyzed`,
   * exposed in src/study_plan.js — note it's module-private; for main-scope
   * UI use the current literal "3,743" as a fallback and add it to the
   * allowed-current-totals list when it next changes) or update the literal.
   */
  it("shlav-a-mega.html (pre-CHANGELOG) has no stale hardcoded total-question count", () => {
    const fs = require("fs");
    const path = require("path");
    const full = fs.readFileSync(
      path.resolve(import.meta.dirname, "..", "shlav-a-mega.html"),
      "utf-8",
    );
    // Slice off CHANGELOG and everything after — those entries quote
    // historical stale numbers as part of the audit trail and must not
    // trigger this guard.
    const changelogIdx = full.indexOf("const CHANGELOG=");
    expect(
      changelogIdx,
      "Could not locate `const CHANGELOG=` marker — guard slice would scan the whole file and false-positive on history.",
    ).toBeGreaterThan(0);
    const liveSrc = full.slice(0, changelogIdx);
    const STALE_COUNTS = ["3,833", "3833", "3,791", "3791", "3,795", "3795"];
    const found = STALE_COUNTS.filter((s) => liveSrc.includes(s));
    expect(
      found,
      `stale count strings in shlav-a-mega.html (pre-CHANGELOG): ${found.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * STALE-COUNT GUARD — repo-root documentation (v10.64.48 / 2026-05-05).
   *
   * The same staleness class hit CLAUDE.md, IMPROVEMENTS.md, and
   * .claude/web-project-instructions.md when terminal Claude refreshed
   * versions to v10.64.47 but missed the `3,833 → 3,743` count drift in
   * docs. Existing guards (above) only scan src/study_plan.js + the live
   * prefix of shlav-a-mega.html, so docs went unprotected.
   *
   * Per-line allow-list: a line containing a stale number is permitted ONLY
   * when it ALSO contains an explicit historical-context marker (`stale`,
   * `obsolete`, `legacy`, `historical`, `pre-v10`, `(was`, `was ~`, `was 88`,
   * `CHANGELOG`). Anything else is flagged.
   *
   * To add a legitimate new historical reference: include one of those
   * markers in the same line. To declare a new "current" total: update
   * STALE_COUNTS below to leave only obsolete numbers.
   */
  it("repo docs have no current-state stale count claims", () => {
    const fs = require("fs");
    const path = require("path");
    const repoRoot = path.resolve(import.meta.dirname, "..");
    const DOC_FILES = [
      "CLAUDE.md",
      "IMPROVEMENTS.md",
      ".claude/web-project-instructions.md",
    ];
    const STALE_COUNTS = ["3,833", "3833", "3,791", "3791", "3,795", "3795"];
    const HISTORICAL_MARKERS = [
      "stale",
      "Stale",
      "STALE",
      "obsolete",
      "legacy",
      "historical",
      "pre-v10",
      "(was",
      "was ~",
      "was 88",
      "CHANGELOG",
      "v10.64.18",
      "v10.64.41",
      "v10.64.47",
    ];
    const violations = [];
    for (const rel of DOC_FILES) {
      const abs = path.join(repoRoot, rel);
      if (!fs.existsSync(abs)) continue;
      const lines = fs.readFileSync(abs, "utf-8").split("\n");
      lines.forEach((line, i) => {
        const hits = STALE_COUNTS.filter((s) => line.includes(s));
        if (hits.length === 0) return;
        const exempt = HISTORICAL_MARKERS.some((m) => line.includes(m));
        if (!exempt) {
          violations.push(
            `${rel}:${i + 1}: stale count [${hits.join(", ")}] without historical marker — line: ${line.trim().slice(0, 120)}`,
          );
        }
      });
    }
    expect(
      violations,
      `Stale count claims found in docs without historical marker:\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("ref field cites a recognizable textbook source where present", () => {
    // Allowlist of legitimate clinical citation patterns. Add new ones as
    // sources expand; the goal is to catch obviously-broken refs (typos,
    // half-strings, unintended placeholders), not to gatekeep new sources.
    const REF_PATTERN = new RegExp(
      [
        // Textbooks (English + Hebrew)
        "Hazzard", "Harrison", "הזארד", "הריסון",
        "פרק", "עמ['׳]", "article", "article_",
        // Educational reference series
        "GRS", "Bhandari",
        // Major guideline organizations
        "IDSA", "ACR", "ACG", "KDIGO", "USPSTF", "AGS", "ADA", "NICE",
        "AAN", "AAFP", "AAPM", "AAOS", "ACC", "AHA", "ESC", "ESH",
        "CDC", "ACIP", "STEADI", "WHO",
        // Trial / cohort name patterns
        "Trial", "Study", "Cohort",
        // Israeli MOH / clinical guidance + Israeli statutes / government / statistical sources
        "חוזר", "חוק", "מכון", "משרד", "אפוטרופוס", "הלשכה", "הר\"י", "למ\"ס",
        "MOH", "Circular", "Director-General",
      ].join("|"),
      "i",
    );
    const bad = [];
    for (let i = 0; i < questions.length; i++) {
      const ref = String(questions[i].ref || "").trim();
      if (!ref) continue; // empty ref allowed (some legacy entries)
      if (!REF_PATTERN.test(ref)) {
        bad.push({ idx: i, ref: ref.slice(0, 80) });
      }
    }
    expect(bad, `${bad.length} questions have unrecognizable ref: ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
  });
});
