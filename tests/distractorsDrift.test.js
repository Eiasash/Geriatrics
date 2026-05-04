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
   * CONTENT-DRIFT GUARD (Track-I, v3 detector — v10.64.40).
   *
   * Catches the case where distractors[i][j] discusses option text from a
   * DIFFERENT slot or different question entirely — happens after question
   * deletions because distractors keep original numbering but indices shift,
   * so a structurally-valid entry can carry rationale about an unrelated
   * option.
   *
   * v3 detector (mirrors `.audit_logs/track_i_drift_detector_v3.py`):
   *   - English caps-leading tokens (≥3 chars) — MRI, RA, BP, etc.
   *   - English LOWERCASE tokens (≥4 chars) — bacteriuria, withdrawal,
   *     cholinesterase. Filtered against ENG_STOPWORDS to avoid noise.
   *   - Parens content (case-insensitive substring)
   *   - First-letter acronyms from multi-word capitalized phrases
   *   - Numeric tokens (2-4 digits)
   *   - Hebrew stem matching: prefix-strip (ה/ב/מ/ל/ו/ש/כ + 2-letter combos)
   *     AND suffix-strip (יות/ות/ים/ית/ת/ה) for inflection variants
   *   - Hebrew threshold ≥4 chars (was ≥5 in v2)
   *   - Cross-language trust: option has English caps tokens AND distractor
   *     is mostly Hebrew with ≥80 chars → accept (regen prompt produces
   *     same-language-as-question output)
   *
   * Baseline history:
   *   2026-05-03 (pre-regen,  v1):  4401 (mostly TRUE drift)
   *   2026-05-04 (post-regen, v1):  3412 (cross-language FPs)
   *   2026-05-04 (post-regen, v2):   295 (after FP fixes)
   *   2026-05-04 (post-regen, v3):   101 (after lowercase + suffix fixes)
   *
   * If this fails: a recent deletion or regen pass desynced distractors from
   * questions. Strip drifted entries via .audit_logs/track_i_strip_drifted.py
   * + re-run scripts/generate_distractors.cjs.
   */
  it("content drift v3: option signals appear in distractor text", () => {
    // Ratchet: 101 v3 detections + ~30% buffer for content edits over time.
    const PRESENT_DRIFT_BUDGET = 130;

    const ENG_CAPS_RE = /\b[A-Z][A-Za-z]{2,}\b/g; // caps-leading ≥3
    const ENG_LOWER_RE = /\b[a-z][a-z]{3,}\b/g; // lowercase ≥4
    const PARENS_RE = /\(([^)]{2,40})\)/g;
    const HEB_RE = /[֐-׿][֐-׿֑-ׇ]{2,}/g; // ≥3 chars Hebrew (was ≥4 in v2)
    const NUM_RE = /\b\d{2,4}\b/g;
    const ACRONYM_PHRASE_RE = /(?:\b[A-Z][A-Za-z]+\b\s*){2,}/g;

    const ENG_STOPWORDS = new Set([
      "WITH","THIS","THAT","FROM","INTO","HAVE","BEEN","WHEN","WHAT","WERE",
      "WILL","SOME","MORE","MOST","ONLY","SUCH","WHICH","DURING","BEFORE",
      "AFTER","WITHIN","ABOUT","BETWEEN","AGAINST","BECAUSE","WOULD","COULD",
      "SHOULD","WHILE","SINCE","ALSO","BOTH","EACH","EITHER","NEITHER",
      "THEN","HERE","THERE","THEIR","THEM","THEY","THESE","THOSE","WHERE",
      "BEING","DOES","DOING","DONE","HAVING","JUST","OVER","UNDER","NOT",
      "ARE","WAS","HAS","HAD","CAN","MAY","ITS","THE","AND","FOR","BUT",
      "ANY","ALL","NOR","TWO","ONE",
    ]);
    const HEB_STOPWORDS = new Set([
      "הינו","הינה","אינו","אינה","בכל","אחת","מהן","אחד","מהם","אשר",
      "הזה","הזאת","אלו","אלה","יותר","פחות","ביותר","הבאות","הבאים",
      "ביניהם","בכלל","באותו","באותה","נכון","אמת","מקרה","מצב",
      "חולה","מטופל","הטיפול","הסיכון","תרופות","רופא","בדיקה","מעבדה",
      "ההסבר","התשובה","השכיח","השכיחה","הוא","היא","הם","הן",
    ]);
    const HEB_PREFIXES = ["מה","בה","לה","וה","כה","שה","ה","ב","מ","ל","ו","ש","כ"];
    const HEB_SUFFIXES = ["יות","ות","ים","ית","ת","ה"];

    function hebStem(word) {
      let w = word;
      const prefixes = HEB_PREFIXES.slice().sort((a, b) => b.length - a.length);
      for (const p of prefixes) {
        if (w.startsWith(p) && w.length >= p.length + 3) {
          w = w.slice(p.length);
          break;
        }
      }
      const suffixes = HEB_SUFFIXES.slice().sort((a, b) => b.length - a.length);
      for (const s of suffixes) {
        if (w.endsWith(s) && w.length >= s.length + 3) {
          w = w.slice(0, w.length - s.length);
          break;
        }
      }
      return w;
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
      for (const m of text.match(ENG_CAPS_RE) || []) {
        if (m.length >= 3) {
          const u = m.toUpperCase();
          if (!ENG_STOPWORDS.has(u)) out.add(u);
        }
      }
      for (const m of text.match(ENG_LOWER_RE) || []) {
        const u = m.toUpperCase();
        if (!ENG_STOPWORDS.has(u)) out.add(u);
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
        if (m.length < 4) continue; // v3: was 5
        if (HEB_STOPWORDS.has(m)) continue;
        const s = hebStem(m);
        if (s.length >= 3) out.add(s);
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
        `Content drift v3: ${drifts.length} of ${checked} (idx, slot) pairs have ` +
          `zero signal overlap between option text and distractor (budget: ${PRESENT_DRIFT_BUDGET}). ` +
          `Strip drifted entries via .audit_logs/track_i_strip_drifted.py + ` +
          `re-run scripts/generate_distractors.cjs. ` +
          `Sample: ${JSON.stringify(sample)}`,
      );
    }

    if (process.env.VERBOSE_TESTS) {
      console.log(`[content-drift v3] ${drifts.length} / ${checked} drifts (budget: ${PRESENT_DRIFT_BUDGET})`);
    }
  });
});
