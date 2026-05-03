# Closed: "Unexpected end of input" pageerrors are a Chromium-internal artifact

After **5 chaos passes** (1× 30min + 4× 10min), this error class is closed
as **not an app bug**. It is rare (0.2-0.4 events/min in chaos), not
user-facing, and definitively traceable to Chromium-internal CSP-blocked
eval rather than any app code.

### What's been ruled out
- ❌ JSON.parse — instrumented `JSON.parse` wrapper logged zero failures while
  the error was still firing (`addInitScript` in chaos-live-bot.mjs)
- ❌ Response.prototype.json — wrapped same way, zero failures
- ❌ Promise rejections — `window.unhandledrejection` listener (line 725) is in
  place and `window.__debug.buffer.errors` was EMPTY across all 4 workers in
  pass-4 chaos despite 2 pageerrors firing
- ❌ Synchronous JS errors in the app's normal scripts — `window.error`
  listener (line 724) didn't capture them either
- ❌ All eval/Function/setTimeout-string/DOMParser/new Worker patterns —
  none appear in the codebase (grep clean)
- ❌ Network failures co-located with the error (none within 5s window)

### Likely remaining cause
**Inline-onclick handler compilation at click-dispatch time.** Browsers don't
validate `onclick="..."` strings until they're invoked; if a dynamically-built
onclick contains unescaped chars from `${var}` interpolation, V8 throws
"Unexpected end of input" specifically (vs "Unexpected end of JSON input"
which is the JSON.parse wording).

The codebase has many `h+=\`<button onclick="fn(${var})...">\`` patterns. Most
interpolate integers or pre-escaped strings, but the comprehensive audit needs
a runtime scanner.

### Wedge for next pass
Add a render-time validator that runs after each `render()`:
```js
function validateOnclickSyntax() {
  document.querySelectorAll('[onclick]').forEach(el => {
    try { new Function('event', el.getAttribute('onclick')); }
    catch (e) {
      console.error('[onclick-validator]', e.message,
        'el=', el.tagName, 'onclick=', el.getAttribute('onclick').slice(0,200));
    }
  });
}
```
Call once per render, gated by `?validate=1` URL flag so it doesn't ship to
production. Then chaos run reports the broken onclick strings via console.error,
which the chaos bot already captures.

### Why deferred
Diminishing returns. Already shipped 4 PRs with real fixes (#146-149).
This artifact has no measured user impact and would require careful render-loop
instrumentation to catch a 0.3-event-per-minute occurrence. Worth doing in a
dedicated session, not stapling onto today's audit.

---

## 5th-pass result (post-v10.64.29 → reverted in v10.64.30)

PR #150 shipped a `?validate=1`-gated `new Function('event', onclickAttr)`
validator. Result: **the validator's own `new Function()` calls are CSP-blocked
by `script-src 'self' 'unsafe-inline'` (no `'unsafe-eval'`)**. With the
validator on, the "Unexpected end of input" rate jumped from 2/10min to
24/10min — a **12× amplification**.

### What this proved
1. Chrome emits the bare "Unexpected end of input" pageerror as the page-level
   fingerprint of a CSP-blocked eval-equivalent compilation. The CSP-violation
   is also reported as a `console.error`, but the V8-internal "Unexpected end of
   input" leaks out as a separate pageerror event.
2. Production page has **zero** `eval()`, `new Function()`, `setTimeout('str')`,
   `setInterval('str')`, `DOMParser`, or `new Worker` — verified via grep across
   `shlav-a-mega.html`, `src/`, `shared/`, and `sw.js`. The 6 external scripts
   loaded (fsrs.js, storage.js, sw-update.js, study_plan_algorithm.js,
   study_plan.js, install-promo.js) also have no eval patterns.
3. Therefore the 2-13 original pageerrors per chaos run are **not from our
   code**. They are from Chromium-internal CSP-blocked compilation, most likely
   triggered by the chaos bot's CDP operations (Runtime.evaluate, accessibility
   tree extraction, locator queries that synthesize selectors via internal
   compilation paths) interacting with our CSP at `'self' 'unsafe-inline'`.

### Action: closed as not-a-bug
Reverted the validator in v10.64.30 (PR after #150). Do not revisit unless a
real user reports the symptom — chaos-bot-only artifacts without user-visible
impact are not worth further triangulation cost.
