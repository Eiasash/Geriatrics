/**
 * Unit tests for scripts/lib/proxy-client.cjs.
 *
 * Verifies the proxy contract is wired correctly so the 3 batch scripts
 * (translate_questions_to_hebrew, generate_explanations, generate-questions)
 * don't silently regress on auth headers or URL when refactored to use it.
 *
 * Mocked fetch — does NOT hit the real proxy.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '..');
const { callClaude, PROXY_URL, PROXY_SECRET, ANTHROPIC_URL, ANTHROPIC_VERSION } =
  require(resolve(ROOT, 'scripts', 'lib', 'proxy-client.cjs'));

function mockOk(text = 'mock response') {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ content: [{ type: 'text', text }] }),
  });
}

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
    expect(body.secret).toBeUndefined();         // not in body
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
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [
        { type: 'text', text: 'part one ' },
        { type: 'text', text: 'part two' },
      ]}),
    });
    const result = await callClaude('q', { fetchImpl });
    expect(result).toBe('part one part two');
  });

  it('throws with status + body on non-2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      text: () => Promise.resolve('Unsupported model'),
      json: () => Promise.resolve(null),
    });
    await expect(callClaude('q', { model: 'claude-opus-4-20250514', fetchImpl }))
      .rejects.toThrow(/HTTP 400 from proxy.*Unsupported model/);
  });

  it('throws when response content array is missing/malformed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ error: { type: 'invalid_request_error' } }),
    });
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

  it('refuses direct mode without apiKey', async () => {
    await expect(callClaude('q', { direct: true })).rejects.toThrow(/requires apiKey/);
  });
});

describe('proxy-client — exports', () => {
  it('exports PROXY_URL and PROXY_SECRET as fixed constants', () => {
    expect(PROXY_URL).toBe('https://toranot.netlify.app/api/claude');
    expect(PROXY_SECRET).toBe('shlav-a-mega-1f97f311d307-2026');
  });
});
