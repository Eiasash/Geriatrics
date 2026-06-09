// Audit-8 G5(a) — pick-channel parse resilience + corrective retry.
//
// ROOT CAUSE (CERT RESULT, AUDIT8_G5_REPAIR_GATE.md §VERDICT): the bounded
// run's `ai-parse-error/pick` DROP channel is `BIASED` on covariate `t`
// (question provenance / exam-era). The old inline parse at
// chaos-doctor-bot-v4.mjs:498-505 —
//   extractJson(text) || {}; LETTER_TO_IDX[String(pick||'').trim().slice(0,1)]
// — drops on FOUR recoverable classes (witnessed by the STEP-1 bucket
// diagnostic, AUDIT8_G5a_REPAIR_GATE.md §2):
//   (1) `unbalanced`  truncated JSON — the pick letter survived but the
//                     brace never closed → extractJson returns null.
//   (2) `parse_threw` malformed-but-complete JSON (e.g. unquoted value).
//   (3) `no_brace`    prose / bare-letter answers with no JSON object.
//   (4) parsed-but-bad-field — a 5-option (GRS8-provenance) question whose
//                     pick is "E"/"ה": extractJson succeeds but the old
//                     4-letter LETTER_TO_IDX table has no E/ה → undefined.
// Class (4) is the era-skew mechanism: 38 corpus Qs have 5 options, all
// GRS8 imports — a distinct `t` provenance — so the old table's
// optCount-blindness drops them preferentially.
//
// FIX CLASS (mirrors scripts/lib/judgeShapeValidator.mjs): a layered
// parser that composes THROUGH the existing extractJson.mjs
// (grep-existing-utility) + post-parse shape check + exactly ONE corrective
// re-ask. Numeric picks are deliberately NOT coerced (a bare number is
// ambiguous: 0- vs 1-based, display vs canonical) — they route to retry.
//
// See docs/AUDIT8_G5a_REPAIR_GATE.md (committed in the same PR).
// Unit contract: tests/pickParseResilience.test.js.

import { extractJson } from './extractJson.mjs';

// Hebrew option labels in board order (א=0 … ח=7). Mirrors the app's
// Hebrew labeling convention (SYS_DOCTOR_PICK: "א/ב/ג/ד maps the same way").
const HEB_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];

// Stable label for option index `i` (A,B,C,…). Replaces the hardcoded
// `'ABCD'[i]` that returned `undefined` for i>=4 — a real labeling bug on
// the 38 five-option (GRS8) questions. Pure; used by the bot for BOTH the
// pick prompt and the judge/explain prompt option lists.
export function letterFor(i) {
  return i >= 0 && i < 26 ? String.fromCharCode(65 + i) : String(i);
}

// A letter→index Map sized to `optCount` (clamped to [2,8]), covering
// uppercase, lowercase, and Hebrew labels. An index is therefore only
// resolvable when it is genuinely IN RANGE for the served question — so a
// returned idx is always < optCount (the old explicit range-check is
// encoded here).
function buildLetterTable(optCount) {
  const n = Math.max(2, Math.min(Number.isInteger(optCount) ? optCount : 4, 8));
  const t = new Map();
  for (let i = 0; i < n; i++) {
    t.set(String.fromCharCode(65 + i), i); // A, B, C, …
    t.set(String.fromCharCode(97 + i), i); // a, b, c, …
    t.set(HEB_LABELS[i], i); // א, ב, ג, …
  }
  return t;
}

