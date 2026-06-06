/**
 * Guards the v10.64.158 security fixes:
 *  - F-02: the Anthropic API key must NOT be included in the cloud-sync payload
 *    (it is redundant — auth_login_user returns it on password-checked login —
 *    and backup_get is SECURITY DEFINER with no identity check, so syncing it
 *    made it exfiltratable by username guess).
 *  - F-03: the OnCall AI-explanation cache (_exCache) must be sanitized at
 *    render, and must tolerate both the string shape (runExplainOnCall) and the
 *    {text} shape (renderExplainBox).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(import.meta.dirname, '..', 'shlav-a-mega.html'), 'utf-8');

describe('F-02 — API key is not cloud-synced', () => {
  it('the cloudBackup payload (_bundled) does not include _apikey', () => {
    // Any _bundled literal that spreads _apikey reintroduces the exfiltration path.
    expect(html).not.toMatch(/_bundled\s*=\s*\{[^}]*_apikey[^}]*\}/);
  });

  it('still restores _apikey from legacy backups (backward-compat read kept)', () => {
    expect(html).toContain("if(typeof rowData._apikey==='string')setApiKey(rowData._apikey);");
  });
});

describe('F-03 — OnCall explanation cache is sanitized and schema-tolerant', () => {
  it('does not render the raw cached value into innerHTML', () => {
    expect(html).not.toContain('dir="${heDir(ex)}">${ex}</div>');
  });

  it('extracts text from either string or {text} shape and sanitizes it', () => {
    expect(html).toContain("const _exTxt=ex?(typeof ex==='string'?ex:(ex.text||'')):'';");
    expect(html).toContain('${sanitize(_exTxt)}');
  });
});
