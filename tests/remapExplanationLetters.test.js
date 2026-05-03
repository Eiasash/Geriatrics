/**
 * v10.64.22 regression: remapExplanationLetters must remap option-letter
 * references in explanations after option shuffle, including BARE LABEL
 * forms like "א' שגויה" / "ב' נכונה" (not just the "תשובה X" form).
 *
 * Original bug: the regex only caught (תשובה\s*)([א-ה])\b which misses:
 *   - bare bullet labels: "**א' שגויה** — ..."
 *   - JS \b after Hebrew is unreliable (Hebrew chars not in ASCII \w)
 *
 * Real-world impact: explanations showed wrong option letter references
 * whenever options got shuffled. Example from idx=2841 (2024-May-Basic
 * stroke Q): the dataset's correct answer is "echo" at orig position ב=1.
 * After display shuffle, echo lands at display position ד=3. The
 * explanation said "אקו (תשובה ב')" but the user sees ECHO under ד —
 * mismatch, confusing.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

let remapExplanationLetters;

beforeAll(() => {
  // Extract the function from the monolith via a function-string snapshot.
  const html = readFileSync(resolve(import.meta.dirname, "..", "shlav-a-mega.html"), "utf-8");
  const m = html.match(/function remapExplanationLetters\(text,shuf\)\{[\s\S]+?\n\}/);
  if (!m) throw new Error("remapExplanationLetters not found in shlav-a-mega.html");
  // eslint-disable-next-line no-new-func
  remapExplanationLetters = new Function(`${m[0]}\nreturn remapExplanationLetters;`)();
});

describe("remapExplanationLetters — v10.64.22 fix", () => {
  // identity shuffle: orig 0,1,2,3 → display 0,1,2,3 — no remap should occur
  const identity = [0, 1, 2, 3];

  it("identity shuffle leaves text unchanged", () => {
    const text = "התשובה הנכונה היא ב'. א' שגויה. Answer C.";
    expect(remapExplanationLetters(text, identity)).toBe(text);
  });

  it("does not remap mid-word gershayim like \"מג'ורי\" (Major)", () => {
    const swap = [1, 0, 2, 3]; // א<>ב swap
    const text = "מאופיין על ידי דיכאון מג'ורי (Major Depression)";
    expect(remapExplanationLetters(text, swap)).toBe(text);
  });

  it("does not remap foreign-sound-at-word-start like \"ג'נטיקה\" (genetics)", () => {
    const swap = [1, 0, 2, 3];
    const text = "ג'נטיקה היא חשובה";
    expect(remapExplanationLetters(text, swap)).toBe(text);
  });

  it("remaps \"תשובה ב'\" form when option shuffled", () => {
    // shuf[disp]=orig: display position 3 holds original ב (idx=1). So inv[1]=3.
    const shuf = [3, 2, 0, 1];
    const text = "האפשרות הנכונה היא תשובה ב'.";
    const result = remapExplanationLetters(text, shuf);
    expect(result).toContain("תשובה ד'");
    expect(result).not.toContain("תשובה ב'");
  });

  it("remaps bare label \"א' שגויה\" form when option shuffled", () => {
    // shuf[0]=3 → inv[3]=0; shuf[2]=0 → inv[0]=2
    const shuf = [3, 2, 0, 1];
    const text = "- **א' שגויה** — דופלר צוואר רלוונטי\n- **ד' שגויה** — אנטיקואגולציה";
    const result = remapExplanationLetters(text, shuf);
    // א (orig 0) → display 2 = ג; ד (orig 3) → display 0 = א
    expect(result).toContain("ג' שגויה");
    expect(result).toContain("א' שגויה");
    expect(result).not.toMatch(/^- \*\*א' שגויה\*\* — דופלר/m);
  });

  it("remaps Latin standalone letters: \"Answer A\" / \"B is correct\"", () => {
    // shuf[disp]=orig: [2,0,1,3] → display 0 holds C, display 1 holds A, etc.
    // So inv[origA=0]=1=B, inv[origB=1]=2=C, inv[origC=2]=0=A.
    const shuf = [2, 0, 1, 3];
    expect(remapExplanationLetters("The answer is A.", shuf)).toBe("The answer is B.");
    expect(remapExplanationLetters("Choice B is correct.", shuf)).toBe("Choice C is correct.");
    expect(remapExplanationLetters("Option C is wrong.", shuf)).toBe("Option A is wrong.");
  });

  it("does not double-remap a letter in alternated patterns", () => {
    // "תשובה ב'" — first branch matches "תשובה ב", consumes through ב.
    // The trailing geresh + lookbehind keeps the second branch from firing.
    const swap = [1, 0, 2, 3]; // א<>ב swap
    const text = "תשובה ב' היא הנכונה";
    const result = remapExplanationLetters(text, swap);
    expect(result).toBe("תשובה א' היא הנכונה");
  });

  it("end-to-end on the v10.64.22 bug case (idx=2841 stroke explanation)", () => {
    // Dataset original order: [doppler, echo*, no-CT, anticoag] (c=1=echo)
    // Display shuffle puts: [anticoag, no-CT, doppler, echo] (echo at pos 3)
    // shuf[disp]=orig: [3, 2, 0, 1]
    const shuf = [3, 2, 0, 1];
    const e = `
לכן **אקו-לב (תשובה ב')** היא הבדיקה החשובה ביותר.

- **א' שגויה** — דופלר צוואר רלוונטי לאתרוסקלרוזיס.
- **ג' שגויה** — חובה לשלול דימום ב-CT.
- **ד' שגויה** — אנטיקואגולציה לא מתחילים אוטומטית.
`.trim();
    const result = remapExplanationLetters(e, shuf);
    // The correct answer (echo) was orig ב=1 → display ד=3
    expect(result).toContain("תשובה ד'");
    // Doppler (orig א=0) → display ג=2
    expect(result).toContain("ג' שגויה");
    // No-CT (orig ג=2) → display ב=1
    expect(result).toContain("ב' שגויה");
    // Anticoag (orig ד=3) → display א=0
    expect(result).toContain("א' שגויה");
  });
});
