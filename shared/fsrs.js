/**
 * FSRS-4.5 Spaced Repetition Algorithm + Deadline Awareness (v2)
 * Shared between Shlav A Mega (Geriatrics) and Pnimit Mega (Internal Medicine)
 *
 * Parameters from official FSRS-4.5 defaults (Anki 23.10+)
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki
 *
 * DO NOT EDIT IN INDIVIDUAL REPOS — edit here and copy to both:
 *   Geriatrics/shared/fsrs.js
 *   InternalMedicine/shared/fsrs.js
 *
 * Exports (global): FSRS_W, FSRS_DECAY, FSRS_FACTOR, FSRS_RETENTION,
 *   fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2, isChronicFail,
 *   fsrsIntervalWithDeadline, fsrsScheduleWithDeadline, fsrsDaysToExam
 *
 * v2 (20/04/26) — deadline-aware wrapper. Backward-compatible: if no exam date set,
 * fsrsIntervalWithDeadline() returns identical output to fsrsInterval().
 */

// ===== FSRS-4.5 CORE (unchanged from v1) =====
const FSRS_W=[0.40255,1.18385,3.1262,15.4722,7.2102,0.5316,1.0651,0.06362,
              1.544,0.1544,1.0070,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621];
const FSRS_DECAY=-0.5;
const FSRS_FACTOR=19/81;
const FSRS_RETENTION=0.90; // target 90% retention

function fsrsR(t,s){
  if(!s||s<=0)return 0;
  return Math.pow(1+FSRS_FACTOR*t/s,FSRS_DECAY);
}
function fsrsInterval(s){
  return Math.max(1,Math.round(s/FSRS_FACTOR*(Math.pow(FSRS_RETENTION,1/FSRS_DECAY)-1)));
}
function fsrsInitNew(rating){
  const r=Math.max(0,Math.min(3,rating-1));
  const s=Math.max(0.1,FSRS_W[r]);
  const d=Math.min(10,Math.max(1,FSRS_W[4]-Math.exp(FSRS_W[5]*r)+1));
  return{s,d};
}
function fsrsUpdate(s,d,rPrev,rating){
  let newS,newD;
  if(rating===1){
    newS=FSRS_W[11]*Math.pow(Math.max(0.1,d),-FSRS_W[12])*
         (Math.pow(s+1,FSRS_W[13])-1)*
         Math.exp(FSRS_W[14]*(1-rPrev));
    newS=Math.max(0.1,newS);
  }else{
    const hard=rating===2?FSRS_W[15]:1;
    const easy=rating===4?FSRS_W[16]:1;
    newS=s*(Math.exp(FSRS_W[8])*(11-d)*
         Math.pow(Math.max(0.01,s),-FSRS_W[9])*
         (Math.exp(FSRS_W[10]*(1-rPrev))-1)*
         hard*easy+1);
    newS=Math.max(0.1,newS);
  }
  const deltaD=-FSRS_W[6]*(rating-3);
  const mr=FSRS_W[7]*(FSRS_W[4]-d);
  newD=Math.min(10,Math.max(1,d+deltaD+mr));
  return{s:newS,d:newD};
}
function fsrsMigrateFromSM2(sm2entry){
  const daysLeft=Math.max(0,(sm2entry.next-Date.now())/86400000);
  const s=Math.max(0.1,daysLeft>0?daysLeft:sm2entry.n||0.1);
  const d=Math.min(10,Math.max(1,Math.round((2.5-sm2entry.ef)/(2.5-1.3)*9+1)));
  return{s,d};
}
// ===== END FSRS CORE =====

/**
 * Check if a question is a chronic failure (low accuracy or high difficulty)
 */
function isChronicFail(srEntry){
  if(!srEntry)return false;
  const lowAccuracy=srEntry.tot>=4&&srEntry.ok/srEntry.tot<0.35;
  const highDifficulty=srEntry.fsrsD&&srEntry.fsrsD>=8&&srEntry.tot>=3;
  return lowAccuracy||highDifficulty;
}

// ===== DEADLINE AWARENESS (v2) =====

/**
 * Days remaining until the exam date (rounded up, min 0).
 * Reads from either (a) explicit param, (b) S.examDate, (c) localStorage['shlav_exam_date' | 'pnimit_exam_date'].
 * Returns null if no exam date is set.
 *
 * @param {string|null} [override] - ISO date string (YYYY-MM-DD) to use instead of stored value
 * @returns {number|null} days to exam, or null if no date set / date in past by >1 day
 */
