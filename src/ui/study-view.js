/**
 * Study notes renderer — extracted from shlav-a-mega.html.
 *
 * Globals read: NOTES, document
 * Globals owned: openNote (mutable, exposed on window)
 * Functions exposed: renderStudy, toggleNote, filterNotes
 */
(function () {
  'use strict';

  // Mutable state owned by study view
  window.openNote = null;

  window.toggleNote = function (i) {
    window.openNote = window.openNote === i ? null : i;
    render();
  };

  window.filterNotes = function (_v) { render(); };

  // ===== NOTE FORMATTING HELPERS =====
  function fmtLine(line) {
    if (/^▸\s+/.test(line)) {
      var title = line.replace(/^▸\s+/, '');
      return '<div style="margin:14px 0 6px;padding:5px 10px;background:linear-gradient(90deg,#eff6ff,transparent);border-left:3px solid #3b82f6;border-radius:0 4px 4px 0;font-size:10px;font-weight:800;color:rgb(var(--blue-fg));text-transform:uppercase;letter-spacing:.6px">' + title + '</div>';
    }
    line = line.replace(/^([A-Z][A-Z\s\/&\-()]{2,40}):/, '<strong style="color:#0f172a">$1:</strong>');
    line = line.replace(/^([^:\n]{2,50}):/, '<strong>$1:</strong>');
    line = line.replace(/(≥\d[\d.]*\s*(?:mmHg|m\/s|s\b|mg|IU|%)?|≤\d[\d.]*\s*(?:mmHg|m\/s|s\b|mg|IU|%)?|[<>]\d[\d.]*\s*(?:mmHg|m\/s|s\b|mg|IU|%)?|\d+–\d+%|\d+%)/g, '<b style="color:#0f172a">$1</b>');
    line = line.replace(/\(SOE=[A-C]\)/g, '<span style="background:#ecfdf5;color:#059669;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;vertical-align:middle">$&</span>');
    line = line.replace(/\b(INCREASES|AVOID|DO NOT|WARNING|CRITICAL|CONTRAINDICATED)\b/g, '<span style="color:#dc2626;font-weight:700">$1</span>');
    line = line.replace(/\b(SOE=A)\b/g, '<span style="color:#059669;font-weight:700">$1</span>');
    return line;
  }

  function fmtBlock(t) {
    var paras = t.split(/\n{2,}/);
    return paras.map(function (para) {
      var lines = para.split('\n');
      if (lines.length === 1 && /^▸\s+/.test(lines[0])) {
        return fmtLine(lines[0]);
      }
      var fmt = lines.map(fmtLine).join('<br>');
      return '<p style="font-size:11.5px;line-height:1.9;margin:0 0 10px;color:rgb(var(--fg))">' + fmt + '</p>';
    }).join('');
  }

  function fmtNote(txt) {
    var parts = txt.split(/📖\s*HAZZARD'?S?\s*8e\s*BOARD\s*PEARLS:\s*/i);
    var clinicalNotes = parts[0] || '';
    var boardPearls = parts[1] || '';
    var h = '<div style="font-size:10px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📝 Clinical Notes</div>';
    h += fmtBlock(clinicalNotes.trim());
    if (boardPearls.trim()) {
      h += '<div style="margin-top:16px;padding:10px 12px;background:rgb(var(--green-bg));border:1px solid rgb(var(--green-brd));border-radius:8px">';
      h += '<div style="font-size:10px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📖 Hazzard\'s 8e — Board Pearls</div>';
      h += '<p style="font-size:11px;line-height:1.85;margin:0;color:#14532d">' + boardPearls.trim().replace(/(≥\d[\d.]*|≤\d[\d.]*|[<>]\d[\d.]*|\d+%)/g, '<b>$1</b>').replace(/\(SOE=[A-C]\)/g, '<span style="background:#dcfce7;color:rgb(var(--green-fg));padding:1px 4px;border-radius:3px;font-size:9px;font-weight:700">$&</span>').replace(/\b(INCREASES|AVOID|DO NOT)\b/g, '<span style="color:#dc2626;font-weight:700">$1</span>') + '</p>';
      h += '</div>';
    }
    return h;
  }

  // ===== MAIN RENDERER =====
  function renderStudy() {
    var h = '<div class="sec-t">📚 Study Notes</div><div class="sec-s">40 IMA topics · Hazzard\'s 8e + Harrison\'s + Israeli Guidelines</div>';
    h += '<input class="search-box" placeholder="Search topics..." oninput="filterNotes(this.value)" id="nfilt">';
    var nfiltEl = document.getElementById('nfilt');
    var fv = nfiltEl ? nfiltEl.value.toLowerCase() : '';
    NOTES.filter(function (n) { return n.topic.toLowerCase().indexOf(fv) >= 0 || n.notes.toLowerCase().indexOf(fv) >= 0; }).forEach(function (n) {
      var i = n.id;
      h += '<div class="card"><button class="acc-h" onclick="toggleNote(' + i + ')">' +
        '<div style="display:flex;align-items:center;gap:8px"><span style="font-weight:700;font-size:12px">' + n.topic + '</span>' +
        '<span style="font-size:9px;color:rgb(var(--fg3))">' + n.ch + '</span></div>' +
        '<span class="acc-ar' + (openNote === i ? ' op' : '') + '">▼</span></button>';
      if (openNote === i) {
        h += '<div style="padding:10px 14px 14px;border-top:1px solid rgb(var(--brd))">' + fmtNote(n.notes) + '</div>';
      }
      h += '</div>';
    });
    return h;
  }

  // ===== FLASHCARDS =====
  function renderFlash() {
    var f = FLASH[S.fci % FLASH.length];
    var fcsr = S.fcsr || {};
    var fcKnown = 0, fcLearning = 0, fcNew = 0;
    for (var i = 0; i < FLASH.length; i++) { var r = fcsr['fc_' + i]; if (!r) fcNew++; else if (r.n >= 2) fcKnown++; else fcLearning++; }
    var h = '<div class="sec-t">\ud83c\udccf Flashcards</div><div class="sec-s">' + FLASH.length + ' high-yield cards \u00b7 Tap to flip</div>';
    h += '<div style="display:flex;gap:6px;margin-bottom:12px">' +
      '<span class="badge badge-g">\u2705 Known: ' + fcKnown + '</span>' +
      '<span class="badge badge-y">\ud83d\udcd6 Learning: ' + fcLearning + '</span>' +
      '<span class="badge" style="background:rgb(var(--bg2));color:rgb(var(--fg2))">\ud83c\udd95 New: ' + fcNew + '</span>' +
      '</div>';
    h += '<div class="fc" onclick="S.fcFlip=!S.fcFlip;save();render()" style="border-color:' + (S.fcFlip ? 'rgb(var(--em))' : 'rgb(var(--sky))') + '" role="button" tabindex="0" aria-label="' + (S.fcFlip ? 'Show question' : 'Show answer') + '">' +
      '<p style="font-size:' + (S.fcFlip ? '12px' : '14px') + ';font-weight:' + (S.fcFlip ? '400' : '700') + ';line-height:1.7;color:' + (S.fcFlip ? '#334155' : '#1e293b') + '">' +
      (S.fcFlip ? f.b : f.f) + '</p>' +
      '<p style="font-size:9px;color:rgb(var(--fg3));margin-top:12px">' + (S.fcFlip ? 'Tap for question' : 'Tap to reveal answer') + ' \u00b7 ' + (S.fci % FLASH.length + 1) + '/' + FLASH.length + '</p>' +
      '</div>';
    h += '<div style="display:flex;gap:8px;justify-content:center;margin-top:12px">' +
      '<button class="btn btn-o" onclick="S.fci=(S.fci-1+FLASH.length)%FLASH.length;S.fcFlip=false;save();render()" aria-label="Previous flashcard">\u2190 Prev</button>' +
      '<button class="btn btn-p" onclick="S.fci++;S.fcFlip=false;save();render()" aria-label="Next flashcard">Next \u2192</button>' +
      '</div>';
    if (S.fcFlip) {
      h += '<div style="display:flex;gap:6px;justify-content:center;margin-top:8px">' +
        '<button class="btn" style="background:rgb(var(--red-bg));color:#dc2626" onclick="fcRate(0)" aria-label="Rate: Again">\ud83d\udd04 \u05e9\u05d5\u05d1</button>' +
        '<button class="btn" style="background:rgb(var(--yellow-bg));color:#d97706" onclick="fcRate(1)" aria-label="Rate: Hard">\ud83e\udd14 \u05e7\u05e9\u05d4</button>' +
        '<button class="btn" style="background:#ecfdf5;color:#059669" onclick="fcRate(2)" aria-label="Rate: Easy">\u2705 \u05e7\u05dc</button>' +
        '</div>';
    }
    h += '<div style="text-align:center;margin-top:8px"><button onclick="S.fci=Math.floor(Math.random()*FLASH.length);S.fcFlip=false;save();render()" style="font-size:10px;color:rgb(var(--sky));text-decoration:underline" aria-label="Random flashcard">\ud83d\udd00 Random</button></div>';
    return h;
  }

  // ===== DRUG LOOKUP =====
  window.drugSearch = '';

  function renderDrugs() {
    var h = '<div class="sec-t">\ud83d\udc8a Drug Lookup</div><div class="sec-s">Beers Criteria + ACB Score Checker</div>';
    h += '<input class="search-box" placeholder="Search drug name..." oninput="drugSearch=this.value;render()" value="' + drugSearch + '" id="dsrch">';
    var fv = drugSearch.toLowerCase();
    var filtered = DRUGS.filter(function (d) { return !fv || d.name.toLowerCase().indexOf(fv) >= 0 || d.heb.indexOf(fv) >= 0 || (d.cat || '').toLowerCase().indexOf(fv) >= 0; });
    h += '<div class="card">';
    if (!filtered.length) h += '<div style="padding:16px;text-align:center;color:rgb(var(--fg3));font-size:12px">No drugs found</div>';
    filtered.forEach(function (d) {
      h += '<div class="drug-row"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
        '<span style="font-weight:700;font-size:12px">' + d.name + ' ' + (d.heb ? '<span style="color:rgb(var(--fg3))">(' + d.heb + ')</span>' : '') + '</span>' +
        '<div style="display:flex;gap:4px">' +
        (d.beers ? '<span class="badge badge-r">BEERS</span>' : '') +
        (d.acb >= 3 ? '<span class="badge badge-r">ACB ' + d.acb + '</span>' : d.acb >= 2 ? '<span class="badge badge-y">ACB ' + d.acb + '</span>' : d.acb >= 1 ? '<span class="badge badge-g">ACB ' + d.acb + '</span>' : '') +
        '</div></div>' +
        '<div style="font-size:10px;color:rgb(var(--fg2))">' + (d.cat || '') + '</div>' +
        '<div style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + d.risk + '</div></div>';
    });
    h += '</div>';
    return h;
  }

  window.renderStudy = renderStudy;
  window.renderFlash = renderFlash;
  window.renderDrugs = renderDrugs;
})();
