# Audit-8 — instrument PRE-STEP (pick-channel + comparator stemHash identity) — GATE

Append-only; do not retro-edit (`feedback_spec_provenance_append_only`).
Lane: terminal, solo (`claude/term-audit8-prestep-stemhash`, cut from
`origin/main` HEAD `7260bdb`). Trinity: **untouched** — `scripts/` +
`tests/` + `docs/` only, **no bump** (mirrors audit-5's fix PR and the
Option-0 instrument PR #231: an instrument precursor that ships no
exam/product content does not bump the version trinity).

**Binding pre-registration is NOT this doc.** It is the merged, locked
`docs/AUDIT8_PRE_REGISTERED_GATE.md` (#233, `7260bdb`), authored before
any run, whose **G0** + **DELTA D4** pre-registered *exactly* what this
PRE-STEP must do. This doc is the PRE-STEP's execution record: STEP 0,
the deterministic predicates G0/D4 are made literal as, the RESULT, and
the cross-lane reconciliation the next (bounded-run) session inherits.
The merged gate's own activation order is binding:
**G0 PRE-STEP PR → re-pass STEP 0.2 → bounded run (G1–G5) → RESULT**.
This session lands the PR; it does **not** run the bounded analysis (it
cannot — the run is gated behind this PR being merged on `main` and a
STEP 0.2 re-pass, and self-merge is forbidden).

---

## STEP 0 (distrust contract) — results

- **0.1 State.** `git fetch --all`; `origin/main` HEAD = `7260bdb`
  (#233 squash-merged — the AUDIT8 representativeness PRE-REGISTERED GATE
  + the parked DROP-invariant ride-along). `docs/AUDIT8_PRE_REGISTERED_GATE.md`
  present on `main`; `tests/chaosBotV4PickDropInvariant.test.js` present
  on `main` (#233 ride-along). Local `main` fast-forwarded
  `dac09e2 → 7260bdb` before branching (stale-local-main trap avoided).
  Untracked `docs/AUDIT7_HORIZON1_kickoff.md` is a prior parked artifact
  superseded by the merged AUDIT8 gate — **out of scope, left untouched,
  not staged** (Working Rule 3). ✅

- **0.2 Concurrent lane.** One open PR: **#234**
  (`claude/web-rm-stale-supabase-migrations`) — the web lane's cosmetic
  removal of the vestigial `supabase/migrations/` dir. It touches no bot
  / `scripts/lib/` / test file. **Not collided with, not reinvented, not
  merged** (other lane's). This PRE-STEP branch cut from `main`, not from
  #234. → solo terminal lane; branch + PR, **no self-merge** (the
  #230/#231 self-merge was a discrete explicit user instruction, not a
  precedent — merged gate SHIP clause). ✅

- **0.3 Baseline green (pre-edit).** Inherited from #233 close: full
  suite green on `main`. The GUARD `tests/chaosBotV4PickDropInvariant.test.js`
  re-confirmed **5/5 green after the instrument edits** (the load-bearing
  re-run — the instrument adds fields to the `:466` drop row and the
  `finding` object but does not touch the `disagrees` gate/compute, and
  the GUARD proves it). ✅

- **0.4 Inputs — supplied, not reconstructed.** The merged gate's append
  (lines 431–437) named two fresh-eye-lane scripts as PRE-STEP **inputs**
  ("not committed in this docs+test PR, and not pre-spec'd now"). At
  session start they were absent from disk / all branches / stash /
  gitignored paths (web lane's clone never synced). The user then
  supplied four web-lane artifacts: `AUDIT8_PICK_REPRESENTATIVENESS_GATE.md`
  (web-draft @ `fedf27e`), `INSTRUMENT_PATCH.md`, `build_stemhash_index.mjs`,
  `analyze_pick_representativeness.mjs`. The web-draft gate doc (its line
  5) explicitly assigns **terminal = fresh-eye reviewer, review required
  before STEP 1** — this session performed that filesystem-grounded
  review against the merged authoritative gate + live bot source + the
  live corpus (workspace CLAUDE.md "Fresh-eye filesystem-grounded review"
  default, fired as designed). Outcome of that review → §"Reconciliation"
  below. None of the four web-lane artifacts is committed to the repo
  (the merged gate's "Single doc — no second gate doc" warning; the
  scripts are Phase-2 inputs, not PR artifacts). ✅

---

## The instrument gap (re-verified from source at `7260bdb`, deterministic — no run)

The merged gate's STEP 0.2 + D4 established this; re-verified line-by-line:

- `:450` `const stemHash = hashStem(q.stem)` — bot hashes the **full**
  stem. djb2 is collision-free over the corpus (3586 distinct hashes =
  3586 unique stems).
- `:458` `ai-error/pick` (network/throw before parse) drop row, `:466`
  `ai-parse-error/pick` (the ~11% drop this whole audit is about) drop
  row — both `log.bugs.push` rows carried **no question identity** (`text`
  on `:466` is the model's *failed response*, not the question).
- pre-pick early return (`!q || q.options.length < 2`) — **no ledger row
  at all**; `extractQuestion`→null was invisible.
- `recordFinding`'s `finding` object (`:695-708`) stores
  `stem: q.stem.slice(0,300)` **truncated**, **no stemHash**; 1713/3743
  (46%) of stems exceed 300 chars (D4) — the truncated slice is *not* a
  faithful join key and the full-stem hash is **not reconstructable**
  from it. The appIdx-null methodology `recordFinding` (`:524`) likewise
  had no stemHash.

Consequence (merged gate G0): the dropped population's covariates are
unrecoverable and the comparator's join key is fragile for ~46% of rows
→ the representativeness run is **NOT runnable on the current instrument**.
This PRE-STEP closes that gap on **both sides**, keyed on one identical
hash.

---

## Fix class (pre-decided by merged gate G0 + D4; locked)

Minimal two-sided identity instrument. Product code = `scripts/` +
`tests/`; **no trinity bump**.

1. **Shared single-source-of-truth hash** — new `scripts/lib/hashStem.mjs`
   exporting `hashStem` (the bot's djb2, verbatim) + `normStem`
   (whitespace-collapse). Bot imports it; the inline djb2 (old `:160-165`)
   is deleted; both bot hash sites use `hashStem(normStem(q.stem))`.
   **Rationale (load-bearing; the corpus fact the no-run merged gate G0
   could not see — exactly the class its DELTAS mechanism absorbs):** the
   bot hashes a DOM-scraped stem (`extractQuestion` → `.heb` innerText:
   whitespace-collapsed, markup-dropped); the offline join hashes the
   dataset `q` string. A raw djb2 of the two will **not** match → the
   merged gate's D3 per-covariate determinate join (≥99%) is
   *structurally impossible* without normalizing both sides. Sibling to
   `scripts/lib/extractJson.mjs` / `optionResolver.mjs` (the repo's
   established `scripts/lib/` shared-helper pattern). Stuck-refresh
   semantics preserved (same stem → same normalized hash).
2. **`:466` `ai-parse-error/pick` (PRIMARY)** — add `dropCtx:
   'pick-parse-error'` + `stemHash` + `stem: q.stem.slice(0,300)` (mirrors
   `recordFinding`) + `optCount: q.options.length`. Exactly the merged
   gate G0 field set (the web `INSTRUMENT_PATCH.md` added `stemHash` only
   — superseded; merged gate wins).
3. **`:458` `ai-error/pick`** — add `stemHash` + distinct `dropCtx:
   'pick-ai-error'` (merged gate G4.1: reported separately, not in the
   parse-drop numerator).
4. **Pre-pick early return** — add a distinct, **EXCLUDABLE** tagged row
   `type:'pre-pick-skip', context:'pick', dropCtx: 'pre-pick-short-extract'
   | 'pre-pick-no-question'` (merged gate G0: "Tag these with a distinct
   sub-context so the analysis can *exclude*"). `type` deliberately ≠
   `ai-*` so the analyzer's DROPPED filter (`type∈{ai-parse-error,ai-error}
   ∧ context==='pick'`) excludes it by construction. Return shape
   (`stemHash:null`) unchanged → stuck-refresh untouched (Working Rule 3).
   Plus a `log.extractNull` denominator counter (web `INSTRUMENT_PATCH.md`
   Change 6 — honest-denominator hygiene, not analyzed for bias).
5. **`:524` appIdx-null `recordFinding`** — add `stemHash`. **Deliberate
   one-row extension of D4's literal `:695-708` scope (Working Rule 1,
   surfaced not buried):** this methodology row *passes* the `:465` pick
   gate but never reaches the judge, so it is neither DROPPED nor JUDGED;
   without `stemHash` it is analyzer-**unjoinable** and the merged gate
   G4.1 exclusion bookkeeping degrades **silently**. One identical field;
   removes a silent-degradation class. (Advisor-endorsed.)
6. **`:697` main `finding`** — add `stemHash` (merged gate D4 comparator
   side).

---

## THE DETERMINISTIC PREDICATES (made literal from merged gate G0/D4)

### P1 — Shared hash determinism + normalization
`scripts/lib/hashStem.mjs`: `hashStem('')==='5381'`, `hashStem('a')==='177670'`
(hand-verified djb2), unicode-stable, idempotent; `normStem` collapses
whitespace so a DOM-scraped stem and the dataset `q` hash equal;
`normStem` is null/undefined-safe (never throws). **TARGET: all vectors
exact.**

### P2 — Two-sided field presence (source-pinned to the producer)
DROP side: `:466` row carries `dropCtx:'pick-parse-error'` + `stemHash`
+ `stem(0,300)` + `optCount`; `:458` row carries `dropCtx:'pick-ai-error'`
+ `stemHash`; pre-pick row is a distinct excludable type with both
`pre-pick-*` sub-contexts + the `extractNull` counter wired. JUDGED side:
the `finding` object and the appIdx-null `recordFinding` both carry
`stemHash`. Bot imports `hashStem`/`normStem` from the shared module and
the inline djb2 is gone; every bot stem hash is `hashStem(normStem(q.stem))`
(no raw `hashStem(q.stem)` survives). Pinned by
`tests/chaosBotV4PickIdentityInstrument.test.js`. **TARGET: all
assertions green.**

### P3 — Regression integrity (additive-change proof)
The GUARD `tests/chaosBotV4PickDropInvariant.test.js` stays **5/5** (the
`disagrees` gate/compute is untouched). Full `chaosBotV4*` family green
(judge/bucket-rule shapes unperturbed — only `context:'pick'` rows
edited). Full `npm run verify` green; **trinity untouched** (no bump).

### Guard-regex widening (in-PR, documented — not a silent loosen)
The GUARD's `INVALID_PICK_GATE` body bound was `[\s\S]{0,200}?`. The
G0-mandated `:466` field set grew the gate body from a measured **120 →
215** chars (the fields were minted *after* that assert was written).
Widened **200 → 300** in the same PR, with the rationale inline in the
test: the invariant the regex pins is **lexical ordering** (the gate's
early `return` precedes the `disagrees` compute — assert 2 enforces the
ordering independently via offset comparison), **not** body length; 300
covers 215 with margin while still tripping on a genuinely large logic
insertion between gate and return. This is a *documented bound
adjustment to preserve the load-bearing invariant under a pre-registered
field addition*, not a post-hoc predicate loosening.

## TRIP CONDITION
If P1 vectors are inexact, **or** any P2 assertion is absent, **or** P3
regresses (GUARD ≠ 5/5, any `chaosBotV4*` red, `npm run verify` red, or a
trinity bump) → **STOP and report.** Do not ship a partial; do not loosen
a predicate post-hoc.

---

## Reconciliation surfaced for the bounded-run session (inherit, don't re-derive)

The four web-lane inputs were authored at `fedf27e`, **before** #233's
DELTAS locked the spec. They diverge from the merged authoritative gate.
**The merged `AUDIT8_PRE_REGISTERED_GATE.md` (#233) is binding; the
web-lane artifacts are adaptable inputs. Where they diverge, the merged
gate wins** (brief: "run against [the merged gate], do not re-litigate
it"; gate: "the data does not get to reshape it").

**A. PRE-STEP scope (resolved this session — merged G0 implemented):**
`INSTRUMENT_PATCH.md` added `stemHash`-only on `:466` and a plain counter
on the pre-pick path. Merged gate G0 requires `stem`+`optCount` on `:466`
and a *tagged distinct sub-context* (excludable) on pre-pick / `:458`.
This PRE-STEP implements the **merged G0** set (the patch's
`normStem`/shared-module idea is kept — it is the one load-bearing thing
the no-run merged gate missed).

**B. Bounded-run analysis (Phase 2 — NOT this session; scripts need
adaptation before STEP 0.2 re-pass authorizes the run):** the supplied
`build_stemhash_index.mjs` + `analyze_pick_representativeness.mjs`
implement the *superseded* web-draft G4, not merged G4. Concretely:

| Axis | Merged gate (BINDING — #233 G4 + D1/D2/D3) | Web-draft scripts (superseded input) |
|---|---|---|
| Covariates | **6**: `stem_len`, `topic`(12 TOPIC_GROUPS), `bilingual`, **`year`=`t` categorical** (D1, χ² + <5 pooling), `c_accept`, `broken` (+`N_broken_served` vacuity check) | **5**: `stem_length_tercile`, `bilingual`, `c_accept`, `broken`, **`chapter`**; `year` **dropped**; no topic-groups |
| `stem_len` test | Mann–Whitney U + **Cliff's δ** (floor \|δ\|≥0.15) | tercile → χ² |
| Categorical floors | **Cramér's V ≥ 0.10** effect-size floor (G4.4) | none |
| Verdict | **4-way** (BIASED / DETECTABLE-BUT-NEGLIGIBLE / REPRESENTATIVE / INCONCLUSIVE) + logistic **sensitivity** | 3-way (YES / NO / INCONCLUSIVE) |
| Join (G3) | **per-covariate determinate ≥99%** (D3) | global ≥90% |
| Min-N (G2) | **N_drop≥80 ∧ N_retain≥200** | DROPPED≥100 |
| Run cfg (G2) | 1 worker, `claude-sonnet-4-6`, `CHAOS_USE_PROXY=1`, 8 h, `CHAOS_COST_CAP_USD=20`, fresh `chaos-reports/v4-long/audit8_<ts>/` | (web-draft equivalents, mostly aligned) |

Phase-2 work: adapt the two scripts to the merged G4 (add `topic`-12 +
`year`=`t`-categorical, drop or demote `chapter` to descriptive,
swap stem_len to MW-U + Cliff's δ, add the V≥0.10 / |δ|≥0.15 floors +
4-way verdict + logistic sensitivity, per-covariate ≥99% join, the
80/200 N gate, `N_broken_served` vacuity). The proxy secret is fetched
per session (workspace CLAUDE.md — never hard-code; it rotates). This is
a "major workstream verdict"-shaped artifact → workspace fresh-eye
filesystem-grounded review applies to the bounded-run RESULT.

## OUT OF SCOPE (handed off untouched)

- **The bounded run itself** — gated behind this PR merged on `main` +
  STEP 0.2 re-pass. Separate session.
- Committing any web-lane artifact to the repo (the merged gate's
  "single doc" discipline; scripts are Phase-2 inputs).
- Horizon **item 2** (Geri-side judge `max_tokens` bump) — moot if the
  bounded run returns BIASED; its own session/gate.
- **B4 content adjudication.** No `q.c` flip, `broken` change, distractor
  regen. Toranot untouched.
- PR #234 (web lane's cosmetic `supabase/migrations/` cleanup).

<!-- RESULT appended post-implementation, append-only, below. -->

---

## [2026-05-18, appended post-implementation] RESULT — all 3 predicates met, TRIP NOT met

Append-only. Instrument: `scripts/lib/hashStem.mjs` (new shared SSOT);
`scripts/chaos-doctor-bot-v4.mjs` (inline djb2 deleted → shared import;
`hashStem(normStem(q.stem))` both paths; `dropCtx`+`stemHash` on
`:458`/`:466`, `stem(300)`+`optCount` on `:466`; distinct excludable
pre-pick row + `log.extractNull`; `stemHash` on the `:524` and `:697`
`recordFinding` objects). Guard widened 200→300 (documented). Pin:
`tests/chaosBotV4PickIdentityInstrument.test.js` (15 assertions).

- **P1 — MET.** djb2 vectors exact (`''→5381`, `'a'→177670`),
  unicode-stable, idempotent; `normStem` whitespace-collapse +
  null/undefined-safe.
- **P2 — MET.** Two-sided field presence source-pinned: `:466`
  `dropCtx:'pick-parse-error'`+`stemHash`+`stem(0,300)`+`optCount`;
  `:458` `dropCtx:'pick-ai-error'`+`stemHash`; distinct excludable
  `pre-pick-skip` row (both `pre-pick-*` sub-contexts) + `extractNull`
  counter; `finding` + appIdx-null `recordFinding` both carry `stemHash`;
  shared-module import present, inline djb2 gone, no raw
  `hashStem(q.stem)` survives.
- **P3 — MET (additive).** GUARD `chaosBotV4PickDropInvariant` **5/5**
  green post-edit (the `disagrees` gate/compute is untouched — verified
  by the GUARD, not asserted). Full `chaosBotV4*` family **11 files /
  122 tests** green (judge/bucket-rule shapes unperturbed). Full
  `npm run verify`: **77 files / 1441 passed + 7 skipped**, all 7
  non-vitest checks green; **trinity untouched at v10.64.130** (no bump
  — scripts/tests/docs only, correctly mirrors audit-5).

**TRIP CONDITION NOT MET.** No predicate failed; no falsification. Clean
instrument-precursor ship. The bounded run remains **gated** behind this
PR merging to `main` + a STEP 0.2 re-pass per the merged gate's binding
activation order — it is the explicit next session, with the §
"Reconciliation B" Phase-2 script adaptation as its inherited starting
context.
