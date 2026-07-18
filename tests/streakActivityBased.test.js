/**
 * G7 (2026-07-18): S.streak must reflect REAL study activity, not app-opens.
 *
 * The updateStreak IIFE previously did S.streak++ merely for opening the app on
 * consecutive days, and computed "today" from toISOString() (UTC) which drifts
 * across the local midnight boundary. The fix makes S.streak mirror the
 * activity-based getStudyStreak() and derives "today" from the LOCAL date.
 *
 * These tests extract the two functions from the monolith and run them against a
 * controllable Date so the behaviour is pinned without a browser.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

let gssSrc, usSrc, htmlAutopsyGuard;

beforeAll(() => {
  const html = readFileSync(resolve(import.meta.dirname, "..", "shlav-a-mega.html"), "utf-8");
  gssSrc = html.match(/function getStudyStreak\(\)\{[\s\S]*?return streak;\s*\}/)[0];
  usSrc = html.match(/\(function updateStreak\(\)\{[\s\S]*?save\(\);\s*\}\)\(\);/)[0];
  htmlAutopsyGuard = html;
});

// A frozen Date subclass: new Date() -> the fixed instant, arithmetic still real.
function frozenDate(nowMs) {
  return class extends Date {
    constructor(...args) { if (args.length === 0) super(nowMs); else super(...args); }
    static now() { return nowMs; }
  };
}

// Run the extracted getStudyStreak + updateStreak IIFE against a Date impl.
function runUpdate(initialS, DateImpl) {
  const S = JSON.parse(JSON.stringify(initialS));
  let saves = 0;
  const factory = new Function("Date", "S", "save", `${gssSrc}\n${usSrc}\nreturn;`);
  factory(DateImpl, S, () => { saves++; });
  return { S, saves };
}

describe("streak is activity-based, not app-open based (G7)", () => {
  it("source no longer increments S.streak for opening the app; mirrors getStudyStreak()", () => {
    expect(usSrc).toContain("S.streak=getStudyStreak()");
    expect(usSrc).not.toMatch(/S\.streak\+\+/);
    // "today" comes from LOCAL date parts, not UTC toISOString()
    expect(usSrc).toContain("now.getFullYear()");
    expect(usSrc).toContain("now.getDate()");
    expect(usSrc).not.toMatch(/toISOString\(\)\.slice\(0,10\)/);
  });

  it("opening the app with no answers does NOT inflate the streak — it reflects real activity", () => {
    const D = frozenDate(Date.UTC(2026, 6, 20, 12, 0, 0)); // day1 = "today"
    const keyDaysAgo = (n) => { const d = new D(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const dailyAct = {};
    dailyAct[keyDaysAgo(1)] = { q: 4 }; // studied yesterday
    dailyAct[keyDaysAgo(2)] = { q: 5 }; // and the day before
    dailyAct[keyDaysAgo(3)] = { q: 6 }; // and the day before that
    // Stored streak is inflated (99) from the old buggy app-open counter; today has
    // NO activity (user just opened the app). Real streak = 3 (yesterday .. 3d ago).
    const r = runUpdate({ streak: 99, lastDay: keyDaysAgo(1), dailyAct }, D);
    expect(r.S.streak).toBe(3);          // corrected to the real activity streak
    expect(r.S.streak).not.toBe(100);    // did NOT increment for the open
    expect(r.saves).toBeGreaterThan(0);  // persisted
  });

  it("opening the app two days running with no answers never increments the streak", () => {
    const D1 = frozenDate(Date.UTC(2026, 6, 20, 12, 0, 0));
    const keyD1 = (n) => { const d = new D1(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const dailyAct = {};
    dailyAct[keyD1(1)] = { q: 3 };
    dailyAct[keyD1(2)] = { q: 3 };
    // Day 1 open (no answers today): streak reflects the 2 real study days.
    const r1 = runUpdate({ streak: 2, lastDay: keyD1(1), dailyAct }, D1);
    expect(r1.S.streak).toBe(2);
    // Day 2 open, still no answers. The OLD code would have bumped the streak by +1
    // for a second consecutive app-open. It must not.
    const D2 = frozenDate(Date.UTC(2026, 6, 21, 12, 0, 0));
    const r2 = runUpdate({ streak: r1.S.streak, lastDay: r1.S.lastDay, dailyAct }, D2);
    expect(r2.S.streak).not.toBe(r1.S.streak + 1); // key: opening did not add a day
    expect(r2.S.streak).toBeLessThanOrEqual(r1.S.streak);
    expect(r2.S.streak).toBe(0); // day-2's "yesterday" had no study → streak legitimately broke
  });

  it("local-date day boundary: 'today' uses LOCAL date parts, not UTC toISOString()", () => {
    // A Date whose LOCAL calendar day is 2026-07-19 but whose UTC (toISOString) has
    // already rolled to 2026-07-20 — e.g. a user just before local midnight. dailyAct
    // is absent so getStudyStreak() short-circuits to 0 without touching Date.
    class DivergentDate {
      static now() { return 0; }
      getFullYear() { return 2026; }
      getMonth() { return 6; }   // July (0-based)
      getDate() { return 19; }   // LOCAL day
      toISOString() { return "2026-07-20T00:30:00.000Z"; } // UTC already on the 20th
    }
    const r = runUpdate({ streak: 5, lastDay: "2026-07-01" }, DivergentDate);
    expect(r.S.lastDay).toBe("2026-07-19");     // local date, NOT the UTC "2026-07-20"
    expect(r.S.streak).toBe(0);                 // no activity tracked
  });
});
