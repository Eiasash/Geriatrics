/**
 * Unit tests for scripts/lib/proxy-client.cjs.
 *
 * Verifies the proxy contract is wired correctly so the 5 batch scripts
 * (translate_questions_to_hebrew, generate_explanations, generate-questions,
 * gen_ai_hard_geri, source-scanner) don't silently regress on auth headers
 * or URL when refactored to use it, and that ProxyError classification +
 * callClaudeWithRetry behave per the documented contract.
 *
 * Mocked fetch — does NOT hit the real proxy.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '..');
const {
  callClaude,
  callClaudeWithRetry,
  ProxyError,
  _classifyError,
  PROXY_URL,
  PROXY_SECRET,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
} = require(resolve(ROOT, 'scripts', 'lib', 'proxy-client.cjs'));

// --- mock helpers --------------------------------------------------------

function makeResponse({ ok = true, status = 200, body = null, contentType = 'application/json' } = {}) {
  const bodyText = body == null
    ? JSON.stringify({ content: [{ type: 'text', text: 'mock response' }] })
    : (typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok,
    status,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-type' ? contentType : null) },
    text: () => Promise.resolve(bodyText),
    json: () => {
      try { return Promise.resolve(JSON.parse(bodyText)); }
      catch (e) { return Promise.reject(e); }
    },
  };
}

function mockOk(text = 'mock response') {
  return vi.fn().mockResolvedValue(makeResponse({
    body: { content: [{ type: 'text', text }] },
  }));
}

// --- existing-contract tests (unchanged in spirit) ------------------------

describe('proxy-client — default proxy mode', () => {
  it('POSTs to PROXY_URL with x-api-secret header (no x-api-key)', async () => {
    const fetchImpl = mockOk();
    await callClaude('hello', { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(PROXY_URL);
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-secret']).toBe(PROXY_SECRET);
    expect(init.headers['x-api-key']).toBeUndefined();
    expect(init.headers['anthropic-version']).toBeUndefined();
  });

  it('sends model + max_tokens + messages in body; secret never in body (Codex P1 vector)', async () => {
    const fetchImpl = mockOk();
    await callClaude('hello', { model: 'opus', max_tokens: 512, fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('opus');
    expect(body.max_tokens).toBe(512);
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.secret).toBeUndefined();
    expect(body['x-api-secret']).toBeUndefined();
  });

  it('defaults to sonnet alias when model omitted', async () => {
    const fetchImpl = mockOk();
    await callClaude('q', { fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('sonnet');
  });

  it('omits system field when not provided; includes it when given', async () => {
    const fetchImpl = mockOk();
    await callClaude('q', { fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).system).toBeUndefined();

    const fetchImpl2 = mockOk();
    await callClaude('q', { system: 'You are a doctor.', fetchImpl: fetchImpl2 });
    expect(JSON.parse(fetchImpl2.mock.calls[0][1].body).system).toBe('You are a doctor.');
  });

  it('returns concatenated text from content array', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      body: { content: [
        { type: 'text', text: 'part one ' },
        { type: 'text', text: 'part two' },
      ] },
    }));
    const result = await callClaude('q', { fetchImpl });
    expect(result).toBe('part one part two');
  });

  it('throws ProxyError with status + body on non-2xx (preserves legacy message format)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: false, status: 400, body: 'Unsupported model',
    }));
    await expect(callClaude('q', { model: 'claude-opus-4-20250514', fetchImpl }))
      .rejects.toThrow(/HTTP 400 from proxy.*Unsupported model/);
  });

  it('throws ProxyError when response content array is missing/malformed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      body: { error: { type: 'invalid_request_error' } },
    }));
    await expect(callClaude('q', { fetchImpl })).rejects.toThrow(/malformed response/);
  });
});

describe('proxy-client — direct fallback mode', () => {
  it('hits api.anthropic.com with x-api-key + anthropic-version when direct=true', async () => {
    const fetchImpl = mockOk();
    await callClaude('hello', { direct: true, apiKey: 'sk-ant-test', fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(ANTHROPIC_URL);
    expect(init.headers['x-api-key']).toBe('sk-ant-test');
    expect(init.headers['anthropic-version']).toBe(ANTHROPIC_VERSION);
    expect(init.headers['x-api-secret']).toBeUndefined();
  });

  it('refuses direct mode without apiKey (programmer-error path — NOT ProxyError)', async () => {
    await expect(callClaude('q', { direct: true })).rejects.toThrow(/requires apiKey/);
    // Verify it is a plain Error, not a ProxyError — config bugs must surface
    // as such instead of looking like retryable network failures.
    try {
      await callClaude('q', { direct: true });
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).not.toBeInstanceOf(ProxyError);
    }
  });
});

describe('proxy-client — exports', () => {
  it('exports PROXY_URL and PROXY_SECRET as fixed constants', () => {
    expect(PROXY_URL).toBe('https://toranot.netlify.app/api/claude');
    expect(PROXY_SECRET).toBe('shlav-a-mega-1f97f311d307-2026');
  });

  it('exports ProxyError, callClaudeWithRetry, and _classifyError', () => {
    expect(typeof ProxyError).toBe('function');
    expect(typeof callClaudeWithRetry).toBe('function');
    expect(typeof _classifyError).toBe('function');
  });
});

// --- _classifyError: one assertion per documented row ---------------------

describe('_classifyError — network errors (err.code)', () => {
  it.each([
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNREFUSED',
    'EPIPE',
    'EHOSTUNREACH',
  ])('classifies %s as transient network', (code) => {
    const err = Object.assign(new Error('boom'), { code });
    expect(_classifyError({ err })).toEqual({ transient: true, category: 'network', status: null });
  });

  it('non-transient err.code falls through to unknown', () => {
    const err = Object.assign(new Error('boom'), { code: 'ENOENT' });
    expect(_classifyError({ err })).toEqual({ transient: false, category: 'unknown', status: null });
  });

  it('error without code or AbortError name → non-transient unknown', () => {
    expect(_classifyError({ err: new Error('mystery') }))
      .toEqual({ transient: false, category: 'unknown', status: null });
  });
});

describe('_classifyError — AbortError (client-side timeout)', () => {
  it('err.name === "AbortError" → transient timeout', () => {
    const err = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(_classifyError({ err })).toEqual({ transient: true, category: 'timeout', status: null });
  });

  it('DOMException-style AbortError (name set, no code) → transient timeout', () => {
    // Real fetch in node produces a DOMException with .name === 'AbortError' and no .code.
    const domEx = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    expect(_classifyError({ err: domEx })).toEqual({ transient: true, category: 'timeout', status: null });
  });
});

describe('_classifyError — Netlify plain-text upstream timeout', () => {
  it('body starting with "Upstream" → transient netlify_upstream_timeout regardless of status', () => {
    const res = { status: 200, headers: { get: () => 'text/plain' } };
    expect(_classifyError({ res, bodyText: 'Upstream timeout' }))
      .toEqual({ transient: true, category: 'netlify_upstream_timeout', status: 200 });
  });

  it('body with leading whitespace + "Upstream" still matches (trimStart)', () => {
    const res = { status: 504, headers: { get: () => 'text/plain' } };
    expect(_classifyError({ res, bodyText: '   Upstream timeout' }))
      .toEqual({ transient: true, category: 'netlify_upstream_timeout', status: 504 });
  });
});

describe('_classifyError — Anthropic error body (transient-only override)', () => {
  it('overloaded_error → transient anthropic_overloaded (overrides 500-class status)', () => {
    const res = { status: 500, headers: { get: () => 'application/json' } };
    const parsedBody = { error: { type: 'overloaded_error' } };
    expect(_classifyError({ res, bodyText: JSON.stringify(parsedBody), parsedBody }))
      .toEqual({ transient: true, category: 'anthropic_overloaded', status: 500 });
  });

  it('rate_limit_error (underscore) → transient rate_limit', () => {
    const res = { status: 429, headers: { get: () => 'application/json' } };
    const parsedBody = { error: { type: 'rate_limit_error' } };
    expect(_classifyError({ res, bodyText: JSON.stringify(parsedBody), parsedBody }))
      .toEqual({ transient: true, category: 'rate_limit', status: 429 });
  });

  it('hyphenated rate-limit variant → transient rate_limit (paranoid catch preserved)', () => {
    const res = { status: 429, headers: { get: () => 'application/json' } };
    const parsedBody = { error: { type: 'some-rate-limit-thing' } };
    expect(_classifyError({ res, bodyText: JSON.stringify(parsedBody), parsedBody }))
      .toEqual({ transient: true, category: 'rate_limit', status: 429 });
  });

  it('precedence: invalid_request_error body does NOT override status (status wins for non-transient)', () => {
    const res = { status: 400, headers: { get: () => 'application/json' } };
    const parsedBody = { error: { type: 'invalid_request_error' } };
    expect(_classifyError({ res, bodyText: JSON.stringify(parsedBody), parsedBody }))
      .toEqual({ transient: false, category: 'bad_request', status: 400 });
  });
});

describe('_classifyError — HTML page detection (Netlify 5xx)', () => {
  it('body starts with "<" + status 502 → transient netlify_5xx', () => {
    const res = { status: 502, headers: { get: () => 'text/plain' } };
    expect(_classifyError({ res, bodyText: '<!DOCTYPE html><html>...' }))
      .toEqual({ transient: true, category: 'netlify_5xx', status: 502 });
  });

  it('content-type text/html + status 503 → transient netlify_5xx', () => {
    const res = { status: 503, headers: { get: () => 'text/html; charset=utf-8' } };
    expect(_classifyError({ res, bodyText: 'whatever' }))
      .toEqual({ transient: true, category: 'netlify_5xx', status: 503 });
  });

  it('HTML body with status 200 does NOT match netlify_5xx (status floor not met)', () => {
    const res = { status: 200, headers: { get: () => 'text/html' } };
    // Falls through: status 200 + no Anthropic error type → malformed_response
    expect(_classifyError({ res, bodyText: '<html>...' }))
      .toEqual({ transient: false, category: 'malformed_response', status: 200 });
  });
});

describe('_classifyError — status-based classification', () => {
  it.each([
    [502, true,  'netlify_5xx'],
    [503, true,  'netlify_5xx'],
    [504, true,  'netlify_5xx'],
    [429, true,  'rate_limit'],
    [500, true,  'server'],
    [599, true,  'server'],
    [401, false, 'auth'],
    [403, false, 'auth'],
    [400, false, 'bad_request'],
    [404, false, 'client_error'],
    [422, false, 'client_error'],
  ])('status %i → transient=%s category=%s', (status, transient, category) => {
    const res = { status, headers: { get: () => 'application/json' } };
    expect(_classifyError({ res, bodyText: '{}', parsedBody: {} }))
      .toEqual({ transient, category, status });
  });

  it('status 200 with no Anthropic error → malformed_response', () => {
    const res = { status: 200, headers: { get: () => 'application/json' } };
    expect(_classifyError({ res, bodyText: '{}', parsedBody: {} }))
      .toEqual({ transient: false, category: 'malformed_response', status: 200 });
  });
});

// --- callClaude: integration — ProxyError is thrown and classified --------

describe('callClaude — throws ProxyError with classification', () => {
  it('502 from proxy → ProxyError transient=true category=netlify_5xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: false, status: 502, body: '<html>Bad gateway</html>', contentType: 'text/html',
    }));
    try {
      await callClaude('q', { fetchImpl });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('netlify_5xx');
      expect(e.status).toBe(502);
      expect(e.message).toMatch(/HTTP 502 from proxy/);
    }
  });

  it('429 with Anthropic rate_limit_error → ProxyError transient=true category=rate_limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: false, status: 429, body: { error: { type: 'rate_limit_error', message: 'slow down' } },
    }));
    try {
      await callClaude('q', { fetchImpl });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('rate_limit');
      expect(e.status).toBe(429);
    }
  });

  it('401 → ProxyError transient=false category=auth', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: false, status: 401, body: 'Unauthorized',
    }));
    try {
      await callClaude('q', { fetchImpl });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(false);
      expect(e.category).toBe('auth');
      expect(e.status).toBe(401);
    }
  });

  it('AbortError from fetch (timeout) → ProxyError transient=true category=timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);
    try {
      await callClaude('q', { fetchImpl, timeout_ms: 50 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('timeout');
      expect(e.cause).toBe(abortErr);
    }
  });

  it('ENOTFOUND from fetch → ProxyError transient=true category=network with cause', async () => {
    const netErr = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' });
    const fetchImpl = vi.fn().mockRejectedValue(netErr);
    try {
      await callClaude('q', { fetchImpl });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('network');
      expect(e.cause).toBe(netErr);
    }
  });

  it('"Upstream timeout" plain-text body (status 200) → ProxyError transient=true netlify_upstream_timeout', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse({
      ok: true, status: 200, body: 'Upstream timeout', contentType: 'text/plain',
    }));
    try {
      await callClaude('q', { fetchImpl });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('netlify_upstream_timeout');
      expect(e.message).toMatch(/Netlify upstream timeout.*Upstream timeout/);
    }
  });
});

// --- callClaudeWithRetry --------------------------------------------------

describe('callClaudeWithRetry', () => {
  it('retries on transient ProxyError twice, then succeeds on attempt 3', async () => {
    const transientResp = makeResponse({ ok: false, status: 502, body: 'gateway error' });
    const okResp = makeResponse({ body: { content: [{ type: 'text', text: 'finally ok' }] } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(transientResp)
      .mockResolvedValueOnce(transientResp)
      .mockResolvedValueOnce(okResp);

    const result = await callClaudeWithRetry('q', {
      fetchImpl,
      maxAttempts: 3,
      baseDelayMs: 1,
      jitterMs: 0,
    });

    expect(result).toBe('finally ok');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on non-transient ProxyError — rethrows after attempt 1', async () => {
    const authResp = makeResponse({ ok: false, status: 401, body: 'Unauthorized' });
    const fetchImpl = vi.fn().mockResolvedValue(authResp);

    try {
      await callClaudeWithRetry('q', { fetchImpl, maxAttempts: 5, baseDelayMs: 1, jitterMs: 0 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(false);
      expect(e.category).toBe('auth');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('rethrows last error after maxAttempts on persistent transient failures', async () => {
    const transientResp = makeResponse({ ok: false, status: 503, body: 'gateway' });
    const fetchImpl = vi.fn().mockResolvedValue(transientResp);

    try {
      await callClaudeWithRetry('q', { fetchImpl, maxAttempts: 3, baseDelayMs: 1, jitterMs: 0 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ProxyError);
      expect(e.transient).toBe(true);
      expect(e.category).toBe('netlify_5xx');
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('onRetry callback fires N-1 times for N attempts on persistent transient', async () => {
    const transientResp = makeResponse({ ok: false, status: 502, body: 'gateway' });
    const fetchImpl = vi.fn().mockResolvedValue(transientResp);
    const onRetry = vi.fn();

    await expect(callClaudeWithRetry('q', {
      fetchImpl,
      maxAttempts: 4,
      baseDelayMs: 1,
      jitterMs: 0,
      onRetry,
    })).rejects.toBeInstanceOf(ProxyError);

    // 4 attempts → onRetry called between attempts 1→2, 2→3, 3→4 = 3 times.
    expect(onRetry).toHaveBeenCalledTimes(3);
    expect(onRetry.mock.calls[0][1]).toBe(1);
    expect(onRetry.mock.calls[1][1]).toBe(2);
    expect(onRetry.mock.calls[2][1]).toBe(3);
  });

  it('non-ProxyError (plain Error) is NOT retried', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      throw new Error('plain synchronous failure');
    });

    await expect(callClaudeWithRetry('q', {
      fetchImpl,
      maxAttempts: 5,
      baseDelayMs: 1,
      jitterMs: 0,
    })).rejects.toThrow(/plain synchronous failure/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('passes through callClaude options (model, system, etc.)', async () => {
    const fetchImpl = mockOk();
    await callClaudeWithRetry('q', {
      fetchImpl,
      model: 'opus',
      system: 'system prompt',
      max_tokens: 256,
      maxAttempts: 1,
      baseDelayMs: 1,
      jitterMs: 0,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.model).toBe('opus');
    expect(body.system).toBe('system prompt');
    expect(body.max_tokens).toBe(256);
  });

  it('onRetry exception does not break the retry loop', async () => {
    const transientResp = makeResponse({ ok: false, status: 502, body: 'gateway' });
    const okResp = makeResponse({ body: { content: [{ type: 'text', text: 'ok' }] } });
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(transientResp)
      .mockResolvedValueOnce(okResp);
    const onRetry = vi.fn(() => { throw new Error('onRetry blew up'); });

    const result = await callClaudeWithRetry('q', {
      fetchImpl, maxAttempts: 2, baseDelayMs: 1, jitterMs: 0, onRetry,
    });
    expect(result).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('ProxyError class', () => {
  it('is an Error subclass', () => {
    const e = new ProxyError('m', { transient: true, category: 'network', status: null });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ProxyError);
    expect(e.name).toBe('ProxyError');
    expect(e.message).toBe('m');
    expect(e.transient).toBe(true);
    expect(e.category).toBe('network');
    expect(e.status).toBeNull();
    expect(e.cause).toBeNull();
  });

  it('defaults: transient=false, category=unknown, status=null, cause=null', () => {
    const e = new ProxyError('m');
    expect(e.transient).toBe(false);
    expect(e.category).toBe('unknown');
    expect(e.status).toBeNull();
    expect(e.cause).toBeNull();
  });

  it('preserves cause for downstream debugging', () => {
    const root = new Error('root cause');
    const e = new ProxyError('wrap', { transient: true, category: 'network', cause: root });
    expect(e.cause).toBe(root);
  });
});
