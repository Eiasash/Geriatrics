/**
 * track-view.js
 * 
 * Extracted rendering functions for the Track/Study/Progress view from shlav-a-mega.html
 * Wrapped in a plain IIFE to avoid global namespace pollution.
 * 
 * DEPENDENCIES (from window):
 * - State: S, QZ, TOPICS, TOPIC_REF, EXAM_FREQ, NOTES, STUDY_PLAN, HAZ_CHAPTERS, LS
 * - Globals: _hazData, _harData, _sessionSaved, _sessionOk, _sessionNo
 * - Constants: APP_VERSION, BUILD_HASH
 * - Functions: getTopicStats, getDueQuestions, getWeakTopics, getStudyStreak, calcEstScore,
 *             getTopicTrend, getChaptersDueForReading, isExamTrap, fmtT, getApiKey, setApiKey,
 *             save, render, buildPool, setFilt, setTopicFilt, startTopicMiniExam, buildRescuePool,
 *             saveSessionSummary, setExamDate, exportCheatSheet, showLeaderboard, applyUpdate,
 *             shareApp, exportProgress, importProgress, cloudBackup, cloudRestore, openNote, go,
 *             sendChatStarter, openHazzardChapter, openHarrisonChapter, sanitize
 * 
 * EXPORTED (window): renderTrack, renderStudyPlan, renderPriorityMatrix, renderExamTrendCard,
 *                   renderDailyPlan, renderSessionCard
 */

