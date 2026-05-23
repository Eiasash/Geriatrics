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
 *
 * Errors thrown by callClaude are ProxyError instances (instanceof Error) with
 * structured classification: { transient, category, status, cause }. Callers
 * that want automatic retry on transient failures should use callClaudeWithRetry
 * instead of re-implementing the regex/status-code logic.
 */

const PROXY_URL = 'https://toranot.netlify.app/api/claude';
const PROXY_SECRET = 'shlav-a-mega-1f97f311d307-2026';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'EPIPE',
  'EHOSTUNREACH',
]);

class ProxyError extends Error {
  constructor(message, { transient, category, status, cause } = {}) {
    super(message);
    this.name = 'ProxyError';
    this.transient = Boolean(transient);
    this.category = category || 'unknown';
    this.status = status ?? null;
    this.cause = cause ?? null;
  }
}

/**
 * Map raw failure inputs to a { transient, category, status } classification.
 *
 * Exported as `_classifyError` for direct unit testing. Underscore-prefixed to
 * mark it as internal — callers should consume ProxyError on a real call, not
 * call this directly.
 *
 * Precedence rule: body-type override applies ONLY for transient signals
 * (overloaded_error, rate_limit/rate-limit). For non-transient categories
 * (auth, bad_request, client_error), status wins. Rationale: only "retry me
 * later" body types need to override status; terminal errors are well-
 * characterized by status alone, and Anthropic's auth/bad_request body types
 * mirror their status reliably.
 */
function _classifyError({ err, res, bodyText, parsedBody } = {}) {
  if (err) {
    if (err.name === 'AbortError') {
      return { transient: true, category: 'timeout', status: null };
    }
    if (err.code && TRANSIENT_NETWORK_CODES.has(err.code)) {
      return { transient: true, category: 'network', status: null };
    }
    return { transient: false, category: 'unknown', status: null };
  }

  const status = res && typeof res.status === 'number' ? res.status : null;

  if (typeof bodyText === 'string' && bodyText.trimStart().startsWith('Upstream')) {
    return { transient: true, category: 'netlify_upstream_timeout', status };
  }

  if (parsedBody && parsedBody.error && typeof parsedBody.error.type === 'string') {
    const t = parsedBody.error.type.toLowerCase();
    if (t === 'overloaded_error') {
      return { transient: true, category: 'anthropic_overloaded', status };
    }
    if (t.includes('rate_limit') || t.includes('rate-limit')) {
      return { transient: true, category: 'rate_limit', status };
    }
  }

  const contentType =
    res && res.headers && typeof res.headers.get === 'function'
      ? String(res.headers.get('content-type') || '').toLowerCase()
      : '';
  const looksHtml =
    contentType.startsWith('text/html') ||
    (typeof bodyText === 'string' && bodyText.trimStart().startsWith('<'));
  if (looksHtml && typeof status === 'number' && status >= 500) {
    return { transient: true, category: 'netlify_5xx', status };
  }

  if (status === 502 || status === 503 || status === 504) {
    return { transient: true, category: 'netlify_5xx', status };
  }
  if (status === 429) {
    return { transient: true, category: 'rate_limit', status };
  }
  if (typeof status === 'number' && status >= 500 && status < 600) {
    return { transient: true, category: 'server', status };
  }
  if (status === 401 || status === 403) {
    return { transient: false, category: 'auth', status };
  }
  if (status === 400) {
    return { transient: false, category: 'bad_request', status };
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return { transient: false, category: 'client_error', status };
  }

  return { transient: false, category: 'malformed_response', status };
}

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
 * @throws {ProxyError} on any failure (instanceof Error). Inspect .transient,
 *   .category, .status to decide retry vs. bail.
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
    // programmer error — not wrapped in ProxyError intentionally. A config bug
    // surfaces immediately at the call site instead of looking like a network
    // failure that retry logic would chew through.
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
  let networkErr;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  } catch (e) {
    networkErr = e;
  } finally {
    clearTimeout(t);
  }

  if (networkErr) {
    const cls = _classifyError({ err: networkErr });
    throw new ProxyError(
      `proxy-client: ${networkErr.name || 'Error'}: ${networkErr.message || String(networkErr)}`,
      { ...cls, cause: networkErr }
    );
  }

  const bodyText = await res.text().catch(() => '<unreadable>');
  let parsedBody = null;
  if (bodyText && bodyText !== '<unreadable>') {
    try { parsedBody = JSON.parse(bodyText); } catch (_) { /* not JSON */ }
  }

  if (typeof bodyText === 'string' && bodyText.trimStart().startsWith('Upstream')) {
    const cls = _classifyError({ res, bodyText, parsedBody });
    throw new ProxyError(
      `proxy-client: Netlify upstream timeout: ${bodyText.slice(0, 300)}`,
      cls
    );
  }

  if (!res.ok) {
    const cls = _classifyError({ res, bodyText, parsedBody });
    throw new ProxyError(
      `proxy-client: HTTP ${res.status} from ${direct ? 'Anthropic' : 'proxy'}: ${(bodyText || '').slice(0, 300)}`,
      cls
    );
  }

  if (!parsedBody || !Array.isArray(parsedBody.content)) {
    throw new ProxyError(
      `proxy-client: malformed response — content array missing. Got: ${(bodyText || '').slice(0, 300)}`,
      { transient: false, category: 'malformed_response', status: res.status }
    );
  }

  const text = parsedBody.content
    .map(b => (b && typeof b.text === 'string') ? b.text : '')
    .join('');
  return text;
}

/**
 * Call Claude with exponential-backoff retry on transient ProxyErrors.
 *
 * @param {string} prompt
 * @param {object} options - all callClaude options PLUS:
 * @param {number} [options.maxAttempts=3]
 * @param {number} [options.baseDelayMs=1000]
 * @param {number} [options.jitterMs=300]  - additive jitter ([0, jitterMs))
 * @param {function} [options.onRetry=null] - (err, attempt) => void
 *
 * Retry policy: ProxyError with transient=true triggers a retry up to
 * maxAttempts. Non-ProxyError, non-transient ProxyError, and final-attempt
 * failures rethrow.
 *
 * Jitter is additive (never accelerates): finalDelay =
 * baseDelayMs * 2^(attempt-1) + Math.floor(Math.random() * jitterMs).
 * This preserves the invariant that we never retry sooner than the nominal
 * exponential delay; only later. Matches generate_distractors.cjs's pre-
 * existing 600ms+jitter behavior shape, modulo the additive-only choice
 * (the pre-existing inline impl used symmetric ±300ms).
 */
async function callClaudeWithRetry(prompt, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    jitterMs = 300,
    onRetry = null,
    ...callOpts
  } = options;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callClaude(prompt, callOpts);
    } catch (err) {
      lastErr = err;
      const shouldRetry =
        err instanceof ProxyError &&
        err.transient &&
        attempt < maxAttempts;
      if (!shouldRetry) throw err;
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
      if (typeof onRetry === 'function') {
        try { onRetry(err, attempt); } catch (_) { /* onRetry must never break retry loop */ }
      }
      await new Promise(r => setTimeout(r, exponentialDelay + jitter));
    }
  }
  throw lastErr;
}

module.exports = {
  callClaude,
  callClaudeWithRetry,
  ProxyError,
  _classifyError,
  PROXY_URL,
  PROXY_SECRET,
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
};
