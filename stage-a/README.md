# Stage A geriatrics — study console

Single-file, offline-capable study site for the Israeli geriatrics Stage A board exam: 44 sections verified line-by-line against Hazzard's *Geriatric Medicine* 8e, 233 flashcards, 786 real past-exam questions with the committee's answer keys, and a 16-week reading schedule.

**Live:** https://eiasash.github.io/Geriatrics/stage-a/

`index.html` is the site. Progress (adherence log, scores, notes, drill state) lives in the browser's localStorage — use *Pace, display & backup* on the home page to export it before switching devices.

## Guards
```
cd build && npm i jsdom
node test.mjs      # 192 checks
node audit.mjs     # structural sweep
node facts.mjs     # 85 chapter-verified strings pinned to sections
node sweep.mjs     # opens every section, clicks every link
```
Rule: when `facts.mjs` fails, go back to the chapter; never edit the fact to make it pass.

## Reporting a problem
The ⚑ button in the top bar captures the section, position, viewport and last script error; *Open a GitHub issue* pre-fills it in this repo.

## CI
`.github/workflows/stage-a-ci.yml` runs the five guards on every push that touches `stage-a/`. The main app's CI does not scan this folder.
