'use strict';

/**
 * proxy-client.cjs — single AI-call entry point for all batch scripts.
 *
 * Default route: Toranot proxy (https://toranot.netlify.app/api/claude).
 * The proxy holds the Anthropic API key server-side, enforces rate limits,
 * tracks token usage in toranot_config, and accepts only the canonical
 * allowed-model list. This means batch scripts never need ANTHROPIC_API_KEY
 * and never leak it to disk via config.json.
 *
 * Direct-API fallback: pass { direct: true, apiKey } if the proxy is down
 * (Netlify outage, key rotation in progress) — per deploy-primitives § 4
 * "Reach for direct Anthropic API unless the proxy genuinely flaps".
 *
 * Allowed models (proxy-side, verified 2026-05-22):
 *   - claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001
 *   - aliases: sonnet, opus, haiku
 *   - 'claude-opus-4-20250514' is REJECTED (returns HTTP 400 "Unsupported model")
 *     — use 'opus' alias instead.
 *
 * Returns just the response text (matches the previous per-script callClaude
 * shape so refactor is drop-in).
 */

const PROXY_URL = 'https://toranot.netlify.app/api/claude';
const PROXY_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Call Claude. Returns a Promise<string> resolving to the response text.
 *
 * @param {string} prompt - the user message
 * @param {object} options
 * @param {string} options.model       - 'sonnet' (default) | 'opus' | 'haiku' | full string in allowed list
 * @param {string} [options.system]    - optional system prompt
 * @param {number} [options.max_tokens=4096]
 * @param {number} [options.timeout_ms=60000]
 * @param {boolean} [options.direct=false] - bypass proxy, hit api.anthropic.com
 * @param {string} [options.apiKey]    - required when direct=true
 * @param {function} [options.fetchImpl=fetch] - injectable for tests
 *
 * @returns {Promise<string>} concatenated text from response.content
 */
async function callClaude(prompt, options = {}) {
  const {
    model = 'sonnet',
    system,
    max_tokens = 4096,
    timeout_ms = 60_000,
    direct = false,
    apiKey,
    fetchImpl = fetch,
  } = options;

  if (direct && !apiKey) {
    throw new Error('proxy-client: direct=true requires apiKey (ANTHROPIC_API_KEY)');
  }

  const body = { model, max_tokens, messages: [{ role: 'user', content: prompt }] };
  if (typeof system === 'string' && system.length) body.system = system;

  const url = direct ? ANTHROPIC_URL : PROXY_URL;
  const headers = { 'Content-Type': 'application/json' };
  if (direct) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
  } else {
    headers['x-api-secret'] = PROXY_SECRET;
  }

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout_ms);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable>');
    throw new Error(`proxy-client: HTTP ${res.status} from ${direct ? 'Anthropic' : 'proxy'}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data.content)) {
    throw new Error(`proxy-client: malformed response — content array missing. Got: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const text = data.content.map(b => (b && typeof b.text === 'string') ? b.text : '').join('');
  return text;
}

module.exports = {
  callClaude,
  PROXY_URL,
  PROXY_SECRET,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
};
