import { describe, it, expect } from 'vitest';
import { TOPIC_NAMES, IMA_WEIGHTS, APP_VERSION, LS_KEY } from '../src/core/constants.js';

describe('constants', () => {
  it('has exactly 40 topics', () => {
    expect(TOPIC_NAMES.length).toBe(40);
  });

  it('has IMA weights matching topic count', () => {
    expect(IMA_WEIGHTS.length).toBe(40);
  });

  it('IMA weights sum to approximately 175', () => {
    const sum = IMA_WEIGHTS.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(150);
    expect(sum).toBeLessThan(200);
  });

  it('all IMA weights are positive', () => {
    IMA_WEIGHTS.forEach((w) => expect(w).toBeGreaterThan(0));
  });

  it('APP_VERSION is a valid semver-ish string', () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+$/);
  });

  it('LS_KEY is samega', () => {
    expect(LS_KEY).toBe('samega');
  });

  it('topics include all expected major geriatric domains', () => {
    const names = TOPIC_NAMES.join(' ').toLowerCase();
    expect(names).toContain('dementia');
    expect(names).toContain('falls');
    expect(names).toContain('delirium');
    expect(names).toContain('frailty');
    expect(names).toContain('polypharmacy');
    expect(names).toContain('palliative');
    expect(names).toContain('osteoporosis');
  });
});
