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
 * Write a JSON value to localStorage with silent error handling.
 * @param {string} key - localStorage key
 * @param {*} value - value to JSON.stringify and store
 */
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
}