function fsrsDaysToExam(override){
  let d=override;
  if(!d){
    try{
      const S=(typeof window!=='undefined'&&window.S)||{};
      d=S.examDate||
        (typeof localStorage!=='undefined'&&
          (localStorage.getItem('shlav_exam_date')||
           localStorage.getItem('pnimit_exam_date')))||
        null;
    }catch(e){d=null;}
  }
  if(!d||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
  const target=new Date(d+'T23:59:59').getTime();
  const days=Math.ceil((target-Date.now())/86400000);
  return days>0?days:0;
}

/**
 * Deadline-aware interval.
 * If no exam date set → returns vanilla fsrsInterval(s).
 * If exam date set → caps interval so at least one review falls before the exam.
 *
 * Bucketing by difficulty (D) + current retrievability (rPrev):
 *   - WEAK       (D >= 7 OR rPrev < 0.75): review at ≤30% of remaining days (2-3 reviews before exam)
 *   - NORMAL     (D 4–7 or moderate mastery):  review at ≤60% of remaining days (1-2 reviews before exam)
 *   - STRONG     (D <= 3 AND rPrev >= 0.9):    review at ≤85% of remaining days (safety buffer, 1 review)
 *
 * Never extends interval beyond what FSRS computed — only caps.
 * Never returns 0 days.
 *
 * @param {number} s - stability
 * @param {number} d - difficulty (1..10)
 * @param {number} [rPrev=1] - last retrievability
 * @param {number|null} [daysToExam] - override; if omitted, reads from state
 * @returns {number} days until next review
 */
function fsrsIntervalWithDeadline(s,d,rPrev,daysToExam){
  const base=fsrsInterval(s);
  const exam=daysToExam===undefined?fsrsDaysToExam():daysToExam;
  if(exam==null||exam<=0)return base;
  // If exam is today/tomorrow, show the card tomorrow regardless of mastery
  if(exam<=1)return 1;
  const rp=(rPrev==null||isNaN(rPrev))?1:rPrev;
  let frac;
  if(d>=7||rp<0.75){frac=0.30;}
  else if(d>=4||rp<0.90){frac=0.60;}
  else{frac=0.85;}
  const capped=Math.max(1,Math.floor(exam*frac));
  return Math.min(base,capped);
}

/**
 * Convenience: returns {intervalDays, nextReviewTime, warped}
 * `warped` is true if the deadline forced a shorter interval than FSRS computed.
 */
function fsrsScheduleWithDeadline(s,d,rPrev,now,daysToExam){
  const base=fsrsInterval(s);
  const withDeadline=fsrsIntervalWithDeadline(s,d,rPrev,daysToExam);
  const t=now||Date.now();
  return{
    intervalDays:withDeadline,
    nextReviewTime:t+withDeadline*86400000,
    warped:withDeadline<base,
    baseIntervalDays:base,
  };
}

// ===== END DEADLINE AWARENESS =====

// Browser globals (if running in browser)
if(typeof window!=='undefined'){
  window.FSRS_W=FSRS_W;
  window.FSRS_DECAY=FSRS_DECAY;
  window.FSRS_FACTOR=FSRS_FACTOR;
  window.FSRS_RETENTION=FSRS_RETENTION;
  window.fsrsR=fsrsR;
  window.fsrsInterval=fsrsInterval;
  window.fsrsInitNew=fsrsInitNew;
  window.fsrsUpdate=fsrsUpdate;
  window.fsrsMigrateFromSM2=fsrsMigrateFromSM2;
  window.isChronicFail=isChronicFail;
  window.fsrsDaysToExam=fsrsDaysToExam;
  window.fsrsIntervalWithDeadline=fsrsIntervalWithDeadline;
  window.fsrsScheduleWithDeadline=fsrsScheduleWithDeadline;
}

// Node/ESM export (for tests)
if(typeof module!=='undefined'&&module.exports){
  module.exports={
    FSRS_W,FSRS_DECAY,FSRS_FACTOR,FSRS_RETENTION,
    fsrsR,fsrsInterval,fsrsInitNew,fsrsUpdate,fsrsMigrateFromSM2,isChronicFail,
    fsrsDaysToExam,fsrsIntervalWithDeadline,fsrsScheduleWithDeadline,
  };
}
