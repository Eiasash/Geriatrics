import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadQuestionsHydrated } from './_helpers/loadQuestionsHydrated.js';

const ROOT = resolve(import.meta.dirname, '..');
const questions = loadQuestionsHydrated(ROOT);

describe('Geri bot queue image-wiring guard', () => {
  const reviewedImageQueue = [65, 2384, 2633, 2716, 3069, 3280];

  it('keeps reviewed image-dependent queue items wired to a displayable image field', () => {
    for (const idx of reviewedImageQueue) {
      const q = questions[idx];
      expect(q, `idx ${idx} should exist`).toBeTruthy();
      expect(typeof q.img, `idx ${idx} should have q.img`).toBe('string');
      expect(q.img.length, `idx ${idx} should have a non-empty q.img`).toBeGreaterThan(0);
    }
  });

  it('replaces the stale May 2024 advanced hip-fracture URL with the live canonical object', () => {
    const q = questions[2384];
    expect(q.img).toBe(
      'https://krmlzwwelqvlfslwltol.supabase.co/storage/v1/object/public/question-images/geri_2024_may_subspec_q35.png',
    );
    expect(q.img).not.toContain('geri_2024_al_q35.png');
    expect(q.imgDep).not.toBe(true);
  });
});
