// src/study_plan.js — In-app Study Plan generator (Shlav A slice).
//
// Mirror of FamilyMedicine v1.9.1 / Pnimit v9.86.0 src/features/study_plan/.
// Plain-script IIFE (matches Geri's auth section style); requires
// src/study_plan_algorithm.js to have loaded first (window.SP_ALGO).
//
// Persists to Supabase via study_plan_upsert / study_plan_get RPCs — NEVER
// to localStorage (one user → one plan, must follow them across devices).
// Table public.study_plans + RPCs are shared across the three medical PWAs;
// migration lives in FamilyMedicine/supabase/migrations/0002_study_plans.sql
// and was applied once on the project (krmlzwwelqvlfslwltol).
//
// Globals consumed (defined elsewhere in shlav-a-mega.html):
//   SUPA_URL, SUPA_ANON           — supabase URL + publishable key
//   sanitize, toast, heDir        — utility helpers
//   getCurrentUser                — auth IIFE export
//   render                        — top-level app rerender (no-op if absent)

(function () {
  'use strict';

  const APP_KEY = 'shlav';
  const SYLLABUS_URL = 'data/syllabus_data.json';
  const DEFAULT_HOURS_PER_WEEK = 8;
  const DEFAULT_RAMP_WEEKS = 3;

  // In-memory per-page cache.
  const _state = {
    loading: false,
    generating: false,
    fetched: false,
    display: null,
    planJson: null,
    examDateISO: null,
    hoursPerWeek: DEFAULT_HOURS_PER_WEEK,
    rampWeeks: DEFAULT_RAMP_WEEKS,
    message: '',
    messageTone: '',
  };
  let _SYLLABUS = null;            // cached after first fetch
  let _syllabusInflight = null;    // dedupe parallel fetches

  function _getSyllabus() {
    if (_SYLLABUS) return Promise.resolve(_SYLLABUS);
    if (_syllabusInflight) return _syllabusInflight;
    _syllabusInflight = fetch(SYLLABUS_URL)
      .then((r) => { if (!r.ok) throw new Error('http_' + r.status); return r.json(); })
      .then((d) => { _SYLLABUS = d; _syllabusInflight = null; return d; })
      .catch((e) => { _syllabusInflight = null; throw e; });
    return _syllabusInflight;
  }

  // ─────────────────────── RPC plumbing ───────────────────────

  function _rpc(fn, body) {
    return fetch(SUPA_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPA_ANON,
        'Authorization': 'Bearer ' + SUPA_ANON,
      },
      body: JSON.stringify(body),
    }).then((res) => {
      if (!res.ok) {
        return res.text().catch(() => '').then((txt) => ({
          ok: false, error: 'http_' + res.status, message: String(txt).slice(0, 200),
        }));
      }
      return res.json().catch(() => null).then((d) => {
        if (!d || typeof d !== 'object') return { ok: false, error: 'bad_response' };
        return d;
      });
    }).catch((e) => ({ ok: false, error: 'network', message: String(e) }));
  }

  function studyPlanGet(username) {
    return _rpc('study_plan_get', { p_username: username, p_app: APP_KEY });
  }
  function studyPlanUpsert(username, examDateISO, hoursPerWeek, rampWeeks, planJson) {
    return _rpc('study_plan_upsert', {
      p_username: username,
      p_app: APP_KEY,
      p_exam_date: examDateISO,
      p_hours_per_week: hoursPerWeek,
      p_ramp_weeks: rampWeeks,
      p_plan_json: planJson,
    });
  }

  // ─────────────────────── helpers ───────────────────────

  function _todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function _addDaysISO(iso, days) {
    return window.SP_ALGO._addDaysISO(iso, days);
  }

  function _setStatus(msg, tone) {
    _state.message = msg || '';
    _state.messageTone = tone || '';
    const el = document.getElementById('sp-status');
    if (el) {
      el.textContent = _state.message;
      el.style.color = tone === 'error' ? '#991b1b' : tone === 'success' ? '#059669' : '#64748b';
    }
  }

  // ─────────────────────── public render ───────────────────────

  function renderStudyPlanSection() {
    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

    // Auto-fetch existing plan on first render after login (fire-and-forget).
    if (user && !_state.fetched && !_state.loading) {
      _state.loading = true;
      _state.fetched = true;
      studyPlanGet(user.username).then((r) => {
        _state.loading = false;
        if (r && r.ok && r.plan && r.plan.plan_json) {
          _state.display = r.plan.plan_json.display || null;
          _state.planJson = r.plan.plan_json || null;
          _state.examDateISO = r.plan.exam_date || null;
          _state.hoursPerWeek = Number(r.plan.hours_per_week) || DEFAULT_HOURS_PER_WEEK;
          _state.rampWeeks = Number(r.plan.ramp_weeks) || DEFAULT_RAMP_WEEKS;
          if (typeof render === 'function') render();
        }
      }).catch(() => { _state.loading = false; });
    }

    // Pre-warm syllabus fetch (don't block first render).
    _getSyllabus().catch(() => {});

    const defaultExam = _state.examDateISO || _addDaysISO(_todayISO(), 19 * 7);
    const minExam = _addDaysISO(_todayISO(), 7 * 7);

    let h = `
<div class="card" style="padding:14px;margin-top:12px" dir="rtl">
  <div style="font-weight:700;font-size:12px;margin-bottom:6px">📅 תכנית לימוד</div>
  <div style="font-size:11px;color:rgb(var(--fg2));margin-bottom:12px;line-height:1.6">
    תכנית לימוד שבועית משוקללת לפי תדירות הופעת נושאים בבחינות שלב א׳ גריאטריה קודמות (3,833 שאלות,
    46 נושאים). הנתונים אמפיריים — מבוססים על מאגר השאלות של האפליקציה, לא על ניחוש.
  </div>`;

    if (!user) {
      h += `
  <div style="padding:10px;background:#fef9c3;border:1px solid #fde68a;border-radius:10px;font-size:11px;color:#854d0e;line-height:1.6;margin-bottom:10px">
    כדי לשמור את התכנית בענן ולפתוח אותה מכל מכשיר — <strong>התחבר לחשבון</strong> או הירשם בחלק החשבון.
    אפשר ליצור תכנית גם כאורח, אך היא לא תישמר בענן.
  </div>`;
    }

    h += `
  <label style="display:block;font-size:11px;font-weight:700;margin-bottom:4px">תאריך הבחינה</label>
  <input id="sp-exam-date" type="date" min="${minExam}" value="${sanitize(defaultExam)}"
    style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;margin-bottom:10px;direction:ltr;text-align:left;font-family:inherit;background:inherit;color:inherit">

  <label style="display:block;font-size:11px;font-weight:700;margin-bottom:4px">
    שעות לימוד בשבוע: <span id="sp-hpw-val" style="color:#0891b2">${_state.hoursPerWeek}</span>h
  </label>
  <input id="sp-hpw" type="range" min="1" max="20" step="1" value="${_state.hoursPerWeek}"
    style="width:100%;margin-bottom:10px;accent-color:#0891b2">

  <label style="display:block;font-size:11px;font-weight:700;margin-bottom:4px">
    שבועות חזרה (Mock + ramp): <span id="sp-ramp-val" style="color:#0891b2">${_state.rampWeeks}</span>
  </label>
  <input id="sp-ramp" type="range" min="1" max="6" step="1" value="${_state.rampWeeks}"
    style="width:100%;margin-bottom:12px;accent-color:#0891b2">

  <div style="display:flex;gap:6px;flex-wrap:wrap">
    <button class="btn btn-p" data-action="sp-generate" ${_state.generating ? 'disabled' : ''}
      style="flex:1;font-size:12px;min-height:42px;font-weight:700">
      ${_state.generating ? '⏳ יוצר…' : '✨ צור תכנית'}
    </button>
    ${_state.display ? `
    <button class="btn" data-action="sp-export-ics"
      style="font-size:11px;min-height:42px;background:#ecfeff;color:#155e75;border:1px solid #a5f3fc;padding:8px 14px">
      📅 ייצא ל-Calendar (.ics)
    </button>` : ''}
  </div>
  <div id="sp-status" style="font-size:11px;margin-top:10px;text-align:center;min-height:16px;color:${_state.messageTone === 'error' ? '#991b1b' : _state.messageTone === 'success' ? '#059669' : '#64748b'}">${sanitize(_state.message)}</div>
</div>`;

    if (_state.display) h += _renderPlan(_state.display);
    return h;
  }

  function _renderPlan(display) {
    const s = display.summary;
    let h = `
<div style="padding:14px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:12px;margin:12px 0;color:#0f172a" dir="rtl">
  <div style="font-size:13px;font-weight:700;color:#134e4a;margin-bottom:8px">📊 סיכום</div>
  <div style="font-size:11px;line-height:1.8">
    <div>תאריך הבחינה: <strong>${sanitize(s.exam_date)}</strong></div>
    <div>סה"כ שבועות: <strong>${s.total_weeks}</strong> (לימוד נושאים: ${s.topic_weeks}, חזרה ומוקים: ${s.ramp_weeks})</div>
    <div>שעות לימוד שבועיות: <strong>${s.hours_per_week}h</strong> (≈ ${(s.hours_per_week*0.7).toFixed(1)}h נושאים, ${(s.hours_per_week*0.3).toFixed(1)}h שאלות)</div>
    <div>יעד יומי: <strong>${s.daily_q_target} שאלות</strong> במאגר</div>
  </div>
</div>`;

    h += `<div style="font-weight:700;font-size:12px;margin:8px 0 6px" dir="rtl">🗓 שבועות לימוד</div>`;
    display.weeks.forEach((w) => {
      h += `
<details style="margin-bottom:6px;border:1px solid rgb(var(--brd));border-radius:10px;background:rgb(var(--bg2))" dir="rtl">
  <summary style="padding:10px 12px;cursor:pointer;font-size:12px;font-weight:700;list-style:none">
    שבוע ${w.idx} — ${sanitize(w.start_date)} → ${sanitize(w.end_date)}
    <span style="float:left;color:#0891b2;font-weight:400">${w.used_hours}h • ${w.topics.length} נושאים</span>
  </summary>
  <div style="padding:0 12px 12px">`;
      if (w.topics.length === 0) {
        h += `<div style="font-size:11px;color:rgb(var(--fg2));padding:6px 0">_ללא נושאים בשבוע זה — שמור לחזרה ושאלות._</div>`;
      } else {
        w.topics.forEach((t) => {
          const en = sanitize(t.en);
          const he = t.he ? sanitize(t.he) : '';
          const kw = (t.keywords || []).slice(0, 6).map(sanitize).join(', ');
          h += `
    <div style="padding:8px 0;border-top:1px solid rgb(var(--brd))">
      <div style="font-size:11px;font-weight:700;line-height:1.4" dir="${heDir(he || en)}">
        ${he ? `<span>${he}</span> · ` : ''}<span style="color:rgb(var(--fg2));font-weight:500;direction:ltr;display:inline-block">${en}</span>
      </div>
      <div style="font-size:10px;color:#0891b2;margin-top:2px">${t.hours}h · ${t.frequency_pct}% מהבחינות</div>
      ${kw ? `<div style="font-size:10px;color:rgb(var(--fg2));margin-top:2px;direction:ltr;text-align:left;font-style:italic">${kw}</div>` : ''}
    </div>`;
        });
      }
      h += `
  </div>
</details>`;
    });

    if (display.ramp_weeks.length) {
      h += `<div style="font-weight:700;font-size:12px;margin:12px 0 6px" dir="rtl">🎯 שבועות מוק וחזרה</div>`;
      display.ramp_weeks.forEach((r) => {
        h += `
<div style="margin-bottom:6px;padding:10px 12px;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;color:#0f172a" dir="rtl">
  <div style="font-size:12px;font-weight:700;color:#92400e">
    ${sanitize(r.mock_label)} — שבוע ${r.idx}
    <span style="float:left;color:#b45309;font-weight:400;font-size:11px">${sanitize(r.start_date)} → ${sanitize(r.end_date)}</span>
  </div>
  <div style="font-size:11px;color:#78350f;margin-top:6px;line-height:1.6">${sanitize(r.advice)}</div>
</div>`;
      });
    }
    return h;
  }

  // ─────────────────────── event handlers ───────────────────────

  function _readInputs() {
    const exam = document.getElementById('sp-exam-date');
    const hpw = document.getElementById('sp-hpw');
    const ramp = document.getElementById('sp-ramp');
    return {
      examDateISO: (exam && exam.value) || '',
      hoursPerWeek: hpw ? Number(hpw.value) : DEFAULT_HOURS_PER_WEEK,
      rampWeeks: ramp ? Number(ramp.value) : DEFAULT_RAMP_WEEKS,
    };
  }

  async function _handleGenerate() {
    if (_state.generating) return;
    const inputs = _readInputs();
    if (!inputs.examDateISO) { _setStatus('בחר תאריך בחינה', 'error'); return; }

    _state.generating = true;
    _setStatus('מחשב תכנית…', '');

    let SYLLABUS;
    try { SYLLABUS = await _getSyllabus(); }
    catch (e) {
      _state.generating = false;
      _setStatus('שגיאה בטעינת נתוני הסילבוס: ' + (e && e.message || e), 'error');
      if (typeof render === 'function') render();
      return;
    }

    let display, planJson;
    try {
      const out = window.SP_ALGO.buildPlan({
        topics: SYLLABUS.Geri.topics,
        startDateISO: _todayISO(),
        examDateISO: inputs.examDateISO,
        hoursPerWeek: inputs.hoursPerWeek,
        rampWeeks: inputs.rampWeeks,
      });
      display = out.display;
      planJson = out.planJson;
    } catch (e) {
      _state.generating = false;
      const map = {
        exam_date_must_be_after_start_date: 'תאריך הבחינה חייב להיות אחרי היום',
        not_enough_weeks: 'יש פחות מ-' + (inputs.rampWeeks + 4) + ' שבועות עד הבחינה — הזז את התאריך או הקטן את שבועות החזרה',
      };
      _setStatus(map[e.message] || ('שגיאה: ' + e.message), 'error');
      if (typeof render === 'function') render();
      return;
    }

    _state.display = display;
    _state.planJson = planJson;
    _state.examDateISO = inputs.examDateISO;
    _state.hoursPerWeek = inputs.hoursPerWeek;
    _state.rampWeeks = inputs.rampWeeks;
    _state.generating = false;

    const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
    if (!user) {
      _setStatus('התכנית נוצרה (לא נשמרה — התחבר לחשבון לסנכרון בענן)', 'success');
      if (typeof render === 'function') render();
      return;
    }

    _setStatus('שומר בענן…', '');
    const r = await studyPlanUpsert(user.username, inputs.examDateISO, inputs.hoursPerWeek, inputs.rampWeeks, planJson);
    if (r && r.ok) {
      _setStatus('✓ התכנית נשמרה בענן', 'success');
      if (typeof toast === 'function') toast('✅ תכנית הלימוד נשמרה', 'success');
    } else {
      const map = {
        no_such_user: 'המשתמש לא נמצא — התחבר מחדש',
        invalid_exam_date: 'תאריך בחינה לא חוקי',
        invalid_hours_per_week: 'מספר שעות לא חוקי',
        invalid_ramp_weeks: 'מספר שבועות חזרה לא חוקי',
        bad_response: 'שגיאת רשת — נסה שוב',
      };
      _setStatus('✗ ' + (map[r.error] || (r.message || r.error || 'שגיאה')), 'error');
    }
    if (typeof render === 'function') render();
  }

  // ─────────────────────── ICS export ───────────────────────

  function _icsEscape(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }
  function _icsDate(iso) { return iso.replace(/-/g, ''); }
  function _icsDtstamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }

  function _buildICS(display) {
    const dtstamp = _icsDtstamp();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Shlav A Mega//Study Plan//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    display.weeks.forEach((w) => {
      if (!w.topics.length) return;
      const summary = 'גריאטריה — שבוע ' + w.idx + ' (' + w.used_hours + 'h)';
      const body = w.topics
        .map((t) => '• ' + (t.he ? t.he + ' / ' : '') + t.en + ' — ' + t.hours + 'h (' + t.frequency_pct + '%)')
        .join('\n');
      const dtEndExclusive = _addDaysISO(w.start_date, 7);
      lines.push(
        'BEGIN:VEVENT',
        'UID:shlav-week-' + w.idx + '-' + w.start_date + '@geriatrics.local',
        'DTSTAMP:' + dtstamp,
        'DTSTART;VALUE=DATE:' + _icsDate(w.start_date),
        'DTEND;VALUE=DATE:' + _icsDate(dtEndExclusive),
        'SUMMARY:' + _icsEscape(summary),
        'DESCRIPTION:' + _icsEscape(body),
        'END:VEVENT'
      );
    });

    display.ramp_weeks.forEach((r) => {
      const summary = 'גריאטריה — ' + r.mock_label + ' (שבוע חזרה ' + r.idx + ')';
      const dtEndExclusive = _addDaysISO(r.start_date, 7);
      lines.push(
        'BEGIN:VEVENT',
        'UID:shlav-ramp-' + r.idx + '-' + r.start_date + '@geriatrics.local',
        'DTSTAMP:' + dtstamp,
        'DTSTART;VALUE=DATE:' + _icsDate(r.start_date),
        'DTEND;VALUE=DATE:' + _icsDate(dtEndExclusive),
        'SUMMARY:' + _icsEscape(summary),
        'DESCRIPTION:' + _icsEscape(r.advice),
        'END:VEVENT'
      );
    });

    lines.push(
      'BEGIN:VEVENT',
      'UID:shlav-exam-' + display.summary.exam_date + '@geriatrics.local',
      'DTSTAMP:' + dtstamp,
      'DTSTART;VALUE=DATE:' + _icsDate(display.summary.exam_date),
      'DTEND;VALUE=DATE:' + _icsDate(_addDaysISO(display.summary.exam_date, 1)),
      'SUMMARY:' + _icsEscape('🎯 בחינת שלב א\' גריאטריה'),
      'DESCRIPTION:' + _icsEscape('בחינת שלב א\' גריאטריה (P005-2026)'),
      'END:VEVENT'
    );

    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function _handleExportICS() {
    if (!_state.display) { _setStatus('צור תכנית לפני הייצוא', 'error'); return; }
    const ics = _buildICS(_state.display);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shlav-a-study-plan-' + _state.display.summary.exam_date + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof toast === 'function') toast('📅 הקובץ הורד — פתח אותו ב-Google Calendar / Outlook / Apple Calendar', 'success');
  }

  function _bindSliderLabels() {
    const hpw = document.getElementById('sp-hpw');
    const ramp = document.getElementById('sp-ramp');
    if (hpw && !hpw.dataset.bound) {
      hpw.dataset.bound = '1';
      hpw.addEventListener('input', () => {
        const el = document.getElementById('sp-hpw-val');
        if (el) el.textContent = hpw.value;
      });
    }
    if (ramp && !ramp.dataset.bound) {
      ramp.dataset.bound = '1';
      ramp.addEventListener('input', () => {
        const el = document.getElementById('sp-ramp-val');
        if (el) el.textContent = ramp.value;
      });
    }
  }

  function bindStudyPlanEvents() {
    _bindSliderLabels();
    if (window.__studyPlanBound) return;
    window.__studyPlanBound = true;
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('[data-action]');
      if (!t) return;
      const a = t.dataset.action;
      if (a === 'sp-generate') _handleGenerate();
      else if (a === 'sp-export-ics') _handleExportICS();
    });
  }

  Object.assign(window, {
    renderStudyPlanSection: renderStudyPlanSection,
    bindStudyPlanEvents: bindStudyPlanEvents,
    studyPlanGet: studyPlanGet,
    studyPlanUpsert: studyPlanUpsert,
  });
})();
