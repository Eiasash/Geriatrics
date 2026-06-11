import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const html = readFileSync(
  resolve(import.meta.dirname, '..', 'shlav-a-mega.html'),
  'utf-8'
);

describe('minimal mode routing guard', () => {
  it('does not hide the tab bar unless an explicit minimal URL signal is present', () => {
    expect(html).toContain("p.get('minimal')==='1'");
    expect(html).toContain("p.get('mode')==='minimal'");
    expect(html).toContain("location.hash==='#minimal'");
    expect(html).toContain("document.body.classList.add('minimal-mode')");
    expect(html).toContain('body.minimal-mode .tabs{display:none!important}');
    expect(html).not.toMatch(/(^|\n)\.tabs\{display:none!important\}/);
  });

  it('forces quiz rendering only after minimal mode is enabled', () => {
    expect(html).toContain("if(MINIMAL_MODE&&tab!=='quiz')tab='quiz';");
  });

  it('normalizes tab before render uses lastTab or switch(tab)', () => {
    const guard = html.indexOf("if(MINIMAL_MODE&&tab!=='quiz')tab='quiz';");
    const lastTabCheck = html.indexOf('if(tab!==lastTab)', guard);
    const tabSwitch = html.indexOf('switch(tab)', guard);
    expect(guard).toBeGreaterThan(-1);
    expect(lastTabCheck).toBeGreaterThan(guard);
    expect(tabSwitch).toBeGreaterThan(guard);
  });
});
