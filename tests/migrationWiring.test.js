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

// ─── Runtime scope tests ─────────────────────────────────────────────
// Catches bugs where a function is DECLARED inside the script (so a regex
// match passes) but is not actually visible at top-level scope. This
// happens when:
//   1. A nested function declaration gets misplaced inside a parent (e.g.
//      _rlHazzard ended up inside _rlHeader due to a wrong brace).
//   2. A multi-line template literal swallows a function declaration (e.g.
//      _rlFooter ended up inside an unterminated `…` string).
// Both bugs shipped in v9.50 and broke the Library tab. The regex-based
// "exists" checks above could not detect them. These tests execute the
// library helper block in isolation and verify top-level scope.

describe("runtime scope — library helpers are top-level functions", () => {
  const LIB_FNS = ["_rlHeader","_rlHazzard","_rlHarrison","_rlLaws","_rlArticles","_rlExams","_rlFooter","renderLibrary"];
  let libCode;
  beforeAll(() => {
    const lines = scriptContent.split("\n");
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("// ===== LIBRARY HELPERS")) { start = i; break; }
    }
    let inRender = false, depth = 0, end = -1;
    for (let i = start; i < lines.length; i++) {
      if (/^function renderLibrary\(\)/.test(lines[i])) { inRender = true; depth = 0; }
      if (inRender) {
        for (const c of lines[i]) {
          if (c === "{") depth++;
          else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end !== -1) break;
      }
    }
    libCode = lines.slice(start, end + 1).join("\n");
  });

  for (const name of LIB_FNS) {
    it(`${name} is a top-level function`, () => {
      const harness = `
        let libSec='haz-pdf', hazChOpen=null, _hazData=null, _hazLoading=false;
        let harChOpen=null, _harData=null, _harLoading=false;
        const TOPIC_REF={}, QZ=[], HAZ_CHAPTERS={}, HAZZARD_MARKED_PARTS=[];
        const SYL_HAR_ALL=[], SYL_HAR_BASE=[];
        const SYL_LAWS=[], SYL_ARTICLES=[], SYL_EXAMS=[];
        function getTopicStats(){return{};}
        ${libCode}
        return typeof ${name};
      `;
      const t = new Function(harness)();
      expect(t).toBe("function");
    });
  }

  it("renderLibrary runs for every libSec value without throwing", () => {
    for (const sec of ["haz-pdf","harrison","laws","articles","exams"]) {
      const harness = `
        let libSec='${sec}', hazChOpen=null, _hazData=null, _hazLoading=false;
        let harChOpen=null, _harData=null, _harLoading=false;
        const TOPIC_REF={}, QZ=[], HAZ_CHAPTERS={}, HAZZARD_MARKED_PARTS=[];
        const SYL_HAR_ALL=[], SYL_HAR_BASE=[];
        const SYL_LAWS=[], SYL_ARTICLES=[], SYL_EXAMS=[];
        function getTopicStats(){return{};}
        ${libCode}
        const r = renderLibrary();
        return { len: r.length, hasUndef: r.includes('undefined') };
      `;
      const r = new Function(harness)();
      expect(r.len).toBeGreaterThan(100);
      expect(r.hasUndef).toBe(false);
    }
  });
});
