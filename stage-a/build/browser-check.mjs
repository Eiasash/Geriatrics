/* Real-browser gates — the checks jsdom cannot run at all, because they depend on things jsdom
   does not implement: `em`/`calc()` font-size resolution against a real viewport (with whatever
   font-boosting a real mobile UA applies), and CSS transitions actually animating over time.
   test.mjs's computed-style reads are instantaneous in jsdom — set a class, read the style, done
   — so a rule that only differs in what happens BETWEEN the start and end of a transition is
   invisible to it no matter how the check is written on that side.

   Mirrors audit.mjs's own gate contract (check(label, value, isBad), one summary "FAIL: a, b"
   line, exit 1 if anything failed) so mutants.mjs's existing 'audit' dispatch works for this
   file too under runner 'browser' — same shape, different engine underneath.

   Requires the `playwright` package and a Chromium binary (see PLAYWRIGHT_BROWSERS_PATH). Not
   part of the jsdom-based guards job; runs as its own CI job. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { logRun } from './ledger.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || '../index.html';
const url = 'file://' + path.resolve(HERE, SRC);

const p = [], fail = [];
function check(label, value, isBad){ p.push([label, value]); if(isBad) fail.push(label); }

/* headless_shell (Playwright's default headless mode since 1.4x) is a separate download from
   the full Chromium binary and isn't guaranteed present everywhere this runs; the full binary
   is what CI's setup step installs (see stage-a-ci.yml), so launch it explicitly rather than
   let Playwright pick a headless-shell revision that may not be there. */
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
try{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(url);
  await page.waitForLoadState('domcontentloaded');
  /* .disp appears twice — the nav-page copy (hidden under 900px, mobile shows the #dispPop
     popover copy instead) and the popover's own copy. Read whichever is actually laid out,
     not just the first match, or this reads a display:none element's font-size on the exact
     viewport this check exists to cover. */
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.disp')].some(el => el.offsetParent !== null));

  /* ---- XL text-size actually scales the reading UI, at a real mobile viewport ----
     jsdom's getComputedStyle resolves calc(12.5px*var(--fs,1)) as a literal string
     ("0.85em" in one earlier probe) and never as a resolved px value, at any --fs. It cannot
     tell an XL page from a default one. A real engine also applies mobile text-size-adjust
     boosting on top of the CSS math (measured: 12.5px*1 -> 13.6px rendered, not 12.5px), which
     is exactly why this has to be read from a real browser rather than computed by hand from
     the stylesheet — the boost factor is the engine's, not the page's. */
  const readVisibleDispSize = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.disp')].find(x => x.offsetParent !== null);
    return parseFloat(getComputedStyle(el).fontSize);
  });
  const defaultSize = await readVisibleDispSize();
  await page.evaluate(() => document.body.classList.add('fs-xl'));
  const xlSize = await readVisibleDispSize();
  const ratio = xlSize / defaultSize;
  check('XL text size actually renders larger than default, at a real mobile viewport',
    defaultSize.toFixed(2) + 'px -> ' + xlSize.toFixed(2) + 'px (ratio ' + ratio.toFixed(2) + ')',
    !(ratio > 1.3 && ratio < 1.5)); // --fs goes 1 -> 1.4; a 30-50% band, not an exact float compare
  /* The ratio alone is blind to a mutation that scales BOTH sizes down by the same linear
     factor (found while red-testing this file: rewriting #week .disp's em multiplier from
     .85em to .5em collapses the reading text to nearly nothing at every text-size setting, and
     the ratio check alone reports it clean, because 8.00 -> 11.20 is still exactly 1.40x). The
     ratio only proves XL is bigger than default; it says nothing about whether either one is a
     readable size to begin with. Pin the floor too, not just the relationship. Measured at
     13.6px on the untouched file; the floor is set below the observed size, not at it, so a
     legitimate future redesign of this row's size doesn't itself trip this check. */
  check('the default reading size has not collapsed toward unreadable, independent of the ratio',
    defaultSize.toFixed(2) + 'px',
    !(defaultSize > 10));
  await page.evaluate(() => document.body.classList.remove('fs-xl'));

  /* ---- the jump row is VISIBLE BUT DEAD during its fade-out, not "tappable for longer" ----
     .jumprow{opacity:1;transition:opacity .18s ease} and .jumprow.fade{opacity:0;
     pointer-events:none} together mean: adding .fade starts opacity animating toward 0 over
     .18s, while pointer-events snaps to none on the SAME frame (pointer-events is not a
     transitionable property here — it is not listed in the transition, so there is no
     property to animate). The reader sees the control still on screen, fully or partly
     opaque, for up to .18s (or however long a future edit sets it to) — and it has already
     stopped accepting taps for the whole of that window. That is a visible-but-dead control,
     not a "stays tappable" one; the earlier framing had that backwards. jsdom never renders a
     transition at all, so it jumps straight to the end state and can't see this window exists
     regardless of the duration — a mutation that stretches .18s out to something a reader
     would actually notice is invisible to it either way. */
  await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
  const mid = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => {
    const row = document.getElementById('jumpRow');
    const cs = getComputedStyle(row);
    res({ opacity: parseFloat(cs.opacity), pointerEvents: cs.pointerEvents });
  })));
  check('the fading jump row is visible-but-dead mid-transition, not tappable for longer',
    'opacity=' + mid.opacity + ' pointer-events=' + mid.pointerEvents,
    !(mid.opacity > 0 && mid.pointerEvents === 'none'));

  logRun('browser-check.mjs', { file: SRC, checks: p.length, failures: fail.length,
    failed: fail, verdict: fail.length ? 'fail' : 'pass', completed: true, engine: 'chromium' });
  p.forEach(([k, v]) => console.log((k + ':').padEnd(38), v));
  if(fail.length){ console.log('FAIL:', fail.join(', ')); process.exitCode = 1; }
}finally{
  await browser.close();
}
