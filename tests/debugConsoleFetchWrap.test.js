import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(import.meta.dirname || '.', '..', 'shlav-a-mega.html'), 'utf8');

describe('debug console fetch wrapper signal preservation (v10.38.2)', () => {
  it('wrapper passes the full arguments object through to origFetch', () => {
    // The wrapper at the top of shlav-a-mega.html must use .apply(this, arguments)
    // (or rest/spread that preserves all params) so that opts.signal reaches the
    // underlying fetch unmodified. Without this, AbortController-based timeouts
    // in callAI / explainWithAI silently no-op.
    expect(html).toMatch(/origFetch\.apply\(this\s*,\s*arguments\)/);
  });

  it('wrapper does not mutate or strip the opts argument before forwarding', () => {
    // Find the function body and assert no `opts.signal = …` or destructuring-mutation.
    const wrapMatch = html.match(/window\.fetch\s*=\s*function\s*\(\s*url\s*,\s*opts\s*\)\s*\{[\s\S]{0,800}?\};?/);
    expect(wrapMatch, 'fetch wrapper present').toBeTruthy();
    const body = wrapMatch[0];
    expect(body).not.toMatch(/opts\.signal\s*=/);
    expect(body).not.toMatch(/delete\s+opts\./);
    // Wrapper must NOT pass a hand-built options object to origFetch (that would lose signal)
    expect(body).not.toMatch(/origFetch\(\s*url\s*,\s*\{/);
  });

  it('functional: wrapper receives signal and aborting it surfaces AbortError', async () => {
    // Mock the wrapped fetch behavior in isolation: build the same wrapper logic
    // and verify signal flows through.
    const calls = [];
    const fakeFetch = (url, opts) => {
      calls.push({ url, signal: opts && opts.signal });
      return new Promise((_, reject) => {
        if (opts && opts.signal) {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('signal is aborted without reason');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    // Wrapper logic mirrors the inline implementation (line 430 of shlav-a-mega.html).
    const buf = [];
    const origFetch = fakeFetch;
    const wrappedFetch = function (url, opts) {
      const t0 = Date.now();
      const u = typeof url === 'string' ? url : (url && url.url) || '?';
      return origFetch.apply(this, arguments).then(
        (r) => {
          buf.push({ url: u, status: r.status, ms: Date.now() - t0 });
          return r;
        },
        (err) => {
          buf.push({ url: u, status: 0, ms: Date.now() - t0, error: err.message });
          throw err;
        }
      );
    };

    const ctrl = new AbortController();
    const promise = wrappedFetch('https://example.com/api', { signal: ctrl.signal });
    expect(calls.length).toBe(1);
    expect(calls[0].signal, 'signal must reach origFetch').toBe(ctrl.signal);

    setTimeout(() => ctrl.abort(), 5);
    await expect(promise).rejects.toThrow('signal is aborted without reason');
    expect(buf.length).toBe(1);
    expect(buf[0].status).toBe(0);
    expect(buf[0].error).toMatch(/aborted/);
  });

  it('callAI uses per-call AbortController (no module-level singleton)', () => {
    // Regression guard: v10.38.1 had a module-scoped _aiAbortController that
    // aborted in-flight peers on every new callAI invocation, breaking bulk
    // explainWithAI. v10.38.2 must declare AbortController inside callAI.
    expect(html).not.toMatch(/^let\s+_aiAbortController\s*=\s*null;?$/m);
    const callAIMatch = html.match(/async function callAI\s*\([^)]*\)\s*\{[\s\S]{0,500}/);
    expect(callAIMatch, 'callAI present').toBeTruthy();
    expect(callAIMatch[0]).toMatch(/new AbortController\(\)/);
    expect(callAIMatch[0]).toMatch(/setTimeout/);
  });
});
