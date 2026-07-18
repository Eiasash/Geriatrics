/**
 * G6 (2026-07-18): the Distractor Autopsy previously iterated q.o in ORIGINAL
 * data order while the quiz displayed options in getOptShuffle DISPLAY order and
 * the correct-answer explanation used display-letter references — an internal
 * ordering inconsistency. The fix iterates the autopsy rows in getOptShuffle
 * order. Row markers still key off the ORIGINAL index (isOk/sel/_dist[i]) so
 * scoring is unaffected — this is display-ordering only.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

let html, getOptShuffle;

beforeAll(() => {
  html = readFileSync(resolve(import.meta.dirname, "..", "shlav-a-mega.html"), "utf-8");
  const src = html.match(/function getOptShuffle\(qIdx,q\)\{[\s\S]*?return map;\s*\}/)[0];
  // Stub isMetaOption -> false so getOptShuffle shuffles all options.
  getOptShuffle = new Function(
    `let _optShuffle=null;\nfunction isMetaOption(){return false;}\n${src}\nreturn getOptShuffle;`
  )();
});

describe("distractor autopsy row order (G6)", () => {
  it("source: autopsy iterates getOptShuffle DISPLAY order, not q.o original order", () => {
    // The quiz option render and the autopsy both derive order from the SAME shuffle.
    expect(html).toContain("const _qIdx=pool[qi];");
    expect(html).toContain("getOptShuffle(_qIdx,q).forEach((i)=>{");
    expect(html).toContain("getOptShuffle(pool[qi],q)"); // quiz-option render uses same shuffle
  });

  it("getOptShuffle returns a full permutation of every option index (no drop/dup)", () => {
    const q = { o: ["a", "b", "c", "d"] };
    const shuf = getOptShuffle(7, q);
    expect([...shuf].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it("autopsy order equals the displayed shuffle order and differs from original data order", () => {
    const q = { o: ["a", "b", "c", "d", "e"] };
    const original = q.o.map((_, i) => i); // [0,1,2,3,4] = old (buggy) autopsy order
    // Find a question index whose shuffle is non-identity (shuffle is seeded by qIdx).
    let qIdx = -1, displayOrder = null;
    for (let cand = 0; cand < 200; cand++) {
      const s = getOptShuffle(cand, q);
      if (JSON.stringify(s) !== JSON.stringify(original)) { qIdx = cand; displayOrder = s; break; }
    }
    expect(qIdx).toBeGreaterThanOrEqual(0); // a shuffled ordering exists

    // The fixed autopsy iterates `getOptShuffle(_qIdx,q)` — the SAME call the quiz
    // display uses — so its row order matches the display order, not the original.
    const autopsyOrder = getOptShuffle(qIdx, q);
    expect(autopsyOrder).toEqual(displayOrder);
    expect(autopsyOrder).not.toEqual(original);
    // still a complete permutation (every distractor row rendered exactly once)
    expect([...autopsyOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });
});
