/**
 * Calc tab renderer — extracted from shlav-a-mega.html.
 *
 * Plain (non-module) script. Reads globals from the monolith:
 *   calcVals, calcView, DRUGS, medBasket, eolState
 *   calcUp, render, copyReport, toggleMedBasket, filterMedList,
 *   calcACBTotal, getSTOPPWarnings, setEol, getEolResult
 *
 * Owns (exposes on window):
 *   frailtyLevel, agingSearch — mutable state used only by calc sub-views
 *   renderCalc, renderMedBasket, renderEOLTree, renderLabOverlay, renderAgingSheet
 */
(function () {
  'use strict';

  // Mutable state owned by calc sub-views
  window.frailtyLevel = 3;
  window.agingSearch = '';

  // ===== GENERIC CALCULATOR HELPERS =====
  function _rcCheckList(title, prefix, items, interpret) {
    var score = items.reduce(function (s, item) { return s + (calcVals[item[0]] || 0); }, 0);
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">' + title + '</h3>';
    items.forEach(function (item) {
      var k = item[0], l = item[1], pts = item[2], on = calcVals[k] || 0;
      h += '<label style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f8fafc;font-size:11px;cursor:pointer">' +
        '<span>' + l + ' (+' + pts + ')</span>' +
        '<input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="calcUp(\'' + k + '\',this.checked?' + pts + ':0)" style="width:16px;height:16px">' +
        '</label>';
    });
    var r = interpret(score);
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center"' + (r.cls ? ' class="calc-result"' : '') + '>' +
      '<span style="font-size:22px;font-weight:700;color:' + r.clr + '">' + r.display + '</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + r.text + '</p>' +
      (r.copy ? '<button id="copy-' + prefix + '" onclick="copyReport(\'' + prefix + '\')" class="btn btn-o" style="margin-top:8px;font-size:10px;padding:4px 10px" aria-label="Copy ' + title + ' report">\ud83d\udccb \u05d4\u05e2\u05ea\u05e7 \u05d3\u05d5\u05d7</button>' : '') +
      '</div></div>';
    return h;
  }

  function _rcSelectList(title, prefix, subs, defaultVal, interpret) {
    var score = subs.reduce(function (s, sub) { return s + (calcVals[sub[0]] || defaultVal); }, 0);
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">' + title + '</h3>';
    subs.forEach(function (sub) {
      var k = sub[0], label = sub[1], opts = sub[2], v = calcVals[k] || defaultVal;
      h += '<div style="margin-bottom:8px"><label style="font-size:10px;color:rgb(var(--fg2));font-weight:600">' + label + '</label>' +
        '<select class="calc-in" style="font-size:11px" onchange="calcUp(\'' + k + '\',this.selectedIndex+' + defaultVal + ')">';
      opts.forEach(function (o, i) { h += '<option value="' + (i + defaultVal) + '"' + (v === i + defaultVal ? ' selected' : '') + '>' + o + '</option>'; });
      h += '</select></div>';
    });
    var r = interpret(score);
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center" class="calc-result">' +
      '<span style="font-size:22px;font-weight:700;color:' + r.clr + '">' + r.display + '</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + r.text + '</p>' +
      (r.copy ? '<button id="copy-' + prefix + '" onclick="copyReport(\'' + prefix + '\')" class="btn btn-o" style="margin-top:8px;font-size:10px;padding:4px 10px" aria-label="Copy ' + title + ' report">\ud83d\udccb \u05d4\u05e2\u05ea\u05e7 \u05d3\u05d5\u05d7</button>' : '') +
      '</div></div>';
    return h;
  }

  // ===== INDIVIDUAL CALCULATORS =====
  function _rcCrCl() {
    var age = calcVals.age || 75, wt = calcVals.wt || 55, cr = calcVals.cr || 1.0, fem = calcVals.fem === undefined ? 0.85 : calcVals.fem;
    var crcl = Math.max(0, Math.round(((140 - age) * wt * fem) / (72 * cr)));
    return '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">Cockcroft-Gault CrCl</h3>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<div><label style="font-size:10px;color:rgb(var(--fg2))">Age</label><input class="calc-in" type="number" value="' + age + '" onchange="calcUp(\'age\',this.value)"></div>' +
      '<div><label style="font-size:10px;color:rgb(var(--fg2))">Weight (kg)</label><input class="calc-in" type="number" value="' + wt + '" onchange="calcUp(\'wt\',this.value)"></div>' +
      '<div><label style="font-size:10px;color:rgb(var(--fg2))">Creatinine</label><input class="calc-in" type="number" step="0.1" value="' + cr + '" onchange="calcUp(\'cr\',this.value)"></div>' +
      '<div><label style="font-size:10px;color:rgb(var(--fg2))">Sex</label><select class="calc-in" onchange="calcUp(\'fem\',this.value)">' +
      '<option value="0.85" ' + (fem < 1 ? 'selected' : '') + '>Female (\u00d70.85)</option><option value="1" ' + (fem >= 1 ? 'selected' : '') + '>Male (\u00d71)</option></select></div>' +
      '</div>' +
      '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center">' +
      '<span style="font-size:22px;font-weight:700;color:' + (crcl < 30 ? '#dc2626' : crcl < 60 ? '#d97706' : '#059669') + '">' + crcl + ' ml/min</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (crcl < 30 ? 'CKD 4-5: Avoid metformin, adjust all renally-cleared drugs' : crcl < 60 ? 'CKD 3: Dose adjust many drugs' : 'CKD 1-2: Mild impairment') + '</p>' +
      '</div></div>';
  }

  function _rcGDS() {
    var gds = Object.entries(calcVals).filter(function (kv) { return kv[0].indexOf('gds_') === 0; }).reduce(function (s, kv) { return s + kv[1]; }, 0);
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">GDS-15 (Depression Screen)</h3>';
    ['Satisfied with life? (No=1)', 'Dropped activities? (Yes=1)', 'Feel life is empty? (Yes=1)', 'Often bored? (Yes=1)', 'Good spirits most of time? (No=1)',
      'Afraid something bad? (Yes=1)', 'Feel happy most of time? (No=1)', 'Often feel helpless? (Yes=1)', 'Stay home rather than go out? (Yes=1)', 'More memory problems? (Yes=1)',
      'Wonderful to be alive? (No=1)', 'Feel worthless? (Yes=1)', 'Feel full of energy? (No=1)', 'Feel hopeless? (Yes=1)', 'Others better off? (Yes=1)'].forEach(function (l, i) {
      var k = 'gds_' + i, on = calcVals[k] || 0;
      h += '<label style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #f8fafc;font-size:10px;cursor:pointer">' +
        '<span>' + l + '</span><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="calcUp(\'' + k + '\',this.checked?1:0)" style="width:14px;height:14px"></label>';
    });
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center">' +
      '<span style="font-size:22px;font-weight:700;color:' + (gds >= 5 ? '#dc2626' : '#059669') + '">' + gds + '/15</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (gds >= 10 ? 'Severe depression \u2014 refer' : gds >= 5 ? 'Positive screen \u2014 evaluate further' : 'Normal') + '</p>' +
      '<button id="copy-gds" onclick="copyReport(\'gds\')" class="btn btn-o" style="margin-top:8px;font-size:10px;padding:4px 10px" aria-label="Copy GDS report">\ud83d\udccb \u05d4\u05e2\u05ea\u05e7 \u05d3\u05d5\u05d7</button>' +
      '</div></div>';
    return h;
  }

  function _rc4AT() {
    var items = [
      ['at4_1', '1. Alertness', [['Normal (0)', '0'], ['Mild sleepiness <10s (0)', '0'], ['Clearly abnormal (4)', '4']]],
      ['at4_2', '2. AMT4 (age, DOB, place, year)', [['No mistakes (0)', '0'], ['1 mistake (1)', '1'], ['2+ mistakes or untestable (2)', '2']]],
      ['at4_3', '3. Attention (months backwards)', [['Achieves 7+ months correctly (0)', '0'], ['Starts but <7 / refuses (1)', '1'], ['Untestable (2)', '2']]],
      ['at4_4', '4. Acute change or fluctuating course', [['No (0)', '0'], ['Yes (4)', '4']]]
    ];
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">4AT (Rapid Delirium Screen)</h3>';
    items.forEach(function (item) {
      var k = item[0], label = item[1], opts = item[2];
      h += '<div style="margin-bottom:8px"><label style="font-size:10px;color:rgb(var(--fg2));font-weight:600">' + label + '</label>' +
        '<select class="calc-in" style="font-size:11px" onchange="calcUp(\'' + k + '\',this.value)">';
      opts.forEach(function (o) { h += '<option value="' + o[1] + '"' + (String(calcVals[k] || 0) === o[1] ? ' selected' : '') + '>' + o[0] + '</option>'; });
      h += '</select></div>';
    });
    var score = items.reduce(function (s, item) { return s + (parseFloat(calcVals[item[0]]) || 0); }, 0);
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center" class="calc-result">' +
      '<span style="font-size:22px;font-weight:700;color:' + (score >= 4 ? '#dc2626' : score >= 1 ? '#d97706' : '#059669') + '">' + score + '</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (score >= 4 ? 'Possible delirium \u00b1 cognitive impairment' : score >= 1 ? 'Possible cognitive impairment' : 'No delirium or cognitive impairment detected') + '</p>' +
      '<button id="copy-4at" onclick="copyReport(\'4at\')" class="btn btn-o" style="margin-top:8px;font-size:10px;padding:4px 10px" aria-label="Copy 4AT delirium report">\ud83d\udccb \u05d4\u05e2\u05ea\u05e7 \u05d3\u05d5\u05d7</button>' +
      '</div></div>';
    return h;
  }

  function _rcMNA() {
    var items = [
      ['mna_a', 'Food intake decline (3mo)', ['Severe decrease (0)', 'Moderate decrease (1)', 'No decrease (2)']],
      ['mna_b', 'Weight loss (3mo)', ['Loss >3kg (0)', 'Unknown (1)', 'Loss 1-3kg (2)', 'No loss (3)']],
      ['mna_c', 'Mobility', ['Bed/chair bound (0)', 'Gets out but not outdoors (1)', 'Goes out (2)']],
      ['mna_d', 'Psychological stress / acute disease (3mo)', ['Yes (0)', 'No (2)']],
      ['mna_e', 'Neuropsychological problems', ['Severe dementia/depression (0)', 'Mild (1)', 'No problems (2)']],
      ['mna_f', 'BMI or Calf circumference', ['BMI<19 / CC<31 (0)', 'BMI 19-21 / CC 31+ (1)', 'BMI 21-23 (2)', 'BMI\u226523 (3)']]
    ];
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">MNA-SF (Nutritional Screen)</h3>';
    items.forEach(function (item) {
      var k = item[0], label = item[1], opts = item[2], v = String(calcVals[k] || 0);
      h += '<div style="margin-bottom:8px"><label style="font-size:10px;color:rgb(var(--fg2));font-weight:600">' + label + '</label>' +
        '<select class="calc-in" style="font-size:11px" onchange="calcUp(\'' + k + '\',this.value)">';
      opts.forEach(function (o) { var val = o.match(/\((\d+)\)/)[1]; h += '<option value="' + val + '"' + (v === val ? ' selected' : '') + '>' + o + '</option>'; });
      h += '</select></div>';
    });
    var score = items.reduce(function (s, item) { return s + (parseFloat(calcVals[item[0]]) || 0); }, 0);
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center" class="calc-result">' +
      '<span style="font-size:22px;font-weight:700;color:' + (score <= 7 ? '#dc2626' : score <= 11 ? '#d97706' : '#059669') + '">' + score + '/14</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (score >= 12 ? 'Normal nutritional status' : score >= 8 ? 'At risk of malnutrition' : 'Malnourished') + '</p>' +
      '</div></div>';
    return h;
  }

  function _rcCFS() {
    var cfsOpts = ['1 \u2014 Very Fit (robust, active, energetic)', '2 \u2014 Well (no active disease, less fit)', '3 \u2014 Managing Well (medical problems well-controlled)', '4 \u2014 Vulnerable (not dependent, but slowed)', '5 \u2014 Mildly Frail (limited IADLs)', '6 \u2014 Moderately Frail (needs help with ADLs+IADLs)', '7 \u2014 Severely Frail (completely dependent, approaching EOL)', '8 \u2014 Very Severely Frail (bed-bound, may not recover from minor illness)', '9 \u2014 Terminally Ill (<6mo prognosis)'];
    var cfsV = calcVals.cfs || 1;
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">Clinical Frailty Scale (CFS)</h3>';
    h += '<select class="calc-in" style="font-size:11px" onchange="calcUp(\'cfs\',this.value)">';
    cfsOpts.forEach(function (o, i) { h += '<option value="' + (i + 1) + '"' + (cfsV == i + 1 ? ' selected' : '') + '>' + o + '</option>'; });
    h += '</select>';
    var cfsClr = cfsV >= 7 ? '#dc2626' : cfsV >= 5 ? '#d97706' : cfsV >= 4 ? '#2563eb' : '#059669';
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center" class="calc-result">' +
      '<span style="font-size:22px;font-weight:700;color:' + cfsClr + '">' + cfsV + '/9</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (cfsV >= 7 ? 'Severely frail \u2014 high mortality, consider goals of care' : cfsV >= 5 ? 'Frail \u2014 increased vulnerability to adverse outcomes' : cfsV >= 4 ? 'Pre-frail / vulnerable' : 'Fit / not frail') + '</p>' +
      '</div></div>';
    return h;
  }

  function _rcMorse() {
    var morseItems = [
      ['mor_hist', 'History of falling (last 3mo)', 25], ['mor_diag', 'Secondary diagnosis (\u22652)', 15],
      ['mor_amb', 'Ambulatory aid', ['None/bedrest/wheelchair (0)', 'Crutches/cane/walker (15)', 'Furniture (30)']],
      ['mor_iv', 'IV/heparin lock', 20], ['mor_gait', 'Gait', ['Normal/bedrest/immobile (0)', 'Weak (10)', 'Impaired (20)']],
      ['mor_ment', 'Mental status', ['Oriented to own ability (0)', 'Overestimates / forgets limitations (15)']]
    ];
    var h = '<div class="card" style="padding:14px"><h3 style="font-size:13px;font-weight:700;margin-bottom:10px">Morse Fall Scale</h3>';
    morseItems.forEach(function (item) {
      var k = item[0], l = item[1], pts = item[2];
      if (Array.isArray(pts)) {
        var v = String(calcVals[k] || 0);
        h += '<div style="margin-bottom:8px"><label style="font-size:10px;color:rgb(var(--fg2));font-weight:600">' + l + '</label>' +
          '<select class="calc-in" style="font-size:11px" onchange="calcUp(\'' + k + '\',this.value)">';
        pts.forEach(function (o) { var val = o.match(/\((\d+)\)/)[1]; h += '<option value="' + val + '"' + (v === val ? ' selected' : '') + '>' + o + '</option>'; });
        h += '</select></div>';
      } else {
        var on = calcVals[k] || 0;
        h += '<label style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f8fafc;font-size:11px;cursor:pointer">' +
          '<span>' + l + ' (+' + pts + ')</span><input type="checkbox" ' + (on ? 'checked' : '') + ' onchange="calcUp(\'' + k + '\',this.checked?' + pts + ':0)" style="width:16px;height:16px"></label>';
      }
    });
    var score = morseItems.reduce(function (s, item) { if (Array.isArray(item[2])) return s + (parseFloat(calcVals[item[0]]) || 0); return s + (calcVals[item[0]] || 0); }, 0);
    var clr = score >= 45 ? '#dc2626' : score >= 25 ? '#d97706' : '#059669';
    h += '<div style="margin-top:10px;padding:10px;background:rgb(var(--blue-bg));border-radius:10px;text-align:center" class="calc-result">' +
      '<span style="font-size:22px;font-weight:700;color:' + clr + '">' + score + '</span>' +
      '<p style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + (score >= 45 ? 'High fall risk \u2014 implement fall bundle' : score >= 25 ? 'Moderate risk \u2014 standard interventions' : 'Low risk') + '</p>' +
      '<button id="copy-morse" onclick="copyReport(\'morse\')" class="btn btn-o" style="margin-top:8px;font-size:10px;padding:4px 10px" aria-label="Copy Morse Falls report">\ud83d\udccb \u05d4\u05e2\u05ea\u05e7 \u05d3\u05d5\u05d7</button>' +
      '</div></div>';
    return h;
  }

  // ===== SUB-VIEWS =====
  function renderMedBasket() {
    var h = '<div class="sec-t">\ud83e\uddf0 Med Basket \u2014 Polypharmacy Clash Engine</div>' +
      '<div class="sec-s">Select drugs to check cumulative ACB + STOPP interactions</div>' +
      '<input class="search-box" placeholder="Search drug to add..." oninput="filterMedList(this.value)" id="mbsrch">' +
      '<div style="display:none;max-height:200px;overflow-y:auto;border:1px solid rgb(var(--brd));border-radius:12px;margin-bottom:10px" id="mblist">';
    DRUGS.forEach(function (d) {
      var inBasket = medBasket.indexOf(d.name) >= 0;
      h += '<div class="mb-item" style="padding:8px 12px;border-bottom:1px solid rgb(var(--brd));cursor:pointer;font-size:11px;display:flex;justify-content:space-between;align-items:center;' + (inBasket ? 'background:#ecfdf5' : '') + '" onclick="toggleMedBasket(\'' + d.name.replace(/'/g, "\\'") + '\');render()" data-drug="' + d.name.toLowerCase() + ' ' + d.heb + '" role="option" aria-selected="' + (inBasket ? 'true' : 'false') + '">' +
        '<span>' + d.name + ' ' + (d.heb ? '(' + d.heb + ')' : '') + '</span>' +
        '<span>' + (inBasket ? '\u2705' : '+') + ' ' + (d.acb ? 'ACB:' + d.acb : '') + ' ' + (d.beers ? 'BEERS' : '') + '</span></div>';
    });
    h += '</div>';
    if (medBasket.length) {
      h += '<div style="margin-bottom:12px">';
      medBasket.forEach(function (name) {
        var d = DRUGS.find(function (x) { return x.name === name; });
        h += '<span class="med-chip">' + name + ' ' + (d && d.acb ? '(ACB:' + d.acb + ')' : '') + '<span class="x" onclick="event.stopPropagation();toggleMedBasket(\'' + name + '\');render()">\u00d7</span></span>';
      });
      h += '</div>';
      var acbTotal = calcACBTotal();
      var acbClr = acbTotal >= 3 ? '#dc2626' : acbTotal >= 2 ? '#d97706' : '#059669';
      h += '<div class="card" style="padding:14px">' +
        '<div style="font-weight:700;font-size:12px;margin-bottom:6px">Anticholinergic Burden (ACB)</div>' +
        '<div class="acb-meter"><div class="acb-fill" style="width:' + Math.min(acbTotal / 6 * 100, 100) + '%;background:' + acbClr + '"></div></div>' +
        '<div style="text-align:center;font-size:22px;font-weight:700;color:' + acbClr + '">' + acbTotal + '</div>' +
        '<div style="text-align:center;font-size:10px;color:rgb(var(--fg2))">' + (acbTotal >= 3 ? 'HIGH burden \u2014 cognitive decline, delirium, falls risk' : acbTotal >= 1 ? 'Moderate burden \u2014 monitor closely' : 'Low anticholinergic burden') + '</div>' +
        '</div>';
      var warnings = getSTOPPWarnings();
      if (warnings.length) {
        h += '<div class="card" style="padding:14px;margin-top:10px">' +
          '<div style="font-weight:700;font-size:12px;margin-bottom:8px">\u26a0\ufe0f Interaction Warnings (' + warnings.length + ')</div>';
        warnings.forEach(function (w) {
          var clr = w.level === 'high' ? '#dc2626' : w.level === 'med' ? '#d97706' : '#2563eb';
          h += '<div style="padding:8px 10px;border-radius:10px;border:1px solid ' + clr + '30;background:' + clr + '08;margin-bottom:6px;font-size:11px;line-height:1.5">' +
            '<span style="font-weight:700;color:' + clr + '">' + (w.level === 'high' ? '\ud83d\udd34 HIGH' : w.level === 'med' ? '\ud83d\udfe1 MODERATE' : '\ud83d\udd35 LOW') + '</span> ' + w.text + '</div>';
        });
        h += '</div>';
      }
    } else {
      h += '<div style="text-align:center;padding:24px;color:rgb(var(--fg3));font-size:12px">Add drugs above to analyze interactions</div>';
    }
    h += '<!-- med list filter handled by filterMedList() -->';
    return h;
  }

  function renderEOLTree() {
    var h = '<div class="sec-t">\ud83d\udd4a\ufe0f EOL / Capacity Decision Tree</div>' +
      '<div class="sec-s" dir="auto">Interactive checklist \u2014 Israeli law (\u05d7\u05d5\u05e7 \u05d4\u05d7\u05d5\u05dc\u05d4 \u05d4\u05e0\u05d5\u05d8\u05d4 \u05dc\u05de\u05d5\u05ea, \u05d9\u05d9\u05e4\u05d5\u05d9 \u05db\u05d5\u05d7 \u05de\u05ea\u05de\u05e9\u05da)</div>';
    function node(key, title, desc, yesLabel, noLabel) {
      return '<div class="dt-node ' + (eolState[key] === true ? 'active' : eolState[key] === false ? 'inactive' : '') + '" onclick="setEol(\'' + key + '\',true)">' +
        '<div style="font-weight:700;margin-bottom:4px"' + (desc.indexOf('\u05d7\u05d5\u05e7') >= 0 ? ' dir="auto"' : '') + '>' + title + '</div>' +
        '<div style="font-size:10px;color:rgb(var(--fg2))"' + (desc.indexOf('\u05d7\u05d5\u05e7') >= 0 ? ' dir="auto"' : '') + '>' + desc + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:8px">' +
        '<button class="btn ' + (eolState[key] === true ? 'btn-g' : 'btn-o') + '" style="font-size:10px;padding:4px 12px" onclick="event.stopPropagation();setEol(\'' + key + '\',true)" aria-label="' + yesLabel + '">' + yesLabel + '</button>' +
        '<button class="btn ' + (eolState[key] === false ? 'btn-g' : 'btn-o') + '" style="font-size:10px;padding:4px 12px" onclick="event.stopPropagation();setEol(\'' + key + '\',false)" aria-label="' + noLabel + '">' + noLabel + '</button>' +
        '</div></div>';
    }
    h += node('competent', '1. Is the patient competent (\u05db\u05e9\u05d9\u05e8)?', 'Can understand, appreciate, reason, and communicate a decision', 'Yes \u2014 Competent', 'No \u2014 Incompetent');
    h += node('terminal', '2. Terminal prognosis <6 months?', '\u05d7\u05d5\u05e7 \u05d4\u05d7\u05d5\u05dc\u05d4 \u05d4\u05e0\u05d5\u05d8\u05d4 \u05dc\u05de\u05d5\u05ea 2005 applies if terminal', 'Yes \u2014 Terminal', 'No');
    if (eolState.competent === false) {
      h += node('directive', '3. Advance directive exists (\u05d9\u05d9\u05e4\u05d5\u05d9 \u05db\u05d5\u05d7 \u05de\u05ea\u05de\u05e9\u05da)?', '', 'Yes', 'No');
      if (eolState.directive === false) {
        h += node('proxy', '4. Is there a proxy / surrogate (\u05de\u05e7\u05d1\u05dc \u05d4\u05d7\u05dc\u05d8\u05d5\u05ea)?', '', 'Yes', 'No');
      }
    }
    var result = getEolResult();
    if (result) {
      h += '<div class="dt-result" dir="auto" style="margin-top:12px">' +
        '<div style="font-weight:700;margin-bottom:8px">\ud83d\udccb Legal Standing</div>' +
        '<div style="margin-bottom:8px">' + result.standing + '</div>' +
        '<div style="font-weight:700;margin-bottom:4px">\ud83d\udcc4 Required Forms:</div>' +
        '<ul style="margin:0 0 8px 16px;font-size:11px">' + result.forms.map(function (f) { return '<li>' + f + '</li>'; }).join('') + '</ul>' +
        '<div style="font-weight:700;margin-bottom:4px">\u26a1 Actions:</div>' +
        '<ul style="margin:0 0 0 16px;font-size:11px">' + result.actions.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul>' +
        '</div>' +
        '<button onclick="eolState={competent:null,terminal:null,directive:null,proxy:null};render()" class="btn btn-o" style="margin-top:8px;font-size:10px" aria-label="Reset decision tree">\ud83d\udd04 Reset</button>';
    }
    return h;
  }

  function renderLabOverlay() {
    var labs = [
      { name: 'Hemoglobin', unit: 'g/dL', young: [12, 17.5], old: [11, 15.5], note: 'Lower Hgb thresholds acceptable in elderly; WHO criteria may over-diagnose anemia' },
      { name: 'Creatinine', unit: 'mg/dL', young: [0.6, 1.2], old: [0.5, 1.5], note: 'Reduced muscle mass \u2192 lower Cr despite reduced GFR; eGFR more reliable' },
      { name: 'D-dimer', unit: 'ng/mL', young: [0, 500], old: [0, null], note: 'Age-adjusted cutoff: age\u00d710 ng/mL. Standard 500 has poor specificity in elderly' },
      { name: 'TSH', unit: 'mIU/L', young: [0.4, 4.0], old: [0.4, 7.0], note: 'Mild TSH elevation (4-7) may be normal in >70yo; avoid over-treating subclinical hypothyroidism' },
      { name: 'Albumin', unit: 'g/dL', young: [3.5, 5.0], old: [3.0, 4.5], note: 'Acute phase reactant; drops in inflammation/illness, not just nutrition' },
      { name: 'BNP', unit: 'pg/mL', young: [0, 100], old: [0, 300], note: 'Rises with age, renal impairment; higher cutoffs needed in elderly for HF diagnosis' },
      { name: 'ESR', unit: 'mm/hr', young: [0, 20], old: [0, null], note: 'Age-adjusted: (age+10)/2 for women, age/2 for men. Nonspecific in elderly' },
      { name: 'WBC', unit: '\u00d710\u00b3/\u00b5L', young: [4.5, 11], old: [3.5, 11], note: 'Blunted immune response may prevent leukocytosis in severe infection' },
      { name: 'Sodium', unit: 'mmol/L', young: [136, 145], old: [133, 145], note: 'Hyponatremia common; drug-induced (SSRIs, diuretics, carbamazepine) is most common cause' },
      { name: 'B12', unit: 'pg/mL', young: [200, 900], old: [300, 900], note: 'Low-normal (200-300) may be functionally deficient in elderly; check methylmalonic acid' }
    ];
    var h = '<div class="sec-t">\ud83d\udd2c Geriatric Lab Reference</div>' +
      '<div class="sec-s">Age-adjusted ranges + Frailty impact on test interpretation</div>' +
      '<div class="card" style="padding:14px;margin-bottom:10px">' +
      '<div style="font-weight:700;font-size:12px;margin-bottom:8px">Frailty Level (CFS): ' + frailtyLevel + '/9</div>' +
      '<input type="range" min="1" max="9" value="' + frailtyLevel + '" class="frailty-slider" oninput="frailtyLevel=parseInt(this.value);render()">' +
      '<div style="display:flex;justify-content:space-between;font-size:9px;color:rgb(var(--fg2));margin-top:4px"><span>1 \u2014 Very Fit</span><span>5 \u2014 Mildly Frail</span><span>9 \u2014 Terminal</span></div>' +
      '<div style="margin-top:8px;padding:8px 10px;background:' + (frailtyLevel >= 7 ? '#fef2f2' : frailtyLevel >= 5 ? '#fffbeb' : '#ecfdf5') + ';border-radius:8px;font-size:10px;color:' + (frailtyLevel >= 7 ? '#991b1b' : frailtyLevel >= 5 ? '#92400e' : '#166534') + ';line-height:1.5">' +
      (frailtyLevel >= 7 ? '\u26a0\ufe0f Severely frail: Standard lab cutoffs have reduced PPV. Many "abnormal" values are baseline. Focus on clinical significance, not numbers.' :
        frailtyLevel >= 5 ? '\u26a1 Frail: Age-adjusted ranges should be used. Higher false-positive rate with standard cutoffs. Consider pre-test probability carefully.' :
          '\u2705 Fit: Standard age-adjusted ranges apply. Most screening tests retain reasonable test characteristics.') +
      '</div></div>';
    labs.forEach(function (l) {
      var ddimer = l.name === 'D-dimer', esr = l.name === 'ESR';
      var oldHi = ddimer ? 75 * 10 : esr ? 40 : l.old[1];
      h += '<div class="card" style="padding:12px;margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-weight:700;font-size:12px">' + l.name + '</span><span style="font-size:10px;color:rgb(var(--fg2))">' + l.unit + '</span></div>' +
        '<div style="display:flex;gap:12px;font-size:10px;margin-bottom:6px"><span style="color:#2563eb">Young: ' + l.young[0] + '\u2013' + l.young[1] + '</span><span style="color:#d97706">Elderly: ' + l.old[0] + '\u2013' + (oldHi || 'age\u00d710') + (ddimer ? ' (age-adjusted)' : '') + '</span></div>' +
        '<div style="font-size:10px;line-height:1.5;color:rgb(var(--fg2));padding:6px 8px;background:rgb(var(--bg2));border-radius:8px">' + l.note + '</div>' +
        (frailtyLevel >= 5 ? '<div style="font-size:9px;color:#d97706;margin-top:4px">\u26a1 In frail patients: PPV of abnormal ' + l.name + ' is reduced. Clinical correlation essential.</div>' : '') +
        '</div>';
    });
    return h;
  }

  function renderAgingSheet() {
    var data = [
      { system: 'Cardiovascular', normal: '\u2191 Aortic stiffness, \u2191 SBP, LV wall thickening, \u2193 max HR, \u2193 diastolic relaxation', path: 'HFpEF, aortic stenosis (calcific), atrial fibrillation, orthostatic hypotension' },
      { system: 'Pulmonary', normal: '\u2193 FEV1 (30mL/yr), \u2193 chest wall compliance, \u2193 PaO2 (normal: 80-age/4), \u2191 residual volume', path: 'COPD, pulmonary fibrosis, sleep apnea (OSA prevalence \u2191 with age)' },
      { system: 'Renal', normal: '\u2193 GFR ~1 mL/min/yr after 40, \u2193 concentrating ability, \u2193 renin/aldosterone, \u2193 tubular function', path: 'CKD, AKI (lower threshold for nephrotoxins), hyponatremia (\u2191 ADH sensitivity)' },
      { system: 'Neurological', normal: '\u2193 Processing speed, \u2193 working memory, mild word-finding difficulty, \u2193 sleep efficiency, \u2193 deep sleep', path: 'Dementia (progressive ADL loss), delirium (acute), Parkinson disease, stroke' },
      { system: 'Musculoskeletal', normal: '\u2193 Bone density (0.5-1%/yr post-menopause), \u2193 muscle mass (sarcopenia 3-8%/decade after 30), \u2191 body fat', path: 'Osteoporosis (fracture), severe sarcopenia (disability), polymyalgia rheumatica' },
      { system: 'GI', normal: '\u2193 Esophageal motility, \u2193 gastric acid, \u2193 hepatic blood flow/mass, slower transit time', path: 'Dysphagia, GERD, C. difficile (especially post-antibiotics), constipation (severe/fecal impaction)' },
      { system: 'Endocrine', normal: '\u2193 Testosterone, \u2191 insulin resistance, \u2193 vitamin D synthesis, \u2193 thyroid hormone clearance', path: 'DM2 (new-onset), hypothyroidism, adrenal insufficiency, hyperosmolar state (HHS)' },
      { system: 'Immune', normal: 'Immunosenescence: \u2193 naive T cells, \u2193 vaccine response, \u2191 autoantibodies, \u2191 inflammatory cytokines (inflammaging)', path: 'Reactivation (herpes zoster, TB), severe infections without fever, poor vaccine response' },
      { system: 'Sensory', normal: 'Presbyopia (lens stiffness ~50yo), presbycusis (high-frequency loss), \u2193 taste/smell, \u2193 proprioception', path: 'Cataracts (opacification), glaucoma, AMD, sudden hearing loss' },
      { system: 'Skin', normal: '\u2193 Collagen, \u2193 subcutaneous fat, \u2193 wound healing, senile purpura, xerosis', path: 'Pressure injuries, skin cancer (BCC/SCC/melanoma), bullous pemphigoid' },
      { system: 'Urogenital', normal: '\u2193 Bladder capacity, \u2191 residual volume, \u2193 detrusor contractility, BPH (men), vaginal atrophy (women)', path: 'Urinary incontinence (urge/overflow/functional), recurrent UTI, urinary retention' },
      { system: 'Hematologic', normal: '\u2193 Bone marrow cellularity, \u2193 stem cell reserve, normal CBC unless stressed', path: 'Anemia of chronic disease, MDS, VTE (\u2191 risk with age), clonal hematopoiesis (CHIP)' }
    ];
    var h = '<div class="sec-t">\ud83d\udc74 Normal Aging vs. Pathology</div>' +
      '<div class="sec-s">Physiological changes vs. disease \u2014 know the difference</div>' +
      '<input class="search-box" placeholder="Search system or term..." oninput="agingSearch=this.value.toLowerCase();render()" value="' + agingSearch + '">' +
      '<div style="border-radius:12px;overflow:hidden;border:1px solid rgb(var(--brd))">' +
      '<div class="aging-row" style="font-weight:700;font-size:11px;background:rgb(var(--bg2))">' +
      '<div class="cell" style="color:rgb(var(--green-fg))">\u2705 Normal Aging</div>' +
      '<div class="cell" style="color:rgb(var(--red-fg))">\u274c Pathology</div></div>';
    data.filter(function (d) { return !agingSearch || d.system.toLowerCase().indexOf(agingSearch) >= 0 || d.normal.toLowerCase().indexOf(agingSearch) >= 0 || d.path.toLowerCase().indexOf(agingSearch) >= 0; }).forEach(function (d) {
      h += '<div style="padding:6px 10px;font-weight:700;font-size:11px;background:rgb(var(--blue-bg));color:#1d4ed8">' + d.system + '</div>' +
        '<div class="aging-row"><div class="cell normal-cell">' + d.normal + '</div><div class="cell path-cell">' + d.path + '</div></div>';
    });
    h += '</div>';
    return h;
  }

  // ===== CALC MAIN RENDERER =====
  function renderCalc() {
    var _cv = [{ id: 'calc', l: '\ud83e\uddf0 Calculators' }, { id: 'basket', l: '\ud83e\uddf0 Med Basket' }, { id: 'eol', l: '\ud83d\udd4a\ufe0f EOL Tree' }, { id: 'lab', l: '\ud83d\udd2c Lab Ref' }, { id: 'aging', l: '\ud83d\udccb Aging Sheet' }];
    var h = '<div style="display:flex;gap:4px;overflow-x:auto;padding:4px 0;margin-bottom:8px">';
    _cv.forEach(function (v) {
      h += '<button onclick="calcView=\'' + v.id + '\';render()" style="white-space:nowrap;padding:6px 12px;border:none;border-radius:20px;font-size:10px;font-weight:' + (calcView === v.id ? '700' : '400') + ';cursor:pointer;background:' + (calcView === v.id ? '#0f172a' : '#f1f5f9') + ';color:' + (calcView === v.id ? '#fff' : '#64748b') + '">' + v.l + '</button>';
    });
    h += '</div>';
    if (calcView === 'basket') return h + renderMedBasket();
    if (calcView === 'eol') return h + renderEOLTree();
    if (calcView === 'lab') return h + renderLabOverlay();
    if (calcView === 'aging') return h + renderAgingSheet();
    h += '<div class="sec-s">CrCl \u00b7 CHA\u2082DS\u2082-VASc \u00b7 CURB-65 \u00b7 GDS-15 \u00b7 Braden \u00b7 PADUA</div>';
    h += _rcCrCl();
    h += _rcCheckList('CHA\u2082DS\u2082-VASc', 'cha', [['cha_chf', 'CHF', 1], ['cha_htn', 'HTN', 1], ['cha_age75', 'Age \u226575', 2], ['cha_dm', 'Diabetes', 1], ['cha_stroke', 'Stroke/TIA', 2], ['cha_vasc', 'Vascular disease', 1], ['cha_age65', 'Age 65-74', 1], ['cha_sex', 'Female sex', 1]],
      function (s) { return { clr: s >= 2 ? '#dc2626' : '#d97706', display: s, text: s >= 2 ? 'Anticoagulate (DOAC preferred, Apixaban safest in CKD)' : s === 1 ? 'Consider anticoagulation' : 'Low risk \u2014 consider no therapy' }; });
    h += _rcCheckList('CURB-65', 'curb', [['curb_conf', 'Confusion (new)', 1], ['curb_bun', 'BUN >20 mg/dL (>7 mmol/L)', 1], ['curb_rr', 'RR \u226530', 1], ['curb_bp', 'BP: SBP<90 or DBP\u226460', 1], ['curb_age', 'Age \u226565', 1]],
      function (s) { return { clr: s >= 3 ? '#dc2626' : s >= 2 ? '#d97706' : '#059669', display: s, text: s <= 1 ? 'Low risk (<2% mortality) \u2014 consider outpatient' : s === 2 ? 'Moderate (9%) \u2014 short inpatient or supervised outpatient' : 'High (15-40%) \u2014 ICU if 4-5' }; });
    h += _rcGDS();
    h += _rcSelectList('Braden Scale (Pressure Injury Risk)', 'braden', [
      ['brad_sens', 'Sensory Perception', ['Completely Limited (1)', 'Very Limited (2)', 'Slightly Limited (3)', 'No Impairment (4)']],
      ['brad_moist', 'Moisture', ['Constantly Moist (1)', 'Very Moist (2)', 'Occasionally Moist (3)', 'Rarely Moist (4)']],
      ['brad_act', 'Activity', ['Bedfast (1)', 'Chairfast (2)', 'Walks Occasionally (3)', 'Walks Frequently (4)']],
      ['brad_mob', 'Mobility', ['Completely Immobile (1)', 'Very Limited (2)', 'Slightly Limited (3)', 'No Limitation (4)']],
      ['brad_nut', 'Nutrition', ['Very Poor (1)', 'Probably Inadequate (2)', 'Adequate (3)', 'Excellent (4)']],
      ['brad_fric', 'Friction/Shear', ['Problem (1)', 'Potential Problem (2)', 'No Apparent Problem (3)']]], 1,
      function (s) { var r = s <= 12 ? 'High Risk' : s <= 14 ? 'Moderate Risk' : s <= 18 ? 'Mild Risk' : 'No Risk'; return { clr: s <= 12 ? '#dc2626' : s <= 14 ? '#d97706' : s <= 18 ? '#2563eb' : '#059669', display: s + '/23', text: r + (s <= 18 ? ' \u2014 Implement prevention protocol' : ''), copy: true, cls: true }; });
    h += _rcCheckList('PADUA VTE Risk Score', 'padua', [['pad_cancer', 'Active cancer', 3], ['pad_vte', 'Previous VTE', 3], ['pad_immob', 'Reduced mobility (\u22653 days)', 3], ['pad_throm', 'Known thrombophilia', 3], ['pad_trauma', 'Recent (\u22641mo) trauma/surgery', 2], ['pad_age', 'Age \u226570', 1], ['pad_hf', 'Heart/respiratory failure', 1], ['pad_mi', 'Acute MI or stroke', 1], ['pad_infect', 'Acute infection/rheumatic disorder', 1], ['pad_obesity', 'Obesity (BMI \u226530)', 1], ['pad_hormone', 'Ongoing hormonal therapy', 1]],
      function (s) { return { clr: s >= 4 ? '#dc2626' : '#059669', display: s, text: s >= 4 ? 'High VTE risk (\u22654) \u2014 Pharmacological prophylaxis recommended' : 'Low VTE risk (<4) \u2014 Mechanical prophylaxis or early mobilization', cls: true }; });
    h += _rcCheckList('Katz ADL Index', 'katz', ['Bathing', 'Dressing', 'Toileting', 'Transferring', 'Continence', 'Feeding'].map(function (l, i) { return ['katz_' + i, l + ' (Independent=1)', 1]; }),
      function (s) { return { clr: s >= 5 ? '#059669' : s >= 3 ? '#d97706' : '#dc2626', display: s + '/6', text: s === 6 ? 'Full independence' : s >= 4 ? 'Moderate dependence' : s >= 2 ? 'Severe dependence' : 'Total dependence', copy: true, cls: true }; });
    h += _rcCheckList('Lawton IADL Scale', 'lawton', ['Phone use', 'Shopping', 'Food prep', 'Housekeeping', 'Laundry', 'Transport', 'Medications', 'Finances'].map(function (l, i) { return ['law_' + i, l + ' (Independent=1)', 1]; }),
      function (s) { return { clr: s >= 6 ? '#059669' : s >= 4 ? '#d97706' : '#dc2626', display: s + '/8', text: (s === 8 ? 'Fully independent' : s >= 5 ? 'Partially dependent' : 'Significantly dependent') + ' in IADLs', cls: true }; });
    h += _rc4AT();
    h += _rcMNA();
    h += _rcCFS();
    h += _rcSelectList('Norton Scale (Pressure Injury Risk)', 'norton', [
      ['nrt_phys', 'Physical Condition', ['Very Bad (1)', 'Poor (2)', 'Fair (3)', 'Good (4)']],
      ['nrt_ment', 'Mental Condition', ['Stuporous (1)', 'Confused (2)', 'Apathetic (3)', 'Alert (4)']],
      ['nrt_act', 'Activity', ['Bedfast (1)', 'Chairbound (2)', 'Walks with Help (3)', 'Ambulatory (4)']],
      ['nrt_mob', 'Mobility', ['Immobile (1)', 'Very Limited (2)', 'Slightly Limited (3)', 'Full (4)']],
      ['nrt_inc', 'Incontinence', ['Doubly (1)', 'Usually Urinary (2)', 'Occasional (3)', 'None (4)']]], 1,
      function (s) { return { clr: s <= 12 ? '#dc2626' : s <= 14 ? '#d97706' : '#059669', display: s + '/20', text: (s <= 12 ? 'High risk \u2014 implement prevention' : 'Norton \u226414 moderate risk, >14 lower risk') + (s <= 14 ? ' \u2014 Turn schedule + skin assessment' : ''), copy: true, cls: true }; });
    h += _rcMorse();
    return h;
  }

  // Expose on window
  window.renderCalc = renderCalc;
  window.renderMedBasket = renderMedBasket;
  window.renderEOLTree = renderEOLTree;
  window.renderLabOverlay = renderLabOverlay;
  window.renderAgingSheet = renderAgingSheet;
})();
