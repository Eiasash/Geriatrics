/**
 * Bridge script — exposes extracted module logic as window.SM globals.
 *
 * This is a plain (non-module) script loaded by shlav-a-mega.html BEFORE the
 * main <script> block. It provides the canonical implementations of pure
 * functions that were extracted from the monolith into src/ modules.
 *
 * The src/ ES modules remain the source of truth for tests and future Vite build.
 * This file is a manual mirror kept in sync with those modules.
 *
 * Usage in monolith: SM.buildPool(...), SM.getDueQuestions(...), etc.
 */
(function () {
  'use strict';

  // ===== SHUFFLE (Fisher-Yates) =====
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ===== TOPIC STATS =====
  function getTopicStats(questions, sr, topics) {
    var stats = {};
    topics.forEach(function (_, i) { stats[i] = { ok: 0, no: 0, tot: 0 }; });
    questions.forEach(function (q, i) {
      var s = sr[i];
      if (s && s.tot) {
        if (!stats[q.ti]) stats[q.ti] = { ok: 0, no: 0, tot: 0 };
        stats[q.ti].ok += s.ok || 0;
        stats[q.ti].no += (s.tot - (s.ok || 0));
        stats[q.ti].tot += s.tot;
      }
    });
    return stats;
  }

  // ===== EXAM TRAP =====
  function isExamTrap(sr, qIdx) {
    var s = sr[qIdx];
    if (!s || !s.wc) return false;
    var totalAttempts = s.tot || 0;
    if (totalAttempts < 3) return false;
    var wrongValues = Object.values(s.wc);
    if (!wrongValues.length) return false;
    var maxWrong = Math.max.apply(null, wrongValues);
    return maxWrong / totalAttempts >= 0.4;
  }

  // ===== DUE QUESTIONS =====
  function getDueQuestions(sr, limit) {
    var now = Date.now();
    limit = limit || 20;
    return Object.entries(sr)
      .filter(function (kv) { return kv[1].next <= now; })
      .map(function (kv) { return parseInt(kv[0]); })
      .slice(0, limit);
  }

  // ===== BUILD POOL =====
  function buildPool(opts) {
    var questions = opts.questions;
    var sr = opts.sr;
    var topics = opts.topics;
    var filter = opts.filter;
    var topicFilter = opts.topicFilter;

    if (filter === 'traps') {
      var pool = questions.map(function (_, i) { return i; }).filter(function (i) { return isExamTrap(sr, i); });
      return shuffle(pool);
    }

    if (filter === 'weak') {
      var ts = getTopicStats(questions, sr, topics);
      var weakTopics = topics
        .map(function (_, i) { return { i: i, s: ts[i] || { ok: 0, no: 0, tot: 0 } }; })
        .filter(function (p) { return p.s.tot >= 3; })
        .sort(function (a, b) {
          var pa = a.s.tot ? a.s.ok / a.s.tot : 0;
          var pb = b.s.tot ? b.s.ok / b.s.tot : 0;
          return pa - pb;
        })
        .slice(0, 10)
        .map(function (p) { return p.i; });
      var pool;
      if (weakTopics.length === 0) {
        pool = questions.map(function (_, i) { return i; });
      } else {
        pool = questions.map(function (_, i) { return i; }).filter(function (i) { return weakTopics.indexOf(questions[i].ti) >= 0; });
      }
      return shuffle(pool);
    }

    if (filter === 'due') {
      return getDueQuestions(sr);
    }

    if (filter === 'hard') {
      var pool = questions.map(function (_, i) { return i; }).filter(function (i) {
        var s = sr[i]; return s && s.ef < 2.5;
      });
      pool.sort(function (a, b) { return (sr[a] && sr[a].ef || 2.5) - (sr[b] && sr[b].ef || 2.5); });
      if (!pool.length) {
        pool = questions.map(function (_, i) { return i; }).filter(function (i) { return sr[i]; });
        pool.sort(function (a, b) { return (sr[a] && sr[a].ef || 2.5) - (sr[b] && sr[b].ef || 2.5); });
      }
      return pool;
    }

    if (filter === 'slow') {
      var pool = questions.map(function (_, i) { return i; }).filter(function (i) {
        var s = sr[i]; return s && s.at && s.at > 60;
      });
      pool.sort(function (a, b) { return (sr[b] && sr[b].at || 0) - (sr[a] && sr[a].at || 0); });
      return pool;
    }

    if (filter === 'topic' && topicFilter >= 0) {
      var pool = [];
      questions.forEach(function (q, i) { if (q.ti === topicFilter) pool.push(i); });
      return shuffle(pool);
    }

    // Default: 'all' or year filter
    var pool = [];
    questions.forEach(function (q, i) {
      if (filter === 'all' || q.t.indexOf(filter) >= 0) pool.push(i);
    });

    if (filter === 'all') {
      var dueSet = {};
      getDueQuestions(sr).forEach(function (i) { dueSet[i] = true; });
      var tier1 = [], tier2 = [], tier3 = [], tier4 = [];
      pool.forEach(function (i) {
        var s = sr[i];
        if (dueSet[i]) tier1.push(i);
        else if (s && (s.fsrsD > 7 || (s.fsrsD === undefined && s.ef < 1.8))) tier2.push(i);
        else if (s && (s.fsrsD > 4 || (s.fsrsD === undefined && s.ef < 2.2))) tier3.push(i);
        else tier4.push(i);
      });
      return [].concat(shuffle(tier1), shuffle(tier2), shuffle(tier3), shuffle(tier4));
    }

    return shuffle(pool);
  }

  // ===== WEAK TOPICS =====
  function getWeakTopics(questions, sr, topics, n) {
    n = n || 3;
    var stats = getTopicStats(questions, sr, topics);
    return Object.entries(stats)
      .map(function (kv) {
        var ti = Number(kv[0]), s = kv[1];
        return { ti: ti, pct: s.tot ? Math.round(s.ok / s.tot * 100) : null, tot: s.tot, ok: s.ok };
      })
      .filter(function (s) { return s.tot >= 3; })
      .sort(function (a, b) { return a.pct - b.pct; })
      .slice(0, n);
  }

  // ===== RESCUE POOL =====
  function buildRescuePool(questions, sr, topics) {
    var weak = getWeakTopics(questions, sr, topics, 3);
    if (!weak.length) return [];
    var rescueQs = [];
    weak.forEach(function (w) {
      var topicQs = questions.map(function (q, i) { return { i: i, q: q }; }).filter(function (x) { return x.q.ti === w.ti; });
      topicQs.sort(function (a, b) {
        var sa = sr[a.i], sb = sr[b.i];
        var pa = sa && sa.tot ? sa.ok / sa.tot : 0.5;
        var pb = sb && sb.tot ? sb.ok / sb.tot : 0.5;
        return pa - pb;
      });
      rescueQs.push.apply(rescueQs, topicQs.slice(0, 7).map(function (x) { return x.i; }));
    });
    return shuffle(rescueQs);
  }

  // ===== STUDY STREAK =====
  function getStudyStreak(dailyAct) {
    if (!dailyAct) return 0;
    var streak = 0;
    var d = new Date();
    for (var i = 0; i < 365; i++) {
      var key = d.toISOString().slice(0, 10);
      if (dailyAct[key] && dailyAct[key].q > 0) streak++;
      else if (i > 0) break;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  }

  // ===== DAILY ACTIVITY =====
  function trackDailyActivity(dailyAct) {
    var today = new Date().toISOString().slice(0, 10);
    if (!dailyAct[today]) dailyAct[today] = { q: 0, ok: 0, time: 0, sessions: 0 };
    dailyAct[today].q++;
    var keys = Object.keys(dailyAct).sort();
    while (keys.length > 90) { delete dailyAct[keys.shift()]; }
  }

  // ===== OPTION SHUFFLE WITH META-OPTION PINNING =====
  var META_PATTERNS = [
    /^all\s+(of\s+)?the\s+above/i,
    /^none\s+(of\s+)?the\s+above/i,
    /^a\s+and\s+b/i,
    /^a,?\s*b,?\s*(and|&)\s*c/i,
    /^b\s+and\s+c/i,
    /^both\s+(a|b)/i,
    /כל\s*התשובות/,
    /אף\s*תשובה/,
    /תשובות?\s*(א|1)\s*(ו|ו-?)\s*(ב|2)/,
    /תשובות?\s*(ב|2)\s*(ו|ו-?)\s*(ג|3)/,
    /תשובות?\s*(א|1),?\s*(ב|2),?\s*(ו|ו-?)\s*(ג|3)/,
  ];

  function isMetaOption(text) {
    if (!text || typeof text !== 'string') return false;
    var trimmed = text.trim();
    return META_PATTERNS.some(function (re) { return re.test(trimmed); });
  }

  function shuffleOptions(options, correctIndex) {
    if (!options || options.length <= 1) {
      return { map: options ? options.map(function (_, i) { return i; }) : [], correctIndex: correctIndex };
    }
    var n = options.length;
    var pinned = {};
    var unpinned = [];
    options.forEach(function (opt, i) {
      if (isMetaOption(opt)) pinned[i] = true;
      else unpinned.push(i);
    });
    if (unpinned.length <= 1) {
      return { map: options.map(function (_, i) { return i; }), correctIndex: correctIndex };
    }
    var shuffled = unpinned.slice();
    for (var i = shuffled.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = t;
    }
    var map = new Array(n);
    var si = 0;
    for (var i = 0; i < n; i++) {
      if (pinned[i]) map[i] = i;
      else map[i] = shuffled[si++];
    }
    var newCorrectIndex = map.indexOf(correctIndex);
    return { map: map, correctIndex: newCorrectIndex };
  }

  // ===== SR SCORE — pure FSRS math (no side effects) =====
  // Requires shared/fsrs.js globals: fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2
  function srScoreCore(srEntry, correct, qStartTime, fsrsRating) {
    // Initialize SR entry if needed
    if (!srEntry.ef) srEntry.ef = 2.5;
    if (!srEntry.n) srEntry.n = 0;
    if (!srEntry.next) srEntry.next = 0;
    if (srEntry.tot === undefined) { srEntry.tot = 0; srEntry.ok = 0; }

    // Answer time tracking
    var elapsed = Math.round((Date.now() - qStartTime) / 1000);
    if (!srEntry.ts) srEntry.ts = [];
    srEntry.ts.push(elapsed);
    if (srEntry.ts.length > 10) srEntry.ts.shift();
    srEntry.at = Math.round(srEntry.ts.reduce(function (a, b) { return a + b; }, 0) / srEntry.ts.length);
    srEntry.tot++;
    if (correct) srEntry.ok++;

    // FSRS-4.5 scheduling
    var rating = fsrsRating || (correct ? 3 : 1);
    var daysSinceReview = srEntry.lastReview ? Math.max(0, (Date.now() - srEntry.lastReview) / 86400000) : 0;

    // Initialize or migrate FSRS state
    if (srEntry.fsrsS === undefined || srEntry.fsrsD === undefined) {
      if (srEntry.n > 0 || srEntry.ef !== 2.5) {
        var mig = fsrsMigrateFromSM2(srEntry);
        srEntry.fsrsS = mig.s; srEntry.fsrsD = mig.d;
      } else {
        var init = fsrsInitNew(rating);
        srEntry.fsrsS = init.s; srEntry.fsrsD = init.d;
      }
    }

    var rPrev = daysSinceReview > 0 ? fsrsR(daysSinceReview, srEntry.fsrsS) : 1;
    var upd = fsrsUpdate(srEntry.fsrsS, srEntry.fsrsD, rPrev, rating);
    srEntry.fsrsS = Math.round(upd.s * 1000) / 1000;
    srEntry.fsrsD = Math.round(upd.d * 100) / 100;
    srEntry.lastReview = Date.now();

    // FSRS interval → next review
    var fsrsDays = fsrsInterval(srEntry.fsrsS);
    srEntry.next = Date.now() + fsrsDays * 86400000;

    // Keep SM-2 ef/n as proxies for filter compatibility
    srEntry.n = correct ? srEntry.n + 1 : 0;
    // ef mirrors difficulty: D=1→ef=2.5, D=10→ef=1.3
    srEntry.ef = Math.round((2.5 - (srEntry.fsrsD - 1) / (10 - 1) * (2.5 - 1.3)) * 1000) / 1000;

    return srEntry;
  }

  // ===== ESTIMATED EXAM SCORE (monolith canonical version) =====
  // Uses EXAM_FREQ weights + legacy S.ts topic stats + due penalty
  function calcEstScore(examFreq, topicStats, dueSet, questions) {
    var totalFreq = examFreq.reduce(function (a, b) { return a + b; }, 0);
    if (!totalFreq) return null;

    var weightedScore = 0, totalWeight = 0;
    examFreq.forEach(function (freq, ti) {
      if (!freq) return;
      var s = topicStats[ti] || { ok: 0, no: 0, tot: 0 };
      var weight = freq / totalFreq;
      var acc;
      if (s.tot < 3) {
        acc = 0.60;
      } else {
        acc = s.ok / s.tot;
        // Penalize if due questions exist in this topic
        var duePenalty = 0;
        if (dueSet && questions) {
          for (var i = 0; i < questions.length; i++) {
            if (questions[i] && questions[i].ti === ti && dueSet[i]) duePenalty++;
          }
        }
        if (duePenalty > 0) acc = Math.max(0, acc - duePenalty * 0.02);
      }
      weightedScore += acc * weight;
      totalWeight += weight;
    });
    return totalWeight > 0 ? Math.round(weightedScore / totalWeight * 100) : null;
  }

  // ===== SANITIZE (XSS prevention) =====
  function sanitize(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ===== TIME FORMATTER =====
  function fmtT(s) {
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
    return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(sc).padStart(2, '0');
  }

  // ===== REMAP EXPLANATION LETTERS (shuffled options) =====
  function remapExplanationLetters(text, shuf) {
    var inv = {};
    shuf.forEach(function (orig, disp) { inv[orig] = disp; });
    var letters = ['A', 'B', 'C', 'D', 'E'];
    var heb = ['א', 'ב', 'ג', 'ד', 'ה'];
    return text.replace(/\b([A-E])\b/g, function (m, letter) {
      var origIdx = letters.indexOf(letter);
      if (origIdx === -1 || inv[origIdx] === undefined) return m;
      return letters[inv[origIdx]];
    }).replace(/(תשובה\s*)([א-ה])\b/g, function (m, prefix, letter) {
      var origIdx = heb.indexOf(letter);
      if (origIdx === -1 || inv[origIdx] === undefined) return m;
      return prefix + heb[inv[origIdx]];
    });
  }

  // ===== MOCK EXAM POOL BUILDER =====
  function buildMockExamPool(questions, examFreq) {
    var total = examFreq.reduce(function (a, b) { return a + b; }, 0);
    var examPool = [];
    var byTopic = {};
    questions.forEach(function (q, i) {
      var ti = q.ti >= 0 ? q.ti : 39;
      if (!byTopic[ti]) byTopic[ti] = [];
      byTopic[ti].push(i);
    });
    examFreq.forEach(function (freq, ti) {
      if (!freq || !byTopic[ti] || !byTopic[ti].length) return;
      var target = Math.max(1, Math.round(freq / total * 100));
      var src = byTopic[ti].slice().sort(function () { return Math.random() - 0.5; });
      for (var k = 0; k < Math.min(target, src.length); k++) examPool.push(src[k]);
    });
    examPool.sort(function () { return Math.random() - 0.5; });
    return examPool.slice(0, 100);
  }

  // ===== SAFE JSON PARSE =====
  function safeJSONParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try { return JSON.parse(raw); }
    catch (_e) { return fallback; }
  }

  // ===== EXPOSE ON WINDOW =====
  window.SM = {
    shuffle: shuffle,
    getTopicStats: getTopicStats,
    isExamTrap: isExamTrap,
    getDueQuestions: getDueQuestions,
    buildPool: buildPool,
    getWeakTopics: getWeakTopics,
    buildRescuePool: buildRescuePool,
    getStudyStreak: getStudyStreak,
    trackDailyActivity: trackDailyActivity,
    shuffleOptions: shuffleOptions,
    isMetaOption: isMetaOption,
    safeJSONParse: safeJSONParse,
    srScoreCore: srScoreCore,
    calcEstScore: calcEstScore,
    sanitize: sanitize,
    fmtT: fmtT,
    remapExplanationLetters: remapExplanationLetters,
    buildMockExamPool: buildMockExamPool,
  };
})();
