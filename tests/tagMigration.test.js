/**
 * Tests for the exam-year tag migration IIFE in shlav-a-mega.html.
 *
 * Geriatrics is monolithic — the migration lives inline, so we extract the
 * actual source by regex and run it in a vm sandbox with a mock
 * localStorage. That way the test covers the SAME bytes that ship, and the
 * regressionGuards.test.js source-pattern check remains a second line of
 * defence.
 *
 * Invariants:
 *   1. MAP rewrites are applied across all whitelisted storage keys.
 *   2. DROP ('2025-א') is removed from arrays and object values — split by
 *      classification, cannot auto-migrate.
 *   3. Sentinel `__tagMigrationV1` is set on plain-object state, NOT arrays.
 *   4. Already-sentinel'd state is left untouched.
 *   5. Corrupt JSON per key is swallowed per-key (other keys still migrate).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');

/**
 * Extract the exact IIFE from shlav-a-mega.html so the test runs real
 * source, not a copy. Fail loudly if the block can't be located — a
 * rename or restructure should force the extractor to be updated
 * alongside the feature.
 */
function extractMigrationSource() {
  const start = html.indexOf('(function migrateExamYearTags(){');
  if (start < 0) throw new Error('migrateExamYearTags IIFE not found in shlav-a-mega.html');
  // Match until the closing `})();` — there is exactly one closing
  // pattern after the start marker inside the IIFE.
  const tail = html.slice(start);
  const end = tail.indexOf('})();');
  if (end < 0) throw new Error('migrateExamYearTags IIFE close not found');
  return tail.slice(0, end + 5); // include the `})();`
}

function makeLocalStorageShim(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    _raw: store,
  };
}

/**
 * Run the extracted IIFE once against a mock localStorage.
 * LS is 'samega' — the same constant used in shlav-a-mega.html for the
 * primary state key.
 */
function runMigration(initialStore) {
  const src = extractMigrationSource();
  const ls = makeLocalStorageShim(initialStore);
  const ctx = { localStorage: ls, LS: 'samega' };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ls;
}

describe('shlav-a-mega.html — migrateExamYearTags IIFE', () => {
  describe('MAP rewrites', () => {
    it('rewrites Hebrew year labels to canonical YYYY-Mon (2024 → -Basic default)', () => {
      const ls = runMigration({
        samega: JSON.stringify({
          selectedYears: ['יוני 21', 'יוני 23', 'יוני 25', 'מאי 24', 'ספט 24', '2023-ב', '2025'],
        }),
      });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.selectedYears).toEqual([
        '2021-Jun', '2023-Jun', '2025-Jun', '2024-May-Basic', '2024-Sep-Basic', '2023-Sep', '2025-Jun',
      ]);
    });

    it('leaves already-canonical labels alone', () => {
      const ls = runMigration({
        samega: JSON.stringify({ selectedYears: ['2021-Jun', '2025-Jun', 'unknown-tag'] }),
      });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.selectedYears).toEqual(['2021-Jun', '2025-Jun', 'unknown-tag']);
    });

    it('walks into nested objects/arrays', () => {
      const ls = runMigration({
        samega: JSON.stringify({
          filters: { exam: { pick: 'מאי 24' } },
          tags: { q1: 'יוני 25' },
          list: [['יוני 21']],
        }),
      });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.filters.exam.pick).toBe('2024-May-Basic');
      expect(after.tags.q1).toBe('2025-Jun');
      expect(after.list[0]).toEqual(['2021-Jun']);
    });
  });

  describe('DROP semantics (2025-א)', () => {
    it('removes 2025-א from arrays (cannot auto-migrate — split by classification)', () => {
      const ls = runMigration({
        samega: JSON.stringify({ selectedYears: ['יוני 21', '2025-א', '2025-Jun'] }),
      });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.selectedYears).toEqual(['2021-Jun', '2025-Jun']);
      expect(after.selectedYears).not.toContain('2025-א');
    });

    it('deletes keys whose value is 2025-א from nested objects', () => {
      const ls = runMigration({
        samega: JSON.stringify({ picker: { current: '2025-א', prev: 'יוני 21' } }),
      });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.picker.prev).toBe('2021-Jun');
      expect('current' in after.picker).toBe(false);
    });
  });

  describe('idempotency sentinel', () => {
    it('sets __tagMigrationV1 on plain-object top-level state', () => {
      const ls = runMigration({ samega: JSON.stringify({ selectedYears: ['יוני 21'] }) });
      const after = JSON.parse(ls.getItem('samega'));
      expect(after.__tagMigrationV1).toBe(true);
    });

    it('does NOT rewrite a sentinel-marked state on a second pass', () => {
      const payload = { selectedYears: ['יוני 21'], __tagMigrationV1: true };
      const ls = runMigration({ samega: JSON.stringify(payload) });
      const after = JSON.parse(ls.getItem('samega'));
      // Untouched because the sentinel short-circuits the walk.
      expect(after.selectedYears).toEqual(['יוני 21']);
    });

    it('runs end-to-end idempotently across two invocations', () => {
      const src = extractMigrationSource();
      const ls = makeLocalStorageShim({ samega: JSON.stringify({ selectedYears: ['יוני 25'] }) });
      const ctx = { localStorage: ls, LS: 'samega' };
      vm.createContext(ctx);
      vm.runInContext(src, ctx);
      const snapshot = ls.getItem('samega');
      vm.runInContext(src, ctx);
      expect(ls.getItem('samega')).toBe(snapshot);
    });
  });

  describe('multi-key migration', () => {
    it('migrates each whitelisted LS key independently', () => {
      const ls = runMigration({
        samega: JSON.stringify({ a: 'יוני 21' }),
        samega_mock_hist: JSON.stringify({ tag: 'מאי 24' }),
        samega_sessions: JSON.stringify({ tag: 'יוני 25' }),
        samega_custom_qs: JSON.stringify({ tag: 'ספט 24' }),
        samega_pending_qs: JSON.stringify({ tag: '2023-ב' }),
      });
      expect(JSON.parse(ls.getItem('samega')).a).toBe('2021-Jun');
      expect(JSON.parse(ls.getItem('samega_mock_hist')).tag).toBe('2024-May-Basic');
      expect(JSON.parse(ls.getItem('samega_sessions')).tag).toBe('2025-Jun');
      expect(JSON.parse(ls.getItem('samega_custom_qs')).tag).toBe('2024-Sep-Basic');
      expect(JSON.parse(ls.getItem('samega_pending_qs')).tag).toBe('2023-Sep');
    });

    it('swallows corrupt JSON on one key without aborting others', () => {
      const ls = runMigration({
        samega: '{not-json',
        samega_sessions: JSON.stringify({ tag: 'יוני 21' }),
      });
      // Corrupt key untouched.
      expect(ls.getItem('samega')).toBe('{not-json');
      // Healthy key still migrated.
      expect(JSON.parse(ls.getItem('samega_sessions')).tag).toBe('2021-Jun');
    });

    it('ignores keys that are absent', () => {
      expect(() => runMigration({})).not.toThrow();
    });
  });
});
