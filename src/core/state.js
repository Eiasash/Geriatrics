/**
 * Centralized application state and persistence.
 *
 * State shape: the `S` object stored in localStorage (key: 'samega') and IndexedDB.
 * This module owns loading, saving, migration, and the default shape.
 *
 * IMPORTANT: localStorage keys 'samega', 'samega_ex', 'samega_apikey' must not be renamed.
 */

import { LS_KEY, STATE_VERSION } from './constants.js';

// ===== DEFAULT STATE SHAPE =====
export function defaultState() {
  return {
    _v: STATE_VERSION,
    ck: {},           // checklist completions
    qOk: 0,          // lifetime correct count
    qNo: 0,          // lifetime wrong count
    bk: {},           // bookmarked question indices
    notes: {},        // per-note user marks
    sr: {},           // spaced repetition data per question index
    fci: 0,           // flashcard index
    fcFlip: false,    // flashcard flipped state
    streak: 0,        // consecutive study days
    lastDay: null,    // last study date (YYYY-MM-DD)
    chat: [],         // AI chat history
    studyMode: false, // study (sepia) mode
    dark: false,      // dark mode
    sp: {},           // study plan state
    spOpen: false,    // study plan accordion open
    dailyAct: {},     // daily activity tracking {date: {q, ok, time, sessions}}
    chReads: {},      // chapter reading timestamps
  };
}

// ===== STATE MIGRATION =====
/**
 * Migrate older state shapes to current version.
 * Called on load — adds missing keys, never removes existing data.
 */
export function migrateState(state) {
  if (!state || typeof state !== 'object') return defaultState();

  const def = defaultState();

  // Fill in any missing keys from default
  for (const key of Object.keys(def)) {
    if (state[key] === undefined) {
      state[key] = def[key];
    }
  }

  // Specific patches for known missing sub-fields
  if (!Array.isArray(state.chat)) state.chat = [];
  if (typeof state.streak !== 'number') state.streak = 0;
  if (typeof state.sp !== 'object' || state.sp === null) state.sp = {};

  // Stamp version
  state._v = STATE_VERSION;

  return state;
}

// ===== SAFE JSON PARSE =====
export function safeJSONParse(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

// ===== LOAD STATE =====
/**
 * Load state from localStorage. Returns migrated state.
 * Handles corrupted JSON gracefully.
 */
export function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  const parsed = safeJSONParse(raw, null);
  return migrateState(parsed);
}

// ===== SAVE STATE (debounced) =====
let _saveTimer = null;
let _currentState = null;

/**
 * Set the live state reference for save() to serialize.
 */
export function setStateRef(stateObj) {
  _currentState = stateObj;
}

/**
 * Debounced save to localStorage (150ms).
 * Also warns if approaching 5MB limit.
 */
export function save() {
  if (!_currentState) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(_currentState));
    } catch (_e) {
      // localStorage full — try clearing non-essential keys
      try {
        localStorage.removeItem('samega_ex');
        localStorage.removeItem('samega_weekly');
        localStorage.setItem(LS_KEY, JSON.stringify(_currentState));
      } catch (_e2) {
        console.warn('localStorage full, unable to save state');
      }
    }

    // Warn if approaching 5MB limit
    try {
      let total = 0;
      for (const k in localStorage) {
        if (localStorage.hasOwnProperty(k)) total += localStorage[k].length * 2;
      }
      if (total > 4 * 1024 * 1024 && !window._lsWarnShown) {
        window._lsWarnShown = true;
        console.warn('localStorage: ' + (total / 1024 / 1024).toFixed(1) + 'MB — approaching limit');
        localStorage.removeItem('samega_ex');
        localStorage.removeItem('samega_weekly');
      }
    } catch (_e) { /* ignore */ }
  }, 150);
}

// ===== STREAK UPDATE =====
export function updateStreak(state) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.lastDay === today) return;
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (state.lastDay === yest) state.streak++;
  else if (state.lastDay !== today) state.streak = 1;
  state.lastDay = today;
}
