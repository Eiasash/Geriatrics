/**
 * Guards the v10.64.160 #353 fix: API-key account sync at save time.
 *
 * Background: the v10.64.158 security fix removed _apikey from the cloud
 * backup payload, which also severed the only WRITE path into
 * app_users.api_key (the sync_api_key_from_backup trigger fed off backup
 * writes). A key saved or rotated after .158 stayed localStorage-only and
 * auth_login_user restored a stale/null key on the next device (Codex P2
 * on IM #167 / FM #142).
 *
 * The fix wires the settings Save/Remove buttons through
 * _apiKeySaveFromInput / _apiKeyRemove, which save locally FIRST and then
 * offer account sync via the auth_set_api_key RPC (re-auth required).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(resolve(import.meta.dirname, '..', 'shlav-a-mega.html'), 'utf-8');

describe('#353 — API-key account sync wiring', () => {
  it('settings Save button routes through _apiKeySaveFromInput', () => {
    expect(html).toContain('onclick="_apiKeySaveFromInput()"');
    // The old inline save (setApiKey straight from the input) must be gone.
    expect(html).not.toContain("onclick=\"var v=document.getElementById('apiKeyInput').value.trim();if(v){setApiKey(v);render();}\"");
  });

  it('settings Remove button routes through _apiKeyRemove', () => {
    expect(html).toContain('onclick="_apiKeyRemove()"');
    expect(html).not.toContain('onclick="setApiKey(\'\');render()"');
  });

  it('auth IIFE exposes _authSyncApiKey and calls auth_set_api_key with the RPC arg names', () => {
    expect(html).toContain('_authSyncApiKey:_syncApiKey');
    expect(html).toMatch(/_rpc\('auth_set_api_key',\{p_username:u\.username,p_password:p,p_api_key:k\|\|''\}\)/);
  });

  it('sync requires a logged-in session and treats prompt-cancel as device-only', () => {
    expect(html).toContain("if(!u) return {ok:false,error:'not_logged_in'};");
    expect(html).toContain("if(!p) return {ok:false,error:'cancelled'};");
  });

  it('local save happens BEFORE the sync attempt (network can never block the save)', () => {
    const saveFn = html.slice(html.indexOf('async function _apiKeySaveFromInput'), html.indexOf('async function _apiKeyRemove'));
    const localSave = saveFn.indexOf('setApiKey(v)');
    const sync = saveFn.indexOf('_authSyncApiKey');
    expect(localSave).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(-1);
    expect(localSave).toBeLessThan(sync);
  });

  it('remove clears locally first, then offers to clear the account copy', () => {
    const removeFn = html.slice(html.indexOf('async function _apiKeyRemove'), html.indexOf('async function _apiKeyRemove') + 1200);
    const localClear = removeFn.indexOf("setApiKey('')");
    const sync = removeFn.indexOf('_authSyncApiKey');
    expect(localClear).toBeGreaterThan(-1);
    expect(sync).toBeGreaterThan(-1);
    expect(localClear).toBeLessThan(sync);
  });

  it('v10.64.158 regression locks stay intact (no _apikey back in the backup payload)', () => {
    expect(html).not.toMatch(/_bundled\s*=\s*\{[^}]*_apikey[^}]*\}/);
    // Login restore survives; legacy backup restore is FILL-ONLY (#354 P2) —
    // a backup _apikey is pre-.158-stale and must never clobber a present key.
    expect(html).toContain("if(typeof r.api_key==='string') setApiKey(r.api_key);");
    expect(html).toContain("if(typeof rowData._apikey==='string'&&!getApiKey())setApiKey(rowData._apikey);");
  });

  it('has-key state offers a sync-to-account button for logged-in users (#354 P2)', () => {
    expect(html).toContain('onclick="_apiKeySyncExisting()"');
    const fn = html.slice(html.indexOf('async function _apiKeySyncExisting'), html.indexOf('async function _apiKeyRemove'));
    expect(fn).toContain('const k=getApiKey()');
    expect(fn).toContain('window._authSyncApiKey(k)');
  });
});
