/**
 * quiz-view.js
 *
 * Quiz rendering engine extracted from shlav-a-mega.html (v9.30)
 * Provides all UI components for question rendering, answer interaction, explanations,
 * and quiz modes (standard, exam, timed, sudden death, on-call).
 *
 * EXPOSES ON window:
 *   - renderQuiz() — main quiz orchestrator, switches between modes
 *   - renderOnCall() — on-call flip-card mode
 *   - runExplainOnCall() — async AI explanation handler for on-call mode
 *
 * PRIVATE (IIFE scope):
 *   - _rqTimerBar() — timed mode countdown bar
 *   - _rqSuddenDeath() — sudden death view (leaderboard, streak, questions)
 *   - _rqExamBar() — exam header with timer and pace
 *   - _rqControls(dueN) — mode buttons, filter pills, toggles
 *   - _rqQuestion(q, qIdx, bk) — question tags, text, images
 *   - _rqOptions(q, qIdx) — shuffled option buttons (with blind recall, autopsy)
 *   - _rqPreAnswer(q) — confidence selector + check button
 *   - _rqPostAnswer(q, qIdx) — wrong reason buttons, difficulty rating, next button
 *   - _rqTeachBack(q, qIdx) — teach-back input/grading section
 *   - _rqExplanations(q, qIdx, shuf) — notes, built-in, AI, autopsy explanations
 *   - _rqFooter(qIdx, pct) — stats line (ok, no, %)
 *
 * DEPENDENCIES (read from window or quizState):
 *   Globals:
 *     QZ, S, TOPICS, TOPIC_REF, NOTES, FLASH, DRUGS
 *   Backed by window.quizState via descriptors:
 *     pool, qi, sel, ans, filt, topicFilt, examMode, examSec, examTimer,
 *     timedMode, timedSec, timedPaused, onCallMode, flipRevealed,
 *     pomoActive, pomoSec, sdMode, sdPool, sdQi, sdStreak, sdLeaderboard,
 *     blindRecall, autopsyMode, autopsyDistractor, isSpeaking,
 *     _confidence, _wrongReason, _diffRating, _pendingSR, _optShuffle,
 *     mockExamResults, teachBackState, _exCache, _sessionOk, _sessionNo, timedInt
 *   Functions: buildPool, getDueQuestions, isExamTrap, isChronicFail, getTopicStats,
 *     getOptShuffle, fmtT, sanitize, remapExplanationLetters, render, save, check,
 *     pick, next, sdCheck, sdNext, endSuddenDeath, startMockExam, startExam,
 *     startSuddenDeath, startOnCallMode, exitOnCallMode, flipCard, onCallPick,
 *     startPomodoro, stopPomodoro, startNextBestStep, pauseTimed, startTimedQ,
 *     stopTimedMode, speakQuestion, showAnswerHardFail, toggleBk, shareQ,
 *     _storeDiff, _updateWrongUI, rateConfidence, startTopicMiniExam, setFilt,
 *     setTopicFilt, explainWithAI, aiAutopsy, renderExplainBox, toggleFlagExplain,
 *     startVoiceTeachBack, gradeTeachBack, callAI, submitReport, viewImg,
 *     uploadQImage, removeQImage, isMetaOption, srScore, checkMockIntercept
 *   SM namespace: SM.sanitize, SM.fmtT
 */