(function(){
  'use strict';

function renderPriorityMatrix(){
  const TOPICS_L=TOPICS;
  const EF_FREQ=[0,34,30,28,36,43,178,39,63,36,20,27,19,22,50,40,22,94,70,78,18,80,43,21,46,27,29,52,10,11,7,0,6,9,26,19,23,9,17,0];
  const maxFreq=Math.max(...EF_FREQ);
  const tSt=getTopicStats();
  const rows=TOPICS_L.map((name,ti)=>{
    const s=tSt[ti]||{ok:0,no:0,tot:0};
    const acc=s.tot>0?s.ok/s.tot:null;
    const freq=EF_FREQ[ti]||0;
    const freqPct=maxFreq>0?freq/maxFreq:0;
    const gap=acc===null?0.7:(1-acc);
    const priority=Math.round(freqPct*gap*100);
    return{ti,name,freq,acc,gap,priority,s};
  }).filter(r=>r.freq>0).sort((a,b)=>b.priority-a.priority);
  
  let h='<div style="font-weight:700;font-size:12px;margin:14px 0 8px;color:#0f172a">🎯 Priority Matrix — where to study next</div>';
  h+='<div style="font-size:9px;color:rgb(var(--fg3));margin-bottom:8px">Score = exam frequency × your gap. Higher = drill harder.</div>';
  rows.slice(0,15).forEach((r,rank)=>{
    const accStr=r.acc===null?'untested':Math.round(r.acc*100)+'%';
    const barW=Math.round(r.priority);
    const color=r.priority>=60?'#dc2626':r.priority>=30?'#f59e0b':'#10b981';
    const trend=getTopicTrend(r.ti);
    const trendStr=trend===null?'':trend>5?'<span style="color:#059669;font-size:10px">↑</span>':trend<-5?'<span style="color:#dc2626;font-size:10px">↓</span>':'<span style="color:rgb(var(--fg3));font-size:10px">→</span>';
    h+='<div style="margin-bottom:6px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px"><div style="font-size:11px;font-weight:'+(rank<5?'700':'400')+'">'+rank+1+'. '+r.name+' '+trendStr+'</div><div style="display:flex;gap:8px;align-items:center"><span style="font-size:9px;color:rgb(var(--fg2))">'+r.s.tot+'q · '+accStr+'</span><span style="font-size:10px;font-weight:700;color:'+color+'">'+r.priority+'</span></div></div><div style="height:5px;background:#e2e8f0;border-radius:3px;overflow:hidden"><div style="width:'+barW+'%;height:100%;background:'+color+';border-radius:3px"></div></div></div>';
  });
  h+='<div onclick="var el=document.getElementById(\'pmFull\');el.style.display=el.style.display===\'none\'?\'block\':\'none\'" style="font-size:10px;color:rgb(var(--sky));cursor:pointer;margin-top:6px">Show all 40 topics ▾</div>';
  h+='<div id="pmFull" style="display:none">';
  rows.slice(15).forEach((r,rank)=>{
    const accStr=r.acc===null?'untested':Math.round(r.acc*100)+'%';
    h+='<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgb(var(--brd));font-size:10px"><span>'+(rank+16)+'. '+r.name+'</span><span style="color:rgb(var(--fg2))">'+r.s.tot+'q · '+accStr+'</span></div>';
  });
  h+='</div>';
  return h;
}

function renderExamTrendCard(){
  const OLD_EX=new Set(['2021','2022','יוני 23']);
  const NEW_EX=new Set(['ספט 24','יוני 25','2025-א']);
  const TOPICS_L=TOPICS;
  const oldTot=QZ.filter(q=>OLD_EX.has(q.t)).length||1;
  const newTot=QZ.filter(q=>NEW_EX.has(q.t)).length||1;
  const trends=TOPICS_L.map((name,ti)=>{
    const oldN=QZ.filter(q=>OLD_EX.has(q.t)&&q.ti===ti).length;
    const newN=QZ.filter(q=>NEW_EX.has(q.t)&&q.ti===ti).length;
    const delta=(newN/newTot - oldN/oldTot)*100;
    return{ti,name,oldN,newN,oldPct:oldN/oldTot*100,newPct:newN/newTot*100,delta};
  }).filter(r=>r.oldN+r.newN>0);
  
  const growing=trends.filter(r=>r.delta>0.5).sort((a,b)=>b.delta-a.delta).slice(0,6);
  const shrinking=trends.filter(r=>r.delta<-0.5).sort((a,b)=>a.delta-b.delta).slice(0,4);
  
  let h='<div class="card" style="padding:14px;margin-bottom:10px;border-left:4px solid #7c3aed"><div style="font-weight:700;font-size:12px;margin-bottom:4px;color:#7c3aed">📈 Exam Trend — 2021-22 vs ספט24–25-א</div><div style="font-size:9px;color:rgb(var(--fg3));margin-bottom:10px">Where the exam is heading. Study accordingly.</div>';
  
  h+='<div style="font-size:10px;font-weight:700;color:#059669;margin-bottom:5px">▲ GROWING — prioritize</div>';
  growing.forEach(r=>{
    const barW=Math.min(100,Math.round(r.delta*15));
    h+='<div style="margin-bottom:5px"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:2px"><span style="font-weight:'+(r.delta>1.5?'700':'400')+'">'+r.name+'</span><span style="color:#059669">+'+r.delta.toFixed(1)+'pp · '+r.newPct.toFixed(1)+'% of exam</span></div><div style="height:4px;background:#e2e8f0;border-radius:2px"><div style="width:'+barW+'%;height:100%;background:#10b981;border-radius:2px"></div></div></div>';
  });
  
  h+='<div style="font-size:10px;font-weight:700;color:#dc2626;margin-bottom:5px;margin-top:10px">▼ SHRINKING — less priority</div>';
  shrinking.forEach(r=>{
    h+='<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px"><span style="color:rgb(var(--fg2))">'+r.name+'</span><span style="color:#dc2626">'+r.delta.toFixed(1)+'pp</span></div>';
  });
  
  h+='<div style="font-size:9px;color:rgb(var(--fg3));margin-top:8px;border-top:1px solid rgb(var(--brd));padding-top:6px">Old: 2021+2022+יוני23 ('+oldTot+'q) · New: ספט24+יוני25+2025-א ('+newTot+'q)</div>';
  h+='</div>';
  return h;
}

function renderDailyPlan(){
  if(!S.examDate&&!localStorage.getItem('shlav_exam_date'))return '';
  const examDate=S.examDate||localStorage.getItem('shlav_exam_date')||'';
  const daysLeft=examDate?Math.max(0,Math.ceil((new Date(examDate)-Date.now())/864e5)):null;
  const dueN=getDueQuestions().length;
  const tSt=getTopicStats();
  const weakest=TOPICS.map((t,i)=>({name:t,i,s:tSt[i]||{ok:0,no:0,tot:0}})).filter(p=>p.s.tot>=3).sort((a,b)=>{
    const pa=a.s.tot?a.s.ok/a.s.tot:0,pb=b.s.tot?b.s.ok/b.s.tot:0;return pa-pb;}).slice(0,3);
  const trapCount=QZ.filter((_,i)=>isExamTrap(i)).length;
  let h='<div class="card" style="padding:14px;margin-bottom:10px;border-left:4px solid #059669"><div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#059669">📋 Today\'s Study Plan</div>';
  if(daysLeft!==null)h+='<div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">'+daysLeft+' days to exam · '+new Date(examDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})+'</div>';
  h+='<div style="font-size:11px;line-height:2">';
  if(dueN>0)h+='<div>1️⃣ <b>'+dueN+' due questions</b> (~'+Math.round(dueN*1.5)+' min) <button onclick="setFilt(\'due\');tab=\'quiz\';render()" style="font-size:9px;padding:2px 8px;background:rgb(var(--blue-bg));color:#3b82f6;border:none;border-radius:6px;cursor:pointer">▶ Start</button></div>';
  else h+='<div>1️⃣ ✅ No questions due — you\'re caught up!</div>';
  if(weakest.length){
    const w=weakest[0];
    const wPct=w.s.tot?Math.round(w.s.ok/w.s.tot*100):0;
    const ref=TOPIC_REF[w.i];
    h+='<div>2️⃣ Read: <b>'+w.name+'</b> ('+wPct+'% accuracy, '+QZ.filter(q=>q.ti===w.i).length+' questions) '+((ref)?'<button onclick="tab=\'lib\';libSec=\'harrison\';render()" style="font-size:9px;padding:2px 8px;background:#ede9fe;color:#7c3aed;border:none;border-radius:6px;cursor:pointer">📖 Open</button>':'')+'</div>';
    h+='<div>3️⃣ Drill: <b>20q mini-exam on '+w.name+'</b> <button onclick="startTopicMiniExam('+w.i+')" style="font-size:9px;padding:2px 8px;background:#dcfce7;color:rgb(var(--green-fg));border:none;border-radius:6px;cursor:pointer">🎯 Start</button></div>';
  }
  if(trapCount>0)h+='<div>4️⃣ Review <b>'+trapCount+' trap questions</b> <button onclick="setFilt(\'traps\');tab=\'quiz\';render()" style="font-size:9px;padding:2px 8px;background:rgb(var(--yellow-bg));color:rgb(var(--yellow-fg));border:none;border-radius:6px;cursor:pointer">🪤 Start</button></div>';
  h+='</div></div>';
  return h;
}

function renderSessionCard(){
  try{
    const hist=JSON.parse(localStorage.getItem('samega_sessions')||'[]');
    if(!hist.length)return '';
    const last=hist[hist.length-1];
    const tot=last.ok+last.no;
    const pct=tot?Math.round(last.ok/tot*100):0;
    const mins=Math.round(last.dur/60);
    const today=new Date().toDateString();
    const sessDate=new Date(last.date).toDateString();
    if(sessDate!==today)return '';
    return '<div class="card" style="padding:14px;margin-bottom:10px;border-left:4px solid #7c3aed"><div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#7c3aed">📊 Today\'s Session</div><div style="display:flex;gap:12px;margin-bottom:8px"><div style="text-align:center"><div style="font-size:18px;font-weight:700;color:'+(pct>=70?'#059669':pct>=50?'#d97706':'#dc2626')+'">'+pct+'%</div><div style="font-size:9px;color:rgb(var(--fg3))">'+last.ok+'/'+tot+' correct</div></div><div style="text-align:center"><div style="font-size:18px;font-weight:700">'+mins+'m</div><div style="font-size:9px;color:rgb(var(--fg3))">duration</div></div><div style="text-align:center"><div style="font-size:18px;font-weight:700;color:#f59e0b">'+last.due+'</div><div style="font-size:9px;color:rgb(var(--fg3))">due tomorrow</div></div></div>'+(last.best?'<div style="font-size:10px;margin-bottom:2px">✅ Best: <b>'+last.best.name+'</b> ('+last.best.n+' correct)</div>':'')+(last.worse?'<div style="font-size:10px">🔴 Worst: <b>'+last.worse.name+'</b> ('+last.worse.n+' wrong)</div>':'')+'<button onclick="this.parentElement.style.display=\'none\'" style="margin-top:8px;font-size:9px;color:rgb(var(--fg3));background:none;border:none;cursor:pointer" aria-label="Dismiss notification">dismiss</button></div>';
  }catch(e){return '';}
}

function _rspTopicRow(topic,tSt){
  const isChecked=S.sp&&S.sp[topic.n];
  const topicStat=tSt[topic.ti];
  let accBadge='';
  if(topicStat&&topicStat.tot>0){
    const acc=Math.round(topicStat.ok/topicStat.tot*100);
    let badgeColor='#94a3b8';
    if(acc>=70)badgeColor='#059669';else if(acc>=50)badgeColor='#d97706';else badgeColor='#dc2626';
    accBadge='<span style="background:'+badgeColor+'20;color:'+badgeColor+';padding:2px 6px;border-radius:4px;font-size:8px;font-weight:600">'+acc+'%</span>';
  }
  let h='<div style="border-radius:8px;margin-bottom:4px;background:'+(isChecked?'#f8fafc':'transparent')+'"><div style="display:flex;align-items:center;gap:8px;padding:6px 8px;font-size:10px;cursor:pointer" onclick="event.stopPropagation();S.sp=S.sp||{};S.sp[\''+topic.n.replace(/'/g,"\\'")+'\']=' +'!S.sp[\''+topic.n.replace(/'/g,"\\'")+'\'];save();render()" role="checkbox" aria-checked="'+(isChecked?'true':'false')+'" tabindex="0"><input type="checkbox" '+(isChecked?'checked':'')+' readonly style="width:14px;height:14px;flex-shrink:0;cursor:pointer" tabindex="-1"><span style="flex:1;'+(isChecked?'color:rgb(var(--fg3));text-decoration:line-through':'color:rgb(var(--fg))')+'">' +topic.n+'</span>'+accBadge+'<span style="color:rgb(var(--fg3));font-size:9px;white-space:nowrap">'+topic.hrs+'</span></div><div style="display:flex;gap:4px;padding:0 8px 6px 36px;flex-wrap:wrap">'+(HAZ_CHAPTERS[topic.n]?'<button onclick="event.stopPropagation();tab=\'lib\';libSec=\'haz-pdf\';openHazzardChapter(parseInt(HAZ_CHAPTERS[\''+topic.n.replace(/'/g,"\\'") +'\'].ch))" style="font-size:9px;padding:3px 8px;border:1px solid rgb(var(--brd));border-radius:6px;background:rgb(var(--card-bg));color:#b45309;cursor:pointer;white-space:nowrap" aria-label="Read Hazzard\'s chapter for '+topic.n.replace(/'/g,'')+'">📕 Ch '+HAZ_CHAPTERS[topic.n].ch+'</button>':'')+'<button onclick="event.stopPropagation();openNote='+topic.ti+';go(\'study\')" style="font-size:9px;padding:3px 8px;border:1px solid rgb(var(--brd));border-radius:6px;background:rgb(var(--card-bg));color:#0D7377;cursor:pointer;white-space:nowrap" aria-label="Open notes for '+topic.n.replace(/'/g,'')+'">📖 Notes</button><button onclick="event.stopPropagation();setTopicFilt('+topic.ti+');go(\'quiz\')" style="font-size:9px;padding:3px 8px;border:1px solid rgb(var(--brd));border-radius:6px;background:rgb(var(--card-bg));color:#3b82f6;cursor:pointer;white-space:nowrap" aria-label="Quiz '+topic.n.replace(/'/g,'')+'">📝 Quiz</button><button onclick="event.stopPropagation();S.chat=[];go(\'chat\');setTimeout(function(){sendChatStarter(\'Give me a concise board-review summary of '+topic.n.replace(/'/g,"\\'") +' in geriatrics. Cover: key definitions, diagnostic criteria, management pearls, exam traps, and must-know numbers. Format with bold headings.\')},100)" style="font-size:9px;padding:3px 8px;border:1px solid rgb(var(--brd));border-radius:6px;background:rgb(var(--card-bg));color:#7c3aed;cursor:pointer;white-space:nowrap" aria-label="AI summary of '+topic.n.replace(/'/g,'')+'">🤖 Summarize</button></div></div>';
  return h;
}

function _rspTier(tier,tSt){
  const tierOpen=S['sp_t'+tier.tier]!==undefined?S['sp_t'+tier.tier]:false;
  let tierTopics=0,tierChecked=0;
  tier.domains.forEach(domain=>{domain.topics.forEach(topic=>{tierTopics++;if(S.sp&&S.sp[topic.n])tierChecked++;});});
  let h='<div style="border-top:1px solid rgb(var(--brd));padding:0"><div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:rgb(var(--bg2))" onclick="S[\'sp_t'+tier.tier+'\']=' +'!S[\'sp_t'+tier.tier+'\'];save();render()" role="button" tabindex="0" aria-expanded="'+(tierOpen?'true':'false')+'"><div style="display:flex;align-items:center;gap:8px;flex:1"><div style="width:20px;height:20px;border-radius:8px;background:'+tier.color+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">'+tier.tier+'</div><div style="flex:1"><div style="font-weight:600;font-size:11px">'+tier.label+'</div><div style="font-size:8px;color:rgb(var(--fg3));margin-top:1px">'+tierChecked+'/'+tierTopics+' · '+tier.desc+'</div></div></div><div style="font-size:10px;color:rgb(var(--fg3));transition:transform .2s;transform:'+(tierOpen?'':'rotate(-90deg)')+'">'+( tierOpen?'▼':'▶')+'</div></div>';
  if(tierOpen){
    tier.domains.forEach(domain=>{
      h+='<div style="padding:8px 14px;border-top:1px solid rgb(var(--brd))"><div style="font-size:10px;font-weight:600;color:rgb(var(--fg2));margin-bottom:6px">'+domain.name+'</div>';
      domain.topics.forEach(topic=>{h+=_rspTopicRow(topic,tSt);});
      h+='</div>';
    });
  }
  h+='</div>';
  return h;
}

function renderStudyPlan(){
  const spOpen=S.spOpen!==undefined?S.spOpen:false;
  if(spOpen!==S.spOpen)S.spOpen=spOpen;
  let totalTopics=0,checkedTopics=0;
  STUDY_PLAN.forEach(tier=>{tier.domains.forEach(domain=>{domain.topics.forEach(topic=>{totalTopics++;if(S.sp&&S.sp[topic.n])checkedTopics++;});});});
  const spPct=totalTopics>0?Math.round(checkedTopics/totalTopics*100):0;
  let h='<div class="card" style="margin-bottom:12px"><div style="padding:14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="S.spOpen=!S.spOpen;save();render()" role="button" tabindex="0" aria-expanded="'+(spOpen?'true':'false')+'" aria-label="Study Plan"><div style="display:flex;align-items:center;gap:8px;flex:1"><div style="font-size:16px">📅</div><div style="flex:1"><div style="font-weight:700;font-size:13px;margin-bottom:2px">Study Plan — Hazzard\'s 8e</div><div style="font-size:9px;color:rgb(var(--fg2))">'+checkedTopics+'/'+totalTopics+' topics ('+spPct+'%)</div></div></div><div style="font-size:12px;color:rgb(var(--fg3));transition:transform .2s">▼</div></div>';
  if(spOpen){
    h+='<div style="padding:0 14px;margin-bottom:10px"><div style="width:100%;height:6px;background:rgb(var(--bg2));border-radius:3px;overflow:hidden"><div style="width:'+spPct+'%;height:100%;background:rgb(var(--em));border-radius:3px;transition:width .3s ease"></div></div></div>';
    const tSt=getTopicStats();
    STUDY_PLAN.forEach(tier=>{h+=_rspTier(tier,tSt);});
  }
  h+='</div>';
  return h;
}

function _rtMetrics(readiness,streak,tot,pct,pctN){
  return '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px"><div class="card" style="padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:'+(readiness===null?'#94a3b8':readiness>=70?'#059669':readiness>=50?'#d97706':'#dc2626')+'">'+(readiness!==null?readiness+'%':'—')+'</div><div style="font-size:9px;color:rgb(var(--fg2))">Est. Score</div></div><div class="card" style="padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#7c3aed">'+streak+'</div><div style="font-size:9px;color:rgb(var(--fg2))">Day Streak</div></div><div class="card" style="padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:#0ea5e9">'+tot+'</div><div style="font-size:9px;color:rgb(var(--fg2))">Answered</div></div><div class="card" style="padding:10px;text-align:center"><div style="font-size:22px;font-weight:800;color:'+(pctN>=70?'#059669':'#d97706')+'">'+pct+'</div><div style="font-size:9px;color:rgb(var(--fg2))">Accuracy</div></div></div>';
}

function _rtDueAlert(dueN){
  if(dueN<=0)return '';
  return '<div class="card" style="padding:12px;margin-bottom:8px;background:rgb(var(--red-bg));border:1px solid rgb(var(--red-brd))"><div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🔔</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#dc2626">'+dueN+' questions due for review</div><div style="font-size:10px;color:rgb(var(--fg2))">Spaced repetition items ready now</div></div><button onclick="filt=\'due\';buildPool();tab=\'quiz\';render()" class="btn" style="font-size:10px;padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:8px">▶ Review</button></div></div>';
}

function _rtTopicMap(){
  const _tStats=getTopicStats();
  let h='<div class="card" style="padding:14px;margin-bottom:8px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">🗺️ Topic Mastery Map</div><div style="display:flex;flex-wrap:wrap;gap:3px">';
  Object.entries(_tStats).forEach(([ti,s])=>{
    ti=Number(ti);if(!TOPICS[ti])return;
    const _p=s.tot>=2?Math.round(s.ok/s.tot*100):null;
    const color=_p===null?'#e2e8f0':_p>=80?'#059669':_p>=60?'#84cc16':_p>=40?'#f59e0b':'#ef4444';
    const bg=_p===null?'#f8fafc':_p>=80?'#ecfdf5':_p>=60?'#f7fee7':_p>=40?'#fffbeb':'#fef2f2';
    h+='<div onclick="tab=\'quiz\';filt=\'topic\';topicFilt='+ti+';buildPool();render()" style="padding:4px 6px;border-radius:6px;font-size:7px;background:'+bg+';color:'+color+';font-weight:700;cursor:pointer;border:1px solid '+color+'30;min-width:32px;text-align:center;line-height:1.3" title="'+TOPICS[ti]+': '+(_p!==null?_p+'%':'no data')+' ('+s.tot+' Qs)"><div style="font-size:6px;opacity:0.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;max-width:40px">'+TOPICS[ti].split(' ')[0].substring(0,6)+'</div>'+(_p!==null?_p+'%':'·')+'</div>';
  });
  h+='</div></div>';
  return h;
}

function _rtConfidenceMatrix(){
  const _confStats={sure_ok:0,sure_no:0,unsure_ok:0,unsure_no:0};
  Object.values(S.sr||{}).forEach(s=>{if(s.conf){Object.entries(s.conf).forEach(([k,v])=>{if(_confStats[k]!==undefined)_confStats[k]+=v;});}});
  const _confTotal=Object.values(_confStats).reduce((a,b)=>a+b,0);
  if(_confTotal<10)return '';
  const _blindSpots=_confStats.sure_no;
  return '<div class="card" style="padding:14px;margin-bottom:10px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">🎯 Confidence Matrix ('+_confTotal+' rated)</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:10px;text-align:center"><div style="padding:8px;background:#dcfce7;border-radius:8px"><div style="font-size:16px;font-weight:700">'+_confStats.sure_ok+'</div>😎✅ Confident + Right</div><div style="padding:8px;background:#fecaca;border-radius:8px"><div style="font-size:16px;font-weight:700;color:#dc2626">'+_confStats.sure_no+'</div>😎❌ BLIND SPOTS</div><div style="padding:8px;background:#fef9c3;border-radius:8px"><div style="font-size:16px;font-weight:700">'+_confStats.unsure_ok+'</div>😬✅ Lucky</div><div style="padding:8px;background:rgb(var(--bg2));border-radius:8px"><div style="font-size:16px;font-weight:700">'+_confStats.unsure_no+'</div>😬❌ Expected miss</div></div>'+(_blindSpots>0?'<div style="margin-top:8px;font-size:10px;color:#dc2626;font-weight:600">⚠️ '+_blindSpots+' blind spots — you were confident but wrong. These are your most dangerous gaps.</div>':'')+'</div>';
}

function _rtRescueDrill(){
  const _weakTopics=getWeakTopics(3);
  if(!_weakTopics.length||_weakTopics[0].pct===null||_weakTopics[0].pct>=65)return '';
  return '<div class="card" style="padding:14px;margin-bottom:10px;background:linear-gradient(135deg,#fef2f2,#fffbeb);border:1px solid rgb(var(--red-brd))"><div style="display:flex;align-items:center;gap:10px"><span style="font-size:24px">🚨</span><div style="flex:1"><div style="font-weight:700;font-size:12px;color:#dc2626">Rescue Drill</div><div style="font-size:10px;color:rgb(var(--fg2))">'+_weakTopics.map(w=>TOPICS[w.ti]+' ('+w.pct+'%)').join(' · ')+'</div></div><button onclick="buildRescuePool();tab=\'quiz\';render()" class="btn" style="font-size:11px;padding:8px 16px;background:#dc2626;color:#fff;border:none;border-radius:10px;font-weight:700">GO</button></div></div>';
}

function _rtActivityCalendar(){
  let h='<div class="card" style="padding:14px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">📅 Activity (last 30 days)</div><div style="display:grid;grid-template-columns:repeat(10,1fr);gap:3px">';
  for(let _i=29;_i>=0;_i--){
    const _d=new Date();_d.setDate(_d.getDate()-_i);
    const _dk=_d.toISOString().slice(0,10);
    const _act=S.dailyAct&&S.dailyAct[_dk];
    const _qc=_act?_act.q:0;
    const _int=_qc===0?0:_qc<5?1:_qc<15?2:_qc<30?3:4;
    const _cols=[document.body.classList.contains('dark')||document.body.classList.contains('study')?'#1e293b':'#f1f5f9','#dcfce7','#86efac','#22c55e','#15803d'];
    h+='<div style="aspect-ratio:1;border-radius:3px;background:'+_cols[_int]+'" title="'+_dk+': '+_qc+' Qs"></div>';
  }
  h+='</div></div>';
  return h;
}

function _rtSpacedReading(){
  const _hazDue=getChaptersDueForReading('haz',30);
  const _harDue=getChaptersDueForReading('har',30);
  if(!_hazDue.length&&!_harDue.length)return '';
  let h='<div class="card" style="padding:14px;margin-bottom:10px"><div style="font-size:12px;font-weight:700;margin-bottom:8px">📖 Chapters Due for Re-Reading</div>';
  if(_hazDue.length){
    h+='<div style="font-size:10px;font-weight:600;color:#dc2626;margin-bottom:4px">Hazzard\'s:</div>';
    _hazDue.slice(0,5).forEach(c=>{
      const _chData=_hazData&&_hazData[c.ch];
      const _title=_chData?_chData.title:'Ch '+c.ch;
      h+='<div onclick="tab=\'lib\';libSec=\'haz-pdf\';openHazzardChapter('+c.ch+')" style="font-size:10px;padding:4px 0;cursor:pointer;color:rgb(var(--fg2));border-bottom:1px solid #f8fafc">📕 Ch '+c.ch+': '+_title+' <span style="color:#dc2626;font-weight:700">('+c.daysSince+'d ago)</span></div>';
    });
  }
  if(_harDue.length){
    h+='<div style="font-size:10px;font-weight:600;color:#7c3aed;margin-bottom:4px;margin-top:6px">Harrison\'s:</div>';
    _harDue.slice(0,5).forEach(c=>{
      const _chData=_harData&&_harData[c.ch];
      const _title=_chData?_chData.title:'Ch '+c.ch;
      h+='<div onclick="tab=\'lib\';libSec=\'harrison\';openHarrisonChapter('+c.ch+')" style="font-size:10px;padding:4px 0;cursor:pointer;color:rgb(var(--fg2));border-bottom:1px solid #f8fafc">📗 Ch '+c.ch+': '+_title+' <span style="color:#7c3aed;font-weight:700">('+c.daysSince+'d ago)</span></div>';
    });
  }
  h+='</div>';
  return h;
}

function _rtBookmarks(bkCount){
  if(bkCount<=0)return '';
  let h='';
  const _byTopic={};
  Object.entries(S.bk).filter(([,v])=>v).forEach(([k])=>{
    const q=QZ[k];if(!q)return;
    const tp=TOPICS[q.ti]||'Other';
    if(!_byTopic[tp])_byTopic[tp]=[];
    _byTopic[tp].push({k:k,q:q});
  });
  const _topicKeys=Object.keys(_byTopic);
  if(_topicKeys.length>1){
    h+='<div class="card" style="padding:14px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">📁 Bookmark Folders</div>';
    _topicKeys.forEach(function(topic){
      var fk='bkf_'+topic.replace(/[^a-z0-9]/gi,'_');
      var open=S[fk];
      var qs=_byTopic[topic];
      h+='<div style="margin-bottom:6px">';
      h+='<div onclick="S[\''+fk+'\']='+'!S[\''+fk+'\'];save();render()" style="display:flex;justify-content:space-between;align-items:center;padding:8px;background:rgb(var(--bg2));border-radius:8px;cursor:pointer;font-size:11px;font-weight:600" role="button" tabindex="0" aria-expanded="'+(open?'true':'false')+'" aria-label="'+topic+'">';
      h+='<span>📁 '+topic+' ('+qs.length+')</span><span>'+(open?'▼':'▶')+'</span></div>';
      if(open){qs.forEach(function(e){h+='<div style="padding:6px 12px;font-size:10px;border-bottom:1px solid rgb(var(--brd))" class="heb" dir="rtl">'+e.q.q.substring(0,90)+'...</div>';});}
      h+='</div>';
    });
    h+='</div>';
  }else{
    h+='<div class="card" style="padding:14px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">🔖 Bookmarked ('+bkCount+')</div>';
    Object.entries(S.bk).filter(([,v])=>v).slice(0,10).forEach(([k])=>{
      const q=QZ[k];if(q)h+='<div style="font-size:10px;padding:6px 0;border-bottom:1px solid #f8fafc" class="heb" dir="rtl">'+q.q.substring(0,80)+'...</div>';
    });
    h+='</div>';
  }
  return h;
}

function _rtAccuracyBars(){
  const tSt=getTopicStats();
  const ranked=TOPICS.map((t,i)=>({name:t,i,s:tSt[i]||{ok:0,no:0,tot:0}})).filter(p=>p.s.tot>0);
  if(!ranked.length)return '';
  let h='<div class="card" style="padding:14px;margin-bottom:10px"><div style="font-weight:700;font-size:12px;margin-bottom:10px">📊 Accuracy by Topic <span class="tt-wrap"><button class="tt-icon" tabindex="0">ⓘ</button><div class="tt-box">Shows your accuracy (% correct) for each topic you\'ve attempted. Green ≥70%, amber ≥50%, red <50%.</div></span></div>';
  ranked.sort((a,b)=>{const pa=a.s.tot?a.s.ok/a.s.tot:0,pb=b.s.tot?b.s.ok/b.s.tot:0;return pa-pb;}).forEach(p=>{
    const pct=p.s.tot?Math.round(p.s.ok/p.s.tot*100):0;
    const clr=pct>=70?'rgb(var(--em))':pct>=50?'rgb(var(--amb))':'rgb(var(--red))';
    h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid #f8fafc;font-size:10px"><span style="flex:1">'+p.name+'</span><div style="display:flex;align-items:center;gap:6px"><div style="width:50px;height:5px;background:rgb(var(--bg2));border-radius:3px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:'+clr+';border-radius:3px"></div></div><span style="width:28px;text-align:right;font-weight:600;color:'+clr+'">'+pct+'%</span><span style="color:rgb(var(--fg3));font-size:8px">'+p.s.tot+'</span></div></div>';
  });
  h+='</div>';
  return h;
}

function _rtWeakSpotsMap(){
  const years=[...new Set(QZ.map(q=>q.t))].sort();
  const heatData=[];
  TOPICS.forEach((topic,ti)=>{
    const row={topic,cells:[]};
    years.forEach(yr=>{
      const qs=QZ.map((q,i)=>({q,i})).filter(e=>e.q.ti===ti&&e.q.t===yr);
      if(!qs.length){row.cells.push({yr,pct:-1,n:0});return;}
      const answered=qs.filter(e=>S.sr[e.i]);
      const correct=qs.filter(e=>{const s=S.sr[e.i];return s&&s.n>0&&s.ef>=2.3;});
      row.cells.push({yr,pct:answered.length?Math.round(correct.length/answered.length*100):-1,n:answered.length});
    });
    if(row.cells.some(c=>c.n>0))heatData.push(row);
  });
  if(!heatData.length)return '';
  let h='<div class="card" style="padding:14px;margin-bottom:10px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">🗺️ Weak Spots Map</div>';
  h+='<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:9px"><thead><tr><th style="text-align:right;padding:3px;font-size:8px">Topic</th>';
  years.forEach(y=>{h+='<th style="padding:3px;text-align:center;font-size:7px;white-space:nowrap">'+(y.length>4?y.slice(-2):y)+'</th>';});
  h+='</tr></thead><tbody>';
  heatData.sort((a,b)=>{
    const avgA=a.cells.filter(c=>c.n>0).reduce((s,c)=>s+c.pct,0)/(a.cells.filter(c=>c.n>0).length||1);
    const avgB=b.cells.filter(c=>c.n>0).reduce((s,c)=>s+c.pct,0)/(b.cells.filter(c=>c.n>0).length||1);
    return avgA-avgB;
  });
  heatData.forEach(row=>{
    h+='<tr><td style="padding:3px;text-align:right;white-space:nowrap;max-width:100px;overflow:hidden;text-overflow:ellipsis">'+row.topic+'</td>';
    row.cells.forEach(c=>{
      if(c.n===0){h+='<td style="padding:2px;text-align:center;background:rgb(var(--bg2));color:#cbd5e1">·</td>';}
      else{
        const bg=c.pct>=75?'#dcfce7':c.pct>=50?'#fef9c3':'#fecaca';
        h+='<td style="padding:2px;text-align:center;background:'+bg+';font-weight:600;border-radius:2px">'+c.pct+'</td>';}
    });
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  h+='<div style="display:flex;gap:8px;margin-top:6px;font-size:8px;color:rgb(var(--fg3));justify-content:center"><span style="display:flex;align-items:center;gap:2px"><span style="width:10px;height:10px;background:#fecaca;border-radius:2px"></span><50%</span><span style="display:flex;align-items:center;gap:2px"><span style="width:10px;height:10px;background:#fef9c3;border-radius:2px"></span>50-74%</span><span style="display:flex;align-items:center;gap:2px"><span style="width:10px;height:10px;background:#dcfce7;border-radius:2px"></span>≥75%</span></div>';
  h+='</div>';
  return h;
}

function _rtSyllabus(done){
  let h='<div class="card" style="padding:14px"><div style="font-weight:700;font-size:12px;margin-bottom:10px">📋 Syllabus ('+done+'/40)</div>';
  TOPICS.forEach((t,i)=>{h+='<div class="topic'+(S.ck[i]?' done':'')+'" onclick="S.ck['+i+']=!S.ck['+i+'];save();render()" style="display:'+(S._sylOpen?'flex':'none')+'" role="checkbox" aria-checked="'+(S.ck[i]?'true':'false')+'" tabindex="0" aria-label="'+t+'"><input type="checkbox" '+(S.ck[i]?'checked':'')+' readonly style="width:13px;height:13px" tabindex="-1"><span>'+t+'</span></div>';});
  h+='<div onclick="S._sylOpen=!S._sylOpen;render()" style="text-align:center;padding:8px;cursor:pointer;font-size:10px;color:rgb(var(--sky));font-weight:600" role="button" tabindex="0" aria-expanded="'+(S._sylOpen?'true':'false')+'" aria-label="Toggle syllabus topics">'+(S._sylOpen?'▲ Collapse':'▼ Show '+TOPICS.length+' topics')+'</div>';
  h+='</div>';
  return h;
}

function _rtImaLinks(){
  let h='<div class="card" style="padding:14px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">📥 IMA Exam Archive</div><div style="font-size:10px">';
  [["2022","639899_34c9618e-ff88-4811-84d5-ba1fdd9d5f1c","639902_9a12e7aa-9876-40e1-bdea-0786dc417406"],
  ["2023","639904_14aa53eb-d114-4ab8-8bfe-938b32d02fc0","639907_33601987-d23e-4f5f-8180-53890b2cfcb4"],
  ["May 24","652285_f10c088f-c183-4f9c-8324-b37bedabe522","652288_5f94445c-1fe5-4207-bd42-e223be8064a0"],
  ["Sep 24","652291_5946c97e-78c1-4920-81e3-1081d46fdb6e","652294_46e7d570-db16-4307-b4f1-66f002ed456e"],
  ["Jun 25","749665_d23a3de1-a2af-4467-b2b0-71f297f6b800","766892_d886488d-27d3-487c-8088-56f67ae43409"],
  ].forEach(([y,q,a])=>{h+='<div style="display:flex;gap:8px;padding:3px 0"><b style="width:48px">'+y+'</b><a href="https://ima-files.s3.amazonaws.com/'+q+'.pdf" target="_blank" style="color:rgb(var(--sky));text-decoration:underline">שאלון</a><a href="https://ima-files.s3.amazonaws.com/'+a+'.pdf" target="_blank" style="color:rgb(var(--sky));text-decoration:underline">תשובות</a></div>';});
  h+='</div></div>';
  return h;
}

function _rtDataManagement(){
  let h='<div class="card" style="padding:14px;text-align:center;margin-top:12px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">🔗 Share with Friends</div><div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">Share this app with fellow geriatric medicine residents</div><button class="btn btn-p" onclick="shareApp()" style="margin-bottom:8px" aria-label="Share app link">📤 Share App Link</button></div>';
  h+='<div class="card" style="padding:14px;margin-top:12px"><div style="font-weight:700;font-size:12px;margin-bottom:8px">💾 Data Management</div><div style="font-size:10px;color:rgb(var(--fg2));margin-bottom:10px">Your progress is saved automatically in your browser. Export to backup or transfer between devices.</div><div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap"><button class="btn btn-p" onclick="exportProgress()" aria-label="Export progress">📥 Export Progress</button><button class="btn btn-g" onclick="importProgress()" aria-label="Import progress">📤 Import Progress</button><button class="btn btn-o" onclick="if(confirm(\'Reset ALL data? This cannot be undone.\')){localStorage.removeItem(\''+LS+'\');location.reload()}" aria-label="Reset all data">🗑️ Reset</button></div><div style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-top:8px"><button id="cloud-backup-btn" class="btn" style="background:#e0f2fe;color:#0284c7" onclick="cloudBackup()" aria-label="Backup to cloud">☁️ Backup to Cloud</button><button class="btn" style="background:rgb(var(--green-bg));color:#15803d" onclick="cloudRestore()" aria-label="Restore from cloud">☁️ Restore from Cloud</button></div><div style="font-size:9px;color:rgb(var(--fg3));text-align:center;margin-top:6px">Cloud sync · progress keyed by device ID</div></div></div>';
  return h;
}

function _rtApiKey(){
  var _storedKey=getApiKey();
  var h='<div class="card" style="padding:14px;margin-top:10px;border:2px solid '+(_storedKey?'#bbf7d0':'#fde68a')+'">';
  h+='<div class="sec-t" style="font-size:13px">🔑 Anthropic API Key</div>';
  h+='<div class="sec-s" style="margin-bottom:10px">לשימוש ב-AI Explain ו-Teach-Back · מאוחסן בדפדפן בלבד</div>';
  if(!_storedKey){h+='<div style="padding:8px 10px;background:#ecfdf5;border:1px solid rgb(var(--green-brd));border-radius:8px;font-size:10px;color:rgb(var(--green-fg));margin-bottom:10px">✅ AI פועל דרך שרת proxy — לא צריך מפתח אישי. אפשר להוסיף כגיבוי. <a href="https://console.anthropic.com/keys" target="_blank" style="color:#d97706;font-weight:700">קבל מפתח ↗</a></div>';}
  if(_storedKey){
    h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    h+='<div style="flex:1;font-size:11px;background:#ecfdf5;border:1px solid rgb(var(--green-brd));border-radius:8px;padding:6px 10px;color:rgb(var(--green-fg))">✅ API key מוגדר (sk-...'+_storedKey.slice(-6)+')</div>';
    h+='<button class="btn btn-o" style="font-size:11px" onclick="setApiKey(\'\');render()" aria-label="Remove API key">הסר</button>';
    h+='</div>';
  } else {
    h+='<div style="display:flex;gap:8px;margin-bottom:8px">';
    h+='<input id="apiKeyInput" type="password" placeholder="sk-ant-..." class="calc-in" style="flex:1;margin:0;font-size:11px" aria-label="Claude API key">';
    h+='<button class="btn btn-p" style="font-size:11px" onclick="var v=document.getElementById(\'apiKeyInput\').value.trim();if(v){setApiKey(v);render();}" aria-label="Save API key">שמור</button>';
    h+='</div>';
  }
  h+='<div style="font-size:9px;color:rgb(var(--fg3))">API key נשמר ב-localStorage בלבד · לא נשלח לשרתים של האפליקציה</div></div>';
  return h;
}

function _rtFooter(){
  return '<div style="text-align:center;margin-top:20px;padding:12px;font-size:9px;color:rgb(var(--fg3));line-height:1.8"><div>Shlav A Mega v'+APP_VERSION+' · '+new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+' · build '+BUILD_HASH+'</div><div>Hazzard\'s 8e + Harrison\'s 22e · '+QZ.length+' Questions</div><div style="margin-top:8px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button onclick="applyUpdate()" style="font-size:10px;padding:5px 14px;background:#0D7377;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600">🔄 Force Update</button><a href="https://eiasash.github.io/InternalMedicine/" target="_blank" style="font-size:10px;padding:5px 14px;background:#4f46e5;color:#fff;border:none;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">🏥 Internal Medicine App →</a></div><div style="margin-top:6px">صدقة جارية الى من نحب</div></div>';
}

function renderTrack(){
  const done=Object.values(S.ck).filter(Boolean).length;
  const tot=S.qOk+S.qNo;const pctN=tot?Math.round(S.qOk/tot*100):0;const pct=tot?pctN+'%':'—';
  const bkCount=Object.values(S.bk).filter(Boolean).length;
  const dueN=getDueQuestions().length;
  const readiness=calcEstScore();
  const streak=getStudyStreak();
  let h=_rtMetrics(readiness,streak,tot,pct,pctN);
  h+=_rtDueAlert(dueN);
  h+=_rtTopicMap();
  h+=renderStudyPlan();
  if(!S.examDate&&!localStorage.getItem('shlav_exam_date')){
    h+='<div class="card" style="padding:14px;margin-bottom:10px;text-align:center"><div style="font-size:12px;font-weight:700;margin-bottom:6px">📅 When is your exam?</div><button class="btn btn-p" onclick="setExamDate()" style="font-size:11px">Set Exam Date</button></div>';
  }else{
    h+=renderDailyPlan();
  }
  h+=renderSessionCard();
  h+=_rtConfidenceMatrix();
  h+=_rtRescueDrill();
  h+=_rtActivityCalendar();
  h+=_rtSpacedReading();
  h+='<div class="card" style="padding:14px;margin-bottom:10px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:14px">🏆</span><div style="font-size:12px;font-weight:700;flex:1">Leaderboard</div><button onclick="showLeaderboard()" style="font-size:9px;padding:4px 10px;background:#f59e0b;color:#fff;border:none;border-radius:6px;cursor:pointer">Refresh</button></div><div id="leaderboard-box" style="font-size:10px;color:rgb(var(--fg3));text-align:center">Tap refresh to load</div></div>';
  h+='<div class="card" style="padding:14px;margin-bottom:10px;text-align:center"><button class="btn btn-d" onclick="exportCheatSheet()" style="font-size:11px" aria-label="Export cheat sheet">📄 Export Weak Topics Cheat Sheet</button><div style="font-size:9px;color:rgb(var(--fg3));margin-top:4px">Print-ready 2-page summary of your 15 weakest topics</div></div>';
  if(S.examDate||localStorage.getItem('shlav_exam_date')){
    h+='<div style="text-align:center;margin-bottom:10px"><button onclick="setExamDate()" style="font-size:9px;color:rgb(var(--fg3));background:none;border:none;cursor:pointer;text-decoration:underline">📅 Change exam date</button></div>';
  }
  h+=renderExamTrendCard();
  h+='<div class="sec-t">Progress</div><div class="sec-s">Syllabus · Bookmarks · Spaced Repetition</div>';
  if(S.streak>0)h+='<div style="text-align:center;margin-bottom:12px"><span class="streak-badge">🔥 '+S.streak+' day'+(S.streak>1?'s':'')+' streak</span></div>';
  const estScore=calcEstScore();
  h+='<div class="stats"><div class="stat"><div class="n" style="color:rgb(var(--em))">'+done+'/40</div><div class="l">Topics</div></div><div class="stat"><div class="n" style="color:rgb(var(--sky))">'+pct+'</div><div class="l">Quiz</div></div><div class="stat"><span class="tt-wrap"><div class="n" style="color:'+(estScore===null?'#94a3b8':estScore>=70?'#059669':estScore>=60?'#d97706':'#dc2626')+'">'+( estScore!==null?estScore+'%':'—')+'</div><div class="l">Est. Score <button class="tt-icon" tabindex="0">ⓘ</button></div><div class="tt-box" style="left:0;transform:none">Rolling exam score estimate: topic accuracy × exam frequency weight. Penalizes overdue SR cards. Needs 3+ answers per topic for accuracy. Pass = 60%.</div></span></div><div class="stat"><span class="tt-wrap"><div class="n" style="color:rgb(var(--amb))">'+dueN+'</div><div class="l">Due (SR) <button class="tt-icon" tabindex="0">ⓘ</button></div><div class="tt-box" style="left:0;transform:none">Spaced repetition cards due for review. Based on your past performance.</div></span></div></div>';
  h+=_rtBookmarks(bkCount);
  h+=_rtAccuracyBars();
  h+=_rtWeakSpotsMap();
  h+=renderPriorityMatrix();
  h+=_rtSyllabus(done);
  h+=_rtImaLinks();
  h+=_rtDataManagement();
  h+=_rtApiKey();
  h+=_rtFooter();
  return h;
}

// ===== EXPORT: expose on window =====
window.renderTrack = renderTrack;
window.renderStudyPlan = renderStudyPlan;
window.renderPriorityMatrix = renderPriorityMatrix;
window.renderExamTrendCard = renderExamTrendCard;
window.renderDailyPlan = renderDailyPlan;
window.renderSessionCard = renderSessionCard;

})();
