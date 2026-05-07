/**
 * FSRS canonical drift guard.
 *
 * shared/fsrs.js is byte-identical across InternalMedicine, Geriatrics, and
 * FamilyMedicine. This test pins its md5 so any edit in one repo fails CI
 * until the other two are updated in lockstep.
 *
 * To update FSRS:
 *   1. Edit shared/fsrs.js (in all 3 repos with identical content).
 *   2. Run `md5sum shared/fsrs.js` and copy the hash below.
 *   3. Update CANONICAL_FSRS_MD5 in all 3 repos to the new value.
 *   4. Push to all 3 — none will go green until they all match.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const CANONICAL_FSRS_MD5 = "71f9f2d406a1935911e86612439ea58a";

describe("FSRS canonical drift guard", () => {
  it("shared/fsrs.js md5 matches the pinned canonical value", () => {
    const code = readFileSync(join(__dirname, "..", "shared", "fsrs.js"));
    const md5 = createHash("md5").update(code).digest("hex");
    expect(md5).toBe(CANONICAL_FSRS_MD5);
  });

  it("shared/fsrs.js still carries the lockstep warning", () => {
    const code = readFileSync(join(__dirname, "..", "shared", "fsrs.js"), "utf-8");
    expect(code).toContain("DO NOT EDIT IN INDIVIDUAL REPOS");
  });
});
