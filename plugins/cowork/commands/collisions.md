---
description: Detect file overlap across all active cowork/* branches (tandem-session safety)
---

When two Claudes run cowork branches at the same time, their edits can collide silently until land time. This command surfaces collisions *before* they become rebase conflicts.

1. `git fetch origin --prune`.
2. Enumerate every `cowork/*` branch (local + remote, dedupe). Exclude branches already merged into `main` (`git branch --merged main` + `git branch -r --merged origin/main`).
3. For each active branch, compute its touched-file set: `git diff --name-only origin/main...<branch>`.
4. Build the overlap matrix. A **collision** = file touched by ≥2 active branches.
5. For each collision, capture each branch's last commit date (`git log -1 --format=%cI <branch>`). Oldest first — stale branches should yield.
6. Separately, read every `.cowork/<slug>.md` and extract its **Claimed** section (if present). A file listed as claimed by branch A that another active branch B is editing = **hard warning**, regardless of whether B has committed yet.
7. Large-file hot-spots (`data/questions.json`, `data/flashcards.json`, `data/notes.json`, `shlav-a-mega.html`, `harrison_chapters.json`) are expected to collide; still list them, but tag them `[hot-spot]` so the reader calibrates severity.
8. Output, under 200 words:
   - **Collisions** table: `file | branches | oldest commit | hot-spot?`
   - **Claim violations**: branch B editing paths claimed by branch A.
   - **Recommendation**: which branch should rebase or yield first. Default: newer branch yields to older; a branch in `ready-to-land` status never yields.

Do NOT auto-resolve. This is a reporting tool — the human decides.
