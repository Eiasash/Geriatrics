// src/study_plan_algorithm.js — pure algorithm primitives for the in-app
// Study Plan generator (Shlav A slice). Plain JS browser script (no module);
// exposes window.SP_ALGO = { allocateHours, schedule, render, buildPlan,
// rampStages, defaultDailyQTarget }.
//
// `allocateHours` and `schedule` are ported VERBATIM from
// `auto-audit/scripts/generate_study_plan.py`. Any drift here desyncs the
// in-app plan from the Python reference, so the cross-language fixture in
// tests/studyPlanAlgorithm.test.js pins them together. If you change either
// function, the Python copy MUST be updated in lockstep.
//
// `render()` is JS-only — it builds the structured display object the
// Settings UI consumes. The Python version emits Markdown, which we don't
// want in-app.
//
// Mirror of FamilyMedicine v1.9.1 / Pnimit v9.86.0 algorithm.js.

(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // allocate_hours — VERBATIM from generate_study_plan.py
  // ─────────────────────────────────────────────────────────────
  function allocateHours(topics, totalHours) {
    const totalFreq = topics.reduce((s, t) => s + t.frequency_pct, 0) || 100.0;
    return topics.map((t) => {
      const share = t.frequency_pct / totalFreq;
      const raw = Math.max(0.5, Math.min(6.0, share * totalHours));
      const hours = Math.round(raw * 10) / 10;
      return Object.assign({}, t, { hours: hours });
    });
  }

  // ─────────────────────────────────────────────────────────────
  // schedule — VERBATIM from generate_study_plan.py
  // ─────────────────────────────────────────────────────────────
  function schedule(topics, hoursPerWeek, weeks) {
    const weeklyBudget = hoursPerWeek * 0.7;
    const sortedTopics = topics.slice().sort((a, b) => b.frequency_pct - a.frequency_pct);
    const weeksArr = [];
    for (let i = 0; i < weeks; i++) weeksArr.push([]);
    const used = new Array(weeks).fill(0);

    for (let k = 0; k < sortedTopics.length; k++) {
      const t = sortedTopics[k];
      let placed = false;
      for (let i = 0; i < weeks; i++) {
        if (used[i] + t.hours <= weeklyBudget + 0.5 + 1e-9) {
          weeksArr[i].push(t);
          used[i] += t.hours;
          placed = true;
          break;
        }
      }
      if (!placed) {
        let minIdx = 0;
        for (let j = 1; j < weeks; j++) if (used[j] < used[minIdx]) minIdx = j;
        weeksArr[minIdx].push(t);
        used[minIdx] += t.hours;
      }
    }

    const usedRounded = used.map((u) => Math.round(u * 10) / 10);
    return { weeks: weeksArr, used: usedRounded };
  }

  // ─────────────────────────────────────────────────────────────
  // render — JS-only structured display data for the Settings UI
  // ─────────────────────────────────────────────────────────────
  const RAMP_BUILDUP = [
    {
      label: 'בחינת דמה #1',
      advice:
        'בחינת דמה ראשונה במצב מלא ומוקצב. סקירת כל טעות, סימון לחזרה (FSRS). חזרה חמה: 5 הנושאים החלשים ביותר במוק (בדרך כלל בעלי תדירות גבוהה שציון < 70%).',
    },
    {
      label: 'בחינת דמה #2',
      advice:
        'בחינת דמה שנייה — סט שאלות חדש במצב מוקצב. השווה למוק #1: אילו נושאים השתפרו ואילו לא. תרגול ממוקד בנושאים בעלי תדירות גבוהה שציון < 70%.',
    },
    {
      label: 'תרגול ממוקד',
      advice:
        'תרגול אינטנסיבי בנושאים החלשים שזוהו במוקים — 40-50 שאלות/יום מהמאגר. סקירת FSRS יומית. בלי חומר חדש מהותי — העמקה והבהרה של אלגוריתמים ופרוטוקולים.',
    },
    {
      label: 'בחינת דמה #3',
      advice:
        'בחינת דמה שלישית במצב מלא. עדכון רשימת הנושאים החלשים. תרגול נוסף בנושאים שעוד לא הגיעו ל-70% — לא ללמוד חומר חדש, רק להעמיק ולחדד.',
    },
    {
      label: 'תרגול שאלות',
      advice:
        'תרגול שאלות אינטנסיבי — 50/יום מהמאגר עם דגש על נושאים בעלי תדירות גבוהה. סקירת FSRS יומית. בלי חומר חדש; חזרות קצרות בלבד על אלגוריתמים מרכזיים.',
    },
  ];

  const RAMP_TAPER = {
    label: 'הכנה אחרונה',
    advice:
      'שבוע פתיחת מבחן: חזרה קלה בלבד, 8 שעות שינה, ללא חומר חדש ב-48 השעות האחרונות. סימולציה אחרונה (חצי בחינה) 4-5 ימים לפני. אין למידה ביום שלפני.',
  };

  function rampStages(rampWeeks) {
    const n = Math.max(1, Math.min(6, rampWeeks | 0));
    if (n === 1) return [RAMP_TAPER];
    return RAMP_BUILDUP.slice(0, n - 1).concat([RAMP_TAPER]);
  }

  function _addDaysISO(iso, days) {
    const parts = iso.split('-').map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    const ms = Date.UTC(y, m - 1, d) + days * 86400000;
    const dt = new Date(ms);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return yy + '-' + mm + '-' + dd;
  }

  function defaultDailyQTarget(hoursPerWeek) {
    const hpw = Number(hoursPerWeek);
    if (!Number.isFinite(hpw) || hpw <= 0) return 10;
    return Math.max(5, Math.min(60, Math.round(hpw * 1.3)));
  }

  function render(args) {
    const startDateISO = args.startDateISO;
    const examDateISO  = args.examDateISO;
    const hoursPerWeek = args.hoursPerWeek;
    const rampWeeks    = args.rampWeeks;
    const weeks        = args.weeks;
    const used         = args.used;
    const dqt = (args.dailyQTarget == null) ? defaultDailyQTarget(hoursPerWeek) : args.dailyQTarget;
    const topicWeeks = weeks.length;
    const totalWeeks = topicWeeks + rampWeeks;

    const weeksOut = weeks.map((wTopics, i) => {
      const startISO = _addDaysISO(startDateISO, i * 7);
      const endISO = _addDaysISO(startISO, 6);
      return {
        idx: i + 1,
        start_date: startISO,
        end_date: endISO,
        topics: wTopics.map((t) => ({
          id: t.id,
          en: t.en,
          he: t.he,
          hours: t.hours,
          frequency_pct: t.frequency_pct,
          keywords: Array.isArray(t.keywords) ? t.keywords.slice(0, 8) : [],
        })),
        used_hours: used[i],
      };
    });

    const rampOut = [];
    const stages = rampStages(rampWeeks);
    for (let j = 0; j < rampWeeks; j++) {
      const startISO = _addDaysISO(startDateISO, (topicWeeks + j) * 7);
      const endISO = _addDaysISO(startISO, 6);
      const stage = stages[j] || stages[stages.length - 1];
      rampOut.push({
        idx: j + 1,
        start_date: startISO,
        end_date: endISO,
        mock_label: stage.label,
        advice: stage.advice,
      });
    }

    return {
      weeks: weeksOut,
      ramp_weeks: rampOut,
      summary: {
        start_date: startDateISO,
        exam_date: examDateISO,
        total_weeks: totalWeeks,
        topic_weeks: topicWeeks,
        ramp_weeks: rampWeeks,
        hours_per_week: hoursPerWeek,
        daily_q_target: dqt,
      },
    };
  }

  function buildPlan(args) {
    const topics       = args.topics;
    const startDateISO = args.startDateISO;
    const examDateISO  = args.examDateISO;
    const hoursPerWeek = args.hoursPerWeek;
    const rampWeeks    = args.rampWeeks;
    const start = new Date(startDateISO + 'T00:00:00Z').getTime();
    const exam  = new Date(examDateISO + 'T00:00:00Z').getTime();
    if (!(exam > start)) throw new Error('exam_date_must_be_after_start_date');
    const totalWeeks = Math.floor((exam - start) / (86400000 * 7));
    if (totalWeeks < rampWeeks + 4) throw new Error('not_enough_weeks');
    const topicWeeks = totalWeeks - rampWeeks;
    const totalTopicHours = topicWeeks * hoursPerWeek * 0.7;

    const dqt = (args.dailyQTarget == null) ? defaultDailyQTarget(hoursPerWeek) : args.dailyQTarget;

    const allocated = allocateHours(topics, totalTopicHours);
    const sched = schedule(allocated, hoursPerWeek, topicWeeks);
    const display = render({
      startDateISO: startDateISO,
      examDateISO: examDateISO,
      hoursPerWeek: hoursPerWeek,
      rampWeeks: rampWeeks,
      weeks: sched.weeks,
      used: sched.used,
      dailyQTarget: dqt,
    });

    const planJson = {
      version: 1,
      generated_at: new Date().toISOString(),
      inputs: {
        startDateISO: startDateISO,
        examDateISO: examDateISO,
        hoursPerWeek: hoursPerWeek,
        rampWeeks: rampWeeks,
        dailyQTarget: dqt,
      },
      allocated: allocated,
      display: display,
    };
    return { display: display, planJson: planJson };
  }

  const SP_ALGO = {
    allocateHours: allocateHours,
    schedule: schedule,
    render: render,
    buildPlan: buildPlan,
    rampStages: rampStages,
    defaultDailyQTarget: defaultDailyQTarget,
    _addDaysISO: _addDaysISO,
  };

  // Browser global. The vm-based test loads this script into a context with
  // `window` set to the same object; node tests can read SP_ALGO off it.
  if (typeof window !== 'undefined') {
    window.SP_ALGO = SP_ALGO;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.SP_ALGO = SP_ALGO;
  }
})();
