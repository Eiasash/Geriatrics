/**
 * FSRS-4.5 Spaced Repetition Algorithm
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
 *   fsrsR, fsrsInterval, fsrsInitNew, fsrsUpdate, fsrsMigrateFromSM2, isChronicFail
 */

// ===== FSRS-4.5 ALGORITHM =====
const FSRS_W=[0.40255,1.18385,3.1262,15.4722,7.2102,0.5316,1.0651,0.06362,
              1.544,0.1544,1.0070,1.9395,0.11,0.29605,2.2698,0.2315,2.9898,0.51655,0.6621];
const FSRS_DECAY=-0.5;
const FSRS_FACTOR=19/81;
const FSRS_RETENTION=0.90; // target 90% retention

function fsrsR(t,s){
  // Retrievability after t days with stability s
  if(!s||s<=0)return 0;
  return Math.pow(1+FSRS_FACTOR*t/s,FSRS_DECAY);
}
function fsrsInterval(s){
  // Days until retrievability drops to FSRS_RETENTION
  return Math.max(1,Math.round(s/FSRS_FACTOR*(Math.pow(FSRS_RETENTION,1/FSRS_DECAY)-1)));
}
function fsrsInitNew(rating){
  // rating: 1=Again,2=Hard,3=Good,4=Easy
  const r=Math.max(0,Math.min(3,rating-1));
  const s=Math.max(0.1,FSRS_W[r]);
  const d=Math.min(10,Math.max(1,FSRS_W[4]-Math.exp(FSRS_W[5]*r)+1));
  return{s,d};
}
function fsrsUpdate(s,d,rPrev,rating){
  let newS,newD;
  if(rating===1){
    // Forgot — short-term stability
    newS=FSRS_W[11]*Math.pow(Math.max(0.1,d),-FSRS_W[12])*
         (Math.pow(s+1,FSRS_W[13])-1)*
         Math.exp(FSRS_W[14]*(1-rPrev));
    newS=Math.max(0.1,newS);
  }else{
    // Recalled
    const hard=rating===2?FSRS_W[15]:1;
    const easy=rating===4?FSRS_W[16]:1;
    newS=s*(Math.exp(FSRS_W[8])*(11-d)*
         Math.pow(Math.max(0.01,s),-FSRS_W[9])*
         (Math.exp(FSRS_W[10]*(1-rPrev))-1)*
         hard*easy+1);
    newS=Math.max(0.1,newS);
  }
  // Difficulty update with mean reversion
  const deltaD=-FSRS_W[6]*(rating-3);
  const mr=FSRS_W[7]*(FSRS_W[4]-d);
  newD=Math.min(10,Math.max(1,d+deltaD+mr));
  return{s:newS,d:newD};
}
function fsrsMigrateFromSM2(sm2entry){
  // Estimate FSRS state from existing SM-2 data
  const daysLeft=Math.max(0,(sm2entry.next-Date.now())/86400000);
  const s=Math.max(0.1,daysLeft>0?daysLeft:sm2entry.n||0.1);
  // ef 2.5=easy(D≈1), ef 1.3=hard(D≈10)
  const d=Math.min(10,Math.max(1,Math.round((2.5-sm2entry.ef)/(2.5-1.3)*9+1)));
  return{s,d};
}
// ===== END FSRS =====

/**
 * Check if a question is a chronic failure (low accuracy or high difficulty)
 * @param {object} srEntry - The SR entry from S.sr[qIdx]
 * @returns {boolean}
 */
function isChronicFail(srEntry){
  if(!srEntry)return false;
  const lowAccuracy=srEntry.tot>=4&&srEntry.ok/srEntry.tot<0.35;
  const highDifficulty=srEntry.fsrsD&&srEntry.fsrsD>=8&&srEntry.tot>=3;
  return lowAccuracy||highDifficulty;
}
