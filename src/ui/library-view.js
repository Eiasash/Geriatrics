/**
 * Library tab renderer — extracted from shlav-a-mega.html.
 *
 * Plain (non-module) script loaded AFTER bridge.js and AFTER the main
 * <script> block's data/state init. Reads globals from the monolith:
 *
 * Data globals:  QZ, TOPICS, TOPIC_REF, HAZ_CHAPTERS, HAZZARD_MARKED_PARTS,
 *                SYL_HAR_ALL, SYL_HAR_BASE, SYL_LAWS, SYL_ARTICLES
 * State globals: S, libSec, hazChOpen, harChOpen, _hazData, _harData,
 *                _hazLoading, _harLoading
 * Functions:     getTopicStats, getHazPdf, render, buildPool
 *                (called via onclick strings, resolved from window)
 *
 * Exposes: window.renderLibrary (replaces the monolith's inline version)
 */
(function () {
  'use strict';

  function _rlHazzardReader() {
    var ch = _hazData[String(hazChOpen)];
    var allHazChNums = Object.keys(_hazData).map(Number).sort(function (a, b) { return a - b; });
    var curIdx = allHazChNums.indexOf(hazChOpen);
    var prevCh = curIdx > 0 ? allHazChNums[curIdx - 1] : null;
    var nextCh = curIdx < allHazChNums.length - 1 ? allHazChNums[curIdx + 1] : null;
    var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
      '<button onclick="hazChOpen=null;render()" style="background:rgb(var(--bg2));border:none;border-radius:8px;padding:6px 12px;font-size:11px;cursor:pointer">\u2190 Back</button>' +
      '<div style="font-size:12px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Ch ' + hazChOpen + ': ' + ch.title + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
      (prevCh ? '<button onclick="openHazzardChapter(' + prevCh + ')" style="font-size:10px;padding:5px 10px;background:rgb(var(--bg2));border:1px solid rgb(var(--brd));border-radius:8px;cursor:pointer">\u2039 Ch ' + prevCh + '</button>' : '') +
      '<button onclick="quizMeOnChapter(hazChOpen,_hazData[String(hazChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer">\ud83e\udde0 Quiz</button>' +
      '<button onclick="generateQuestionsFromChapter(\'haz\',hazChOpen,_hazData[String(hazChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#0ea5e9;color:#fff;border:none;border-radius:8px;cursor:pointer">\u2728 Generate Qs</button>' +
      '<button onclick="aiSummarizeChapter(hazChOpen,_hazData[String(hazChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#059669;color:#fff;border:none;border-radius:8px;cursor:pointer">\ud83d\udcdd Summary</button>' +
      '<button onclick="window.open(getHazPdf(String(hazChOpen)),\'_blank\')" style="font-size:10px;padding:5px 10px;background:rgb(var(--red-bg));color:#dc2626;border:1px solid rgb(var(--red-brd));border-radius:8px;cursor:pointer">\ud83d\udcc4 PDF</button>' +
      (nextCh ? '<button onclick="openHazzardChapter(' + nextCh + ')" style="font-size:10px;padding:5px 10px;background:rgb(var(--bg2));border:1px solid rgb(var(--brd));border-radius:8px;cursor:pointer">Ch ' + nextCh + ' \u203a</button>' : '') +
      '</div>' +
      '<div id="quiz-me-box"></div>' +
      '<div class="card" style="padding:16px">';
    var _hazRelTopics = Object.entries(TOPIC_REF).filter(function (kv) { return kv[1] && kv[1].s === 'haz'; });
    var _hazChTopicIdx = _hazRelTopics.find(function (kv) { return String(kv[1].ch) === String(hazChOpen); });
    if (_hazChTopicIdx) {
      var _hti = +_hazChTopicIdx[0];
      var _hts = getTopicStats()[_hti] || { ok: 0, no: 0, tot: 0 };
      var _htpct = _hts.tot ? Math.round(_hts.ok / _hts.tot * 100) : null;
      var _htqCount = QZ.filter(function (q) { return q.ti === _hti; }).length;
      h += '<div style="display:flex;gap:8px;margin-bottom:12px;padding:8px 12px;background:rgb(var(--red-bg));border-radius:10px;font-size:10px;align-items:center">' +
        '<span>\ud83d\udcdd ' + _htqCount + ' questions on this topic</span>' +
        (_htpct !== null ? '<span style="font-weight:700;color:' + (_htpct >= 70 ? '#059669' : _htpct >= 50 ? '#d97706' : '#dc2626') + '">' + _htpct + '% accuracy</span>' : '<span style="color:rgb(var(--fg3))">Not attempted yet</span>') +
        '<button onclick="tab=\'quiz\';filt=\'topic\';topicFilt=' + _hti + ';buildPool();render()" style="margin-left:auto;font-size:10px;padding:4px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;cursor:pointer">\u25b6 Drill</button>' +
        '</div>';
    }
    ch.sections.forEach(function (sec) {
      if (sec.title) { h += '<div style="font-size:13px;font-weight:800;color:rgb(var(--red-fg));margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid rgb(var(--red-brd))">' + sec.title + '</div>'; }
      sec.content.forEach(function (p) { h += '<p style="font-size:11.5px;line-height:1.9;color:rgb(var(--fg));margin:0 0 10px;text-align:justify">' + p + '</p>'; });
    });
    h += '</div>';
    return h;
  }

  function _rlHazzardList() {
    var _hazEntries = Object.entries(HAZ_CHAPTERS).map(function (kv) {
      var name = kv[0], info = kv[1];
      var chNum = parseInt(info.ch);
      var partNum = chNum <= 6 ? 1 : chNum <= 13 ? 2 : chNum <= 30 ? 3 : chNum <= 48 ? 4 : chNum <= 66 ? 5 : chNum <= 72 ? 6 : chNum <= 87 ? 7 : chNum <= 96 ? 8 : 9;
      var color = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'][partNum];
      return { name: name, ch: info.ch, p: info.p, color: color, chNum: chNum };
    }).sort(function (a, b) { return a.chNum - b.chNum; });
    var _hazTopicMap = {};
    Object.entries(TOPIC_REF).forEach(function (kv) { if (kv[1] && kv[1].s === 'haz') _hazTopicMap[String(kv[1].ch)] = +kv[0]; });
    var h = '<div class="card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">\ud83d\udcd5 Hazzard\'s Geriatric Medicine 8e</div>' +
      '<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">' + _hazEntries.length + ' chapters \u00b7 Tap to read in-app \u00b7 <span style="color:#dc2626">red</span> = Part I \u00b7 colors by part</div>';
    _hazEntries.forEach(function (e) {
      var _ti = _hazTopicMap[String(e.ch)];
      var _stats = _ti !== undefined ? getTopicStats()[_ti] : null;
      var _pct = _stats && _stats.tot ? Math.round(_stats.ok / _stats.tot * 100) : null;
      var _qCnt = _ti !== undefined ? QZ.filter(function (q) { return q.ti === _ti; }).length : 0;
      var hazCh = _hazData && _hazData[String(e.chNum)];
      var wc = hazCh ? '~' + Math.round(hazCh.wordCount / 250) + ' min' : 'tap to load';
      h += '<div onclick="openHazzardChapter(' + e.chNum + ')" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgb(var(--brd));cursor:pointer">' +
        '<span style="background:' + e.color + ';color:#fff;font-size:10px;font-weight:700;padding:4px 8px;border-radius:8px;min-width:46px;text-align:center">Ch ' + e.ch + '</span>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e.name + '</div>' +
        '<div style="font-size:9px;color:rgb(var(--fg3));margin-top:2px">' + wc + (_qCnt ? ' \u00b7 ' + _qCnt + ' Qs' : '') + (_pct !== null ? ' \u00b7 <span style="font-weight:700;color:' + (_pct >= 70 ? '#059669' : _pct >= 50 ? '#d97706' : '#dc2626') + '">' + _pct + '%</span>' : '') + '</div>' +
        '</div>' +
        (_ti !== undefined ? '<button onclick="event.stopPropagation();tab=\'quiz\';filt=\'topic\';topicFilt=' + _ti + ';buildPool();render()" style="font-size:9px;padding:3px 8px;background:rgb(var(--red-bg));color:#dc2626;border:none;border-radius:6px;cursor:pointer;flex-shrink:0">\u25b6</button>' : '') +
        '<span style="font-size:18px;color:rgb(var(--fg3))">\u203a</span></div>';
    });
    h += '</div>';
    h += '<div class="card" style="padding:14px;margin-top:8px">' +
      '<div onclick="document.getElementById(\'haz-annotated\').style.display=document.getElementById(\'haz-annotated\').style.display===\'none\'?\'block\':\'none\'" style="display:flex;align-items:center;gap:8px;cursor:pointer">' +
      '<div style="font-size:12px;font-weight:700">\ud83d\udcdd Annotated Part PDFs</div>' +
      '<div style="font-size:9px;color:rgb(var(--fg2));flex:1">Your marked-up copies</div>' +
      '<span style="font-size:14px;color:rgb(var(--fg3))" id="haz-ann-chevron">\u25b8</span>' +
      '</div>' +
      '<div id="haz-annotated" style="display:none;margin-top:10px">';
    HAZZARD_MARKED_PARTS.forEach(function (p, i) {
      h += '<a href="' + p.file + '" target="_blank" style="text-decoration:none;display:block;padding:8px 0;border-bottom:1px solid rgb(var(--brd))">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="background:' + p.color + ';color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">' + (i + 1) + '</span>' +
        '<div style="flex:1;font-size:11px;font-weight:600">' + p.ch + ' \u2014 ' + p.desc + '</div>' +
        (p.exam ? '<span style="font-size:9px;color:#dc2626;font-weight:700">' + (p.exam.indexOf('\u05de\u05d5\u05d7\u05e8\u05d2') >= 0 ? '\u26d4' : '') + '</span>' : '') +
        '<span style="font-size:14px;color:rgb(var(--fg3))">\u203a</span>' +
        '</div></a>';
    });
    h += '</div></div>';
    return h;
  }

  function _rlHarrisonReader() {
    var ch = _harData[String(harChOpen)];
    var allSylChNums = [].concat(SYL_HAR_ALL, SYL_HAR_BASE).map(function (c) { return c.ch; }).sort(function (a, b) { return a - b; });
    var curIdx = allSylChNums.indexOf(harChOpen);
    var prevCh = curIdx > 0 ? allSylChNums[curIdx - 1] : null;
    var nextCh = curIdx < allSylChNums.length - 1 ? allSylChNums[curIdx + 1] : null;
    var h = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
      '<button onclick="harChOpen=null;render()" style="background:rgb(var(--bg2));border:none;border-radius:8px;padding:6px 12px;font-size:11px;cursor:pointer">\u2190 Back</button>' +
      '<div style="font-size:12px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Ch ' + harChOpen + ': ' + ch.title + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">' +
      (prevCh ? '<button onclick="openHarrisonChapter(' + prevCh + ')" style="font-size:10px;padding:5px 10px;background:rgb(var(--bg2));border:1px solid rgb(var(--brd));border-radius:8px;cursor:pointer">\u2039 Ch ' + prevCh + '</button>' : '') +
      '<button onclick="quizMeOnChapter(harChOpen,_harData[String(harChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#7c3aed;color:#fff;border:none;border-radius:8px;cursor:pointer">\ud83e\udde0 Quiz</button>' +
      '<button onclick="generateQuestionsFromChapter(\'har\',harChOpen,_harData[String(harChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#0ea5e9;color:#fff;border:none;border-radius:8px;cursor:pointer">\u2728 Generate Qs</button>' +
      '<button onclick="aiSummarizeChapter(harChOpen,_harData[String(harChOpen)].title)" style="font-size:10px;padding:5px 10px;background:#059669;color:#fff;border:none;border-radius:8px;cursor:pointer">\ud83d\udcdd Summary</button>' +
      (nextCh ? '<button onclick="openHarrisonChapter(' + nextCh + ')" style="font-size:10px;padding:5px 10px;background:rgb(var(--bg2));border:1px solid rgb(var(--brd));border-radius:8px;cursor:pointer">Ch ' + nextCh + ' \u203a</button>' : '') +
      '</div>' +
      '<div id="quiz-me-box"></div>' +
      '<div class="card" style="padding:16px">';
    var _relTopics = Object.entries(TOPIC_REF).filter(function (kv) { return kv[1].s === 'haz'; }).map(function (kv) { return +kv[0]; });
    var _chTopicIdx = _relTopics.find(function (ti) { var ref = TOPIC_REF[ti]; return ref && String(ref.ch) === String(harChOpen); });
    if (_chTopicIdx !== undefined) {
      var _ts = getTopicStats()[_chTopicIdx] || { ok: 0, no: 0, tot: 0 };
      var _tpct = _ts.tot ? Math.round(_ts.ok / _ts.tot * 100) : null;
      var _tqCount = QZ.filter(function (q) { return q.ti === _chTopicIdx; }).length;
      h += '<div style="display:flex;gap:8px;margin-bottom:12px;padding:8px 12px;background:#f5f3ff;border-radius:10px;font-size:10px;align-items:center">' +
        '<span>\ud83d\udcdd ' + _tqCount + ' questions on this topic</span>' +
        (_tpct !== null ? '<span style="font-weight:700;color:' + (_tpct >= 70 ? '#059669' : _tpct >= 50 ? '#d97706' : '#dc2626') + '">' + _tpct + '% accuracy</span>' : '<span style="color:rgb(var(--fg3))">Not attempted yet</span>') +
        '<button onclick="tab=\'quiz\';filt=\'topic\';topicFilt=' + _chTopicIdx + ';buildPool();render()" style="margin-left:auto;font-size:10px;padding:4px 10px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer">\u25b6 Drill</button>' +
        '</div>';
    }
    ch.sections.forEach(function (sec) {
      if (sec.title) { h += '<div style="font-size:13px;font-weight:800;color:#7c3aed;margin:18px 0 8px;padding-bottom:4px;border-bottom:2px solid #ede9fe">' + sec.title + '</div>'; }
      sec.content.forEach(function (p) { h += '<p style="font-size:11.5px;line-height:1.9;color:rgb(var(--fg));margin:0 0 10px;text-align:justify">' + p + '</p>'; });
    });
    h += '</div>';
    return h;
  }

  function _rlHarrisonList() {
    var allSylChs = [].concat(SYL_HAR_ALL, SYL_HAR_BASE).sort(function (a, b) { return a.ch - b.ch; });
    var allChNums = SYL_HAR_ALL.map(function (c) { return c.ch; });
    var h = '<div class="card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">\ud83d\udcd7 Harrison\'s 22e \u2014 In-App Reader</div>' +
      '<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:12px">' + allSylChs.length + ' required chapters \u00b7 <span style="color:#7c3aed">purple</span> = all examinees \u00b7 <span style="color:#06b6d4">teal</span> = base track only</div>';
    allSylChs.forEach(function (c) {
      var isAll = allChNums.indexOf(c.ch) >= 0;
      var harCh = _harData && _harData[String(c.ch)];
      var wc = harCh ? '~' + Math.round(harCh.wordCount / 250) + ' min' : 'tap to load';
      h += '<div onclick="openHarrisonChapter(' + c.ch + ')" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgb(var(--brd));cursor:pointer">' +
        '<span style="background:' + (isAll ? '#7c3aed' : '#06b6d4') + ';color:#fff;font-size:10px;font-weight:700;padding:4px 8px;border-radius:8px;min-width:42px;text-align:center">Ch ' + c.ch + '</span>' +
        '<div style="flex:1;min-width:0">' +
        '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.t + '</div>' +
        '<div style="font-size:9px;color:rgb(var(--fg3));margin-top:2px">' + wc + '</div>' +
        '</div>' +
        '<span style="font-size:18px;color:rgb(var(--fg3))">\u203a</span></div>';
    });
    h += '</div>';
    return h;
  }

  function _rlLaws() {
    var h = '<div class="card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">\u2696\ufe0f \u05d7\u05d5\u05e7\u05d9\u05dd, \u05e0\u05d4\u05dc\u05d9\u05dd \u05d5\u05e4\u05e8\u05e1\u05d5\u05de\u05d9\u05dd</div>' +
      '<div class="heb" style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">' + SYL_LAWS.length + ' items</div>';
    SYL_LAWS.forEach(function (l, i) {
      h += '<div class="heb" style="padding:8px 0;border-bottom:1px solid rgb(var(--brd))">' +
        '<div style="display:flex;align-items:flex-start;gap:8px">' +
        '<span style="background:#f59e0b;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;flex-shrink:0">' + (i + 1) + '</span>' +
        '<div style="flex:1"><div style="font-size:11px;font-weight:600">' + l.n + '</div>' +
        '<div style="font-size:9px;color:rgb(var(--fg3));margin-top:2px">' + l.s + '</div></div>' +
        (l.f ? '<a href="' + l.f + '" target="_blank" style="font-size:10px;padding:3px 7px;background:rgb(var(--yellow-bg));color:#d97706;border-radius:6px;text-decoration:none;flex-shrink:0;white-space:nowrap">\ud83d\udcc4</a>' : '') +
        '</div></div>';
    });
    h += '</div>';
    return h;
  }

  function _rlArticles() {
    var h = '<div class="card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">\ud83d\udcc4 Required Articles</div>' +
      '<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">' + SYL_ARTICLES.length + ' journal articles</div>';
    var _artMap = { '0': 'article_beers_2023.pdf', '1': 'article_vascog2.pdf', '2': 'article_alzheimer_iwg.pdf', '3': 'article_alzheimer_aa.pdf', '4': 'article_dementia_prevention.pdf', '5': 'article_hearing_loss.pdf' };
    SYL_ARTICLES.forEach(function (a, i) {
      var _apdf = _artMap[String(i)];
      h += '<div style="padding:8px 0;border-bottom:1px solid rgb(var(--brd));display:flex;align-items:flex-start;gap:8px">' +
        '<div style="flex:1"><div style="font-size:11px;font-weight:600;line-height:1.5">' + (i + 1) + '. ' + a.t + '</div>' +
        '<div style="font-size:9px;color:rgb(var(--sky));margin-top:2px">' + a.j + '</div></div>' +
        (_apdf ? '<a href="' + _apdf + '" download style="font-size:10px;padding:3px 7px;background:rgb(var(--blue-bg));color:#3b82f6;border-radius:6px;text-decoration:none;flex-shrink:0">\ud83d\udcc4</a>' : '') +
        '</div>';
    });
    h += '</div>';
    return h;
  }

  function _rlExams() {
    var examYears = [];
    var seen = {};
    QZ.forEach(function (q) { if (!seen[q.t]) { seen[q.t] = true; examYears.push(q.t); } });
    examYears.sort();
    var h = '<div class="card" style="padding:14px">' +
      '<div style="font-size:13px;font-weight:700;margin-bottom:4px">\ud83d\udcdd Past Exams in Question Bank</div>' +
      '<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">' + QZ.length + ' questions from ' + examYears.length + ' exam sessions</div>';
    examYears.forEach(function (yr) {
      var cnt = QZ.filter(function (q) { return q.t === yr; }).length;
      h += '<div onclick="tab=\'quiz\';filt=\'' + yr + '\';buildPool();render()" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgb(var(--brd));cursor:pointer">' +
        '<span style="background:#06b6d4;color:#fff;font-size:10px;font-weight:700;padding:4px 10px;border-radius:8px;min-width:60px;text-align:center">' + yr + '</span>' +
        '<span style="font-size:11px;flex:1">' + cnt + ' questions</span>' +
        '<span style="font-size:14px;color:rgb(var(--fg3))">\u203a</span></div>';
    });
    h += '</div>';
    return h;
  }

  function renderLibrary() {
    var h = '<div class="sec-t">\ud83d\udcd6 Library</div>' +
      '<div class="sec-s">Textbooks \u00b7 Laws \u00b7 Articles \u00b7 Exam PDFs</div>';
    var libTabs = [
      { id: 'haz-pdf', l: '\ud83d\udcd5 Hazzard' },
      { id: 'harrison', l: '\ud83d\udcd7 Harrison' },
      { id: 'laws', l: '\u2696\ufe0f Laws' },
      { id: 'articles', l: '\ud83d\udcc4 Articles' },
      { id: 'exams', l: '\ud83d\udcdd Exams' }
    ];
    h += '<div style="display:flex;gap:4px;overflow-x:auto;padding:4px 0;margin-bottom:12px;-webkit-overflow-scrolling:touch">';
    libTabs.forEach(function (t) {
      h += '<span class="pill ' + (libSec === t.id ? 'on' : '') + '" style="white-space:nowrap;font-size:10px" onclick="libSec=\'' + t.id + '\';render()">' + t.l + '</span>';
    });
    h += '</div>';
    if (libSec === 'haz-pdf') {
      if (hazChOpen !== null && _hazData && _hazData[String(hazChOpen)]) h += _rlHazzardReader();
      else if (_hazLoading) h += '<div class="card" style="padding:40px;text-align:center"><div style="font-size:13px;color:rgb(var(--fg2))">\u23f3 Loading Hazzard\'s chapter...</div></div>';
      else h += _rlHazzardList();
    }
    if (libSec === 'harrison') {
      if (harChOpen !== null && _harData && _harData[String(harChOpen)]) h += _rlHarrisonReader();
      else if (_harLoading) h += '<div class="card" style="padding:40px;text-align:center"><div style="font-size:13px;color:rgb(var(--fg2))">\u23f3 Loading Harrison\'s chapter...</div></div>';
      else h += _rlHarrisonList();
    }
    if (libSec === 'laws') h += _rlLaws();
    if (libSec === 'articles') h += _rlArticles();
    if (libSec === 'exams') h += _rlExams();
    h += '<div style="text-align:center;margin-top:12px;font-size:9px;color:rgb(var(--fg3))">' +
      '<a href="https://ima-contentfiles.s3.amazonaws.com/P005-2026.pdf" target="_blank" style="color:rgb(var(--sky));text-decoration:underline">P005-2026 Syllabus \u2197</a></div>';
    h += '<div style="text-align:center;margin-top:8px;padding:8px;font-size:9px;color:rgb(var(--fg3));line-height:1.5">' +
      '\u0635\u062f\u0642\u0629 \u062c\u0627\u0631\u064a\u0629 \u0627\u0644\u0649 \u0645\u0646 \u0646\u062d\u0628<br>Ceaseless Charity \u2014 To the People That We Love</div>';
    return h;
  }

  // Expose on window — replaces the monolith's inline version
  window.renderLibrary = renderLibrary;
})();
