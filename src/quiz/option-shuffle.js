/**
 * Option shuffle logic for quiz questions.
 *
 * Shuffles answer options per question while pinning meta-options
 * like "All of the above" / "כל התשובות" to their original position.
 *
 * Pure function — no DOM dependencies.
 */

/**
 * Meta-option patterns that should stay pinned in their original position.
 * These are typical "all/none of the above" style options in Hebrew and English.
 */
const META_PATTERNS = [
  /^all\s+(of\s+)?the\s+above/i,
  /^none\s+(of\s+)?the\s+above/i,
  /^a\s+and\s+b/i,
  /^a,?\s*b,?\s*(and|&)\s*c/i,
  /^b\s+and\s+c/i,
  /^both\s+(a|b)/i,
  /כל\s*התשובות/,
  /אף\s*תשובה/,
  /תשובות?\s*(א|1)\s*(ו|ו-?)\s*(ב|2)/,
  /תשובות?\s*(ב|2)\s*(ו|ו-?)\s*(ג|3)/,
  /תשובות?\s*(א|1),?\s*(ב|2),?\s*(ו|ו-?)\s*(ג|3)/,
];

/**
 * Check if an option text is a meta-option that should be pinned.
 */
function isMetaOption(text) {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  return META_PATTERNS.some((re) => re.test(trimmed));
}

/**
 * Generate a shuffle map for a question's options.
 *
 * @param {string[]} options - The option texts (q.o array)
 * @param {number} correctIndex - The correct answer index (q.c)
 * @returns {{ map: number[], correctIndex: number }} Shuffle map and new correct index
 *
 * map[displayPosition] = originalIndex
 * e.g., if map = [2, 0, 1, 3], display slot 0 shows original option 2
 */
export function shuffleOptions(options, correctIndex) {
  if (!options || options.length <= 1) {
    return { map: options ? options.map((_, i) => i) : [], correctIndex };
  }

  const n = options.length;
  const pinned = new Set();
  const unpinned = [];

  // Identify pinned meta-options
  options.forEach((opt, i) => {
    if (isMetaOption(opt)) {
      pinned.add(i);
    } else {
      unpinned.push(i);
    }
  });

  // If all are pinned or only 1 unpinned, no meaningful shuffle
  if (unpinned.length <= 1) {
    return { map: options.map((_, i) => i), correctIndex };
  }

  // Shuffle unpinned indices
  const shuffled = [...unpinned];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // Build the map: pinned stay in place, unpinned fill remaining slots
  const map = new Array(n);
  let si = 0;
  for (let i = 0; i < n; i++) {
    if (pinned.has(i)) {
      map[i] = i; // pinned in place
    } else {
      map[i] = shuffled[si++];
    }
  }

  // Find new correct index
  const newCorrectIndex = map.indexOf(correctIndex);

  return { map, correctIndex: newCorrectIndex };
}

/**
 * Get the original index from a display index using a shuffle map.
 */
export function originalIndex(map, displayIndex) {
  if (!map || displayIndex < 0 || displayIndex >= map.length) return displayIndex;
  return map[displayIndex];
}
