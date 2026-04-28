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
    "renderMedBasket", "renderOnCall", "render", "renderTabs",
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

describe("renderCalc collapsed to renderMedBasket", () => {
  it("renderCalc returns renderMedBasket()", () => { const b = extractBody(scriptContent, "renderCalc"); expect(b).toContain("renderMedBasket()"); });
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
  // v10.51.0: bumped onclick ceiling 230→240 + total 260→275 to absorb the
  // new wrong-answer Review CTA, the SVG topic-heatmap cell click handlers,
  // and the source-link buttons (3 features × ~3 inline handlers each).
  it("onclick 140–240", () => { const c = (html.match(/onclick=/g)||[]).length; expect(c).toBeGreaterThanOrEqual(140); expect(c).toBeLessThanOrEqual(240); });
  it("onchange 3–40", () => { const c = (html.match(/onchange=/g)||[]).length; expect(c).toBeGreaterThanOrEqual(3); expect(c).toBeLessThanOrEqual(40); });  // v10.56.0: floor lowered after calculator deletion
  it("total ≤275", () => { const t = (html.match(/onclick=/g)||[]).length+(html.match(/onchange=/g)||[]).length+(html.match(/oninput=/g)||[]).length; expect(t).toBeLessThanOrEqual(275); });
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
// "exists" checks above could not detect them. These tests slice each
// orchestrator's helper block, evaluate it in isolation, and assert
// typeof === "function" at global scope.

function sliceHelperBlock(scriptContent, startMarker, orchestratorName) {
  const lines = scriptContent.split("\n");
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(startMarker)) { start = i; break; }
  }
  if (start < 0) return null;
  const re = new RegExp(`^function\\s+${orchestratorName}\\s*\\(`);
  let inOrch = false, depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    if (re.test(lines[i])) { inOrch = true; depth = 0; }
    if (inOrch) {
      for (const c of lines[i]) {
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end !== -1) break;
    }
  }
  if (end < 0) return null;
  return lines.slice(start, end + 1).join("\n");
}

// Permissive harness: any unknown global resolves to a chainable stub.
// This lets us evaluate helper blocks without stubbing every app global
// by hand. We only care about scope (typeof === "function"), not behavior.
function buildScopeHarness(helperBlock, targetName) {
  return `
    const __stubHandler = {
      get(target, prop) {
        if (prop === Symbol.toPrimitive || prop === "toString" || prop === "valueOf") {
          return () => "";
        }
        if (!(prop in target)) {
          target[prop] = new Proxy(function(){ return new Proxy({}, __stubHandler); }, __stubHandler);
        }
        return target[prop];
      },
      set(target, prop, value) { target[prop] = value; return true; },
      has() { return true; },
      apply() { return new Proxy({}, __stubHandler); },
    };
    // Minimal concrete globals that helpers commonly destructure or iterate
    let tab="quiz", qi=0, sel=null, ans=false, pool=[], filt="all", topicFilt=-1;
    let examMode=false, examTimer=null, examSec=0;
    let onCallMode=false, flipRevealed=false;
    let timedMode=false, timedSec=90, timedInt=null, timedPaused=false;
    let _optShuffle=null, _sessionSaved=false, _sessionOk=0, _sessionNo=0;
    let learnSub="study", moreSub="calc", calcView="calc", libSec="haz-pdf";
    let hazChOpen=null, _hazData=null, _hazLoading=false;
    let harChOpen=null, _harData=null, _harLoading=false;
    const S = new Proxy({sr:{}, dark:false, studyMode:false, streak:0}, __stubHandler);
    const QZ = [];
    const TOPIC_REF = {}, TOPICS = [], EXAM_FREQ = [], TABS = [];
    const HAZ_CHAPTERS = {}, HAZZARD_MARKED_PARTS = [];
    const SYL_HAR_ALL=[], SYL_HAR_BASE=[], SYL_LAWS=[], SYL_ARTICLES=[], SYL_EXAMS=[];
    const NOTES = [], DRUGS = [], FLASHCARDS = [], CHANGELOG = {};
    // All other globals auto-stub via Proxy:
    const _globals = new Proxy({}, __stubHandler);
    const getTopicStats = () => ({}), getDueQuestions = () => [], getStudyStreak = () => 0;
    const getWeakTopics = () => [], calcEstScore = () => null;
    const srScore = () => 0, isExamTrap = () => false, getOptShuffle = () => null;
    const sanitize = (x) => String(x||""), fmtT = (x) => String(x||"");
    const save = () => {}, trackDailyActivity = () => {}, trackChapterRead = () => {};
    const buildPool = () => {}, buildMockExamPool = () => [], buildRescuePool = () => [];
    const check = () => {}, next = () => {}, pick = () => {};
    const render = () => {}, callAI = () => Promise.resolve("");
    ${helperBlock}
    return typeof ${targetName};
  `;
}

function canEvalScope(helperBlock, targetName) {
  try {
    const harness = buildScopeHarness(helperBlock, targetName);
    const result = new Function(harness)();
    return { ok: true, type: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

describe("runtime scope — all decomposed helpers are top-level functions", () => {
  const FAMILIES = [
    {
      marker: "// ===== LIBRARY HELPERS",
      orchestrator: "renderLibrary",
      helpers: ["_rlHeader","_rlHazzard","_rlHarrison","_rlLaws","_rlArticles","_rlExams","_rlFooter"],
    },
    {
      marker: "// ===== QUIZ HELPERS",
      orchestrator: "renderQuiz",
      helpers: ["_rqSuddenDeath","_rqMain"],
    },
    {
      marker: "// ===== QUIZ MAIN HELPERS",
      orchestrator: "_rqMain",
      helpers: ["_rqmQuestion","_rqmControls","_rqmTeachBack","_rqmExplain","_rqmFooter"],
    },
    {
      marker: "// ===== TRACK HELPERS",
      orchestrator: "renderTrack",
      helpers: ["_rtTop","_rtMid","_rtProgress","_rtFooter"],
    },
  ];

  for (const family of FAMILIES) {
    describe(`${family.orchestrator} family`, () => {
      let block;
      beforeAll(() => {
        block = sliceHelperBlock(scriptContent, family.marker, family.orchestrator);
        if (!block) throw new Error(`Could not slice block for marker "${family.marker}" + "${family.orchestrator}"`);
      });

      for (const helper of family.helpers) {
        it(`${helper} is a top-level function (not nested / not swallowed by template)`, () => {
          const r = canEvalScope(block, helper);
          if (!r.ok) throw new Error(`Harness eval failed: ${r.error}`);
          expect(r.type).toBe("function");
        });
      }

      it(`${family.orchestrator} is a top-level function`, () => {
        const r = canEvalScope(block, family.orchestrator);
        if (!r.ok) throw new Error(`Harness eval failed: ${r.error}`);
        expect(r.type).toBe("function");
      });
    });
  }
});

// Additional: actually exercise renderLibrary end-to-end (the only one
// self-contained enough to run through with minimal stubs).
describe("runtime exec — renderLibrary runs without throwing", () => {
  let libCode;
  beforeAll(() => {
    libCode = sliceHelperBlock(scriptContent, "// ===== LIBRARY HELPERS", "renderLibrary");
  });

  it("runs for every libSec value, no 'undefined' in output", () => {
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