(function(){
  'use strict';

  // ===== PRIVATE FUNCTIONS (defined in IIFE scope) =====

  function _rqTimerBar(){
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
      + '<span id="timed-count" style="font-size:11px;font-weight:700;color:rgb(var(--fg2));min-width:24px">' + timedSec + 's</span>'
      + '<div style="flex:1;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden">'
      + '  <div id="timed-bar" style="height:100%;width:' + Math.round(timedSec/90*100) + '%;background:' + (timedSec>45?'#10b981':timedSec>22?'#f59e0b':'#ef4444') + ';border-radius:3px;transition:width .9s linear"></div>'
      + '</div>'
      + '<button onclick="pauseTimed()" style="font-size:9px;padding:2px 7px;background:rgb(var(--bg2));border:1px solid rgb(var(--brd));border-radius:6px;cursor:pointer;white-space:nowrap" aria-label="' + (timedPaused?'Resume timer':'Pause timer') + '">' + (timedPaused?'▶ המשך':'⏸ עצור') + '</button>'
      + '</div>';
  }

  function _rqSuddenDeath(){
    if(sdQi>=sdPool.length)sdQi=0;
    const q=QZ[sdPool[sdQi]];
    let h='<div class="sudden-death-banner"><span style="font-weight:700;font-size:13px">💀 Sudden Death</span>'
      + '<span style="font-size:16px;font-weight:700">🔥 ' + sdStreak + '</span>'
      + '<button class="btn" style="background:rgba(255,255,255,.2);color:#fff;font-size:10px;padding:4px 10px" onclick="endSuddenDeath()" aria-label="Quit sudden death mode">Quit</button></div>';
    h+='<div class="card" style="padding:16px">';
    if(timedMode&&!ans)h+=_rqTimerBar();
    const _isFlagQ=(S.flagged||{})[pool[qi]];
    h+='<p class="heb" style="font-size:13px;font-weight:700;line-height:1.7;margin-bottom:' + (q.img?'10':'16') + 'px">' + (_isFlagQ?'<span style="color:#dc2626;font-size:11px" title="Explanation flagged — verify">⚑ </span>':'') + q.q + '</p>';
    if(q.img){
      h+='<div style="margin-bottom:14px;text-align:center;position:relative"><img src="' + q.img + '" alt="Question image" style="max-width:100%;max-height:300px;border-radius:10px;border:1px solid rgb(var(--brd));cursor:pointer" onclick="viewImg(this.src)" loading="lazy">'
        + '<button onclick="event.stopPropagation();removeQImage(' + pool[qi] + ')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;font-size:12px;cursor:pointer">✕</button></div>';
    }
    if(!q.img&&!examMode){
      h+='<div style="margin-bottom:10px"><button onclick="uploadQImage(' + pool[qi] + ')" style="font-size:10px;padding:4px 12px;background:rgb(var(--bg2));color:rgb(var(--fg2));border:1px solid rgb(var(--brd));border-radius:8px;cursor:pointer">📷 Attach Image</button><span id="img-status-' + pool[qi] + '" style="font-size:10px;color:rgb(var(--fg3));margin-left:6px"></span></div>';
    }
    q.o.forEach((o,i)=>{
      let cls='qo';
      if(ans){cls+=' lk';if(i===q.c)cls+=' ok';else if(i===sel)cls+=' no';else cls+=' dim';}
      else if(i===sel)cls+=' sel';
      h+='<button class="' + cls + '" onclick="pick(' + i + ')" aria-label="Option ' + (i+1) + ': ' + o + '">' + o + '</button>';
    });
    if(!ans)h+='<button class="btn btn-p" onclick="sdCheck()"' + (sel===null?' disabled':'') + ' aria-label="Check answer">בדוק</button>';
    else h+='<button class="btn btn-d" onclick="sdNext()" aria-label="Next question">הבאה ←</button>';
    h+='</div>';
    if(sdLeaderboard.length){
      h+='<div class="card" style="padding:14px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">🏆 Leaderboard</div>';
      sdLeaderboard.forEach((e,i)=>{h+='<div class="leaderboard-row"><span>' + (i===0?'🥇':i===1?'🥈':i===2?'🥉':'#'+(i+1)) + ' ' + e.streak + ' questions</span><span style="color:rgb(var(--fg3))">' + e.date + '</span></div>';});
      h+='</div>';
    }
    return h;
  }

  function _rqExamBar(){
    const answered=S.qOk+S.qNo;
    const isMock=!!mockExamResults;
    const target=isMock?108:72;
    const elapsed=10800-examSec;
    const avgSec=answered>0?Math.floor(elapsed/answered):0;
    const paceOk=avgSec<=target*1.1;
    const paceStr=answered>0?'avg ' + fmtT(avgSec) + '/q · ' + (paceOk?'<span style="color:#4ade80">✓</span>':'<span style="color:#f87171">⚠️ slow</span>'):'';
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:#0f172a;border-radius:12px;color:#fff">'
      + '<span style="font-weight:700;font-size:11px">' + (isMock?'🎯 Mock':'📋 Exam') + '<br><span style="font-size:9px;font-weight:400">' + paceStr + '</span></span>'
      + '<span id="etimer" class="timer" style="font-size:16px;font-weight:700">' + fmtT(examSec) + '</span>'
      + '<span style="font-size:11px">' + (qi+1) + '/' + (isMock?pool.length:150) + '</span>'
      + '<button onclick="if(confirm(\'סיים מבחן?\\n\\nהציון ייחשב על ' + (qi+1) + ' שאלות שענית עד עכשיו.\')){' + (isMock?'endMockExam()':'endExam()') + '}" style="background:#dc2626;color:#fff;border:none;border-radius:10px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(220,38,38,.3)">⏹ סיים</button>'
      + '</div>';
  }

  function _rqControls(dueN){
    let h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      + '<div class="sec-t">Quiz</div>'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap">'
      + '<button onclick="startMockExam()" class="btn" style="font-size:10px;padding:6px 14px;background:#7c3aed;color:#fff;border:none;border-radius:8px;font-weight:700" aria-label="Start mock exam">🎯 Mock Exam</button>'
      + '<button onclick="startExam()" class="btn" style="font-size:10px;padding:6px 12px;background:#0f172a;color:#fff;border:none;border-radius:8px" aria-label="Start full exam">📋 Full (150q)</button>'
      + '<button onclick="startSuddenDeath()" class="btn" style="font-size:10px;padding:6px 12px;background:rgb(var(--red-bg));color:#dc2626;border:1px solid rgb(var(--red-brd));border-radius:8px" aria-label="Sudden death">💀</button>'
      + '<button onclick="startOnCallMode()" class="btn" style="font-size:10px;padding:6px 12px;background:#0f172a;color:#7dd3fc;border:none;border-radius:8px" aria-label="On-call mode">🌙</button>'
      + (!pomoActive?'<button onclick="startPomodoro()" class="btn" style="font-size:10px;padding:6px 12px;background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;border-radius:8px" aria-label="Pomodoro">⏱️</button>':'')
      + '</div>'
      + '</div>';
    h+='<div style="display:flex;gap:4px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:10px;padding-bottom:4px;-webkit-overflow-scrolling:touch">';
    const _trapCount=QZ.filter((_,i)=>isExamTrap(i)).length;
    const filts=[['all','הכל (' + QZ.length + ')'],['2021','21'],['2022','22'],['יוני 23','Jun23'],['2023-ב','23-ב'],['מאי 24','May24'],['ספט 24','Sep24'],['יוני 25','Jun25'],['2025-א','25-א'],['Hazzard','🤖 AI (' + QZ.filter(q=>q.t==='Hazzard').length + ')'],['hard','🔥 Hard'],['slow','⏱️ Slow'],['weak','🎯 Weak'],['due','🔄 Due'],['traps','🪤 Traps (' + _trapCount + ')'],['nbs','🎯 Next Best Step']];
    if(dueN>0)filts.push(['due','🔄 Due (' + dueN + ')']);
    filts.forEach(([f,l])=>{
      if(f==='nbs')h+='<span class="pill ' + (filt==='nbs'?'on':'') + '" onclick="startNextBestStep()">' + l + '</span>';
      else h+='<span class="pill ' + (filt===f&&filt!=='topic'?'on':'') + '" onclick="setFilt(\'' + f + '\')">' + l + '</span>';
    });
    h+='</div>';
    h+='<div style="display:flex;gap:8px;margin-bottom:10px;font-size:10px">'
      + '<span class="tt-wrap"><label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ' + (blindRecall?'checked':'') + ' onchange="blindRecall=this.checked;render()"> 🙈 Cover Options</label><button class="tt-icon" tabindex="0">ⓘ</button><div class="tt-box">Hides answer choices — forces you to recall the answer before seeing options.</div></span>'
      + '<span class="tt-wrap"><label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ' + (autopsyMode?'checked':'') + ' onchange="autopsyMode=this.checked;render()"> 🔬 Distractor Autopsy</label><button class="tt-icon" tabindex="0">ⓘ</button><div class="tt-box">After answering, explains WHY each wrong option is wrong — builds distractor recognition skill.</div></span>'
      + '<span class="tt-wrap"><label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ' + (timedMode?'checked':'') + ' onchange="timedMode=this.checked;if(timedMode){clearInterval(timedInt);timedSec=90;render();setTimeout(startTimedQ,50);}else{stopTimedMode();}"> ⏱ Timed (90s)</label><button class="tt-icon" tabindex="0">ⓘ</button><div class="tt-box">90-second countdown per question. Auto-advances when time runs out — marks as wrong. Builds exam-condition reflexes.</div></span>'
      + '</div>';
    h+='<div style="display:flex;gap:6px;margin-bottom:10px"><select class="calc-in" style="font-size:11px;padding:6px 10px;flex:1" onchange="this.value===-1?setFilt(\'all\'):setTopicFilt(parseInt(this.value))">'
      + '<option value="-1"' + (filt!=='topic'?' selected':'') + '>📂 Filter by topic…</option>';
    TOPICS.forEach((t,i)=>{h+='<option value="' + i + '"' + (filt==='topic'&&topicFilt===i?' selected':'') + '>' + t + '</option>';});
    h+='</select>';
    if(filt==='topic'&&topicFilt>=0){
      const _tqCount=QZ.filter(q=>q.ti===topicFilt).length;
      h+='<button class="btn btn-d" style="font-size:10px;padding:6px 12px;white-space:nowrap" onclick="startTopicMiniExam(' + topicFilt + ')" aria-label="Start topic mini-exam">🎯 Mini Exam (' + Math.min(_tqCount,20) + 'q)</button>';
    }
    h+='</div>';
    return h;
  }

  function _rqQuestion(q,qIdx,bk){
    const topicName=q.ti>=0&&TOPICS[q.ti]?TOPICS[q.ti]:'';
    const _cf=isChronicFail(S.sr[qIdx]);
    let h='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">'
      + '<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">' + (_cf?'<span title="Chronic difficulty — read the chapter instead of drilling" style="font-size:14px;cursor:default">🔴</span>':'') + (isExamTrap(qIdx)?'<span title="Exam trap — many people pick the same wrong answer" style="font-size:12px;cursor:default">🪤</span>':'') + '<span class="tag-year" style="background:' + (q.t==='Hazzard'?'#faf5ff':'#eff6ff') + ';color:' + (q.t==='Hazzard'?'#7c3aed':'#1d4ed8') + ';font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px">' + (q.t==='Hazzard'?'🤖 AI — Hazzard\'s':'📝 '+q.t) + '</span>' + (topicName?'<span class="tag-topic" style="background:rgb(var(--green-bg));color:rgb(var(--green-fg));font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px">' + topicName + '</span>':'') + (()=>{const ref=TOPIC_REF[q.ti];if(!ref)return '';if(ref.s==='haz')return '<span onclick="tab=\'lib\';libSec=\'haz-pdf\';render();" style="background:#fef3c7;color:rgb(var(--yellow-fg));font-size:10px;font-weight:600;padding:3px 10px;border-radius:20px;cursor:pointer" title="Open Hazzard PDFs">📕 ' + ref.l + '</span>';return '';})()
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:8px">'
      + '<button onclick="speakQuestion()" class="speech-btn' + (isSpeaking?' speaking':'') + '" title="Read aloud" aria-label="Read question aloud">🔊</button>'
      + '<button onclick="shareQ()" id="shbtn" class="share-btn" title="Share" aria-label="Share question">📋 שתף</button><button onclick="toggleBk()" style="font-size:16px;opacity:' + (bk?.7:.3) + ';min-height:44px" title="Bookmark" aria-label="' + (bk?'Remove bookmark':'Bookmark question') + '">' + (bk?'🔖':'🏷️') + '</button>'
      + '<span style="color:rgb(var(--fg3));font-size:10px">' + (qi+1) + '/' + pool.length + '</span>'
      + '</div></div>';
    h+='<p class="heb" style="font-size:13px;font-weight:700;line-height:1.7;margin-bottom:' + (q.img?'10':'16') + 'px" dir="auto">' + q.q + '</p>';
    if(q.img){h+='<div style="margin-bottom:14px;text-align:center"><img src="' + q.img + '" alt="Question image" style="max-width:100%;max-height:300px;border-radius:10px;border:1px solid rgb(var(--brd));cursor:pointer" onclick="viewImg(this.src)" loading="lazy"></div>';}
    return h;
  }

  function _rqOptions(q,qIdx){
    let h='';
    const _shuf=getOptShuffle(qIdx,q);
    _shuf.forEach((origI,dispJ)=>{
      const o=q.o[origI];
      let cls='qo';
      if(ans){cls+=' lk';if(origI===q.c)cls+=' ok';else if(origI===sel)cls+=' no';else cls+=' dim';}
      else if(origI===sel)cls+=' sel';
      const blurCls=blindRecall&&!ans&&origI!==sel?' qo-blur':'';
      const autopsyCls=(autopsyMode&&ans&&origI!==q.c&&origI===autopsyDistractor)?' distractor-highlight':'';
      h+='<button class="' + cls + blurCls + autopsyCls + '" onclick="' + (blindRecall&&!ans&&origI!==sel?'this.classList.remove("qo-blur");':'') + 'pick(' + origI + ')" aria-label="Option ' + (origI+1) + '"><span>' + sanitize(o) + '</span>' + (q.oi&&q.oi[origI]?'<img src="' + sanitize(q.oi[origI]) + '" style="max-width:100%;max-height:120px;margin-top:6px;border-radius:6px" loading="lazy">':'') + '</button>';
    });
    return h;
  }

  function _rqPreAnswer(q){
    let h='';
    if(!examMode&&sel!==null&&_confidence===null){
      h+='<div style="margin-bottom:8px;font-size:10px;color:rgb(var(--fg2));font-weight:600">How sure are you?</div>'
        + '<div style="display:flex;gap:6px;margin-bottom:10px">'
        + '<button class="btn" style="flex:1;background:rgb(var(--red-bg));color:#dc2626;font-size:13px;padding:8px" onclick="_confidence=0;render()">😬</button>'
        + '<button class="btn" style="flex:1;background:rgb(var(--yellow-bg));color:#d97706;font-size:13px;padding:8px" onclick="_confidence=1;render()">🤔</button>'
        + '<button class="btn" style="flex:1;background:rgb(var(--green-bg));color:#059669;font-size:13px;padding:8px" onclick="_confidence=2;render()">😎</button>'
        + '</div>';
    }
    const _confLabel=_confidence===0?'😬':_confidence===1?'🤔':_confidence===2?'😎':'';
    h+='<button class="btn btn-p" onclick="check()"' + (sel===null||(!examMode&&_confidence===null)?' disabled':'') + ' aria-label="Check answer">' + _confLabel + ' בדוק</button>';
    if(!examMode)h+='<button class="btn" onclick="showAnswerHardFail()" style="background:rgb(var(--yellow-bg));color:rgb(var(--yellow-fg));font-size:11px;padding:6px 14px;margin-left:6px;border:1px solid rgb(var(--yellow-brd))" aria-label="Show answer">👁 לא יודע</button>';
    return h;
  }

  function _rqPostAnswer(q,qIdx){
    let h='';
    if(!examMode&&sel!==q.c&&!_wrongReason){
      h+='<div id="why-wrong-box" style="display:inline-flex;align-items:center;gap:4px;margin-bottom:0">'
        + '<span style="font-size:9px;color:rgb(var(--red-fg));font-weight:700">Why?</span>'
        + '<button class="btn" style="font-size:12px;padding:2px 6px;background:rgb(var(--bg2));border-radius:6px;min-height:28px" title="Didn\'t know" onclick="_wrongReason=\'no_knowledge\';save();_updateWrongUI()">📚</button>'
        + '<button class="btn" style="font-size:12px;padding:2px 6px;background:rgb(var(--bg2));border-radius:6px;min-height:28px" title="Misread" onclick="_wrongReason=\'misread\';save();_updateWrongUI()">👓</button>'
        + '<button class="btn" style="font-size:12px;padding:2px 6px;background:rgb(var(--bg2));border-radius:6px;min-height:28px" title="Between 2" onclick="_wrongReason=\'between_2\';save();_updateWrongUI()">⚖️</button>'
        + '<button class="btn" style="font-size:12px;padding:2px 6px;background:rgb(var(--bg2));border-radius:6px;min-height:28px" title="Silly mistake" onclick="_wrongReason=\'silly\';save();_updateWrongUI()">🤦</button>'
        + '</div>';
    }
    if(!examMode&&sel!==q.c&&q.ti>=0){
      const _chRef=TOPIC_REF[q.ti];
      if(_chRef&&_chRef.s==='haz'){
        h+='<button class="btn" onclick="tab=\'lib\';libSec=\'harrison\';render()" style="font-size:10px;padding:5px 12px;background:rgb(var(--blue-bg));color:rgb(var(--blue-fg));border:1px solid rgb(var(--blue-brd));margin-bottom:6px;width:100%">📖 Read: ' + _chRef.l + ' — you\'re weak here</button>';
      }
    }
    const _blocked=!examMode&&sel!==q.c&&!_wrongReason;
    h+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
    if(!examMode){
      h+='<div style="display:flex;gap:3px;align-items:center">'
        + '<button class="btn" style="font-size:9px;padding:3px 7px;' + (_diffRating==='easy'?'background:rgb(var(--green-bg));color:rgb(var(--green-fg))':'background:rgb(var(--bg2));color:rgb(var(--fg3))') + '" onclick="_diffRating=\'easy\';_storeDiff(pool[qi],\'easy\')">Easy</button>'
        + '<button class="btn" style="font-size:9px;padding:3px 7px;' + (_diffRating==='med'?'background:rgb(var(--yellow-bg));color:rgb(var(--yellow-fg))':'background:rgb(var(--bg2));color:rgb(var(--fg3))') + '" onclick="_diffRating=\'med\';_storeDiff(pool[qi],\'med\')">Med</button>'
        + '<button class="btn" style="font-size:9px;padding:3px 7px;' + (_diffRating==='hard'?'background:rgb(var(--red-bg));color:rgb(var(--red-fg))':'background:rgb(var(--bg2));color:rgb(var(--fg3))') + '" onclick="_diffRating=\'hard\';_storeDiff(pool[qi],\'hard\')">Hard</button>'
        + '</div>';
    }
    h+='<button id="next-btn" class="btn btn-d" onclick="next()"' + (_blocked?' disabled':'') + ' style="margin-left:auto;' + (_blocked?'opacity:0.5':'') + '" aria-label="' + (examMode&&qi+1>=150?'Finish exam':'Next question') + '">' + (examMode&&qi+1>=150?'סיים':'הבאה ←') + '</button>';
    if(!examMode&&ans){
      h+='<button onclick="document.getElementById(\'report-wrong-expand\').style.display=document.getElementById(\'report-wrong-expand\').style.display===\'none\'?\'block\':\'none\'" style="font-size:8px;padding:2px 6px;background:none;color:rgb(var(--fg3));cursor:pointer;border:none" title="Report wrong answer key">⚠️</button>';
    }
    h+='</div>';
    if(!examMode&&ans){
      h+='<div id="report-wrong-expand" style="display:none;margin-top:6px;padding:10px;background:rgb(var(--bg2));border-radius:10px;border:1px solid rgb(var(--brd))">'
        + '<input id="reportInput" class="search-box" placeholder="מה לדעתך התשובה הנכונה ולמה?" style="font-size:11px;margin-bottom:6px;direction:rtl">'
        + '<button class="btn" style="font-size:10px;width:100%;background:rgb(var(--yellow-fg));color:#fff" onclick="S._reportType=\'wrong_answer\';submitReport()">שלח לבדיקת AI</button>'
        + '<div id="fbStatus" style="font-size:10px;margin-top:4px;display:none"></div>'
        + '<div id="aiVerifyResult" style="display:none;margin-top:8px;padding:10px;border-radius:8px;font-size:10px;line-height:1.6"></div>'
        + '</div>';
    }
    return h;
  }

  function _rqTeachBack(q,qIdx){
    if(!ans||examMode||sel!==q.c)return '';
    let h='';
    if(!teachBackState){
      h+='<div style="margin-top:12px;background:rgb(var(--green-bg));border:1px solid #a7f3d0;border-radius:12px;padding:12px">';
      h+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><span style="font-size:12px;font-weight:700;color:rgb(var(--green-fg));direction:rtl">🎓 Teach-Back: הסבר מדוע זו התשובה הנכונה</span><button onclick="startVoiceTeachBack()" id="tb-mic-btn" style="font-size:16px;padding:4px 8px;background:#ecfdf5;border:none;border-radius:8px;cursor:pointer" title="הקלט קולי" aria-label="Record voice teach-back">🎙️</button></div>';
      h+='<textarea id="tbInput" dir="rtl" style="width:100%;min-height:60px;resize:vertical;font-family:Heebo,sans-serif;border:1px solid #a7f3d0;border-radius:8px;padding:8px;font-size:12px" placeholder="הקלד את ההסבר שלך..." aria-label="Teach-back explanation"></textarea>';
      h+='<div style="display:flex;gap:8px;margin-top:8px">';
      h+='<button class="btn btn-g" style="flex:1;font-size:11px" onclick="var v=document.getElementById(\'tbInput\')?.value?.trim();if(v){gradeTeachBack(pool[qi],v);}else{teachBackState=\'skip\';render();}" aria-label="Grade teach-back with AI">🤖 Grade it</button>';
      h+='<button class="btn btn-o" style="font-size:11px" onclick="teachBackState=\'skip\';render()" aria-label="Skip teach-back">דלג</button>';
      h+='</div></div>';
    }else if(teachBackState==='grading'){
      h+='<div style="margin-top:12px;background:rgb(var(--green-bg));border:1px solid #a7f3d0;border-radius:12px;padding:12px;text-align:center"><div style="font-size:12px;color:rgb(var(--green-fg))">⏳ Grading...</div></div>';
    }else if(teachBackState&&teachBackState!=='skip'){
      var scoreEmoji=teachBackState.score===3?'🟢':teachBackState.score===2?'🟡':'🔴';
      var scoreLabel=teachBackState.score===3?'Excellent!':teachBackState.score===2?'Partial':'Needs work';
      h+='<div style="margin-top:12px;background:rgb(var(--green-bg));border:1px solid #a7f3d0;border-radius:12px;padding:12px">';
      h+='<div style="font-size:13px;font-weight:700;margin-bottom:4px">' + scoreEmoji + ' ' + scoreLabel + '</div>';
      if(teachBackState.feedback){
        const axes=[['mechanism','מנגנון'],['criteria','קריטריון'],['exception','חריג']];
        const axesDots=axes.map(([k,l])=>{const v=teachBackState[k];return v===undefined?'':'<span style="font-size:10px;padding:1px 6px;border-radius:10px;background:' + (v?'#dcfce7':'#fee2e2') + ';color:' + (v?'#166534':'#991b1b') + '">' + l + ' ' + (v?'✓':'✗') + '</span>';}).join(' ');
        if(axesDots)h+='<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px">' + axesDots + '</div>';
        h+='<div style="font-size:11px;line-height:1.7;direction:rtl;text-align:right">' + sanitize(teachBackState.feedback) + '</div>';
      }
      h+='</div>';
    }
    return h;
  }

  function _rqExplanations(q,qIdx,shuf){
    if(!ans||examMode)return '';
    let h='';
    const note=q.ti>=0&&NOTES[q.ti]?NOTES[q.ti]:null;
    if(note){
      const correctText=q.o[q.c];
      const sentences=note.notes.split(/\.\s+/);
      const relevant=sentences.filter(s=>s.length>20).filter(s=>{
        const sl=s.toLowerCase(),ql=q.q.toLowerCase(),cl=correctText.toLowerCase();
        return cl.split(/\s+/).filter(w=>w.length>3).some(w=>sl.includes(w.toLowerCase()))||ql.split(/\s+/).filter(w=>w.length>4).some(w=>sl.includes(w.toLowerCase()));
      }).slice(0,3);
      h+='<div class="explain-box" style="margin-top:10px;padding:10px 12px;background:rgb(var(--green-bg));border:1px solid rgb(var(--green-brd));border-radius:10px;font-size:11px;line-height:1.7;color:rgb(var(--green-fg))">';
      h+='<div style="font-weight:700;margin-bottom:4px">💡 ' + note.topic + '</div>';
      if(relevant.length)h+='<div style="margin-bottom:6px">' + relevant.join('. ') + '.</div>';
      else h+='<div style="margin-bottom:6px;color:rgb(var(--fg2));font-style:italic">Correct answer: <b>' + correctText + '</b></div>';
      h+='<div style="font-size:9px;color:#059669;border-top:1px solid #bbf7d0;padding-top:4px;margin-top:4px">📖 Source: ' + note.ch + ' · ' + q.t + '</div>';
      h+='</div>';
    }
    if(q.e){
      h+='<div style="margin-top:8px;padding:10px 12px;background:rgb(var(--blue-bg));border:1px solid rgb(var(--blue-brd));border-radius:10px;font-size:11px;line-height:1.7;color:rgb(var(--blue-fg));direction:rtl;text-align:right">';
      h+='<div style="font-weight:700;margin-bottom:4px;font-size:10px">📝 הסבר</div>';
      h+='<div>' + sanitize(remapExplanationLetters(q.e,shuf)).replace(/\n/g,'<br>').replace(/\*\*(.*?)\*\*/g,'<b>$1</b>') + '</div>';
      h+='</div>';
    }
    var _aiIdx=qIdx;
    h+='<div id="ai-explain-' + _aiIdx + '" style="margin-top:6px"></div>';
    if(_exCache[_aiIdx]&&!_exCache[_aiIdx].err){
      setTimeout(function(){renderExplainBox(_aiIdx);},0);
    } else {
      h+='<button class="btn btn-g" style="width:100%;margin-top:4px;font-size:11px" onclick="explainWithAI(' + _aiIdx + ')">' + '🤖 הסבר AI (' + (_exCache[_aiIdx]?'נסה שוב':'קלוד אופוס') + ')' + '</button>';
    }
    const wrongIdxs=q.o.map((_,i)=>i).filter(i=>i!==q.c);
    if(autopsyDistractor<0||autopsyDistractor===q.c)autopsyDistractor=wrongIdxs[Math.floor(Math.random()*wrongIdxs.length)];
    const _apKey='autopsy_' + qIdx;
    h+='<div style="padding:12px;margin-top:10px;border:1px solid rgb(var(--brd));border-radius:12px;background:rgb(var(--bg2))">'
      + '<div style="font-weight:700;font-size:11px;margin-bottom:6px">🔬 Distractor Autopsy</div>';
    if(_exCache[_apKey]){
      h+='<div style="font-size:11px;line-height:1.7;color:rgb(var(--fg))" dir="auto">' + _exCache[_apKey] + '</div>';
    } else {
      h+='<div style="font-size:11px;line-height:1.6;color:rgb(var(--yellow-fg))" dir="auto">';
      wrongIdxs.forEach(wi=>{
        h+='<div style="margin-bottom:6px"><b style="color:#dc2626">✗ ' + q.o[wi] + '</b> — <span style="color:rgb(var(--fg2))">why wrong here?</span></div>';
      });
      h+='</div>';
      h+='<button class="btn btn-o" style="font-size:10px;margin-top:6px;width:100%" onclick="aiAutopsy(' + qIdx + ')">🤖 AI: Explain why each is wrong</button>';
    }
    h+='</div>';
    return h;
  }

  function _rqFooter(qIdx,pct){
    return '<div style="display:flex;gap:16px;margin-top:10px;padding-top:8px;border-top:1px solid rgb(var(--brd));font-size:10px;color:rgb(var(--fg3))">'
      + '<span>✅ ' + S.qOk + '</span><span>❌ ' + S.qNo + '</span><span>📊 ' + pct + '</span>' + (S.sr[qIdx]?.at?'<span style="color:rgb(var(--fg3))">⏱' + S.sr[qIdx].at + 's avg</span>':'')
      + '</div>';
  }

  // ===== EXPOSED PUBLIC FUNCTIONS =====

  window.renderOnCall=function renderOnCall(){
    if(!pool.length)return '<div style="padding:40px;text-align:center;color:rgb(var(--fg3))">No questions available</div>';
    const qIdx=pool[qi];const q=QZ[qIdx];
    const TOPICS_L=TOPICS;
    const topic=q.ti>=0?TOPICS_L[q.ti]:'';
    const correct=q.o[q.c];
    let h='<div style="min-height:100vh;padding:16px;display:flex;flex-direction:column;gap:12px">';
    // Header
    h+='<div style="display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:11px;color:rgb(var(--fg2))">' + (qi+1) + '/' + pool.length + ' · ' + filt + '</div>'
      + '<button onclick="exitOnCallMode()" style="font-size:11px;padding:4px 10px;background:rgb(var(--bg2));border:none;border-radius:8px;cursor:pointer" aria-label="Exit on-call mode">✕ Exit</button>'
      + '</div>';
    // Topic tag
    if(topic)h+='<div style="font-size:10px;background:rgb(var(--green-bg));color:rgb(var(--green-fg));padding:3px 10px;border-radius:20px;display:inline-block;align-self:flex-start;font-weight:600">' + topic + '</div>';
    // Question card - large text
    h+='<div style="background:rgb(var(--card-bg));border-radius:16px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.08);flex:1;cursor:' + (flipRevealed?'default':'pointer') + '" ' + (flipRevealed?'':'onclick="flipCard()" role="button" tabindex="0" aria-label="Flip card to reveal answer"') + '>'
      + '<div style="font-size:16px;line-height:1.6;font-weight:500;direction:rtl;text-align:right;margin-bottom:' + (flipRevealed?'16px':'0') + '">' + q.q + '</div>';
    if(!flipRevealed){
      h+='<div style="text-align:center;margin-top:20px;color:rgb(var(--fg3));font-size:13px">👆 tap to reveal answer</div>';
    } else {
      // Show correct answer prominently
      h+='<div style="background:#dcfce7;border-radius:12px;padding:14px;margin-bottom:12px">'
        + '<div style="font-size:10px;color:rgb(var(--green-fg));font-weight:700;margin-bottom:6px">✓ CORRECT ANSWER</div>'
        + '<div style="font-size:14px;font-weight:600;direction:rtl;text-align:right">' + correct + '</div>'
        + '</div>';
      // Explanation if available
      const ex=_exCache&&_exCache[qIdx];
      if(ex){h+='<div style="font-size:12px;color:rgb(var(--fg2));line-height:1.7;direction:rtl;text-align:right;border-top:1px solid #e2e8f0;padding-top:10px">' + ex + '</div>';}
      else{h+='<button onclick="runExplainOnCall(' + qIdx + ')" id="oc-exp-' + qIdx + '" style="font-size:11px;padding:5px 12px;background:rgb(var(--blue-bg));color:#3b82f6;border:none;border-radius:8px;cursor:pointer;margin-bottom:8px">🤖 הסבר AI</button><div id="oc-exp-box-' + qIdx + '"></div>';}
    }
    h+='</div>';
    // Rate buttons (only after flip)
    if(flipRevealed){
      h+='<div style="display:flex;gap:12px">'
        + '<button onclick="onCallPick(false)" style="flex:1;padding:18px;background:rgb(var(--red-bg));color:#dc2626;border:none;border-radius:16px;font-size:28px;font-weight:700;cursor:pointer;min-height:64px" aria-label="Wrong answer">✗</button>'
        + '<button onclick="onCallPick(true)" style="flex:1;padding:18px;background:rgb(var(--green-bg));color:#16a34a;border:none;border-radius:16px;font-size:28px;font-weight:700;cursor:pointer;min-height:64px" aria-label="Correct answer">✓</button>'
        + '</div>';
    }
    h+='</div>';
    return h;
  };

  window.runExplainOnCall=async function runExplainOnCall(qIdx){
    const btn=document.getElementById('oc-exp-'+qIdx);
    const box=document.getElementById('oc-exp-box-'+qIdx);
    if(!btn||!box)return;
    btn.textContent='⏳ ...';btn.disabled=true;
    const q=QZ[qIdx];const correct=q.o[q.c];
    try{
      const txt=await callAI([{role:'user',content:'ANSWER KEY: The correct answer is DEFINITIVELY "'+correct+'".\n\nהסבר בעברית (3-4 משפטים) למה זו התשובה הנכונה. עגן בתשובה הנכונה. שאלה: '+q.q+'\nתשובה נכונה: '+correct}],400,'sonnet');
      _exCache[qIdx]=txt;try{localStorage.setItem('samega_ex',JSON.stringify(_exCache));}catch(e){}
      box.innerHTML='<div style="font-size:12px;color:rgb(var(--fg2));line-height:1.7;direction:rtl;text-align:right;margin-top:8px">'+sanitize(txt)+'</div>';
      btn.remove();
    }catch(e){btn.textContent='🤖 הסבר AI';btn.disabled=false;}
  };

  window.renderQuiz=function renderQuiz(){
    if(sdMode)return _rqSuddenDeath();
    if(!pool.length)buildPool();
    if(qi>=pool.length)qi=0;
    const q=QZ[pool[qi]];const tot=S.qOk+S.qNo;const pct=tot?Math.round(S.qOk/tot*100)+'%':'—';
    const bk=S.bk[pool[qi]];
    const dueN=getDueQuestions().length;
    let h=pomoActive?'<div class="pomo-bar"><div class="pomo-fill" id="pomo-fill" style="width:' + ((3000-pomoSec)/3000*100) + '%"></div></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#ecfdf5;border-radius:10px;margin-bottom:10px;font-size:11px">'
      + '<span>⏱️ Pomodoro</span><span class="timer" id="pomo-time" style="font-weight:700">' + fmtT(pomoSec) + '</span>'
      + '<button onclick="stopPomodoro()" style="font-size:10px;color:#dc2626;font-weight:600" aria-label="Stop pomodoro timer">Stop</button></div>':'';
    h+=examMode?_rqExamBar():'';
    if(!examMode)h+=_rqControls(dueN);
    if(!pool.length){h+='<div class="card" style="padding:24px;text-align:center"><p style="font-size:13px;color:rgb(var(--fg3))">' + (filt==='due'?'🎉 No questions due for review!':'No questions match this filter.') + '</p></div>';return h;}
    h+='<div class="progress-bar"><div class="fill" style="width:' + Math.round((qi+1)/pool.length*100) + '%"></div></div>';
    h+='<div class="card" style="padding:16px">';
    if(timedMode&&!ans)h+=_rqTimerBar();
    h+=_rqQuestion(q,pool[qi],bk);
    h+=_rqOptions(q,pool[qi]);
    h+='<div style="display:flex;gap:6px;margin-top:14px">';
    if(!ans)h+=_rqPreAnswer(q);
    else h+=_rqPostAnswer(q,pool[qi]);
    h+='</div>';
    h+=_rqTeachBack(q,pool[qi]);
    const _shuf=getOptShuffle(pool[qi],q);
    h+=_rqExplanations(q,pool[qi],_shuf);
    h+=_rqFooter(pool[qi],pct);
    h+='</div>';
    return h;
  };

})();