// Layered pick-letter parser. Returns `{ letter, idx } | null`. `idx` is
// always in-range for `optCount`. Never coerces a numeric pick (returns
// null → caller routes to retry).
export function parsePickLetter(text, optCount) {
  const table = buildLetterTable(optCount);

  // Layer 1 — structured JSON (the contract path). Read pick ?? answer ??
  // choice; normalize the first char; map via the optCount-sized table.
  const obj = extractJson(text);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const raw = obj.pick ?? obj.answer ?? obj.choice;
    // Numeric pick → ambiguous, do NOT coerce; fall through to retry.
    if (raw != null && typeof raw !== 'number') {
      const ch = String(raw).trim().charAt(0);
      if (table.has(ch)) return { letter: ch, idx: table.get(ch) };
    }
  }

  const s = String(text || '');

  // Layer 2 — keyed-regex fallback for truncated/malformed JSON where the
  // `pick` token survived but JSON.parse can't (the `unbalanced` /
  // `parse_threw` classes). Keyed on `pick` ONLY — the SYS_DOCTOR_PICK
  // schema field — because `answer`/`choice` appear in free prose and would
  // false-match (e.g. "the answer could be …" → the `c` of "could"). The
  // `answer`/`choice` aliases stay supported via the structured JSON layer.
  // `a-f` under the /i flag covers upper E/F too (a 6-option label space);
  // `א-ו` covers Hebrew.
  const keyed = s.match(/pick["'\s:]+["']?([A-Da-fא-ו])/i);
  if (keyed) {
    const hit = keyed[1];
    for (const cand of [hit, hit.toUpperCase(), hit.toLowerCase()]) {
      if (table.has(cand)) return { letter: cand, idx: table.get(cand) };
    }
  }

  // Layer 3 — single-unambiguous bare-letter scan (last resort). Scoped to
  // SHORT responses (the model emitted just a letter: "C", "C.", "(C)") so
  // it cannot mis-fire on the `c` inside `"pick"` or a stray vowel in prose.
  // Resolves only when EXACTLY ONE distinct in-range index appears.
  const stripped = s.trim();
  if (stripped.length <= 4) {
    const seen = new Map();
    for (const ch of stripped) {
      if (table.has(ch)) {
        const idx = table.get(ch);
        if (!seen.has(idx)) seen.set(idx, ch);
      }
    }
    if (seen.size === 1) {
      const [idx, letter] = seen.entries().next().value;
      return { letter, idx };
    }
  }

  return null;
}

// Terse corrective re-ask appended to the original prompt — restates the
// JSON-only contract without speculating which sub-cause produced the miss
// (mirrors judgeShapeValidator.correctivePrompt).
function correctivePickPrompt(userPrompt) {
  return `${userPrompt}

[RETRY] Your previous response did not contain a parseable pick.
JSON only: {"pick":"<letter>"}`;
}

// Drop-in for the bot's inline pick/parse (chaos-doctor-bot-v4.mjs
// :492-505). Mirrors judgeWithShapeRetry: one call; if `parsePickLetter`
// is null, EXACTLY ONE corrective retry; parse again. `callClaude` is
// injected so the path is unit-testable with a stub (no API, no playwright).
//
// Returns one of:
//   { idx, letter, recovered, obj }   — success (`obj` = parsed JSON pick
//                                        object or null; carries confidence/
//                                        why for the action log)
//   { failed:true, reason:'api-error', message }  — first call threw
//                                        (network/API; NO retry, mirroring
//                                        judgeWithShapeRetry) → caller emits
//                                        the ai-error/pick row
//   { failed:true, reason:'parse', raw }          — parse hard-failed after
//                                        the corrective retry → caller emits
//                                        the ai-parse-error/pick row
export async function pickWithShapeRetry({
  system,
  userPrompt,
  callClaude,
  maxTokens = 250,
  optCount,
}) {
  let resp;
  try {
    resp = await callClaude(system, userPrompt, { maxTokens });
  } catch (e) {
    return { failed: true, reason: 'api-error', message: e.message };
  }

  let parsed = parsePickLetter(resp.text, optCount);
  if (parsed) {
    return {
      idx: parsed.idx,
      letter: parsed.letter,
      recovered: false,
      obj: extractJson(resp.text),
    };
  }

  // FIRST PARSE FAILED → exactly one corrective retry (cap=1; beyond one
  // you are masking a prompt problem, not fixing parse adherence).
  let resp2;
  try {
    resp2 = await callClaude(system, correctivePickPrompt(userPrompt), { maxTokens });
  } catch (e) {
    // Retry threw (network/API). The first attempt produced unparseable
    // output and no verdict was obtained → terminal parse hard-fail; the
    // retry's API error is incidental. Emit the parse drop with the first
    // response's raw text (what actually failed to parse).
    return { failed: true, reason: 'parse', raw: resp.text };
  }

  parsed = parsePickLetter(resp2.text, optCount);
  if (parsed) {
    return {
      idx: parsed.idx,
      letter: parsed.letter,
      recovered: true,
      obj: extractJson(resp2.text),
    };
  }

  // Both failed → terminal pick parse drop (now only after the retry).
  return { failed: true, reason: 'parse', raw: resp2.text };
}
