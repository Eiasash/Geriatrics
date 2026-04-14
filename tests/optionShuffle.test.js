import { describe, it, expect } from 'vitest';
import { shuffleOptions, originalIndex } from '../src/quiz/option-shuffle.js';

describe('shuffleOptions', () => {
  it('returns identity map for single option', () => {
    const { map, correctIndex } = shuffleOptions(['A'], 0);
    expect(map).toEqual([0]);
    expect(correctIndex).toBe(0);
  });

  it('returns identity map for empty options', () => {
    const { map } = shuffleOptions([], 0);
    expect(map).toEqual([]);
  });

  it('preserves all indices after shuffle', () => {
    const options = ['Option A', 'Option B', 'Option C', 'Option D'];
    const { map } = shuffleOptions(options, 0);
    expect(map.length).toBe(4);
    expect(map.sort()).toEqual([0, 1, 2, 3]);
  });

  it('maps correct answer index properly', () => {
    const options = ['Wrong 1', 'Wrong 2', 'Correct', 'Wrong 3'];
    const originalCorrect = 2;
    const { map, correctIndex } = shuffleOptions(options, originalCorrect);
    // The correct index should point to original position 2
    expect(map[correctIndex]).toBe(originalCorrect);
  });

  it('pins "All of the above" in its position', () => {
    const options = ['Alpha', 'Beta', 'Gamma', 'All of the above'];
    const { map } = shuffleOptions(options, 0);
    // Last option should stay pinned
    expect(map[3]).toBe(3);
  });

  it('pins Hebrew meta-option כל התשובות', () => {
    const options = ['אלפא', 'ביתא', 'גמא', 'כל התשובות נכונות'];
    const { map } = shuffleOptions(options, 0);
    expect(map[3]).toBe(3);
  });

  it('pins "None of the above"', () => {
    const options = ['X', 'Y', 'Z', 'None of the above'];
    const { map } = shuffleOptions(options, 0);
    expect(map[3]).toBe(3);
  });

  it('pins "A and B"', () => {
    const options = ['Drug X', 'Drug Y', 'Drug Z', 'A and B'];
    const { map } = shuffleOptions(options, 0);
    expect(map[3]).toBe(3);
  });

  it('returns identity when all options are meta-options', () => {
    const options = ['A and B', 'B and C', 'All of the above', 'None of the above'];
    const { map, correctIndex } = shuffleOptions(options, 1);
    expect(map).toEqual([0, 1, 2, 3]);
    expect(correctIndex).toBe(1);
  });

  it('handles null/undefined options gracefully', () => {
    expect(shuffleOptions(null, 0).map).toEqual([]);
    expect(shuffleOptions(undefined, 0).map).toEqual([]);
  });
});

describe('originalIndex', () => {
  it('maps display index back to original', () => {
    const map = [2, 0, 1, 3]; // display 0 shows original 2, etc.
    expect(originalIndex(map, 0)).toBe(2);
    expect(originalIndex(map, 1)).toBe(0);
    expect(originalIndex(map, 2)).toBe(1);
    expect(originalIndex(map, 3)).toBe(3);
  });

  it('returns display index when map is null', () => {
    expect(originalIndex(null, 2)).toBe(2);
  });

  it('handles out-of-bounds index', () => {
    expect(originalIndex([0, 1], 5)).toBe(5);
    expect(originalIndex([0, 1], -1)).toBe(-1);
  });
});
