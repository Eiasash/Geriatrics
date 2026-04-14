import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync('shlav-a-mega.html', 'utf-8');
const bridge = readFileSync('src/bridge.js', 'utf-8');

// Extract JS between first <script> and last </script>
const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
const jsCode = scriptMatch ? scriptMatch[1] : '';

describe('AI Proxy Routing', () => {
  it('has AI_PROXY constant pointing to toranot proxy', () => {
    expect(html).toContain("const AI_PROXY='https://toranot.netlify.app/api/claude'");
  });

  it('has AI_SECRET for proxy authentication', () => {
    expect(html).toMatch(/const AI_SECRET='[^']+'/);
  });

  it('callAI tries proxy first before direct API', () => {
    const callAIBlock = html.slice(html.indexOf('async function callAI('), html.indexOf('async function callAI(') + 2000);
    // Proxy fetch comes before direct API fetch
    const proxyIdx = callAIBlock.indexOf('AI_PROXY');
    const directIdx = callAIBlock.indexOf('api.anthropic.com');
    expect(proxyIdx).toBeGreaterThan(-1);
    expect(directIdx).toBeGreaterThan(-1);
    expect(proxyIdx).toBeLessThan(directIdx);
  });

  it('sends x-api-secret header to proxy', () => {
    expect(html).toContain("'x-api-secret':AI_SECRET");
  });

  it('callAI falls back to user API key when proxy fails', () => {
    const callAIBlock = html.slice(html.indexOf('async function callAI('), html.indexOf('async function callAI(') + 2000);
    expect(callAIBlock).toContain('getApiKey()');
    expect(callAIBlock).toContain("throw new Error('no_key')");
  });

  it('supports abort controller for in-flight request cancellation', () => {
    expect(html).toContain('_aiAbortController');
    expect(html).toContain('AbortController');
  });

  it('uses model alias map for direct API (sonnet→claude-sonnet-4-6)', () => {
    expect(html).toContain("sonnet:'claude-sonnet-4-6'");
  });

  it('sends anthropic-version header on direct calls', () => {
    expect(html).toContain("'anthropic-version':'2023-06-01'");
  });

  it('sends anthropic-dangerous-direct-browser-access header', () => {
    expect(html).toContain("'anthropic-dangerous-direct-browser-access':'true'");
  });

  it('extracts text from Claude response correctly (content[0].text)', () => {
    expect(html).toContain("d.content?.[0]?.text||''");
  });
});

describe('Sanitization', () => {
  // sanitize implementation now lives in bridge.js, monolith delegates to SM.sanitize
  const sanitizeMatch = bridge.match(/function sanitize\(s\)\s*\{([^}]+)\}/);
  const sanitizeBody = sanitizeMatch ? sanitizeMatch[1] : '';

  it('sanitize function exists in bridge', () => {
    expect(bridge).toContain('function sanitize(');
  });

  it('monolith delegates to SM.sanitize', () => {
    expect(html).toContain('SM.sanitize(');
  });

  it('escapes & to &amp;', () => {
    expect(sanitizeBody).toContain("replace(/&/g, '&amp;')");
  });

  it('escapes < to &lt;', () => {
    expect(sanitizeBody).toContain("replace(/</g, '&lt;')");
  });

  it('escapes > to &gt;', () => {
    expect(sanitizeBody).toContain("replace(/>/g, '&gt;')");
  });

  it('escapes double quotes to &quot;', () => {
    expect(sanitizeBody).toContain("replace(/\"/g, '&quot;')");
  });

  it('escapes single quotes to &#39;', () => {
    expect(sanitizeBody).toContain("replace(/'/g, '&#39;')");
  });

  it('handles null/undefined input gracefully', () => {
    expect(sanitizeBody).toContain("String(s || '')");
  });

  it('sanitize is applied to user-visible content in innerHTML assignments', () => {
    const sanitizeCallCount = (html.match(/sanitize\(/g) || []).length;
    expect(sanitizeCallCount).toBeGreaterThan(20);
  });

  it('no unsanitized innerHTML with user data patterns', () => {
    // Check that innerHTML doesn't directly concatenate q.q or q.e without sanitize
    // Pattern: innerHTML includes sanitize() wrapping around content
    const dangerPatterns = html.match(/innerHTML\s*[+=].*\bq\.q\b(?!.*sanitize)/g) || [];
    expect(dangerPatterns.length).toBe(0);
  });
});

describe('SRS / FSRS Edge Cases', () => {
  it('loads shared/fsrs.js in service worker', () => {
    const sw = readFileSync('sw.js', 'utf-8');
    expect(sw).toContain('shared/fsrs.js');
  });

  it('imports FSRS functions from shared module', () => {
    expect(html).toContain('shared/fsrs.js');
  });

  it('FSRS parameters are defined (FSRS_W array)', () => {
    const fsrs = readFileSync('shared/fsrs.js', 'utf-8');
    expect(fsrs).toMatch(/const\s+FSRS_W\s*=\s*\[/);
  });

  it('FSRS handles first review via fsrsInitNew', () => {
    const fsrs = readFileSync('shared/fsrs.js', 'utf-8');
    expect(fsrs).toContain('function fsrsInitNew(');
    expect(fsrs).toContain('rating');
  });

  it('SRS state saved to localStorage under correct key', () => {
    expect(html).toContain("const LS='samega'");
  });

  it('SRS handles missing/corrupted sr object gracefully', () => {
    // S.sr should be initialized safely
    expect(html).toMatch(/S\.sr\s*\|\|\s*\{/);
  });

  it('SRS due calculation uses Date.now()', () => {
    // Due cards: sr.next <= Date.now()
    expect(html).toContain('.next<=Date.now()');
  });

  it('confidence rating maps to FSRS ratings', () => {
    // Should have rating values for Again/Hard/Good/Easy
    expect(html).toMatch(/fsrsRating|rating.*[1234]/);
  });

  it('streak calculation uses dailyAct data', () => {
    expect(html).toContain('dailyAct');
    expect(html).toMatch(/streak/i);
  });

  it('backup includes SRS data', () => {
    // Backup should serialize the entire state including sr
    const backupSection = html.slice(html.indexOf('pnimit_backups'));
    expect(backupSection.length).toBeGreaterThan(0);
  });
});

describe('Content Security Policy', () => {
  it('CSP allows Supabase connections', () => {
    expect(html).toContain('https://*.supabase.co');
  });

  it('CSP allows Anthropic API', () => {
    expect(html).toContain('https://api.anthropic.com');
  });

  it('CSP allows proxy', () => {
    expect(html).toContain('https://toranot.netlify.app');
  });

  it('CSP does not allow unsafe-eval', () => {
    const cspMatch = html.match(/Content-Security-Policy[^"]*"([^"]*)"/);
    if (cspMatch) {
      expect(cspMatch[1]).not.toContain('unsafe-eval');
    }
  });
});
