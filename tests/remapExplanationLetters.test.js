/**
 * G5 (2026-07-18) — remapExplanationLetters is now KEYWORD-ANCHORED.
 *
 * remapExplanationLetters(text, shuf) translates option-letter references from a
 * question's ORIGINAL option order to the deterministic display order. The
 * translation is correct; the DEFECT was that the Latin form matched ANY
 * standalone A-E (\b[A-E]\b), so it corrupted clinical tokens whenever the
 * shuffle moved that index: "vitamin D"->"vitamin A", "34.2°C" (the C),
 * "hepatitis B", "class A", SARC-F "**C**", "type A/B", "grade A-C". The bare
 * Hebrew label form ([א-ה]') could likewise corrupt "יום ב'"/"שלב ג'"/"דרגה א'".
 * A prior analysis proved NO free-text regex can separate real bare-letter refs
 * from these medical tokens.
 *
 * APPROVED FIX: remap ONLY where a letter is UNAMBIGUOUSLY an option reference
 * because it is immediately anchored to an explicit option keyword —
 *   Hebrew: תשובה / תשובות / (תשובה) נכונה / סעיף / אפשרות / מסיח
 *   Latin:  answer / option / choice
 * In those contexts a clinical token can never appear, so remap is provably safe.
 * BARE letters with no keyword anchor are HELD (left byte-for-byte): the correct
 * option is already marked green (isOk), so a desynced letter is
 * confusing-but-not-wrong, whereas a corrupted clinical token is unacceptable.
 *
 * (Full-corpus proof — every shipped explanation × identity + seeded shuffles —
 * lives in .work/captain/g5-corpus-validate.mjs: NEW changes ZERO medical tokens.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

let remap;

beforeAll(() => {
  // Extract the function from the monolith via a function-string snapshot.
  const html = readFileSync(resolve(import.meta.dirname, "..", "shlav-a-mega.html"), "utf-8");
  const m = html.match(/function remapExplanationLetters\(text,shuf\)\{[\s\S]+?\n\}/);
  if (!m) throw new Error("remapExplanationLetters not found in shlav-a-mega.html");
  // eslint-disable-next-line no-new-func
  remap = new Function(`${m[0]}\nreturn remapExplanationLetters;`)();
});

describe("remapExplanationLetters — G5 positive (keyword-anchored refs remap)", () => {
  it("identity shuffle leaves text unchanged", () => {
    const text = "תשובה C. answer B. סעיף A.";
    expect(remap(text, [0, 1, 2, 3])).toBe(text);
  });

  it("remaps 'תשובה C' (Hebrew keyword + Latin letter — the corpus-common form)", () => {
    // shuf[disp]=orig: [2,0,1,3] => inv[C=2]=0=A
    expect(remap("תשובה C שגויה", [2, 0, 1, 3])).toBe("תשובה A שגויה");
  });

  it("remaps 'answer C' (Latin keyword + Latin letter)", () => {
    expect(remap("answer C", [2, 0, 1, 3])).toBe("answer A");
  });

  it("remaps 'תשובה ב'' (Hebrew keyword + Hebrew letter + geresh)", () => {
    // shuf [3,2,0,1] => inv[ב=1]=3=ד
    expect(remap("האפשרות הנכונה היא תשובה ב'.", [3, 2, 0, 1])).toContain("תשובה ד'");
    expect(remap("האפשרות הנכונה היא תשובה ב'.", [3, 2, 0, 1])).not.toContain("תשובה ב'");
  });

  it("remaps 'סעיף' / 'אפשרות' / 'מסיח' anchors", () => {
    const swap = [1, 0, 2, 3]; // א<->ב, A<->B
    expect(remap("סעיף A", swap)).toBe("סעיף B");
    expect(remap("אפשרות B", swap)).toBe("אפשרות A");
    expect(remap("מסיח A", swap)).toBe("מסיח B");
  });

  it("remaps 'Choice B' / 'Option C'", () => {
    const shuf = [2, 0, 1, 3]; // inv[B=1]=2=C, inv[C=2]=0=A
    expect(remap("Choice B is correct.", shuf)).toBe("Choice C is correct.");
    expect(remap("Option C is wrong.", shuf)).toBe("Option A is wrong.");
  });

  it("remaps Hebrew letter directly followed by ASCII letter 'תשובה אcorrect'", () => {
    // shuf [1,2,0,3] => inv[א=0]=2=ג
    expect(remap("תשובה אcorrect", [1, 2, 0, 3])).toBe("תשובה גcorrect");
  });

  it("remaps Hebrew letter directly followed by whitespace 'תשובה א נכונה'", () => {
    expect(remap("תשובה א נכונה", [1, 2, 0, 3])).toBe("תשובה ג נכונה");
  });

  it("does not double-remap 'תשובה ב'' in alternated patterns", () => {
    const swap = [1, 0, 2, 3]; // ב(1) -> disp 0 = א
    expect(remap("תשובה ב' היא הנכונה", swap)).toBe("תשובה א' היא הנכונה");
  });
});

describe("remapExplanationLetters — G5 held (bare refs, no keyword anchor)", () => {
  const shuf = [3, 2, 0, 1];

  it("HOLDS bare Hebrew label 'א' שגויה' (no keyword anchor)", () => {
    const text = "- **א' שגויה** — דופלר צוואר\n- **ד' שגויה** — אנטיקואגולציה";
    expect(remap(text, shuf)).toBe(text);
  });

  it("HOLDS bare Latin bullet labels '**A** —' / '**B** —'", () => {
    const text = "- **A** — דלוזיות\n- **B** — נפילות\n- **C** — דיכאון";
    expect(remap(text, [2, 0, 1, 3])).toBe(text);
  });

  it("HOLDS 'The answer is A' (keyword not immediately adjacent to the letter)", () => {
    expect(remap("The answer is A.", [2, 0, 1, 3])).toBe("The answer is A.");
  });
});

describe("remapExplanationLetters — G5 negative (medical tokens NEVER corrupted)", () => {
  // Maps chosen so that, if the old bare-letter forms were still active, the
  // token's letter WOULD move — these assertions prove the corruption is gone.
  const maps = [[3, 2, 0, 1], [1, 2, 3, 4, 0], [2, 0, 1, 3]];

  const unchanged = (s) => {
    for (const map of maps) expect(remap(s, map), `token corrupted under map ${JSON.stringify(map)}`).toBe(s);
  };

  it("does not corrupt 'ויטמין A'..'ויטמין E' / 'vitamin A'..'vitamin E'", () => {
    for (const L of ["A", "B", "C", "D", "E"]) { unchanged("ויטמין " + L); unchanged("vitamin " + L); }
  });

  it("does not corrupt '34.2°C' / '°C' / '°F'", () => {
    unchanged("34.2°C"); unchanged("°C"); unchanged("°F"); unchanged("חום 34.2°C בקבלה");
  });

  it("does not corrupt 'hepatitis A'..'hepatitis E'", () => {
    for (const L of ["A", "B", "C", "D", "E"]) unchanged("hepatitis " + L);
  });

  it("does not corrupt SARC-F incl. the bare '**C**' mnemonic", () => {
    unchanged("SARC-F");
    unchanged("שאלון SARC-F כולל **S**trength ו-**C**limb stairs ו-**F**alls");
  });

  it("does not corrupt 'class A' / 'type A/B' / 'grade A'-'grade C' / 'part A/B'", () => {
    unchanged("class A"); unchanged("type A/B"); unchanged("grade A"); unchanged("grade B");
    unchanged("grade C"); unchanged("part A"); unchanged("Medicare part A/B");
  });

  it("does not corrupt Hebrew 'שלב ב'' / 'דרגה א'' / 'יום ב'' (day-of-week)", () => {
    unchanged("המחלה בשלב ב'"); unchanged("כוויה מדרגה א'"); unchanged("ביום ב' התייצב");
  });

  it("does not remap mid-word gershayim 'מג'ורי' or foreign-sound 'ג'נטיקה'", () => {
    unchanged("דיכאון מג'ורי (Major Depression)");
    unchanged("ג'נטיקה היא חשובה");
  });
});

describe("remapExplanationLetters — G5 end-to-end (real bug case idx=2841)", () => {
  it("remaps the keyword-anchored 'תשובה ב'' to display ד' and HOLDS bare labels", () => {
    // Dataset original order: [doppler, echo*, no-CT, anticoag] (c=1=echo).
    // Display shuffle puts echo at display ד=3 → shuf[disp]=orig = [3,2,0,1].
    const shuf = [3, 2, 0, 1];
    const text = [
      "לכן **אקו-לב (תשובה ב')** היא הבדיקה החשובה ביותר.",
      "",
      "- **א' שגויה** — דופלר צוואר רלוונטי לאתרוסקלרוזיס.",
      "- **ג' שגויה** — חובה לשלול דימום ב-CT.",
      "- **ד' שגויה** — אנטיקואגולציה לא מתחילים אוטומטית.",
    ].join("\n");
    const expected = [
      "לכן **אקו-לב (תשובה ד')** היא הבדיקה החשובה ביותר.",
      "",
      "- **א' שגויה** — דופלר צוואר רלוונטי לאתרוסקלרוזיס.",
      "- **ג' שגויה** — חובה לשלול דימום ב-CT.",
      "- **ד' שגויה** — אנטיקואגולציה לא מתחילים אוטומטית.",
    ].join("\n");
    // Only the keyword-anchored "תשובה ב'" moves (ב orig=1 -> display ד=3);
    // the bare "א'/ג'/ד' שגויה" bullet labels are HELD byte-for-byte.
    expect(remap(text, shuf)).toBe(expected);
  });
});
