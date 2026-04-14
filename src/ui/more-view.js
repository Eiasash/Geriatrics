/**
 * More tab renderers — Search, Feedback, Chat.
 * Extracted from shlav-a-mega.html.
 *
 * Globals read: QZ, NOTES, DRUGS, S, APP_VERSION, SUPA_URL, SUPA_ANON,
 *   AI_PROXY, AI_SECRET, voiceListening, voiceTranscript
 * Globals owned: srchQ, chatLoading, CHAT_STARTERS, CHAT_SYSTEM
 * Functions used: sanitize, save, render, startVoiceParser, getApiKey,
 *   setApiKey, callAI
 */
(function () {
  'use strict';

  // ===== SEARCH =====
  window.srchQ = '';

  function renderSearch() {
    var h = '<div class="sec-t">\ud83d\udd0d Search</div><div class="sec-s">Search across all ' + QZ.length + ' questions + ' + NOTES.length + ' study notes + ' + DRUGS.length + ' drugs</div>';
    h += '<div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">' +
      '<input class="search-box" style="margin-bottom:0;flex:1" placeholder="Type to search..." oninput="srchQ=this.value;render()" value="' + srchQ + '" id="srchi">' +
      '<button class="voice-btn' + (voiceListening ? ' listening' : '') + '" onclick="startVoiceParser()" aria-label="' + (voiceListening ? 'Stop voice input' : 'Start voice input') + '">' + (voiceListening ? '\ud83d\udd34 Listening...' : '\ud83c\udfa4 Voice') + '</button>' +
      '</div>';
    if (voiceTranscript && srchQ) {
      h += '<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:8px;padding:6px 10px;background:rgb(var(--bg2));border-radius:8px" dir="auto">\ud83c\udfa4 "' + voiceTranscript + '"</div>';
    }
    if (srchQ.length >= 2) {
      var q = srchQ.toLowerCase();
      var qRes = [];
      QZ.forEach(function (item, i) { if (item.q.toLowerCase().indexOf(q) >= 0 || item.o.some(function (o) { return o.toLowerCase().indexOf(q) >= 0; })) qRes.push(i); });
      var nRes = NOTES.filter(function (n) { return n.topic.toLowerCase().indexOf(q) >= 0 || n.notes.toLowerCase().indexOf(q) >= 0; });
      var dRes = DRUGS.filter(function (d) { return d.name.toLowerCase().indexOf(q) >= 0 || d.heb.indexOf(q) >= 0 || d.risk.toLowerCase().indexOf(q) >= 0; });
      h += '<div style="font-size:11px;color:rgb(var(--fg2));margin-bottom:10px">' + qRes.length + ' questions \u00b7 ' + nRes.length + ' topics \u00b7 ' + dRes.length + ' drugs</div>';
      if (nRes.length) {
        h += '<div style="font-weight:700;font-size:12px;margin-bottom:6px">\ud83d\udcda Study Notes</div>';
        nRes.forEach(function (n) { h += '<div class="card" style="padding:10px"><div style="font-weight:700;font-size:11px">' + n.topic + '</div><div style="font-size:10px;color:rgb(var(--fg2));margin-top:4px;line-height:1.6">' + n.notes.substring(0, 200) + '...</div></div>'; });
      }
      if (dRes.length) {
        h += '<div style="font-weight:700;font-size:12px;margin:8px 0 6px">\ud83d\udc8a Drugs</div>';
        dRes.forEach(function (d) { h += '<div class="card" style="padding:10px"><span style="font-weight:700;font-size:11px">' + d.name + '</span> ' + (d.beers ? '<span class="badge badge-r">BEERS</span>' : '') + '<div style="font-size:10px;color:rgb(var(--fg2));margin-top:2px">' + d.risk + '</div></div>'; });
      }
      if (qRes.length) {
        h += '<div style="font-weight:700;font-size:12px;margin:8px 0 6px">\ud83d\udcdd Questions (' + Math.min(qRes.length, 15) + ' shown)</div>';
        qRes.slice(0, 15).forEach(function (i) { h += '<div class="card heb" dir="rtl" style="padding:10px;font-size:11px;line-height:1.5"><span class="badge" style="background:' + (QZ[i].t === 'Hazzard' ? '#faf5ff' : '#eff6ff') + ';color:' + (QZ[i].t === 'Hazzard' ? '#7c3aed' : '#1d4ed8') + '">' + (QZ[i].t === 'Hazzard' ? '\ud83e\udd16 AI' : '\ud83d\udcdd ' + QZ[i].t) + '</span> ' + QZ[i].q.substring(0, 120) + '...</div>'; });
      }
    }
    return h;
  }

  // ===== FEEDBACK =====
  function renderFeedback() {
    var h = '<div class="sec-t">\ud83d\udca1 Feedback & Feature Requests</div>';
    h += '<div class="sec-s">Help improve Shlav A Mega for everyone. AI reviews every submission.</div>';
    h += '<div class="card" style="padding:16px;margin-bottom:12px">';
    h += '<div style="font-size:12px;font-weight:700;margin-bottom:8px">Submit Feedback</div>';
    h += '<select id="fb-type" style="width:100%;padding:8px;border:1px solid rgb(var(--brd));border-radius:8px;font-size:12px;margin-bottom:8px;background:rgb(var(--bg2))">';
    h += '<option value="bug">\ud83d\udc1b Bug Report</option>';
    h += '<option value="feature">\u2728 Feature Request</option>';
    h += '<option value="content">\ud83d\udcdd Content Fix (wrong answer/explanation)</option>';
    h += '<option value="ux">\ud83c\udfa8 UX/Design Improvement</option>';
    h += '<option value="other">\ud83d\udcac Other</option>';
    h += '</select>';
    h += '<textarea id="fb-text" dir="auto" placeholder="Describe your feedback in detail..." style="width:100%;min-height:100px;padding:10px;border:1px solid rgb(var(--brd));border-radius:10px;font-size:12px;font-family:inherit;resize:vertical;margin-bottom:8px"></textarea>';
    h += '<button onclick="submitFeedback()" class="btn" style="width:100%;padding:10px;background:#7c3aed;color:#fff;border:none;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer">\ud83d\udce4 Submit Feedback</button>';
    h += '</div>';
    var fb = [];
    try { fb = JSON.parse(localStorage.getItem('samega_fb_sent') || '[]'); } catch (_e) {}
    if (fb.length) {
      h += '<div class="card" style="padding:14px">';
      h += '<div style="font-size:12px;font-weight:700;margin-bottom:8px">\ud83d\udccb Your Submissions (' + fb.length + ')</div>';
      var icons = { bug: '\ud83d\udc1b', feature: '\u2728', content: '\ud83d\udcdd', ux: '\ud83c\udfa8', other: '\ud83d\udcac' };
      fb.slice(-5).reverse().forEach(function (f) {
        h += '<div style="padding:6px 0;border-bottom:1px solid rgb(var(--brd));font-size:10px">';
        h += '<span style="font-weight:600">' + (icons[f.type] || '\ud83d\udcac') + ' ' + f.type + '</span>';
        h += ' \u00b7 <span style="color:rgb(var(--fg2))">' + new Date(f.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</span>';
        h += '<div style="color:rgb(var(--fg2));margin-top:2px;line-height:1.5">' + f.text.slice(0, 120) + (f.text.length > 120 ? '...' : '') + '</div>';
        if (f.aiResponse) { h += '<div style="color:#7c3aed;margin-top:4px;padding:6px 8px;background:#f5f3ff;border-radius:6px;font-size:9px;line-height:1.5">\ud83e\udd16 ' + f.aiResponse + '</div>'; }
        h += '</div>';
      });
      h += '</div>';
    }
    return h;
  }

  window.submitFeedback = async function () {
    var type = (document.getElementById('fb-type') || {}).value || 'other';
    var text = ((document.getElementById('fb-text') || {}).value || '').trim();
    if (!text) { alert('Please describe your feedback'); return; }
    var entry = { type: type, text: text, ts: Date.now(), version: APP_VERSION, uid: localStorage.getItem('samega_uid') || 'anon' };
    var fb = [];
    try { fb = JSON.parse(localStorage.getItem('samega_fb_sent') || '[]'); } catch (_e) {}
    fb.push(entry);
    localStorage.setItem('samega_fb_sent', JSON.stringify(fb));
    try {
      await fetch(SUPA_URL + '/rest/v1/shlav_feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON, 'Authorization': 'Bearer ' + SUPA_ANON },
        body: JSON.stringify(entry)
      });
    } catch (_e) { console.warn('Feedback submit failed', _e); }
    try {
      var aiPrompt = 'A user submitted this feedback for a medical study app. Briefly acknowledge it and assess feasibility in 1-2 sentences. Type: ' + type + '. Feedback: ' + text;
      var res = await fetch('https://toranot.netlify.app/api/claude', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt, secret: 'shlav-a-mega-2026' })
      });
      var data = await res.json();
      var aiText = data.content || data.text || data.response || '';
      if (aiText) {
        fb[fb.length - 1].aiResponse = aiText.slice(0, 300);
        localStorage.setItem('samega_fb_sent', JSON.stringify(fb));
      }
    } catch (_e) {}
    render();
  };

  // ===== CHAT =====
  var CHAT_STARTERS = [
    '\u05de\u05d4 \u05d4\u05d4\u05d1\u05d3\u05dc \u05d1\u05d9\u05df \u05d3\u05de\u05e0\u05e6\u05d9\u05d4 \u05dc\u05d3\u05dc\u05d9\u05e8\u05d9\u05d5\u05dd?',
    '\u05ea\u05e1\u05d1\u05d9\u05e8 \u05e2\u05dc \u05ea\u05e1\u05de\u05d5\u05e0\u05ea \u05d4\u05e9\u05d1\u05e8\u05d9\u05e8\u05d5\u05ea (frailty)',
    '\u05de\u05d4 \u05db\u05d5\u05dc\u05dc \u05d4\u05e2\u05e8\u05db\u05d4 \u05d2\u05e8\u05d9\u05d0\u05d8\u05e8\u05d9\u05ea \u05de\u05e7\u05d9\u05e4\u05d4?',
    '\u05ea\u05e8\u05d5\u05e4\u05d5\u05ea \u05e9\u05d9\u05e9 \u05dc\u05d4\u05d9\u05de\u05e0\u05e2 \u05de\u05d4\u05df \u05d1\u05e7\u05e9\u05d9\u05e9\u05d9\u05dd (Beers)',
    '\u05de\u05d4 \u05d4\u05d2\u05d9\u05e9\u05d4 \u05dc\u05e0\u05e4\u05d9\u05dc\u05d5\u05ea \u05d1\u05e7\u05e9\u05d9\u05e9?'
  ];
  var CHAT_SYSTEM = "You are a senior geriatrician and mentor at Shaare Zedek Medical Center in Jerusalem. The user is a geriatrics fellow preparing for their shlav-aleph (board) exam (P005-2026). Answer in the same language as the question (Hebrew or English). Be concise, clinically precise. Focus on Hazzard's 8e, Harrison's 22e, Beers criteria, STOPP/START, CGA, FRAX, and exam-relevant guidelines.";
  window.chatLoading = false;

  function renderChat() {
    var h = '<div class="sec-t">\ud83d\udcac AI Chat</div><div class="sec-s">Claude-powered geriatrics Q&A \u2014 board prep focus</div>';
    h += '<div class="card" style="display:flex;flex-direction:column;height:calc(100vh - 200px);overflow:hidden">';
    h += '<div class="chat-disclaimer" style="margin:10px 10px 0">\u26a0\ufe0f AI mentor \u2014 not a substitute for clinical judgment. For board prep use only.</div>';
    if (S.chat.length > 0) { h += '<div style="padding:4px 10px;text-align:left"><button onclick="clearChat()" style="font-size:10px;color:rgb(var(--fg3));background:none;border:none;cursor:pointer" aria-label="Clear chat history">\ud83d\uddd1 \u05e0\u05e7\u05d4 \u05e9\u05d9\u05d7\u05d4</button></div>'; }
    h += '<div class="chat-msgs" id="chat-msgs">';
    if (S.chat.length === 0) {
      h += '<div style="padding:8px 4px 12px"><div class="heb" style="font-size:11px;color:rgb(var(--fg2));margin-bottom:10px;text-align:right">\u05d4\u05ea\u05d7\u05dc \u05e9\u05d9\u05d7\u05d4 \u2014 \u05d1\u05d7\u05e8 \u05e0\u05d5\u05e9\u05d0 \u05d0\u05d5 \u05db\u05ea\u05d5\u05d1 \u05e9\u05d0\u05dc\u05d4 \u05d7\u05d5\u05e4\u05e9\u05d9\u05ea:</div>';
      CHAT_STARTERS.forEach(function (s) { h += '<button class="chat-starter" onclick="sendChatStarter(this.getAttribute(\'data-t\'))" data-t="' + s.replace(/"/g, '&quot;') + '">' + sanitize(s) + '</button>'; });
      h += '</div>';
    } else {
      S.chat.forEach(function (m) {
        var cls = m.role === 'user' ? 'chat-msg-user' : m.role === 'error' ? 'chat-msg-err' : 'chat-msg-ai';
        if (m.role === 'user') { h += '<div class="' + cls + ' heb" dir="rtl" style="text-align:right">' + sanitize(m.text) + '</div>'; }
        else { h += '<div class="' + cls + '">' + sanitize(m.text) + '</div>'; }
      });
      if (chatLoading) { h += '<div class="chat-msg-ai" style="padding:6px 12px"><div class="typing-dots"><span></span><span></span><span></span></div></div>'; }
    }
    h += '</div>';
    h += '<div class="chat-input-row">';
    h += '<textarea id="chat-input" placeholder="\u05e9\u05d0\u05dc \u05e9\u05d0\u05dc\u05d4 \u05d2\u05e8\u05d9\u05d0\u05d8\u05e8\u05d9\u05ea..." rows="2" aria-label="Chat input" style="flex:1;border:1px solid rgb(var(--brd));border-radius:10px;padding:8px 10px;font-size:12px;resize:none;font-family:Heebo,sans-serif;direction:rtl;text-align:right;background:inherit;color:inherit" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();sendChat()}"></textarea>';
    h += '<button class="btn btn-p" onclick="sendChat()" ' + (chatLoading ? 'disabled' : '') + ' style="align-self:flex-end;min-width:52px" aria-label="Send">\u05e9\u05dc\u05d7</button>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  window.sendChat = async function () {
    var input = document.getElementById('chat-input');
    var text = (input ? input.value : '').trim();
    if (!text || chatLoading) return;
    var key = getApiKey();
    if (!key) { var k = prompt('\u05d4\u05db\u05e0\u05e1 Anthropic API Key:', ''); if (!k) return; setApiKey(k); }
    S.chat.push({ role: 'user', text: text });
    chatLoading = true; save(); render();
    setTimeout(function () { var el = document.getElementById('chat-msgs'); if (el) el.scrollTop = el.scrollHeight; }, 50);
    var history = S.chat.slice(-10);
    if (history.length > 0 && history[0].role !== 'user') history = history.slice(1);
    var messages = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; }).map(function (m) { return { role: m.role, content: m.text }; });
    try {
      var ctrl = new AbortController();
      var timeout = setTimeout(function () { ctrl.abort(); }, 45000);
      var resp = await fetch(AI_PROXY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-secret': AI_SECRET },
        body: JSON.stringify({ model: 'sonnet', max_tokens: 1024, system: CHAT_SYSTEM, messages: messages }),
        signal: ctrl.signal
      });
      clearTimeout(timeout);
      if (!resp.ok) { var e = await resp.json().catch(function () { return {}; }); if (resp.status === 401 || resp.status === 403) { localStorage.removeItem('samega_apikey'); throw new Error('API key invalid'); } throw new Error(e.error && e.error.message ? e.error.message : 'HTTP ' + resp.status); }
      var data = await resp.json();
      S.chat.push({ role: 'assistant', text: data.content[0].text });
    } catch (e) {
      var offline = !navigator.onLine || e.message.indexOf('Failed to fetch') >= 0;
      var timedOut = e.name === 'AbortError';
      S.chat.push({ role: 'error', text: offline ? '\ud83d\udce1 \u05d0\u05d9\u05df \u05d7\u05d9\u05d1\u05d5\u05e8 \u05dc\u05d0\u05d9\u05e0\u05d8\u05e8\u05e0\u05d8' : timedOut ? '\u23f1\ufe0f \u05ea\u05dd \u05d4\u05d6\u05de\u05df' : '\u26a0\ufe0f ' + sanitize(e.message) });
    }
    chatLoading = false; save(); render();
    setTimeout(function () { var el = document.getElementById('chat-msgs'); if (el) el.scrollTop = el.scrollHeight; }, 50);
  };

  window.sendChatStarter = function (text) { var input = document.getElementById('chat-input'); if (input) input.value = text; sendChat(); };
  window.clearChat = function () { S.chat = []; chatLoading = false; save(); render(); };

  // Expose renderers
  window.renderSearch = renderSearch;
  window.renderFeedback = renderFeedback;
  window.renderChat = renderChat;
})();
