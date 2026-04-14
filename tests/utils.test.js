import { describe, it, expect } from 'vitest';
import { sanitize, fmtT } from '../src/core/utils.js';

describe('sanitize', () => {
  it('escapes HTML entities', () => {
    expect(sanitize('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });

  it('escapes ampersands', () => {
    expect(sanitize('a & b')).toBe('a &amp; b');
  });

  it('escapes single quotes', () => {
    expect(sanitize("it's")).toBe('it&#39;s');
  });

  it('handles null/undefined gracefully', () => {
    expect(sanitize(null)).toBe('');
    expect(sanitize(undefined)).toBe('');
    expect(sanitize('')).toBe('');
  });

  it('converts numbers to string', () => {
    expect(sanitize(42)).toBe('42');
  });

  it('handles Hebrew text unchanged', () => {
    expect(sanitize('שלום עולם')).toBe('שלום עולם');
  });
});

describe('fmtT', () => {
  it('formats seconds as mm:ss', () => {
    expect(fmtT(0)).toBe('00:00');
    expect(fmtT(90)).toBe('01:30');
    expect(fmtT(65)).toBe('01:05');
    expect(fmtT(5)).toBe('00:05');
  });

  it('formats with hours when >= 3600', () => {
    expect(fmtT(3600)).toBe('1:00:00');
    expect(fmtT(3661)).toBe('1:01:01');
    expect(fmtT(7200)).toBe('2:00:00');
  });

  it('pads minutes and seconds', () => {
    expect(fmtT(61)).toBe('01:01');
    expect(fmtT(3601)).toBe('1:00:01');
  });
});
