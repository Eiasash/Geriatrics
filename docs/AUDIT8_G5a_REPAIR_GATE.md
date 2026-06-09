# Audit-8 G5(a) — pick-parser robustness hardening (NO self-merge — audit-evidence carve-out)

Pre-registration + implementation record for **G5 trigger (a)**: harden the
chaos-bot's **pick** parser so its `ai-parse-error/pick` DROP channel stops
skewing by exam-era. Branch `claude/term-audit8-g5a-pickparse`. Lane: terminal,
solo. Trinity: **untouched** — scripts/tests/docs only, **no version bump**
(mirrors #235 / the R1.6 / R2 bot-and-analyzer precedent: a bot/lib/test change
that touches no `shlav-a-mega.html` / `sw.js` / `package.json` does not bump the
trinity).

**Parent / trigger.** The CERT RESULT of `docs/AUDIT8_G5_REPAIR_GATE.md`
(2026-06-08) routed `verdict = BIASED` on covariate **`t`** (question
provenance / exam-source-era) for the bot's `ai-parse-error/pick` drop channel,
and named three G5 remediation triggers, each its own gated session:

> (a) pick-side robustness hardening (bot parse resilience);
> (b) retroactive-reach characterization — DOCUMENT, do not auto-rerun;
> (c) audit horizon item 2 (Geri judge max_tokens) stays gated behind the de-bias.

This document is the **(a)** session. It flips **no `q.c`**, changes **no
`broken`** flag, touches **no `shlav-a-mega.html`**, and ships **no fresh
bounded run**. The CERT verdict explicitly scopes the bias to the bot's **read
failure** on certain source surfaces — NOT a content/answer-key defect — so the
fix is a parser change, not a dataset change.

---

## STEP 0 — state (verified on disk)

