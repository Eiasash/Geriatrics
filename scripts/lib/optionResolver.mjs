// Pure helpers for chaos-doctor-bot v4 served↔canonical option resolution.
//
// Why this module exists
// ----------------------
// FM/IM dist bundles render answer options in a SHUFFLED order (display
// position) but tag each <button data-action="pick"> with `data-i="<canonical
// index>"` (the original position in `q.o`). The bot read these into a flat
// `options[]` array in DOM/display order while preserving each option's
// canonical index in `option.idx`.
//
// v4-as-shipped mixed two coordinate frames:
//   - `aiLetter` came from prompting the model with options labeled A..D in
//     DISPLAY order, so `aiIdx = LETTER_TO_IDX[aiLetter]` is a DISPLAY position.
//   - `appIdx` came from `data-i` on the .ok button — a CANONICAL index.
//
// Two bugs followed:
//   (1) Click: `[data-action="pick"][data-i="${aiIdx}"]` interpreted the
//       display-position number as a canonical data-i, so when shuffle ≠
//       identity the bot clicked the WRONG option. (Did not corrupt the
//       answer-key signal because `detectAppCorrectIdx` reads .ok regardless
//       of which button the bot clicked, but did contaminate `disagrees`.)
//   (2) Judge prompt: `App's claimed correct answer: ${'ABCD'[appIdx]}` used
//       a canonical-index-→-letter mapping while the model's letter space
//       was display-frame. Result: the judge model wrote sentences like
//       "App claims D (Arterial Hypertension)" when the served-position-3
//       option happened to be Arterial Hypertension, even though the app's
//       canonical answer was Venous Insufficiency. Triage 2026-05-10
//       attributed ~240/241 false-positive flags to this single mismatch.
//
// The fix below keeps the AI letter space in display frame (the model only
// ever sees served options) and translates appIdx into:
//   • the served letter the app's correct option lives at (for "claimed X"),
//   • the canonical option text (so the judge sentence quotes the right
//     option even if our display↔canonical mapping is somehow wrong).
//
// Geri's bot operates entirely in display frame (no data-i — the app's
// onclick="pick(origI)" handler does the translation) and therefore does
// not have this bug. Geri's port is a no-op, but a regression test pins
// the contract.

/**
 * Translate a canonical (data-i) index into the display position the bot
 * actually served to the AI judge.
 *
 * @param {Array<{idx:number, text:string}>} servedOptions
 *   The bot's `q.options` array — entries are in DISPLAY (DOM) order, with
 *   `idx` carrying the canonical index from `data-i`.
 * @param {number} canonicalIdx
 *   A canonical index (e.g. `appIdx` from `detectAppCorrectIdx`).
 * @returns {number|null}
 *   The matching display position, or `null` if not found.
 */
export function canonicalToDisplay(servedOptions, canonicalIdx) {
  if (!Array.isArray(servedOptions) || canonicalIdx == null) return null;
  for (let i = 0; i < servedOptions.length; i++) {
    const o = servedOptions[i];
    if (o && Number(o.idx) === Number(canonicalIdx)) return i;
  }
  return null;
}

/**
 * Translate a display (AI-letter) position into the canonical (data-i) index
 * the app expects in `pick(...)` / `[data-i="N"]` selectors.
 *
 * @param {Array<{idx:number, text:string}>} servedOptions
 * @param {number} displayIdx
 * @returns {number|null}
 */
export function displayToCanonical(servedOptions, displayIdx) {
  if (!Array.isArray(servedOptions) || displayIdx == null) return null;
  if (displayIdx < 0 || displayIdx >= servedOptions.length) return null;
  const o = servedOptions[displayIdx];
  if (!o || o.idx == null) return null;
  return Number(o.idx);
}

/**
 * Resolve `appIdx` to a verdict triple:
 *   { displayIdx, displayLetter, canonicalText }
 *
 * `canonicalText` is the option text the bot ACTUALLY served at the matching
 * display position — i.e. the same string the AI model saw labeled by
 * `displayLetter`. This is what the judge-prompt sentence "App's claimed
 * correct answer: <letter> (<text>)" should use.
 *
 * Returns `null` if `appIdx` cannot be located in `servedOptions`.
 *
 * @param {Array<{idx:number, text:string}>} servedOptions
 * @param {number} appIdx Canonical index from `data-i` on the .ok button.
 * @param {string[]} [letterTable=['A','B','C','D','E','F','G','H']]
 */
export function resolveAppVerdict(servedOptions, appIdx, letterTable) {
  const LETTERS = letterTable || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const displayIdx = canonicalToDisplay(servedOptions, appIdx);
  if (displayIdx == null) return null;
  return {
    displayIdx,
    displayLetter: LETTERS[displayIdx] || '?',
    canonicalText: servedOptions[displayIdx].text,
  };
}
