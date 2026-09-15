# Stage A geriatrics — study console

Single-file, offline-capable study site for the Israeli geriatrics Stage A board exam: 44 sections verified line-by-line against Hazzard's *Geriatric Medicine* 8e, 233 flashcards, 786 real past-exam questions with the committee's answer keys, and a 16-week reading schedule.

**Live:** https://eiasash.github.io/Geriatrics/stage-a/

`index.html` is the site. Progress (adherence log, scores, notes, drill state) lives in the browser's localStorage — use *Pace, display & backup* on the home page to export it before switching devices.

## Guards
```
cd build && npm i jsdom
node test.mjs      # behaviour suite; exits 1 on any FAIL
node audit.mjs     # structural sweep
node facts.mjs     # chapter-verified strings pinned to sections
node sweep.mjs     # opens every section, clicks every link
node dashtest.mjs  # dashboard and table pop-out; exits 1 on a runtime error
node mutants.mjs   # breaks the file on purpose; every mutation must turn its named guard red
```
The page clock is pinned (`build/clock.mjs`) so results do not depend on the day they run. Default is a reading week; `STAGEA_DATE=2027-01-12 node test.mjs` runs the consolidation period, `2026-08-30` the days before the block. CI runs everything in `TZ=Asia/Jerusalem`. `window.__stageaClock.set('2026-10-12T00:00:05')` moves the clock mid-test, which is how the midnight checks cross the day.
Rule: when `facts.mjs` fails, go back to the chapter; never edit the fact to make it pass.

## Reporting a problem
The ⚑ button in the top bar captures the section, position, viewport and last script error; *Open a GitHub issue* pre-fills it in this repo.

## CI
`.github/workflows/stage-a-ci.yml` runs all six guards, the suite at three dates, on every push that touches `stage-a/`. The main app's CI does not scan this folder.
