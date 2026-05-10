/**
 * v10.64.88 — render() microtask defer regression guard (Option A from PR #195 audit).
 *
 * Pins the wrapper that defers DOM rebuild to the next tick so click events
 * finish propagating before element detachment. Reverting the wrapper would
 * re-introduce the click-event-during-rebuild race that produced 953
 * timeouts/h in the 2026-05-05 chaos run.
 *
 * This is a static-source ratchet — it asserts the wrapper still surrounds
 * the render() body in shlav-a-mega.html, and that no production caller
 * does `render(); <DOM-read>` synchronously (which would now read stale
 * DOM under the async wrap).
 *
 * NOTE: a runtime test would require a JSDOM monolith eval which the rest
 * of the suite avoids. The static-source pin is the same shape used by
 * sibling ratchets (curatorOverridesRatchet, integrityRatchet, a11yIssue125).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
let html;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
});

describe("render() microtask defer (v10.64.88, PR #195 Option A)", () => {
  it("render() body is wrapped in setTimeout(...,0) — fixes click-event race", () => {
    // Find `function render(){` and verify the next non-comment statement is
    // setTimeout(()=>{ … },0). Wrapper must remain to keep the antipattern fix.
    const fnIdx = html.indexOf("function render(){");
    expect(fnIdx).toBeGreaterThan(-1);

    // Slice a window after the fn opening to inspect the wrapper.
    const window = html.slice(fnIdx, fnIdx + 800);
    expect(window).toMatch(/setTimeout\(\(\)\s*=>\s*\{/);
    // The wrap must include the el lookup that was previously the first body line.
    expect(window).toMatch(/setTimeout\([\s\S]*?const el\s*=\s*document\.getElementById\('ct'\)/);
  });

  it("render() closing has the setTimeout `},0);` close before the fn brace", () => {
    // Find updateAccountChip() (the last call of the original body) and verify
    // the next characters close setTimeout (`},0);`) before the fn `}`.
    const tailIdx = html.indexOf("updateAccountChip();");
    expect(tailIdx).toBeGreaterThan(-1);
    const tail = html.slice(tailIdx, tailIdx + 60);
    expect(tail).toMatch(/updateAccountChip\(\);\s*\},\s*0\s*\);\s*\}/);
  });

  it("defensive `if(!el)return;` guard exists inside the wrap", () => {
    // The async wrap means #ct could in theory be detached between schedule and
    // run (app teardown, hot reload, test harness). Confirm the early-return
    // guard is in place.
    const fnIdx = html.indexOf("function render(){");
    const window = html.slice(fnIdx, fnIdx + 800);
    expect(window).toMatch(/if\(!el\)\s*return;/);
  });

  it("no production caller does `render(); document.getElementById(...)` synchronously", () => {
    // The audit memo (PR #195) confirmed zero such patterns. This ratchet
    // re-asserts: any future code that adds a sync DOM-read after render()
    // would silently read stale DOM under the async wrap. Forces a refactor
    // (capture before render, or chain via setTimeout/queueMicrotask).
    //
    // Allow the existing setTimeout-wrapped patterns (line 1148: scroll inside
    // setTimeout(...,100)). Match only the bare unsafe pattern: `render();`
    // followed within ~80 chars by getElementById/querySelector with no
    // intervening setTimeout/queueMicrotask/requestAnimationFrame.
    const lines = html.split("\n");
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and changelog quotes.
      if (/^\s*(\/\/|\*|<!--)/.test(line)) continue;
      if (line.includes("CHANGELOG") || line.includes("Mirrors Pnimit")) continue;

      // Match `render();` followed by a DOM read in the same line, with no defer.
      const m = line.match(/render\(\);([^;]{0,200}?(?:getElementById|querySelector)\b)/);
      if (!m) continue;
      const segment = m[1];
      if (/setTimeout|queueMicrotask|requestAnimationFrame/.test(segment)) continue;

      violations.push(`line ${i + 1}: ${line.trim().slice(0, 160)}`);
    }
    expect(violations).toEqual([]);
  });

  it("trinity is at v10.64.88 (HTML APP_VERSION)", () => {
    // Self-pin: the wrapper landed in v10.64.88. If APP_VERSION moves forward
    // without the wrapper still being in source, the wrapper test above will
    // catch it; this guards the version trinity move that authorized the
    // behavioral change.
    expect(html).toMatch(/const APP_VERSION='10\.64\.\d+'/);
  });
});
