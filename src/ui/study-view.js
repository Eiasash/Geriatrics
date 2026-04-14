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

  window.renderStudy = renderStudy;
})();
