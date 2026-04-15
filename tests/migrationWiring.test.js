/**
 * Migration wiring tests — lightweight guardrails for the monolith cleanup.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
let html, scriptContent;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  scriptContent = scripts.map(m => m[1]).join("\n");
});

// ─── Render function orchestrators exist ───

describe("render function orchestrators exist", () => {
  const ORCHESTRATORS = [
    "renderQuiz", "renderTrack", "renderCalc", "renderLibrary",
    "renderStudy", "renderFlash", "renderDrugs", "renderSearch",
    "renderMedBasket", "renderEOLTree", "renderLabOverlay",
    "renderAgingSheet", "renderOnCall", "render", "renderTabs",
  ];
  for (const name of ORCHESTRATORS) {
    it(`${name} exists`, () => {
      expect(scriptContent).toMatch(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
    });
  }
});

// ─── S.ts stale-state regression guard ───

describe("S.ts stale-state bug", () => {
  it("S.ts is never referenced anywhere", () => {
    expect(scriptContent).not.toMatch(/S\.ts/);
  });
});

// ─── Core engine functions ───

describe("core engine functions exist", () => {
  const FNS = [
    "buildPool", "buildRescuePool", "buildMockExamPool",
    "getDueQuestions", "getWeakTopics", "srScore", "calcEstScore",
    "getStudyStreak", "trackDailyActivity", "getTopicStats",
    "getOptShuffle", "isExamTrap", "check", "next", "pick",
    "save", "sanitize", "callAI", "cloudBackup", "cloudRestore",
    "_storeDiff", "_updateWrongUI", "_sbDeviceId",
  ];
  for (const fn of FNS) {
    it(`${fn} exists`, () => {
      const p = new RegExp(`(?:(?:async\\s+)?function\\s+${fn.replace(/[$()*+.?[\\\]^{|}]/g,'\\$&')}\\s*\\(|(?:const|let|var)\\s+${fn.replace(/[$()*+.?[\\\]^{|}]/g,'\\$&')}\\s*=)`);
      expect(scriptContent).toMatch(p);
    });
  }
});

// ─── Decomposition: _rc* _rq* _rt* _rl* ───

function extractBody(sc, fnName) {
  const lines = sc.split("\n");
  const p = new RegExp(`function\\s+${fnName.replace(/[$()*+.?[\\\]^{|}]/g,'\\$&')}\\s*\\(`);
  const startIdx = lines.findIndex(l => p.test(l));
  if (startIdx < 0) return null;
  let body = "", depth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    body += lines[i] + "\n";
    depth += (lines[i].match(/\{/g) || []).length;
    depth -= (lines[i].match(/\}/g) || []).length;
    if (depth <= 0 && i > startIdx) break;
  }
  return body;
}

describe("renderCalc → _rc* helpers", () => {
  const H = ["_rcCrCl","_rcChads","_rcCurb","_rcGds","_rcBraden","_rcPadua","_rcKatz","_rcLawton","_rc4at","_rcMna","_rcCfs","_rcNorton","_rcMorse"];
  for (const n of H) { it(`${n} exists`, () => { expect(scriptContent).toMatch(new RegExp(`function\\s+${n.replace(/[$()*+.?[\\\]^{|}]/g,'\\$&')}\\s*\\(`)); }); }
  it("renderCalc calls all helpers", () => { const b = extractBody(scriptContent, "renderCalc"); for (const n of H) expect(b).toContain(n+"()"); });
});

describe("renderQuiz → _rq* helpers", () => {
  const H = ["_rqSuddenDeath","_rqMain"];
  for (const n of H) { it(`${n} exists`, () => { expect(scriptContent).toMatch(new RegExp(`function\\s+${n}\\s*\\(`)); }); }
  it("renderQuiz calls helpers", () => { const b = extractBody(scriptContent, "renderQuiz"); for (const n of H) expect(b).toContain(n+"("); });
});

describe("renderTrack → _rt* helpers", () => {
  const H = ["_rtTop","_rtMid","_rtProgress","_rtFooter"];
  for (const n of H) { it(`${n} exists`, () => { expect(scriptContent).toMatch(new RegExp(`function\\s+${n}\\s*\\(`)); }); }
  it("renderTrack calls all helpers", () => { const b = extractBody(scriptContent, "renderTrack"); for (const n of H) expect(b).toContain(n+"("); });
});

describe("renderLibrary → _rl* helpers", () => {
  const H = ["_rlHeader","_rlHazzard","_rlHarrison","_rlLaws","_rlArticles","_rlExams","_rlFooter"];
  for (const n of H) { it(`${n} exists`, () => { expect(scriptContent).toMatch(new RegExp(`function\\s+${n}\\s*\\(`)); }); }
  it("renderLibrary calls all helpers", () => { const b = extractBody(scriptContent, "renderLibrary"); for (const n of H) expect(b).toContain(n+"("); });
});

// ─── Inline handler baseline ───

describe("inline handler counts are stable", () => {
  it("onclick 140–200", () => { const c = (html.match(/onclick=/g)||[]).length; expect(c).toBeGreaterThanOrEqual(140); expect(c).toBeLessThanOrEqual(200); });
  it("onchange 15–40", () => { const c = (html.match(/onchange=/g)||[]).length; expect(c).toBeGreaterThanOrEqual(15); expect(c).toBeLessThanOrEqual(40); });
  it("total ≤250", () => { const t = (html.match(/onclick=/g)||[]).length+(html.match(/onchange=/g)||[]).length+(html.match(/oninput=/g)||[]).length; expect(t).toBeLessThanOrEqual(250); });
});

// ─── Function count floor ───

describe("function count floor", () => {
  it("≥170 named functions", () => {
    const fns = scriptContent.match(/(?:async\s+)?function\s+\w+\s*\(/g) || [];
    expect(fns.length).toBeGreaterThanOrEqual(170);
  });
});

// ─── _rqMain → _rqm* helpers ───
describe("_rqMain → _rqm* helpers", () => {
  const H = ["_rqmQuestion","_rqmControls","_rqmTeachBack","_rqmExplain","_rqmFooter"];
  for (const n of H) { it(`${n} exists`, () => { expect(scriptContent).toMatch(new RegExp(`function\\s+${n}\\s*\\(`)); }); }
  it("_rqMain calls all helpers", () => { const b = extractBody(scriptContent, "_rqMain"); for (const n of H) expect(b).toContain(n+"("); });
});
