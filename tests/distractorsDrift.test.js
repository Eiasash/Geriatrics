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

  /**
   * ALIGNMENT GUARD — empty slot in DIS[k] must equal Q[k].c.
   *
   * Generator invariant: distractors are produced for the 3 wrong options only;
   * the slot at q.c is always "" (or whitespace). If questions.json is reordered,
   * inserted into, or has its answer key corrected without regenerating
   * distractors.json, this invariant breaks silently — and the UI ends up showing
   * "Wrong because:" rationales on the correct answer.
   *
   * Real-world precedent: caught a 72%-misaligned distractors.json in v10.44.x
   * (2729 of 3795 keys) after the v9.58 answer-key correction sweep + question
   * insertions had silently desynced the file.
   *
   * If this fails: re-run `node scripts/generate_distractors.cjs`.
   */
  it("empty slot in DIS[k] aligns with Q[k].c (the correct option index)", () => {
    const misaligned = [];
    for (const [k, v] of Object.entries(distractors)) {
      const q = questions[Number(k)];
      if (!q || !Array.isArray(q.o) || typeof q.c !== "number") continue;
      if (v.length !== q.o.length) continue;
      const emptyIdx = v.findIndex((s) => !s || !String(s).trim());
      if (emptyIdx === -1) continue;
      if (emptyIdx !== q.c) {
        misaligned.push({ key: k, qC: q.c, emptyIdx });
      }
    }
    if (misaligned.length > 0) {
      const sample = misaligned.slice(0, 5);
      throw new Error(
        `${misaligned.length} of ${Object.keys(distractors).length} distractor entries ` +
          `are misaligned with their question's correct-answer index. ` +
          `Re-run scripts/generate_distractors.cjs. Sample: ${JSON.stringify(sample)}`,
      );
    }
  });

  /**
   * CONTENT-DRIFT GUARD (added post-Track-I regen, v10.64.38).
   *
   * Structural alignment alone doesn't catch the case where distractors[i][j]
   * discusses option text from a DIFFERENT slot or different question entirely.
   * That happens after question deletions: distractors keep original numbering
   * but indexes shift, so a perfectly structurally-valid entry may carry
   * rationale text about a totally unrelated option.
   *
   * Detection: for each non-empty distractor[i][j], extract distinctive tokens
   * from questions[i].o[j] (drug names, English caps words, Hebrew nouns ≥5
   * chars minus stopwords). If the option has extractable tokens but ZERO of
   * them appear in the distractor text, flag as drift.
   *
   * Baseline history:
   *   2026-05-03 (pre-regen):  4401 drift suspects (mostly TRUE drift —
   *                            cerebral-artery option ↔ kidney-drug rationale,
   *                            from index shifts after ~90 question deletions).
   *   2026-05-04 (post-regen): 3412 drift suspects (mostly FALSE POSITIVES —
   *                            detector doesn't recognize Hebrew translations
   *                            of English option tokens, e.g. option
   *                            "Anterior communicating artery" with distractor
   *                            "העורק המתקשר הקדמי (AComA)" — content matches
   *                            but English-token-overlap is zero).
   *
   * The ratchet PRESENT_DRIFT_BUDGET below guards against another bulk-drift
   * event (would push count well past 3500). It does not catch one-off
   * single-question drift because the orthographic-mismatch noise floor
   * masks it. A future detector improvement (stemming, cross-language
   * normalization, embedding similarity) would let us tighten the budget
   * substantially.
   *
   * If this fails: a recent deletion or regen-pass desynced distractors from
   * questions. Re-run `node scripts/generate_distractors.cjs --force` for
   * affected entries (or use the strip-drifted-then-regen pattern from
   * .audit_logs/track_i_strip_drifted.py for selective regeneration).
   */
  it("content drift: distractor mentions option-specific tokens", () => {
    // Ratchet — current orthographic-noise floor + 3% buffer.
    // Tighten when the detector gets cross-language awareness.
    const PRESENT_DRIFT_BUDGET = 3500;

    const ENG_RE = /\b[A-Z][A-Za-z]{3,}\b/g;
    const PARENS_RE = /\(([^)]{2,40})\)/g;
    const HEB_RE = /[֐-׿][֐-׿֑-ׇ]{4,}/g;
    const HEB_STOPWORDS = new Set([
      "הינו","הינה","אינו","אינה","בכל","אחת","מהן","אחד","מהם","אשר",
      "הזה","הזאת","אלו","אלה","יותר","פחות","ביותר","הבאות","הבאים",
      "ביניהם","בכלל","באותו","באותה","נכון","אמת","מקרה","מצב",
      "חולה","מטופל","הטיפול","הסיכון","תרופות","רופא","בדיקה","מעבדה",
      "ההסבר","התשובה","השכיח","השכיחה","הוא","היא","הם","הן",
    ]);

    function extractTokens(text) {
      const out = new Set();
      if (!text) return out;
      for (const m of text.match(ENG_RE) || []) {
        if (m.length >= 4) out.add(m.toUpperCase());
      }
      for (const pm of text.matchAll(PARENS_RE)) {
        const inner = pm[1].trim();
        const words = inner.match(/\b[A-Z][A-Za-z]{2,}\b/g) || [];
        for (const w of words) out.add(w.toUpperCase());
      }
      for (const m of text.match(HEB_RE) || []) {
        if (m.length >= 5 && !HEB_STOPWORDS.has(m)) out.add(m);
      }
      return out;
    }

    function hasOverlap(tokens, text) {
      if (tokens.size === 0 || !text) return false;
      const upper = text.toUpperCase();
      for (const t of tokens) {
        // ASCII tokens — case-insensitive
        if (/^[A-Z]/.test(t)) {
          if (upper.includes(t)) return true;
        } else {
          if (text.includes(t)) return true;
        }
      }
      return false;
    }

    const drifts = [];
    let checked = 0;
    for (const [k, v] of Object.entries(distractors)) {
      const i = Number(k);
      const q = questions[i];
      if (!q || !Array.isArray(q.o)) continue;
      for (let j = 0; j < v.length; j++) {
        const dist = v[j];
        if (!dist || !String(dist).trim()) continue;
        const opt = q.o[j];
        if (!opt) continue;
        const tokens = extractTokens(opt);
        if (tokens.size === 0) continue; // no extractable tokens — skip
        checked++;
        if (!hasOverlap(tokens, dist)) {
          drifts.push({ k, j });
        }
      }
    }

    if (drifts.length > PRESENT_DRIFT_BUDGET) {
      const sample = drifts.slice(0, 5);
      throw new Error(
        `Content drift: ${drifts.length} of ${checked} (idx, slot) pairs have ` +
          `zero token overlap between option text and distractor (budget: ${PRESENT_DRIFT_BUDGET}). ` +
          `Re-run scripts/generate_distractors.cjs --force for affected entries. ` +
          `See .audit_logs/track_i_distractors_content_drift.py for the equivalent Python scanner. ` +
          `Sample: ${JSON.stringify(sample)}`,
      );
    }

    // Soft signal — log the current count so we can tighten the budget over time.
    if (process.env.VERBOSE_TESTS) {
      console.log(`[content-drift] ${drifts.length} / ${checked} drifts (budget: ${PRESENT_DRIFT_BUDGET})`);
    }
  });
});
