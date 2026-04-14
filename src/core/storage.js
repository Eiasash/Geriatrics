/**
 * IndexedDB persistence layer.
 *
 * Provides IDB open/get/set and the migration from localStorage → IDB.
 * Falls back to localStorage if IDB is unavailable.
 */

import { IDB_NAME, IDB_VER, IDB_STORE, LS_KEY } from './constants.js';
import { safeJSONParse } from './state.js';

let idb = null;

export function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => {
      idb = e.target.result;
      resolve(idb);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export function idbGet(key) {
  return new Promise((resolve) => {
    if (!idb) return resolve(null);
    const tx = idb.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export function idbSet(key, val) {
  return new Promise((resolve) => {
    if (!idb) return resolve();
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Migrate localStorage state to IndexedDB on first run.
 * After migration, save() writes to both IDB and localStorage (fallback).
 *
 * @param {object} state - The current in-memory state object (S)
 * @param {function} saveFn - The current save function reference
 * @returns {{ state: object, save: function }} Updated state and save function
 */
export async function migrateToIDB(state, saveFn) {
  try {
    await openIDB();
    const existing = await idbGet('samega');

    if (!existing) {
      const lsData = localStorage.getItem(LS_KEY);
      if (lsData) {
        await idbSet('samega', safeJSONParse(lsData, state));
        localStorage.removeItem(LS_KEY);
      } else {
        await idbSet('samega', state);
      }
    } else {
      // Load from IDB into state
      Object.assign(state, existing);
    }

    // Create IDB-aware save that writes to both
    let idbTimer = null;
    const idbSave = () => {
      clearTimeout(idbTimer);
      idbTimer = setTimeout(() => {
        idbSet('samega', JSON.parse(JSON.stringify(state))).catch(() => {});
        // Keep localStorage as fallback
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(state));
        } catch (_e) { /* ignore */ }
      }, 150);
    };

    return { state, save: idbSave };
  } catch (e) {
    console.warn('IDB migration failed, using localStorage:', e);
    return { state, save: saveFn };
  }
}
