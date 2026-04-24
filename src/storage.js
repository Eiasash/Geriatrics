// src/storage.js — Centralized localStorage JSON helpers
// Extracted from shlav-a-mega.html (Phase 7)
// Globals exposed: lsGet(), lsSet()

/**
 * Read a JSON value from localStorage with safe parsing.
 * @param {string} key - localStorage key
 * @param {*} fallback - returned on missing/corrupt data
 * @returns {*} parsed value or fallback
 */
function lsGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch(e) { localStorage.removeItem(key); return fallback; }
}

/**
 * Write a JSON value to localStorage.
 *
 * Returns true on success, false on failure. Quota exhaustion is the common
 * case (iOS Safari caps localStorage at 5 MB); previously it was swallowed
 * silently, so callers kept believing study progress was saved when it was
 * not. We still don't throw — the single-file HTML app can't crash on a
 * write failure — but we log once and surface the boolean so callers can
 * retry, prune, or warn the user. Old call sites that ignore the return
 * value still compile.
 *
 * @param {string} key - localStorage key
 * @param {*} value - value to JSON.stringify and store
 * @returns {boolean} true on success, false on quota/serialization failure
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    try {
      console.warn('lsSet failed for key', key, '-', (e && e.name) || e);
    } catch (_) {}
    return false;
  }
}
