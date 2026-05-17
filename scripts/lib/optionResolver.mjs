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

/**
 * Consumer-side helper for JSONL post-processing. Given a bot's served
 * options (in display order) and the canonical question's option array
 * (in canonical order), return the display→canonical permutation by
 * substring-matching option text.
 *
 * This is the sanctioned way to recover the canonical mapping for
 * Geri-frame JSONL rows where the bot emits `optionCanonicalIdx: null`
 * because the source DOM has no `data-i` attributes. Hashing on text is
 * slow but correct; the alternative (treating null-frame rows as if they
 * carried an identity mapping) silently produces wrong dedup keys.
 *
 * The match is exact-string on the display option text against each
 * canonical entry. If a display option doesn't match any canonical
 * option, its position in the output array is `null`. This signals
 * truncation (the bot stores `options[].text.slice(0,120)` so long
 * options may not exact-match) or genuine corpus drift (the question
 * was edited between bot run and consumer lookup).
 *
 * @param {string[]} displayOptionTexts
 *   Bot's served option texts in display order (e.g. JSONL row's
 *   `options` field — a string array, NOT the bot's internal
 *   `q.options` object array).
 * @param {string[]} canonicalOptionTexts
 *   Canonical option texts in canonical order (e.g. `QZ[idx].o`).
 * @returns {Array<number|null>}
 *   For each display position, the matching canonical index (or null
 *   if no match). The result has the same length as `displayOptionTexts`.
 */
export function textResolveAgainstQZ(displayOptionTexts, canonicalOptionTexts) {
  if (!Array.isArray(displayOptionTexts) || !Array.isArray(canonicalOptionTexts)) {
    return [];
  }
  return displayOptionTexts.map((displayText) => {
    if (typeof displayText !== 'string') return null;
    // Display text may be truncated (slice(0,120)); match by prefix when
    // canonical is longer than display.
    const trimmedDisplay = displayText.trim();
    for (let i = 0; i < canonicalOptionTexts.length; i++) {
      const canon = canonicalOptionTexts[i];
      if (typeof canon !== 'string') continue;
      const trimmedCanon = canon.trim();
      if (trimmedCanon === trimmedDisplay) return i;
      // Truncation tolerance: if display is a strict prefix of canonical
      // (or vice versa), accept the match.
      if (trimmedCanon.startsWith(trimmedDisplay) && trimmedDisplay.length >= 20) return i;
      if (trimmedDisplay.startsWith(trimmedCanon) && trimmedCanon.length >= 20) return i;
    }
    return null;
  });
}

/**
 * Multi-accept-aware agreement predicate for the doctor-bot's `disagrees`
 * signal.
 *
 * Background — the c_accept false-positive (2026-05-17)
 * ----------------------------------------------------
 * Geri's app marks the answer key with `class="qo ... ok"` via
 * `isOk(q,i)` (shlav-a-mega.html:2466):
 *   `if (Array.isArray(q.c_accept) && q.c_accept.length) return q.c_accept.includes(i);
 *    return i === q.c;`
 * For a multi-accept question (`q.c_accept` non-empty) the render path
 * (shlav-a-mega.html:3160) therefore puts `.ok` on EVERY accepted option,
 * not just `q.c`. The bot's `detectAppCorrectIdx` read only the FIRST
 * `.ok` (`document.querySelector('button.qo.ok')`), so when the AI picked
 * a *different but also-accepted* option the old
 * `disagrees = appDisplayIdx !== aiIdx` fired a false positive.
 *
 * The fix keeps the bot DOM-driven: `detectAppAcceptedDisplayIdxSet`
 * collects the display positions of ALL `.ok` buttons (the DOM already
 * encodes `{c} ∪ c_accept` because `isOk` is exactly that predicate), and
 * agreement becomes set-membership instead of scalar equality. No dataset
 * lookup, no canonical↔display mapping in the bot — both `aiDisplayIdx`
 * and the `.ok` positions are display-frame.
 *
 * Semantics: returns `true` (treat as agreement → do NOT flag) when the
 * accepted set is unknown/empty or there is no pick, so the existing
 * `appDisplayIdx != null` guard at the call site remains the single
 * gate for "the app revealed a key at all". The fix only ever RELAXES
 * a disagreement (true→false) — it can never manufacture a new one,
 * because the accepted set is a superset of `{first .ok}`.
 *
 * @param {Array<number>} okDisplayIdxSet
 *   Display positions of every `button.qo.ok` (see
 *   `detectAppAcceptedDisplayIdxSet`).
 * @param {number|null} aiDisplayIdx
 *   The display index the AI was prompted with and picked.
 * @returns {boolean} `true` if the pick is an accepted answer (or
 *   undeterminable), `false` only when the key set is known and the pick
 *   is provably outside it.
 */
export function pickAgreesWithApp(okDisplayIdxSet, aiDisplayIdx) {
  if (!Array.isArray(okDisplayIdxSet) || okDisplayIdxSet.length === 0) return true;
  if (aiDisplayIdx == null) return true;
  return okDisplayIdxSet.includes(Number(aiDisplayIdx));
}

/**
 * DOM-pure scrape of the accepted-answer DISPLAY-index set.
 *
 * This is the ONLY DOM-touching helper in this otherwise pure module. It
 * lives here so the bot's Playwright wrapper and the unit test share ONE
 * source — the 2026-05-17 c_accept fix's named risk is a selector
 * regression (typo, or a future CSS refactor making it match the first
 * `.ok` only) that the ledger-reconstruction ratchet structurally cannot
 * catch. Pinning the literal scrape behaviorally closes that gap.
 *
 * Runs faithfully in three contexts off the SAME function body:
 *   - Playwright: `page.evaluate(extractAcceptedDisplayIdxSet)` serializes
 *     it into the live page; called with no arg → falls back to the
 *     page `document` (CDP-evaluated, not subject to page CSP).
 *   - happy-dom/jsdom unit test: called with an explicit root element.
 *   - Node without a DOM: returns `[]` (safe no-op).
 *
 * Display position = index among ALL `button.qo` siblings; the returned
 * entries are the positions carrying `.ok` (the app's isOk-driven
 * answer-key marker, multi-accept aware — shlav-a-mega.html:2466 / :3160).
 * Non-`button` `.qo` skeleton nodes (shlav-a-mega.html:3493-3496 are
 * `<div class="qo">`) are excluded by the `button.qo` selector, matching
 * the original inline behavior.
 *
 * @param {ParentNode} [rootEl] DOM root (defaults to global `document`).
 * @returns {number[]} display indices of every `.ok` option (possibly []).
 */
export function extractAcceptedDisplayIdxSet(rootEl) {
  const root = rootEl || (typeof document !== 'undefined' ? document : null);
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  const all = Array.from(root.querySelectorAll('button.qo'));
  return Array.from(root.querySelectorAll('button.qo.ok'))
    .map((ok) => all.indexOf(ok))
    .filter((i) => i >= 0);
}
