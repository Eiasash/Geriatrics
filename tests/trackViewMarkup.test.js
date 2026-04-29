/**
 * Markup-shape tests for the v10.60.0 Track tab rebuild.
 *
 * Mirrors the FamilyMedicine PR #16 quizViewMarkup pattern: pin the new
 * class taxonomy and fail CI if any of the rebuilt outer shells regrows
 * `style="..."`. Inline styles on inner data-driven elements (bar fills
 * with dynamic widths) are still allowed — only the structural shells
 * are guarded.
 *
 * shlav-a-mega.html is single-file (no ES modules to import) so we read
 * the file as a string and scrape each render function's body.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dirname, "..");
let html;

beforeAll(() => {
  html = readFileSync(resolve(ROOT, "shlav-a-mega.html"), "utf-8");
});

// Walk the source brace-by-brace and return the body of the named function.
function bodyOf(fnName) {
  const m = html.match(new RegExp(`function\\s+${fnName.replace(/[$]/g, "\\$")}\\s*\\(`));
  if (!m) throw new Error(`function ${fnName} not found`);
  let depth = 0, started = false, bodyStart = m.index + m[0].length;
  for (let i = m.index + m[0].length; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") {
      depth++;
      if (!started) { started = true; bodyStart = i + 1; }
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && started) return html.slice(bodyStart, i);
    }
  }
  throw new Error(`function ${fnName}: body never closes`);
}

// Outer shells that must NOT carry `style="..."`. Inner data-driven elements
// (e.g. `track-*__bar-fill` with width:${...}%) are intentionally excluded.
const OUTER_SHELLS = [
  "track-kpi-row", "track-kpi", "track-kpi__value", "track-kpi__label",
  "track-due", "track-due__icon", "track-due__body", "track-due__title", "track-due__sub", "track-due__cta",
  "track-heatmap", "track-heatmap__head", "track-heatmap__title", "track-heatmap__sub", "track-heatmap__count",
  "track-heatmap__grid", "track-heatmap__cell", "track-heatmap__name", "track-heatmap__pct",
  "track-heatmap__legend", "track-heatmap__swatches", "track-heatmap__swatch", "track-heatmap__caption",
  "track-empty", "track-empty__title",
  "track-rescue", "track-rescue__icon", "track-rescue__body", "track-rescue__title", "track-rescue__topics", "track-rescue__cta",
  "track-final", "track-final__icon", "track-final__body", "track-final__title", "track-final__sub", "track-final__cta",
  "track-reread", "track-reread__title", "track-reread__group", "track-reread__row",
  "track-lb", "track-lb__head", "track-lb__icon", "track-lb__title", "track-lb__sub", "track-lb__chev",
  "track-lb__refresh-row", "track-lb__refresh", "track-lb__board",
  "track-trend", "track-trend__head", "track-trend__title", "track-trend__period", "track-trend__sub",
  "track-trend__cols", "track-trend__col-heading", "track-trend__empty",
  "track-trend__row", "track-trend__row-line", "track-trend__row-name", "track-trend__row-delta",
  "track-trend__bar", "track-trend__footer",
  "track-bk", "track-bk__title", "track-bk__folder", "track-bk__folder-head", "track-bk__folder-row", "track-bk__row",
  "track-syllabus", "track-syllabus__title", "track-syllabus__topic", "track-syllabus__toggle",
  "track-wsm", "track-wsm__head", "track-wsm__title", "track-wsm__sub", "track-wsm__chev",
  "track-wsm__scroll", "track-wsm__table", "track-wsm__th-topic", "track-wsm__th-year",
  "track-wsm__td-topic", "track-wsm__td-cell", "track-wsm__legend", "track-wsm__legend-row", "track-wsm__legend-swatch",
  "track-cm", "track-cm__head", "track-cm__title", "track-cm__sub", "track-cm__blind", "track-cm__chev",
  "track-cm__grid", "track-cm__cell", "track-cm__num", "track-cm__warn",
  "track-matrix__title", "track-matrix__sub", "track-matrix__heading", "track-matrix__heading-arrow",
  "track-matrix__row", "track-matrix__line", "track-matrix__name", "track-matrix__meta",
  "track-matrix__counts", "track-matrix__priority", "track-matrix__bar", "track-matrix__empty", "track-matrix__more", "track-matrix__trend",
  "track-cheat-row", "track-cheat-link",
  "track-activity", "track-activity__head", "track-activity__title", "track-activity__sub",
  "track-activity__chev", "track-activity__grid", "track-activity__cell",
  "track-daily", "track-daily__title", "track-daily__meta", "track-daily__steps", "track-daily__step", "track-daily__btn",
  "track-session-inline", "track-session-inline__title", "track-session-inline__row",
  "track-session-inline__stat", "track-session-inline__num", "track-session-inline__lbl", "track-session-inline__best",
  "track-plan", "track-plan__head", "track-plan__head-main", "track-plan__icon", "track-plan__title-block",
  "track-plan__title", "track-plan__sub", "track-plan__chevron", "track-plan__progress", "track-plan__bar",
  "track-plan__tier", "track-plan__tier-head", "track-plan__tier-main", "track-plan__tier-badge",
  "track-plan__tier-text", "track-plan__tier-label", "track-plan__tier-meta", "track-plan__tier-arrow",
  "track-plan__domain", "track-plan__domain-name", "track-plan__topic", "track-plan__topic-row",
  "track-plan__topic-cb", "track-plan__topic-name", "track-plan__topic-acc", "track-plan__topic-hrs",
  "track-plan__actions", "track-plan__action",
  "track-share", "track-share__title", "track-share__sub", "track-share__btn",
  "track-version-footer", "track-version-footer__row", "track-version-footer__btn", "track-version-footer__link", "track-version-footer__sig",
];

// Helper: walk every <tag ...> in the body, parse its class + style attrs,
// and flag elements that carry an inline `style="..."` AND any class token
// from OUTER_SHELLS. Tokenized matching is required because `\b`-based
// regex would treat `track-trend__bar-fill` as containing `track-trend__bar`.
function shellsWithInlineStyle(body, shells) {
  const offenders = new Set();
  const set = new Set(shells);
  const reEl = /<[a-z]+\s[^>]*>/gi;
  let m;
  while ((m = reEl.exec(body)) !== null) {
    const tag = m[0];
    if (!/\sstyle="[^"]*"/.test(tag)) continue;
    const classMatch = tag.match(/\sclass="([^"]*)"/);
    if (!classMatch) continue;
    const tokens = classMatch[1].split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (set.has(t)) offenders.add(t);
    }
  }
  return [...offenders];
}
function assertNoInlineStyleOnShells(body, label) {
  const offenders = shellsWithInlineStyle(body, OUTER_SHELLS);
  expect(offenders, `${label}: inline style on track-* shell(s): ${offenders.join(", ")}`).toEqual([]);
}

// ─── _rtTop (KPI tiles + due alert + rescue / final stretch + empty state) ───
describe("_rtTop — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("_rtTop"); });

  it("emits the four-tile KPI row with .track-kpi-row + .track-kpi", () => {
    expect(body).toMatch(/class="track-kpi-row"/);
    expect((body.match(/class="card track-kpi"/g) || []).length).toBe(4);
  });

  it("each KPI value has a state modifier class (--ok/--warn/--err/--neutral/--accent/--info)", () => {
    // `readinessMod` and `accMod` are computed at render time and embedded
    // via template literals — assert the source has the placeholder form
    // plus the static --accent / --info modifiers for streak/answered.
    expect(body).toMatch(/track-kpi__value track-kpi__value--\$\{readinessMod\}/);
    expect(body).toMatch(/track-kpi__value track-kpi__value--\$\{accMod\}/);
    expect(body).toMatch(/track-kpi__value track-kpi__value--accent/);
    expect(body).toMatch(/track-kpi__value track-kpi__value--info/);
    // CSS-side: the four state-modifier classes referenced from JS must exist.
    for (const m of ["ok", "warn", "err", "neutral"]) {
      expect(html, `.track-kpi__value--${m} missing in CSS`).toMatch(
        new RegExp(`\\.track-kpi__value--${m}\\s*\\{`)
      );
    }
  });

  it("renders the SRS due alert card when dueN>0 with .track-due shell", () => {
    expect(body).toMatch(/<div class="card track-due">/);
    expect(body).toMatch(/track-due__cta/);
  });

  it("uses .track-rescue + state-modified .track-final shells (no per-CTA inline gradients)", () => {
    expect(body).toMatch(/<div class="card track-rescue">/);
    expect(body).toMatch(/track-final track-final--\$\{_mod\}/);
    expect(body).toMatch(/track-final__cta track-final__cta--\$\{_mod\}/);
    // CSS-side guard for the two state modifiers
    for (const m of ["calm", "urgent"]) {
      expect(html, `.track-final--${m} missing in CSS`).toMatch(
        new RegExp(`\\.track-final--${m}\\s*\\{`)
      );
      expect(html, `.track-final__cta--${m} missing in CSS`).toMatch(
        new RegExp(`\\.track-final__cta--${m}\\s*\\{`)
      );
    }
  });

  it("renders empty-state card via .track-empty when no exam date set", () => {
    expect(body).toMatch(/class="card track-empty"/);
  });

  it("preserves canonical onclick handlers (filt='due', buildPool, buildRescuePool, buildFinalStretchPool)", () => {
    for (const fn of ["buildPool()", "buildRescuePool()", "buildFinalStretchPool(40)"]) {
      expect(body, `_rtTop missing onclick body: ${fn}`).toContain(fn);
    }
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "_rtTop");
  });
});

// ─── _rtMid (re-read chapters + leaderboard + exam trend orchestration) ───
describe("_rtMid — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("_rtMid"); });

  it("re-read card uses .track-reread + group-modifier classes", () => {
    expect(body).toMatch(/class="card track-reread"/);
    expect(body).toMatch(/class="track-reread__group track-reread__group--haz"/);
    expect(body).toMatch(/class="track-reread__group track-reread__group--har"/);
  });

  it("leaderboard collapsible uses .track-lb shell + open-state modifier", () => {
    expect(body).toMatch(/class="card track-lb"/);
    expect(body).toMatch(/class="track-lb__head\$\{_lbOpen\?' track-lb__head--open':''\}"/);
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "_rtMid");
  });
});

// ─── _rtProgress (bookmarks + syllabus + WSM + CM + matrix + activity) ───
describe("_rtProgress — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("_rtProgress"); });

  it("bookmark folder card uses .track-bk + folder-* sub-elements", () => {
    expect(body).toMatch(/class="card track-bk"/);
    expect(body).toMatch(/track-bk__folder-head/);
  });

  it("syllabus card uses --open class for show/hide instead of inline display:", () => {
    expect(body).toMatch(/class="card track-syllabus\$\{S\._sylOpen\?' track-syllabus--open':''\}"/);
    expect(body).not.toMatch(/style="display:\$\{S\._sylOpen/);
  });

  it("Weak Spots Map uses .track-wsm shell + --open state modifier", () => {
    expect(body).toMatch(/class="card track-wsm"/);
    expect(body).toMatch(/class="track-wsm__head\$\{_wsmOpen\?' track-wsm__head--open':''\}"/);
  });

  it("WSM cells use modifier classes for empty/single/ok/mid/low (no per-cell inline bg)", () => {
    expect(body).toMatch(/track-wsm__td-cell--empty/);
    expect(body).toMatch(/track-wsm__td-cell--single/);
    expect(body).toMatch(/track-wsm__td-cell--\$\{cellMod\}/);
  });

  it("Confidence Matrix uses .track-cm shell + cell-state modifiers", () => {
    expect(body).toMatch(/class="card track-cm"/);
    for (const m of ["good", "blind", "lucky", "miss"]) {
      expect(body, `track-cm__cell--${m} missing`).toMatch(new RegExp(`track-cm__cell--${m}`));
    }
  });

  it("activity heatmap uses .track-activity shell + per-level (--lvl0..lvl4) cells", () => {
    expect(body).toMatch(/class="card track-activity"/);
    expect(body).toMatch(/track-activity__cell--lvl\$\{_int\}/);
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "_rtProgress");
  });
});

// ─── _rtFooter ───
describe("_rtFooter — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("_rtFooter"); });

  it("share card uses .track-share shell", () => {
    expect(body).toMatch(/class="card track-share"/);
  });

  it("version footer uses .track-version-footer shell + button/link sub-classes", () => {
    expect(body).toMatch(/class="track-version-footer"/);
    expect(body).toMatch(/track-version-footer__btn--update/);
    expect(body).toMatch(/track-version-footer__link/);
  });

  it("preserves the apply-update data-action on the force-update button", () => {
    expect(body).toMatch(/data-action="apply-update"/);
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "_rtFooter");
  });
});

// ─── renderTopicHeatmap (called from _rtTop) ───
describe("renderTopicHeatmap — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderTopicHeatmap"); });

  it("uses .track-heatmap card + grid", () => {
    expect(body).toMatch(/class="card track-heatmap"/);
    expect(body).toMatch(/class="track-heatmap__grid"/);
  });

  it("each cell gets a Cividis-bucket modifier (--b0..--b4 or --neutral)", () => {
    expect(body).toMatch(/track-heatmap__cell track-heatmap__cell--\$\{cellMod\}/);
  });

  it("legend swatches are class-driven (no inline background swatches)", () => {
    expect(body).toMatch(/track-heatmap__swatch--b\$\{_b\}/);
    expect(body).toMatch(/track-heatmap__swatch--neutral track-heatmap__swatch--n/);
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "renderTopicHeatmap");
  });
});

// ─── renderPriorityMatrix ───
describe("renderPriorityMatrix — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderPriorityMatrix"); });

  it("uses .track-matrix__title + .track-matrix__sub for the header", () => {
    expect(body).toMatch(/class="track-matrix__title"/);
    expect(body).toMatch(/class="track-matrix__sub"/);
  });

  it("priority badge state classes cover high/mid/low", () => {
    expect(body).toMatch(/track-matrix__priority track-matrix__priority--\$\{prioMod\}/);
    expect(body).toMatch(/track-matrix__bar-fill--\$\{prioMod\}/);
  });

  it("trend arrows are class-driven (no inline color)", () => {
    expect(body).toMatch(/track-matrix__trend track-matrix__trend--up/);
    expect(body).toMatch(/track-matrix__trend track-matrix__trend--down/);
    expect(body).toMatch(/track-matrix__trend track-matrix__trend--flat/);
  });

  it("preserves setTopicFilt onclick wiring (with single-quoted args)", () => {
    expect(body).toMatch(/onclick="setTopicFilt\(\$\{r\.ti\}\);tab='quiz';render\(\)"/);
  });

  it("emits ZERO inline style attributes on track-* shells (bar widths excepted)", () => {
    assertNoInlineStyleOnShells(body, "renderPriorityMatrix");
  });
});

// ─── renderStudyPlan ───
describe("renderStudyPlan — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderStudyPlan"); });

  it("outer card uses .track-plan", () => {
    expect(body).toMatch(/class="card track-plan"/);
  });

  it("tier badges use class modifiers (--t1..--t4) instead of inline background", () => {
    expect(body).toMatch(/track-plan__tier-badge track-plan__tier-badge--t\$\{tier\.tier\}/);
    expect(body).not.toMatch(/track-plan__tier-badge"\s+style=/);
  });

  it("topic accuracy badges use --ok/--warn/--err state modifiers", () => {
    expect(body).toMatch(/track-plan__topic-acc track-plan__topic-acc--\$\{accMod\}/);
  });

  it("action buttons preserve their canonical onclick handlers (single-quoted args)", () => {
    // openHazzardChapter, openNote, setTopicFilt, sendChatStarter
    for (const fn of ["openHazzardChapter", "openNote=", "setTopicFilt", "sendChatStarter"]) {
      expect(body, `renderStudyPlan missing handler: ${fn}`).toContain(fn);
    }
  });

  it("emits ZERO inline style attributes on track-* shells (progress bar fill width excepted)", () => {
    assertNoInlineStyleOnShells(body, "renderStudyPlan");
  });
});

// ─── renderDailyPlan ───
describe("renderDailyPlan — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderDailyPlan"); });

  it("outer card uses .track-daily shell with a fixed-color CSS border (no inline)", () => {
    expect(body).toMatch(/class="card track-daily"/);
    expect(body).not.toMatch(/track-daily"\s+style=/);
  });

  it("daily plan steps use .track-daily__step + per-step btn modifiers", () => {
    for (const m of ["primary", "secondary", "good", "warn", "danger"]) {
      expect(body, `track-daily__btn--${m} missing`).toMatch(new RegExp(`track-daily__btn--${m}`));
    }
  });

  it("preserves canonical onclick handlers (setFilt, startTopicMiniExam, replayLastMockWrong)", () => {
    for (const fn of ["setFilt('due')", "setFilt('traps')", "startTopicMiniExam", "replayLastMockWrong()"]) {
      expect(body, `renderDailyPlan missing handler: ${fn}`).toContain(fn);
    }
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "renderDailyPlan");
  });
});

// ─── renderSessionInline ───
describe("renderSessionInline — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderSessionInline"); });

  it("uses .track-session-inline outer + per-stat sub-elements", () => {
    expect(body).toMatch(/class="track-session-inline"/);
    expect(body).toMatch(/class="track-session-inline__row"/);
    expect((body.match(/class="track-session-inline__stat"/g) || []).length).toBe(3);
  });

  it("score number uses --ok/--warn/--err state modifier (no inline color)", () => {
    expect(body).toMatch(/track-session-inline__num track-session-inline__num--\$\{pctMod\}/);
    expect(body).toMatch(/track-session-inline__num track-session-inline__num--due/);
  });

  it("emits ZERO inline style attributes on track-* shells", () => {
    assertNoInlineStyleOnShells(body, "renderSessionInline");
  });
});

// ─── renderExamTrendCard ───
describe("renderExamTrendCard — class-driven shell", () => {
  let body;
  beforeAll(() => { body = bodyOf("renderExamTrendCard"); });

  it("outer card uses .track-trend", () => {
    expect(body).toMatch(/class="card track-trend"/);
  });

  it("up/down columns use --up / --down heading modifiers (no inline color)", () => {
    expect(body).toMatch(/track-trend__col-heading track-trend__col-heading--up/);
    expect(body).toMatch(/track-trend__col-heading track-trend__col-heading--down/);
  });

  it("delta values + bar fills use --up / --down state classes", () => {
    expect(body).toMatch(/track-trend__row-delta track-trend__row-delta--up/);
    expect(body).toMatch(/track-trend__row-delta track-trend__row-delta--down/);
    expect(body).toMatch(/track-trend__bar-fill track-trend__bar-fill--up/);
    expect(body).toMatch(/track-trend__bar-fill track-trend__bar-fill--down/);
  });

  it("emits ZERO inline style attributes on track-* shells (bar widths excepted)", () => {
    assertNoInlineStyleOnShells(body, "renderExamTrendCard");
  });
});

// ─── Cross-function invariants ───
describe("Track tab — cross-function invariants", () => {
  it("renderTrack still composes the four _rt* helpers in order", () => {
    const body = bodyOf("renderTrack");
    expect(body).toMatch(/_rtTop\(\)[\s\S]*_rtMid\(\)[\s\S]*_rtProgress\(\)[\s\S]*_rtFooter\(\)/);
  });

  it("CSS block defines all KPI value modifier classes", () => {
    expect(html).toMatch(/\.track-kpi__value--ok\s*\{/);
    expect(html).toMatch(/\.track-kpi__value--warn\s*\{/);
    expect(html).toMatch(/\.track-kpi__value--err\s*\{/);
    expect(html).toMatch(/\.track-kpi__value--neutral\s*\{/);
    expect(html).toMatch(/\.track-kpi__value--accent\s*\{/);
    expect(html).toMatch(/\.track-kpi__value--info\s*\{/);
  });

  it("CSS block defines the four study-plan tier badge modifiers", () => {
    for (let t = 1; t <= 4; t++) {
      expect(html, `.track-plan__tier-badge--t${t} missing in CSS`).toMatch(
        new RegExp(`\\.track-plan__tier-badge--t${t}\\s*\\{`)
      );
    }
  });

  it("CSS block defines the Cividis 5-step + neutral heatmap palette", () => {
    for (let b = 0; b <= 4; b++) {
      expect(html, `.track-heatmap__cell--b${b} missing in CSS`).toMatch(
        new RegExp(`\\.track-heatmap__cell--b${b}\\s*\\{`)
      );
    }
    expect(html).toMatch(/\.track-heatmap__cell--neutral\s*\{/);
  });

  it("dark/study mode override of activity-cell --lvl0 background is present", () => {
    expect(html).toMatch(/body\.dark\s+\.track-activity__cell--lvl0/);
    expect(html).toMatch(/body\.study\s+\.track-activity__cell--lvl0/);
  });
});
