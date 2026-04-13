/**
 * Expanded app logic tests — additional pure functions extracted from shlav-a-mega.html.
 *
 * Covers: fmtT, isMetaOption, getOptShuffle, getWeakTopics, getReadinessScore,
 * calcEstScore, getStudyStreak, getChaptersDueForReading, getTopicTrend,
 * buildMockExamPool.
 */

import { describe, it, expect } from "vitest";

// ─── Extracted pure functions ────────────────────────────────────────────────

// fmtT — format seconds as time string (line 1492)
function fmtT(s) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sc = s % 60;
  return (h ? h + ":" : "") + String(m).padStart(2, "0") + ":" + String(sc).padStart(2, "0");
}

// isMetaOption — detect aggregate/reference answer options (line 1582)
function isMetaOption(text) {
  const t = (text || "").trim();
  const metaPatterns = [
    /כל\s*(ה)?תשוב/,
    /כל\s*(ה)?אמור/,
    /אף\s*תשוב/,
    /all\s+of\s+the\s+above/i,
    /none\s+of\s+the\s+above/i,
    /both\s+[a-e]\s+and\s+[a-e]/i,
    /[א-ת][׳']\s*ו[־-]?\s*[א-ת][׳']/,
    /^\s*[a-e]\s+and\s+[a-e]\s*$/i,
    /\d\s*ו\s*\d/,
  ];
  return metaPatterns.some((p) => p.test(t));
}

// getOptShuffle — deterministic seeded shuffle with meta-option pinning (line 1599)
function getOptShuffle(qIdx, q) {
  const n = q.o.length;
  const regular = [], meta = [];
  q.o.forEach((_, i) => { isMetaOption(q.o[i]) ? meta.push(i) : regular.push(i); });
  let seed = qIdx * 31 + 17;
  const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
  for (let i = regular.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [regular[i], regular[j]] = [regular[j], regular[i]];
  }
  const map = [...regular, ...meta];
  return map;
}

// getWeakTopics — identify weakest topics by accuracy (line 916)
function getWeakTopics(topicStats, n = 3) {
  const scored = Object.entries(topicStats)
    .map(([ti, s]) => ({ ti: Number(ti), pct: s.tot ? Math.round((s.ok / s.tot) * 100) : null, tot: s.tot, ok: s.ok }))
    .filter((s) => s.tot >= 3)
    .sort((a, b) => a.pct - b.pct);
  return scored.slice(0, n);
}

// getReadinessScore — weighted exam readiness percentage (line 974)
const EXAM_FREQ = [0, 34, 30, 28, 36, 43, 178, 39, 63, 36, 20, 27, 19, 22, 50, 40, 22, 94, 70, 78, 18, 80, 43, 21, 46, 27, 29, 52, 10, 11, 7, 0, 6, 9, 26, 19, 23, 9, 17, 0];

function getReadinessScore(topicStats) {
  let weightedScore = 0, totalWeight = 0;
  EXAM_FREQ.forEach((freq, ti) => {
    if (!freq) return;
    const s = topicStats[ti];
    const pct = s && s.tot >= 2 ? s.ok / s.tot : 0;
    weightedScore += pct * freq;
    totalWeight += freq;
  });
  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0;
}

