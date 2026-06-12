import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve(import.meta.dirname, '..', 'shlav-a-mega.html'), 'utf8');

describe('mobile quiz and study controls', () => {
  it('renders advanced quiz filters through responsive classes', () => {
    expect(html).toContain('class="quiz-filter-pills scroll-fade-x" role="group" aria-label="Advanced quiz filters"');
    expect(html).toContain('.quiz-filter-pills{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));');
    expect(html).not.toContain('<div class="scroll-fade-x" style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:10px;');
  });

  it('renders Study sub-tabs through responsive tab classes', () => {
    expect(html).toContain('<div class="study-subnav" role="tablist" aria-label="Study sections">');
    expect(html).toContain('role="tab" aria-selected="${_on?\'true\':\'false\'}" class="study-subnav__btn ${_on?\'on\':\'\'}"');
    expect(html).toContain('.study-subnav{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));');
    expect(html).not.toContain("let _subBar='<div style=\"display:flex;gap:6px;overflow-x:auto;");
  });
});
