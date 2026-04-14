/**
 * Pure utility helpers — no DOM, no globals.
 * Mirrored in src/bridge.js for non-module consumption.
 */

/**
 * Sanitize a string for safe HTML insertion (XSS prevention).
 */
export function sanitize(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Format seconds as h:mm:ss or mm:ss.
 */
export function fmtT(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sc = s % 60;
  return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sc).padStart(2, '0');
}
