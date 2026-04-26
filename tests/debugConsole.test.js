import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(import.meta.dirname || '.', '..', 'shlav-a-mega.html'), 'utf8');

describe('debug console (v10.38.1)', () => {
  it('debug console init runs in the FIRST inline <script> block (before any other JS)', () => {
    const firstScript = html.indexOf('<script>');
    const debugInit = html.indexOf('initDebugConsole');
    expect(firstScript, '<script> tag exists').toBeGreaterThan(0);
    expect(debugInit, 'initDebugConsole present').toBeGreaterThan(0);
    // initDebugConsole must appear before any imported script (fsrs.js) and before
    // any inline JS that uses console.* — we verify it precedes the second <script> block
    const secondScriptOpen = html.indexOf('<script>', firstScript + 8);
    expect(debugInit, 'initDebugConsole before 2nd <script>').toBeLessThan(secondScriptOpen);
  });

  it('5-tap counter logic exists (taps array + corner check)', () => {
    expect(html).toMatch(/var taps\s*=\s*\[\]/);
    expect(html).toMatch(/taps\.length\s*>=\s*5/);
    expect(html).toMatch(/function corner\b/);
  });

  it('copy-to-clipboard handler exists with execCommand fallback', () => {
    expect(html).toMatch(/navigator\.clipboard\.writeText/);
    expect(html).toMatch(/document\.execCommand\(['"]copy['"]\)/);
  });

  it('exposes window.__debug API with show/report/buffer/clear', () => {
    expect(html).toMatch(/window\.__debug\s*=/);
    expect(html).toMatch(/show:\s*showDebugPanel/);
    expect(html).toMatch(/report:\s*function/);
    expect(html).toMatch(/buffer:\s*buffer/);
    expect(html).toMatch(/clear:\s*function/);
  });

  it('report format uses === DEBUG REPORT === plain-text headers', () => {
    expect(html).toMatch(/=== DEBUG REPORT ===/);
    expect(html).toMatch(/=== RECENT ERRORS/);
    expect(html).toMatch(/=== RECENT CONSOLE/);
    expect(html).toMatch(/=== RECENT NETWORK/);
    expect(html).toMatch(/=== RECENT ACTIONS/);
    expect(html).toMatch(/=== END REPORT ===/);
  });

  it('captures console + errors + fetch + clicks', () => {
    expect(html).toMatch(/\['log','info','warn','error','debug'\]\.forEach/);
    expect(html).toMatch(/window\.addEventListener\(['"]error['"]/);
    expect(html).toMatch(/window\.addEventListener\(['"]unhandledrejection['"]/);
    expect(html).toMatch(/window\.fetch\s*=\s*function/);
    expect(html).toMatch(/document\.addEventListener\(['"]click['"]/);
  });
});
