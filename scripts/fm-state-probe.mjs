import { chromium } from 'playwright';
const url = 'https://eiasash.github.io/FamilyMedicine/';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await new Promise(r => setTimeout(r, 5000));
const out = await p.evaluate(() => {
  const counts = {};
  document.querySelectorAll('[data-action]').forEach(e => { const k = e.getAttribute('data-action'); counts[k] = (counts[k] || 0) + 1; });
  const heb = document.querySelector('.heb');
  const firstQText = document.querySelector('.heb')?.innerText?.slice(0, 200) || '';
  return { dataActions: counts, hebFound: !!heb, hebFirstText: firstQText, hasPick: document.querySelectorAll('[data-action="pick"]').length, bodyTextStart: document.body.innerText.slice(0, 400) };
});
console.log(JSON.stringify(out, null, 2));
await p.screenshot({ path: 'C:/Users/User/repos/FamilyMedicine/chaos-reports/upgraded-run/fm-initial-state.png', fullPage: true });
await b.close();