- `origin/main` HEAD at/after `5c0bf0ea` (the AUDIT8/9 capstone, #352); working
  tree clean at branch cut. The on-disk gate is `docs/AUDIT8_G5_REPAIR_GATE.md`
  (the G5 parent); no prior `AUDIT8_G5a*` doc existed — this authors it.
- Anchors read, not assumed: `scripts/chaos-doctor-bot-v4.mjs` old
  `LETTER_TO_IDX` (was `:239`), `doctorOneQuestion` pick→parse→drop flow
  (`:466`–`:510`), the `'ABCD'[i]` label (`:491`), the `extractJson || {}` +
  drop emit (`:498`–`:505`); `scripts/lib/extractJson.mjs`
  (`classifyExtractFailure`); `scripts/lib/judgeShapeValidator.mjs`
  (`judgeWithShapeRetry`, the mirror target); the existing pin
  `tests/chaosBotV4PickIdentityInstrument.test.js`.

### Fixture-path decision (binding STEP-0 record)

`test -d chaos-reports/v4-long/audit8cert_20260607T205756Z` → **ABSENT** (the
run dir is gitignored and not present in this checkout). Per the FALLBACK below,
STEP 1 **synthesizes** fixtures — one representative per failure class the pick
channel can emit at `maxTokens:250` — rather than ingesting real
`ai-parse-error/pick` rows. The synthetic fixtures are derived from the
documented `classifyExtractFailure` branch taxonomy and the corpus-witnessed
5-option class, so they are not arbitrary.

**§2 FALLBACK (defined here, since this doc authors the G5a gate).** When the
real audit8cert drop rows are not on disk, synthesize one fixture per bucket of
`classifyExtractFailure` (`empty` / `no_brace` / `unbalanced` / `parse_threw` /
`parsed`) **plus** a `parsed-but-bad-field` bucket (extractJson succeeds but the
A–D letter resolve fails). Because the synthesizer controls what is "shown,"
the fix ships only levers each of which is **independently justified by a
disk-witnessed fact** (the corpus option-count distribution, the documented
branch taxonomy), not by the synthetic fixture alone.

---

## STEP 1 — diagnosis (bucket × cause; precedes the fix)

The pick channel's drop is `ai-parse-error/pick`, emitted when the old inline
parse —

```js
const pickJson = extractJson(pickResp.text) || {};
const aiLetter = String(pickJson.pick || '').trim().slice(0, 1);
const aiIdx = LETTER_TO_IDX[aiLetter];          // 4-letter table: A–D only
if (aiIdx == null || aiIdx < 0 || aiIdx >= q.options.length) { /* DROP */ }
```

— resolves no in-range index. Bucketing synthetic fixtures by
`classifyExtractFailure` (+ the `parsed-but-bad-field` bucket) and running the
OLD parser over each:

| fixture | optCount | classifyExtractFailure | parsed-but-bad-field? | OLD parser |
|---|---:|---|---|---|
| `{"pick":"C","confidence":80}` | 4 | parsed | no | idx 2 ✓ |
| ```{"pick":"C","confidence":8``` (truncated) | 4 | **unbalanced** | no | **DROP** |
| `{"pick": C, "confidence": 80}` (unquoted) | 4 | **parse_threw** | no | **DROP** |
| `pick: B — heart failure` | 4 | **no_brace** | no | **DROP** |
| ` `` ```json\n{"pick":"D"}\n``` `` (fenced) | 4 | parsed | no | idx 3 ✓ |
| `{"pick":"E","confidence":70}` | **5** | parsed | **YES** | **DROP** |
| `{"pick":"ה"}` | **5** | parsed | **YES** | **DROP** |
| `C` (bare) | 4 | no_brace | no | **DROP** |
| `{"pick":3}` (numeric) | 4 | parsed | YES | **DROP** (correct — must not coerce) |
| `` `` (empty) | 4 | empty | no | **DROP** |

**bucket × `t` cross-tab:** not produced — real rows absent, so there is no `t`
to cross-tab. The provenance link is established structurally instead (below).

**The era-skew mechanism, disk-witnessed (not inferred from synthetic data).**
`data/questions.json` option-count distribution: **`{4: 4259, 5: 38}`**, max `c`
index = 4. All 38 five-option questions are GRS8 imports — a **distinct `t`
provenance**. The old `LETTER_TO_IDX` table maps only A–D, and the old `'ABCD'[i]`
prompt label produces `undefined` for the 5th option (`i=4`). So a model that
correctly answers "E"/"ה" on a 5-option GRS8 question is **systematically
dropped** by the old parser — a provenance-correlated drop, exactly the shape of
the CERT's `BIASED`-on-`t` verdict. This is the concrete, corpus-grounded link
between the pick parser and the era skew.

---

## STEP 2 — the fix (minimal; only disk-justified levers)

**Lever 1 — layered parser + corrective retry** (recovers `unbalanced` /
`parse_threw` / `no_brace` / bare-letter; routes `empty`/numeric to retry).
`scripts/lib/pickParse.mjs`:

- `parsePickLetter(text, optCount) → { letter, idx } | null`. Three layers:
  (1) `extractJson` then `pick ?? answer ?? choice`, first-char normalized,
  mapped via a letter→idx table **built to `optCount`** (A.. + a.. + Hebrew
  א..); (2) keyed-regex fallback `/pick["'\s:]+["']?([A-Da-fא-ו])/i` (keyed on
  `pick` ONLY — `answer`/`choice` recur in prose and would false-match, e.g.
  "the **a**nswer **c**ould be …"; those aliases stay supported by the JSON
  layer); (3) a single-unambiguous bare-letter scan, scoped to short (≤4-char)
  responses so it cannot mis-fire on the `c` inside `"pick"` or a stray prose
  vowel. **Numeric picks are NOT coerced** — a bare number is ambiguous (0- vs
  1-based, display vs canonical) → returns null → caller retries.
- `pickWithShapeRetry({ system, userPrompt, callClaude, maxTokens, optCount })`
  mirrors `judgeWithShapeRetry`: one call; if `parsePickLetter` is null, exactly
  ONE corrective retry appending a terse `JSON only: {"pick":"<letter>"}`
  reminder; parse again. Returns `{ idx, letter, recovered, obj }` on success,
  `{ failed:true, reason:'api-error', message }` if the first call throws (no
  retry — mirrors the judge validator), or `{ failed:true, reason:'parse', raw }`
  on a post-retry hard-fail. `callClaude` is an injected parameter
  (unit-testable, no API / no playwright).

**Lever 2 — `letterFor(i)`** (the optCount/label-space lever — **justified by
the 38 five-option corpus Qs**). Replaces the hardcoded `'ABCD'[i]` at the pick
prompt (`:491`) and the two judge/explain prompt option lists (`:591`, `:633`).
This is the only judge-side touch — a labeling-correctness fix (5-option labels
now render `E`), not a channel change. The judge prompt's adjudication logic and
schema are untouched.

**Lever NOT shipped — pick `maxTokens` bump.** The `unbalanced` (truncation)
bucket appears, but the keyed-regex (Layer 2) recovers the pick token from
truncated output, and the corrective retry is the backstop. Raising the pick
budget is therefore unnecessary; `maxTokens` stays `250`. (Per STEP-1's
"ship only the levers this shows" — truncation is recovered without more budget.)

### Bot wiring

`scripts/chaos-doctor-bot-v4.mjs` `doctorOneQuestion`: the `:498`–`:505` inline
pick/parse is replaced by `pickWithShapeRetry`. The terminal
`ai-parse-error/pick` drop row now fires **only after the retry**, with a
**byte-identical schema** (`type`/`context`/`dropCtx`/`text`/`stemHash`/`qIdx`/
`stem`/`optCount`). The `ai-error/pick` row (API throw) is preserved for the
`api-error` branch. The old `LETTER_TO_IDX` const (only used at the replaced
site) is removed.

### §3.1 schema-invariance — PRESERVED

The `ai-parse-error/pick` bug-row keeps every pre-G5a field, byte-stable; the
only change is *when* it fires (post-retry) and *where* its `text` comes from
(`pickResult.raw`). Pinned by `tests/chaosBotV4PickIdentityInstrument.test.js`
(unchanged, green) and re-asserted in `tests/pickParseResilience.test.js`.

---

## STEP 3 — harness (the deliverable)

`tests/pickParseResilience.test.js` (vitest):

1. **RED-proof.** The OLD logic (`extractJson || {}` →
   `LETTER_TO_IDX[pick.slice(0,1)]`), replicated verbatim, returns null (DROP)
   on every recoverable bucket — including the gate's named `unbalanced`
   truncation anchor. (The harness is only trusted if the old path genuinely
   fails.)
2. **GREEN.** `parsePickLetter` recovers a valid in-range idx for every
   recoverable bucket; `pickWithShapeRetry` exercises the retry path with an
   injected fake `callClaude` (recover-on-retry, no-retry-on-first-parse,
   api-error-no-retry, both-fail-hard, numeric-triggers-retry).
3. **Schema-invariance + wiring pins** assert the bot routes through
   `pickWithShapeRetry`, the old `LETTER_TO_IDX` is gone, option lists use
   `letterFor(i)`, and the terminal drop row keeps its byte-stable schema.

`tests/chaosBotV4PickDropInvariant.test.js` was **consciously updated** (not
silently): its invalid-pick-DROPs-before-`disagrees` invariant is unchanged, but
the gate's syntactic anchor moved from `if (aiIdx == null …)` to
`if (pickResult.failed)` (the range check is now encoded inside
`parsePickLetter`). The rationale is documented in that file's header.

**Recovery-rate threshold:** N/A — real rows absent, so no recovery-rate
assertion is made (only the per-bucket recover/decline contract). A future
session with the real audit8cert drop rows can add the rate assertion + the
bucket×`t` cross-tab.

---

## STEP 4 — verify

`npm run verify` green (trinity untouched — no `shlav-a-mega.html` / `sw.js` /
`package.json` change, so no version bump and `changelogDrift` stays green). The
new `tests/pickParseResilience.test.js` and the existing
`tests/chaosBotV4PickIdentityInstrument.test.js` both pass; all 13 chaosBotV4
test files pass.

---

## SCOPE / OUT OF SCOPE

- **IN:** the bot pick-parser (`pickParse.mjs`) + the `letterFor` label fix + the
  resilience harness + the gate-doc update for the moved invariant anchor.
- **OUT:** any fresh bounded run (this is offline-validatable — fixtures +
  injected `callClaude`, no live run, no `$` spend); flipping any `q.c`; changing
  any `broken` flag; touching `shlav-a-mega.html`; the G5 (b)/(c) triggers
  (their own gated sessions); widening the pick `maxTokens`.

## SHIP

Branch `claude/term-audit8-g5a-pickparse` → PR to `main`. **NO self-merge** —
`docs/AUDIT8*` is an audit-evidence path. CI green + Codex review (cross-model
independence) → **Eias merges**. This PR opening is the un-hold trigger.

---

## EXECUTION RECORD — appended 2026-06-09 (post-merge; append-only marker, no retro-edits above)

**Shipped:** PR **#355** (`9fac2de`, Eias-merged after CI green incl. `claude-review`) +
follow-up PR **#356** (`b158f68`, Eias-merged, same gates). Conformance verified against
the merged artifacts, not the PR narration:

| Gate clause | Outcome | Witness |
|---|---|---|
| §2 D0 fixture path | FALLBACK (CERT ledger dir absent on run machine) — synthesized fixtures per bucket; bucket×`t` cross-tab structurally established (38/38 five-option Qs are GRS8, `{4: 4259, 5: 38}`) | #355 body STEP-0/1; `data/questions.json` |
| §3 module + retry | `scripts/lib/pickParse.mjs` — layered parse, optCount-sized letter table, numeric NOT coerced (routes to retry), EXACTLY ONE corrective retry, `callClaude` injected | `pickParse.mjs:24,62,71,130` |
| §3 levers conditional on D0 | `letterFor(i)` shipped (justified by the 38-Q witness; used at pick/judge/explain prompts — the judge touch is labeling-only); pick `maxTokens` bump DECLINED, stays 250 | `chaos-doctor-bot-v4.mjs:500,605,647,506` |
| §3.1 schema invariance | `ai-parse-error/pick` row byte-stable; `tests/chaosBotV4PickIdentityInstrument.test.js` UNTOUCHED since #235 (15 field pins green) | `git log -- tests/chaosBotV4PickIdentityInstrument.test.js` |
| §4.A RED-proof | OLD inline parse replicated verbatim in the harness and shown to drop every recoverable bucket; GREEN recovery incl. exercised retry path | `tests/pickParseResilience.test.js:26-66` |
| §6 merge discipline | NO self-merge honored — both PRs Eias-merged after CI green | #355 / #356 merge metadata |

**Recorded deviation (the reason #356 exists):** the §3 pre-registered scope made the
option LIST E-aware (`letterFor`) but did not name the `SYS_DOCTOR_PICK` contract text,
which still mandated `"pick":"A"|"B"|"C"|"D"` — a compliant model was instructed never to
answer E, so correct-E suppression on the 38 GRS8 questions survived at the PROMPT layer
(Codex P2 on #355, `discussion_r3383678131`). #356 extended the contract to "exactly the
letters shown" (A–D, or A–E when a fifth option is rendered) + Hebrew `א/ב/ג/ד/ה`,
pinned by `tests/chaosBotV4Persona.test.js` (incl. a ratchet against the strict A–D enum
returning). Range safety unchanged — `buildLetterTable` is optCount-sized, so an
out-of-range E still fails resolution → retry/drop. This is a pick-side completion of the
pre-registered `letterFor` lever justified by the same disk witness, recorded here rather
than silently absorbed.

**§4.B status: UNCHANGED — deferred.** The bounded re-cert run remains gated on an
explicit $-decision (≤$20 cap), requires a frozen corpus snapshot with `data-qidx`
capture, and its pre-registered criterion stands as written above. Criterion A is the
evidence the mechanism is fixed; no `REPRESENTATIVE` claim is made or implied here.
G5 triggers (b)/(c) remain their own gated sessions.