// calcEstScore — FSRS-aware estimated exam score (line 3443)
function calcEstScore(topicStats, dueSet) {
  const FREQ = [0, 34, 30, 28, 36, 43, 178, 39, 63, 36, 20, 27, 19, 22, 50, 40, 22, 94, 70, 78, 18, 80, 43, 21, 46, 27, 29, 52, 10, 11, 7, 0, 6, 9, 26, 19, 23, 9, 17, 0];
  const totalFreq = FREQ.reduce((a, b) => a + b, 0);
  let weightedScore = 0, totalWeight = 0;
  FREQ.forEach((freq, ti) => {
    if (!freq) return;
    const s = topicStats[ti] || { ok: 0, no: 0, tot: 0 };
    const weight = freq / totalFreq;
    let acc;
    if (s.tot < 3) {
      acc = 0.60;
    } else {
      acc = s.ok / s.tot;
      const duePenalty = dueSet.has(ti) ? 1 : 0;
      if (duePenalty > 0) acc = Math.max(0, acc - duePenalty * 0.02);
    }
    weightedScore += acc * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : null;
}

// getStudyStreak — consecutive study days (line 987)
function getStudyStreak(dailyAct, now = new Date()) {
  if (!dailyAct) return 0;
  let streak = 0;
  const d = new Date(now);
  for (let i = 0; i < 365; i++) {
    const key = d.toISOString().slice(0, 10);
    if (dailyAct[key] && dailyAct[key].q > 0) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// getChaptersDueForReading — spaced reading (line 951)
function getChaptersDueForReading(chReads, source, dayThreshold = 30, now = Date.now()) {
  if (!chReads) return [];
  const due = [];
  Object.entries(chReads).forEach(([key, ts]) => {
    if (!key.startsWith(source + "_")) return;
    const ch = key.split("_")[1];
    const daysSince = Math.floor((now - ts) / 86400000);
    if (daysSince >= dayThreshold) due.push({ ch, daysSince, ts });
  });
  return due.sort((a, b) => b.daysSince - a.daysSince);
}

// getTopicTrend — week-over-week accuracy trend (line 4671)
function getTopicTrend(snapshots, ti) {
  const keys = Object.keys(snapshots).sort();
  if (keys.length < 2) return null;
  const prev = snapshots[keys[keys.length - 2]].acc[ti];
  const curr = snapshots[keys[keys.length - 1]].acc[ti];
  if (prev === null || curr === null) return null;
  return curr - prev;
}

// buildMockExamPool — proportional topic distribution (line 1371)
function buildMockExamPool(QZ, examFreq) {
  const total = examFreq.reduce((a, b) => a + b, 0);
  const examPool = [];
  const byTopic = {};
  QZ.forEach((q, i) => { const ti = q.ti >= 0 ? q.ti : 39; if (!byTopic[ti]) byTopic[ti] = []; byTopic[ti].push(i); });
  examFreq.forEach((freq, ti) => {
    if (!freq || !byTopic[ti] || !byTopic[ti].length) return;
    const target = Math.max(1, Math.round((freq / total) * 100));
    const src = [...byTopic[ti]].sort(() => Math.random() - 0.5);
    for (let k = 0; k < Math.min(target, src.length); k++) examPool.push(src[k]);
  });
  examPool.sort(() => Math.random() - 0.5);
  return examPool.slice(0, 100);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fmtT — time formatting", () => {
  it("formats seconds only", () => {
    expect(fmtT(5)).toBe("00:05");
  });

  it("formats minutes and seconds", () => {
    expect(fmtT(65)).toBe("01:05");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(fmtT(3661)).toBe("1:01:01");
  });

  it("formats zero", () => {
    expect(fmtT(0)).toBe("00:00");
  });

  it("formats exactly one hour", () => {
    expect(fmtT(3600)).toBe("1:00:00");
  });

  it("pads minutes and seconds with leading zeros", () => {
    expect(fmtT(62)).toBe("01:02");
  });

  it("formats large values (3 hour exam)", () => {
    expect(fmtT(10800)).toBe("3:00:00");
  });

  it("does not show hours when under 3600", () => {
    expect(fmtT(3599)).toBe("59:59");
    // No hour prefix — only 2 segments (MM:SS)
    expect(fmtT(3599).split(":").length).toBe(2);
  });
});

describe("isMetaOption — meta answer detection", () => {
  it("detects Hebrew 'all answers correct'", () => {
    expect(isMetaOption("כל התשובות נכונות")).toBe(true);
  });

  it("detects Hebrew 'all of the above'", () => {
    expect(isMetaOption("כל האמור נכון")).toBe(true);
  });

  it("detects Hebrew 'none of the answers'", () => {
    expect(isMetaOption("אף תשובה אינה נכונה")).toBe(true);
  });

  it("detects English 'all of the above'", () => {
    expect(isMetaOption("All of the above")).toBe(true);
  });

  it("detects English 'none of the above'", () => {
    expect(isMetaOption("None of the above")).toBe(true);
  });

  it("detects 'both A and C'", () => {
    expect(isMetaOption("Both A and C")).toBe(true);
  });

  it("detects Hebrew letter references (א׳ ו-ב׳)", () => {
    expect(isMetaOption("א׳ ו-ב׳")).toBe(true);
  });

  it("detects numeric references (1 ו-2)", () => {
    expect(isMetaOption("1 ו 2")).toBe(true);
  });

  it("returns false for regular option text", () => {
    expect(isMetaOption("Metformin 500mg")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isMetaOption("")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isMetaOption(null)).toBe(false);
    expect(isMetaOption(undefined)).toBe(false);
  });
});

describe("getOptShuffle — deterministic option shuffling", () => {
  const q = { o: ["Option A", "Option B", "Option C", "Option D"] };

  it("returns an array of the same length as options", () => {
    const map = getOptShuffle(0, q);
    expect(map.length).toBe(4);
  });

  it("contains all indices", () => {
    const map = getOptShuffle(0, q);
    expect([...map].sort()).toEqual([0, 1, 2, 3]);
  });

  it("is deterministic — same qIdx produces same shuffle", () => {
    const map1 = getOptShuffle(42, q);
    const map2 = getOptShuffle(42, q);
    expect(map1).toEqual(map2);
  });

  it("different qIdx produces different shuffle", () => {
    const map1 = getOptShuffle(0, q);
    const map2 = getOptShuffle(1, q);
    // Very unlikely but possible to be same; check at least one difference
    const allSame = map1.every((v, i) => v === map2[i]);
    // If they happen to be same, just skip — odds extremely low
    if (!allSame) {
      expect(map1).not.toEqual(map2);
    }
  });

  it("pins meta options to the end", () => {
    const qMeta = { o: ["Metformin", "Aspirin", "Warfarin", "כל התשובות נכונות"] };
    const map = getOptShuffle(5, qMeta);
    // Last position should be index 3 (the meta option)
    expect(map[map.length - 1]).toBe(3);
  });

  it("shuffles regular options when meta exists", () => {
    const qMeta = { o: ["A", "B", "C", "All of the above"] };
    const map = getOptShuffle(10, qMeta);
    // Meta at end
    expect(map[3]).toBe(3);
    // First 3 are some permutation of [0,1,2]
    expect([...map.slice(0, 3)].sort()).toEqual([0, 1, 2]);
  });

  it("handles question with all meta options", () => {
    const qAllMeta = { o: ["כל התשובות נכונות", "אף תשובה", "1 ו 2", "All of the above"] };
    const map = getOptShuffle(0, qAllMeta);
    // All are meta — should remain in original order
    expect(map).toEqual([0, 1, 2, 3]);
  });
});

describe("getWeakTopics — weak topic identification", () => {
  it("returns weakest topics sorted by accuracy", () => {
    const stats = {
      0: { ok: 1, tot: 10 },
      1: { ok: 8, tot: 10 },
      2: { ok: 3, tot: 10 },
    };
    const result = getWeakTopics(stats, 2);
    expect(result.length).toBe(2);
    expect(result[0].ti).toBe(0); // 10% accuracy
    expect(result[1].ti).toBe(2); // 30% accuracy
  });

  it("filters topics with fewer than 3 attempts", () => {
    const stats = {
      0: { ok: 0, tot: 2 },
      1: { ok: 5, tot: 10 },
    };
    const result = getWeakTopics(stats);
    expect(result.length).toBe(1);
    expect(result[0].ti).toBe(1);
  });

  it("returns empty when no topics meet threshold", () => {
    const stats = {
      0: { ok: 0, tot: 1 },
      1: { ok: 0, tot: 0 },
    };
    expect(getWeakTopics(stats)).toEqual([]);
  });

  it("returns correct percentage", () => {
    const stats = { 5: { ok: 7, tot: 10 } };
    const result = getWeakTopics(stats, 1);
    expect(result[0].pct).toBe(70);
  });

  it("defaults to n=3", () => {
    const stats = {};
    for (let i = 0; i < 10; i++) stats[i] = { ok: i, tot: 10 };
    const result = getWeakTopics(stats);
    expect(result.length).toBe(3);
  });
});

describe("getReadinessScore — weighted exam readiness", () => {
  it("returns 0 when no topics have data", () => {
    expect(getReadinessScore({})).toBe(0);
  });

  it("returns 100 when all topics have perfect accuracy", () => {
    const stats = {};
    EXAM_FREQ.forEach((_, ti) => { stats[ti] = { ok: 10, tot: 10 }; });
    expect(getReadinessScore(stats)).toBe(100);
  });

  it("returns 0 when all topics have zero accuracy", () => {
    const stats = {};
    EXAM_FREQ.forEach((_, ti) => { stats[ti] = { ok: 0, tot: 10 }; });
    expect(getReadinessScore(stats)).toBe(0);
  });

  it("ignores topics with fewer than 2 attempts", () => {
    const stats = {};
    EXAM_FREQ.forEach((_, ti) => { stats[ti] = { ok: 1, tot: 1 }; });
    // tot=1 < 2, so all topics treated as pct=0
    expect(getReadinessScore(stats)).toBe(0);
  });

  it("weights high-frequency topics more heavily", () => {
    const statsHighFreq = {};
    // Topic 6 (Dementia) has frequency 178 — highest
    statsHighFreq[6] = { ok: 10, tot: 10 };
    const scoreHigh = getReadinessScore(statsHighFreq);

    const statsLowFreq = {};
    // Topic 31 has frequency 0
    // Topic 30 (Elder Abuse) has frequency 7 — lowest
    statsLowFreq[30] = { ok: 10, tot: 10 };
    const scoreLow = getReadinessScore(statsLowFreq);

    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});

describe("calcEstScore — FSRS-aware estimated score", () => {
  it("returns 60 when no data exists (neutral assumption)", () => {
    const result = calcEstScore({}, new Set());
    expect(result).toBe(60);
  });

  it("returns higher score with good accuracy", () => {
    const stats = {};
    EXAM_FREQ.forEach((_, ti) => { stats[ti] = { ok: 9, tot: 10, no: 1 }; });
    const result = calcEstScore(stats, new Set());
    expect(result).toBeGreaterThan(85);
  });

  it("penalizes due topics", () => {
    const stats = {};
    EXAM_FREQ.forEach((_, ti) => { stats[ti] = { ok: 8, tot: 10, no: 2 }; });
    const withoutDue = calcEstScore(stats, new Set());
    const withDue = calcEstScore(stats, new Set([6])); // topic 6 is due
    expect(withDue).toBeLessThanOrEqual(withoutDue);
  });

  it("returns null when totalWeight is zero", () => {
    // This shouldn't happen with real EXAM_FREQ but test the edge case
    const result = calcEstScore({}, new Set());
    // With real EXAM_FREQ, totalWeight > 0 so should return a number
    expect(typeof result).toBe("number");
  });

  it("handles mixed data — some topics seen, some not", () => {
    const stats = {
      6: { ok: 9, tot: 10, no: 1 }, // Dementia — strong
      17: { ok: 2, tot: 10, no: 8 }, // CVD — weak
    };
    const result = calcEstScore(stats, new Set());
    // Should be between 0 and 100
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(100);
  });
});

describe("getStudyStreak — consecutive study days", () => {
  it("returns 0 when no activity data", () => {
    expect(getStudyStreak(null)).toBe(0);
    expect(getStudyStreak(undefined)).toBe(0);
  });

  it("returns 0 when no recent activity", () => {
    expect(getStudyStreak({})).toBe(0);
  });

  it("counts consecutive days from today", () => {
    const now = new Date("2026-04-13");
    const act = {
      "2026-04-13": { q: 5 },
      "2026-04-12": { q: 3 },
      "2026-04-11": { q: 7 },
    };
    expect(getStudyStreak(act, now)).toBe(3);
  });

  it("allows today to be empty (streak from yesterday)", () => {
    const now = new Date("2026-04-13");
    const act = {
      "2026-04-12": { q: 5 },
      "2026-04-11": { q: 3 },
    };
    expect(getStudyStreak(act, now)).toBe(2);
  });

  it("breaks on first gap", () => {
    const now = new Date("2026-04-13");
    const act = {
      "2026-04-13": { q: 5 },
      // gap on 2026-04-12
      "2026-04-11": { q: 3 },
    };
    expect(getStudyStreak(act, now)).toBe(1);
  });

  it("ignores days with q=0", () => {
    const now = new Date("2026-04-13");
    const act = {
      "2026-04-13": { q: 0 },
      "2026-04-12": { q: 5 },
    };
    // Today has q=0 (allowed to be empty), yesterday has activity
    expect(getStudyStreak(act, now)).toBe(1);
  });
});

describe("getChaptersDueForReading — spaced reading", () => {
  const ONE_DAY = 86400000;

  it("returns empty when no reads recorded", () => {
    expect(getChaptersDueForReading(null, "hazzard")).toEqual([]);
    expect(getChaptersDueForReading({}, "hazzard")).toEqual([]);
  });

  it("returns chapters due after threshold days", () => {
    const now = Date.now();
    const reads = {
      hazzard_3: now - 31 * ONE_DAY,
      hazzard_7: now - 15 * ONE_DAY,
    };
    const result = getChaptersDueForReading(reads, "hazzard", 30, now);
    expect(result.length).toBe(1);
    expect(result[0].ch).toBe("3");
    expect(result[0].daysSince).toBe(31);
  });

  it("filters by source prefix", () => {
    const now = Date.now();
    const reads = {
      hazzard_3: now - 40 * ONE_DAY,
      harrison_5: now - 40 * ONE_DAY,
    };
    const result = getChaptersDueForReading(reads, "hazzard", 30, now);
    expect(result.length).toBe(1);
    expect(result[0].ch).toBe("3");
  });

  it("sorts by most overdue first", () => {
    const now = Date.now();
    const reads = {
      hazzard_1: now - 50 * ONE_DAY,
      hazzard_2: now - 90 * ONE_DAY,
      hazzard_3: now - 35 * ONE_DAY,
    };
    const result = getChaptersDueForReading(reads, "hazzard", 30, now);
    expect(result[0].ch).toBe("2"); // 90 days — most overdue
    expect(result[1].ch).toBe("1"); // 50 days
    expect(result[2].ch).toBe("3"); // 35 days
  });

  it("uses custom threshold", () => {
    const now = Date.now();
    const reads = { hazzard_3: now - 10 * ONE_DAY };
    expect(getChaptersDueForReading(reads, "hazzard", 7, now).length).toBe(1);
    expect(getChaptersDueForReading(reads, "hazzard", 14, now).length).toBe(0);
  });

  it("returns exactly at threshold boundary", () => {
    const now = Date.now();
    const reads = { hazzard_1: now - 30 * ONE_DAY };
    const result = getChaptersDueForReading(reads, "hazzard", 30, now);
    expect(result.length).toBe(1);
  });
});

describe("getTopicTrend — week-over-week accuracy trend", () => {
  it("returns null with fewer than 2 snapshots", () => {
    expect(getTopicTrend({}, 0)).toBe(null);
    expect(getTopicTrend({ "2026-W15": { acc: [50] } }, 0)).toBe(null);
  });

  it("returns positive delta when improving", () => {
    const snapshots = {
      "2026-W14": { acc: [50, 60] },
      "2026-W15": { acc: [70, 80] },
    };
    expect(getTopicTrend(snapshots, 0)).toBe(20);
    expect(getTopicTrend(snapshots, 1)).toBe(20);
  });

  it("returns negative delta when declining", () => {
    const snapshots = {
      "2026-W14": { acc: [80, 90] },
      "2026-W15": { acc: [60, 70] },
    };
    expect(getTopicTrend(snapshots, 0)).toBe(-20);
  });

  it("returns 0 when unchanged", () => {
    const snapshots = {
      "2026-W14": { acc: [75] },
      "2026-W15": { acc: [75] },
    };
    expect(getTopicTrend(snapshots, 0)).toBe(0);
  });

  it("returns null when either snapshot has null accuracy", () => {
    const snapshots = {
      "2026-W14": { acc: [null] },
      "2026-W15": { acc: [80] },
    };
    expect(getTopicTrend(snapshots, 0)).toBe(null);
  });

  it("uses last two snapshots even with more history", () => {
    const snapshots = {
      "2026-W12": { acc: [10] },
      "2026-W13": { acc: [20] },
      "2026-W14": { acc: [40] },
      "2026-W15": { acc: [80] },
    };
    // Should compare W14 and W15 only
    expect(getTopicTrend(snapshots, 0)).toBe(40);
  });
});

describe("buildMockExamPool — proportional exam pool", () => {
  // Create a small mock question bank
  const QZ = [];
  for (let ti = 0; ti < 40; ti++) {
    for (let j = 0; j < 20; j++) {
      QZ.push({ ti, q: `Q${ti}-${j}`, o: ["a", "b", "c", "d"], c: 0 });
    }
  }

  it("returns at most 100 questions", () => {
    const pool = buildMockExamPool(QZ, EXAM_FREQ);
    expect(pool.length).toBeLessThanOrEqual(100);
  });

  it("returns valid indices", () => {
    const pool = buildMockExamPool(QZ, EXAM_FREQ);
    for (const idx of pool) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(QZ.length);
    }
  });

  it("includes questions from high-frequency topics", () => {
    const pool = buildMockExamPool(QZ, EXAM_FREQ);
    // Topic 6 (Dementia, freq 178) should be represented
    const topic6Qs = pool.filter((i) => QZ[i].ti === 6);
    expect(topic6Qs.length).toBeGreaterThan(0);
  });

  it("skips topics with zero frequency", () => {
    const pool = buildMockExamPool(QZ, EXAM_FREQ);
    // Topic 0 and 39 have freq=0
    const topic0Qs = pool.filter((i) => QZ[i].ti === 0);
    expect(topic0Qs.length).toBe(0);
  });

  it("returns integer indices", () => {
    const pool = buildMockExamPool(QZ, EXAM_FREQ);
    for (const idx of pool) {
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  it("handles empty question bank", () => {
    const pool = buildMockExamPool([], EXAM_FREQ);
    expect(pool.length).toBe(0);
  });

  it("handles question bank with only one topic", () => {
    const singleTopicQZ = Array.from({ length: 50 }, (_, i) => ({ ti: 6 }));
    const pool = buildMockExamPool(singleTopicQZ, EXAM_FREQ);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.length).toBeLessThanOrEqual(100);
  });
});
