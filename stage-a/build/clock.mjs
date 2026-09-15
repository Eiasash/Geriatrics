/* Pins the page's clock so a guard means the same thing on every day it runs.

   Without this the suite tests whatever date CI happens to run on: an unchanged file
   passed 335/335 in September and failed 3 checks when the page thought it was January,
   because the schedule moves through reading weeks into the consolidation period.

   STAGEA_DATE=YYYY-MM-DD picks the date; the default is a mid-block reading week.
   The page sees that date at 10:00 local time, and time still advances from there, so
   timers and Date.now() differences behave normally. */
export const PIN = process.env.STAGEA_DATE || '2026-10-07';
if(!/^\d{4}-\d{2}-\d{2}$/.test(PIN)) throw new Error('STAGEA_DATE must be YYYY-MM-DD, got ' + PIN);

export function pinClock(w){
  const Real = w.Date;
  let off = new Real(PIN + 'T10:00:00').getTime() - Real.now();
  if(Number.isNaN(off)) throw new Error('STAGEA_DATE is not a real date: ' + PIN);
  /* test-only handle: move the page's clock to a local date-time mid-session, e.g. to
     cross midnight. The page itself never reads this. */
  w.__stageaClock = { set(localDateTime){
    const t = new Real(localDateTime).getTime();
    if(Number.isNaN(t)) throw new Error('not a date-time: ' + localDateTime);
    off = t - Real.now();
  } };
  class Pinned extends Real {
    constructor(...a){ if(a.length) super(...a); else super(Real.now() + off); }
    static now(){ return Real.now() + off; }
  }
  w.Date = Pinned;
}
