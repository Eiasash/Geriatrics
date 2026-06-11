import { mkdirSync, rmdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function acquireDerivedFilesLock(root) {
  const lockDir = resolve(root, '.tmp-derived-files.lock');
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir);
      return () => {
        try { rmdirSync(lockDir); } catch (_) {}
      };
    } catch (e) {
      if (e && e.code !== 'EEXIST') throw e;
      try {
        const ageMs = Date.now() - statSync(lockDir).mtimeMs;
        if (ageMs > 120000) rmdirSync(lockDir);
      } catch (_) {}
      if (Date.now() - start > 30000) {
        throw new Error(`timed out waiting for derived-file lock at ${lockDir}`);
      }
      sleep(25);
    }
  }
}

export async function withDerivedFilesLock(root, fn) {
  const release = acquireDerivedFilesLock(root);
  try {
    return await fn();
  } finally {
    release();
  }
}
