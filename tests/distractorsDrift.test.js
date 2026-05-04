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
   * CONTENT-DRIFT GUARD (Track-I, v2 detector — v10.64.39).
   *
   * Catches the case where distractors[i][j] discusses option text from a
   * DIFFERENT slot or different question entirely — happens after question
   * deletions because distractors keep original numbering but indices shift,
   * so a structurally-valid entry can carry rationale about an unrelated
   * option.
   *
   * v2 detector (mirrors `.audit_logs/track_i_drift_detector_v2.py`):
   *   - English caps-leading tokens (≥3 chars) — catches MRI, RA, BP, etc.
   *   - Parens content (case-insensitive substring) — catches "(intramedullary nails)"
   *   - First-letter acronyms from multi-word capitalized phrases — catches
   *     "AComA" matching "Anterior communicating artery"
   *   - Numeric tokens (2-4 digits) — catches "25%" / "2035" / "180" doses
   *   - Hebrew stem matching (strip ה/ב/מ/ל/ו/ש/כ + 2-letter combos) —
   *     handles "המטופלת" / "מטופלת" inflection variants
   *   - Cross-language trust: if option has English caps tokens AND distractor
   *     is mostly Hebrew with ≥80 chars, accept it (the regen prompt explicitly
   *     produces same-language-as-question output; bilingual translation is a
   *     known pattern, not drift)
   *
   * Baseline history:
   *   2026-05-03 (pre-regen, v1 detector):       4401 drift suspects (TRUE drift)
   *   2026-05-04 (post-regen, v1 detector):      3412 (mostly cross-language FPs)
   *   2026-05-04 (post-regen, v2 detector):       295 (after FP fixes)
   *
   * If this fails: a recent deletion or regen pass desynced distractors from
   * questions. Re-run via the strip-drifted-then-regen pattern from
   * .audit_logs/track_i_strip_drifted.py + scripts/generate_distractors.cjs.
   */
  it("content drift v2: option signals appear in distractor text", () => {
    // Ratchet: 295 v2 detections + ~18% buffer.
    // Tighten as content gets edited and FP rate drops further.
    const PRESENT_DRIFT_BUDGET = 350;

    const ENG_RE = /\b[A-Z][A-Za-z]{2,}\b/g; // ≥3 chars (caps-leading)
    const PARENS_RE = /\(([^)]{2,40})\)/g;
    const HEB_RE = /[֐-׿][֐-׿֑-ׇ]{3,}/g; // ≥4 chars Hebrew
    const NUM_RE = /\b\d{2,4}\b/g;
    const ACRONYM_PHRASE_RE = /(?:\b[A-Z][A-Za-z]+\b\s*){2,}/g;

    const HEB_STOPWORDS = new Set([
      "הינו","הינה","אינו","אינה","בכל","אחת","מהן","אחד","מהם","אשר",
      "הזה","הזאת","אלו","אלה","יותר","פחות","ביותר","הבאות","הבאים",
      "ביניהם","בכלל","באותו","באותה","נכון","אמת","מקרה","מצב",
      "חולה","מטופל","הטיפול","הסיכון","תרופות","רופא","בדיקה","מעבדה",
      "ההסבר","התשובה","השכיח","השכיחה","הוא","היא","הם","הן",
    ]);
    const HEB_PREFIXES = ["מה","בה","לה","וה","כה","שה","ה","ב","מ","ל","ו","ש","כ"];

    function hebStem(word) {
      // Strip the longest matching prefix that leaves ≥3 chars
      const sorted = HEB_PREFIXES.slice().sort((a, b) => b.length - a.length);
      for (const p of sorted) {
        if (word.startsWith(p) && word.length >= p.length + 3) {
          return word.slice(p.length);
        }
      }
      return word;
    }

    function isMostlyHebrew(text, threshold = 0.4) {
      if (!text) return false;
      let hebrew = 0, alpha = 0;
      for (const ch of text) {
        const code = ch.charCodeAt(0);
        if (code >= 0x0590 && code <= 0x05FF) hebrew++;
        if (/\p{L}/u.test(ch)) alpha++;
      }
      return alpha > 0 && hebrew / alpha >= threshold;
    }

    function extractEngTokens(text) {
      const out = new Set();
      if (!text) return out;
      for (const m of text.match(ENG_RE) || []) {
        if (m.length >= 3) out.add(m.toUpperCase());
      }
      for (const pm of text.matchAll(PARENS_RE)) {
        const inner = pm[1].trim();
        if (inner.length >= 3 && inner.length <= 40) out.add(inner.toUpperCase());
      }
      return out;
    }

    function extractHebStems(text) {
      const out = new Set();
      if (!text) return out;
      for (const m of text.match(HEB_RE) || []) {
        if (m.length < 5) continue;
        if (HEB_STOPWORDS.has(m)) continue;
        out.add(hebStem(m));
      }
      return out;
    }

    function buildAcronyms(option) {
      const out = new Set();
      if (!option) return out;
      for (const pm of option.matchAll(ACRONYM_PHRASE_RE)) {
        const words = pm[0].match(/\b[A-Z][A-Za-z]+\b/g) || [];
        if (words.length < 2) continue;
        for (let n = 2; n <= Math.min(words.length, 5); n++) {
          out.add(words.slice(0, n).map((w) => w[0]).join("").toUpperCase());
        }
      }
      return out;
    }

    function extractNumbers(text) {
      const out = new Set();
      if (!text) return out;
      for (const m of text.match(NUM_RE) || []) out.add(m);
      return out;
    }

    function detectDrift(option, distractor) {
      if (!option || !distractor) return { drift: false, signal: false };
      const eng = extractEngTokens(option);
      const stems = extractHebStems(option);
      const acros = buildAcronyms(option);
      const nums = extractNumbers(option);
      if (eng.size === 0 && stems.size === 0 && acros.size === 0 && nums.size === 0) {
        return { drift: false, signal: false };
      }
      const upper = distractor.toUpperCase();
      for (const t of eng) if (upper.includes(t)) return { drift: false, signal: true };
      for (const a of acros) if (upper.includes(a)) return { drift: false, signal: true };
      if (nums.size > 0) {
        const distNums = extractNumbers(distractor);
        for (const n of nums) if (distNums.has(n)) return { drift: false, signal: true };
      }
      if (stems.size > 0) {
        const distStems = extractHebStems(distractor);
        for (const s of stems) if (distStems.has(s)) return { drift: false, signal: true };
      }
      // Cross-language trust
      if (eng.size > 0 && isMostlyHebrew(distractor) && distractor.length >= 80) {
        return { drift: false, signal: true };
      }
      return { drift: true, signal: true };
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
        const { drift, signal } = detectDrift(opt, dist);
        if (!signal) continue;
        checked++;
        if (drift) drifts.push({ k, j });
      }
    }

    if (drifts.length > PRESENT_DRIFT_BUDGET) {
      const sample = drifts.slice(0, 5);
      throw new Error(
        `Content drift v2: ${drifts.length} of ${checked} (idx, slot) pairs have ` +
          `zero signal overlap between option text and distractor (budget: ${PRESENT_DRIFT_BUDGET}). ` +
          `Strip drifted entries via .audit_logs/track_i_strip_drifted.py + ` +
          `re-run scripts/generate_distractors.cjs. ` +
          `Sample: ${JSON.stringify(sample)}`,
      );
    }

    if (process.env.VERBOSE_TESTS) {
      console.log(`[content-drift v2] ${drifts.length} / ${checked} drifts (budget: ${PRESENT_DRIFT_BUDGET})`);
    }
  });
});
