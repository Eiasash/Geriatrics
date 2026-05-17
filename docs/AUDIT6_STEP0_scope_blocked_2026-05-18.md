# Audit-6 — chaos-doctor-bot v4 judge OUTPUT-CONTRACT — STEP-0 SCOPE-BLOCKED

**Date:** 2026-05-18 · **Branch:** `claude/term-audit6-judge-output-contract`
(solo terminal lane) · **Spend:** $0 (no chaos run; STEP-0 make-or-break
pre-flight resolved the outcome from source) · **Trinity:** untouched at
v10.64.130 — **docs-only** (thinner than audit-5's scripts+tests+docs:
no fix shipped because the fix the brief scopes is a no-op in the
practical run mode; see §3).

Tracked report of record (clone-visible). Append-only; do not retro-edit
(`feedback_spec_provenance_append_only`). This is the audit-6
pre-registered gate — written **after** the STEP-0 proxy verdict because
the brief states the fix shape depends on it
(`docs/AUDIT6_judge_output_contract_kickoff.md` §"PRE-REGISTERED GATE"),
and the verdict is **blocked at the make-or-break pre-flight**. Audit-5's
gate (`docs/AUDIT5_PRE_REGISTERED_GATE.md`) is a **separate** append-only
doc — not touched here.

The brief explicitly admits this outcome: *"If the gate can't be met
(proxy blocks tool-use AND the cross-repo Toranot fix is out of scope) →
STOP and report. Premise-falsification / scope-blocked is a valid
outcome (audit-4 precedent)."* This doc is that report.

---

## 1. STEP 0 — distrust contract (every brief claim independently verified)

| Item | Brief claim | Verified result |
|---|---|---|
| 0.1 ancestry | HEAD ⊃ `7b87bfa`(#228) ⊃ `deb335d`(#227 B5) ⊃ `8788f63`(literal-RED pin) | ✅ **TRUE** — all three confirmed `merge-base --is-ancestor` of HEAD |
| 0.1 tree/lane | clean tree, no concurrent web lane on bot/`scripts/lib/` | ✅ **TRUE** — `git status --porcelain` empty; only this workstream's own merged `claude/term-*` branches in last 2d; branched before any edit |
| 0.2 baseline | `npx vitest run` 4 named files → **51 passed** (17 B5 + 34 baseline) | ✅ **TRUE** — 4 files / 51 passed |
| 0.2 oracle | carried-forward c_accept-AWARE oracle → `isOk_pick_FPs:0, any_isOk_FPs:0, unresolved_total:0` | ✅ **TRUE** — exactly 0/0/0 (592 rows, 86 genuine disagreements) |
| 0.3 **make-or-break** | *"Do NOT assume the proxy is transparent. Confirm the Anthropic mechanism via the `claude-api` skill."* | ⚠️ **CHECK PERFORMED → proxy is NOT transparent (see §2)** |
| 0.4 docs read | audit-5 report + append-only gate | ✅ read; audit-5 = the defense-in-depth floor; audit-6 target = the underlying *rate* |

Every numeric/path/ancestry claim in the brief held. The brief was
honest. The make-or-break pre-flight is the one that resolves the
outcome.

## 2. The make-or-break pre-flight — Toranot proxy is an explicit allowlist

The bot runs **proxy mode** in CI/sandbox (`CHAOS_USE_PROXY=1` →
`https://toranot.netlify.app/api/claude`; `chaos-doctor-bot-v4.mjs`
L108/118/119 — verified). The active proxy is the **Edge Function**
`Toranot/netlify/edge-functions/claude.ts` (Edge has priority over the
legacy `netlify/functions/claude.ts` per its own header + workspace
CLAUDE.md). Its upstream `payload` is built as an **explicit
reconstruction allowlist** — verbatim, lines 198–234:

```ts
  const payload: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages,
  };
  if (wantsStream) payload.stream = true;
  if (typeof b?.system === "string") payload.system = b.system;
  // Opus 4.7 rejects temperature/top_p with non-default values (returns 400).
  // Silently drop them for that model rather than propagating the error to clients
  // that historically pass these defensively.
  const isOpus47 = model === "claude-opus-4-7";
  if (!isOpus47) {
    if (typeof b?.temperature === "number" && Number.isFinite(b.temperature)) {
      payload.temperature = Math.max(0, Math.min(2, b.temperature));
    }
    if (typeof b?.top_p === "number" && Number.isFinite(b.top_p)) {
      payload.top_p = Math.max(0, Math.min(1, b.top_p));
    }
  }
  // Adaptive thinking: forward thinking config if the client opted in.
  // We accept exactly one shape — { type: "adaptive" | "disabled" } —
  // and nothing else, so a typoed param can't unlock arbitrary upstream features.
  if (b?.thinking && typeof b.thinking === "object") {
    const t = b.thinking as { type?: unknown };
    if (t.type === "adaptive" || t.type === "disabled") {
      payload.thinking = { type: t.type };
    }
  }
  // output_config carries the effort dial for adaptive thinking. Only `effort`
  // is forwarded; `display` etc. are not whitelisted yet — we omit thinking
  // summaries from responses by default (matching Opus 4.7 default behavior).
  if (b?.output_config && typeof b.output_config === "object") {
    const oc = b.output_config as { effort?: unknown };
    if (typeof oc.effort === "string" && /^(low|medium|high|xhigh|max)$/.test(oc.effort)) {
      payload.output_config = { effort: oc.effort };
    }
  }
```

**Corroborating evidence (verify independently, do not trust this
paraphrase):**

- `grep -n "tools\|tool_choice\|\.format\|output_format"` across **both**
  `netlify/edge-functions/claude.ts` **and** `netlify/functions/claude.ts`
  → **zero matches.** Neither proxy references these fields anywhere. No
  hidden pass-through.
- `payload` is **reconstructed**, not forwarded. `output_config` is
  rebuilt as `{ effort: oc.effort }` — even a client sending
  `{format:{...}, effort:"high"}` loses `format`. And a client sending
  `{output_config:{format:{...}}}` with **no** `effort` fails the
  `typeof oc.effort === "string"` guard at L231, so `payload.output_config`
  is **never set at all**. The strip is total.
- The proxy is request-side opaque but **response-side transparent**
  (L332–348 passes the upstream body through verbatim). The block is
  entirely on the request side — the structured-output directive is
  stripped before it ever reaches Anthropic, so the `tool_use` block the
  brief wants to read is never generated.

### 2a. Sub-finding — the brief's named fallback is itself broken

The brief's fallback is *"strict-JSON prefill / response-format
constraint + the existing validator."* The bot defaults to
`MODEL = claude-opus-4-7` (`chaos-doctor-bot-v4.mjs:112`; the proxy's
`normalizeClaudeModel` maps every `opus*` alias to `claude-opus-4-7` and
has dedicated Opus-4.7 handling). Per the `claude-api` skill (authoritative,
loaded as STEP-0 instructed): **assistant-turn prefill returns a 400 on
Opus 4.7** (`temperature`/`top_p`/`top_k` and `budget_tokens` likewise
removed). So the prefill fallback is doubly broken in the practical run
mode: it 400s on the default model, independent of the proxy. The brief
author flagged the proxy risk but not this — surfaced here as a discrete
finding.

## 3. Verdict — all three API-layer mechanisms are no-ops in the practical run mode

| Mechanism | Status through proxy + Opus-4.7 default |
|---|---|
| Forced tool-use (`tools`+`tool_choice`) — brief's **lead hypothesis** | proxy strips `tools`/`tool_choice` → **no-op** |
| `output_config.format` JSON-schema | proxy whitelists only `output_config.effort`, never `.format` → **no-op** |
| Strict-JSON prefill — brief's **named fallback** | assistant-turn prefill **400s on Opus 4.7** (§2a) → **broken** |

There is **no API-layer forced-structured-output mechanism available in
the practical run mode without a cross-repo Toranot change.** The only
in-`Geriatrics` lever left is prompt-strengthening of `SYS_DOCTOR_JUDGE`
— which the brief explicitly scopes OUT ("a judge output-contract
problem … not bot plumbing"; audit-5's `feedback_validator_before_prompt`
makes prompt-strengthening the last resort, and the audit-5
validator/retry already IS the defense-in-depth floor for this).

Per the brief, a Toranot proxy change is *"a separate repo — surface as
a BLOCKING decision, not silently in-scope."* The proxy allowlist is a
**deliberate security boundary** (verbatim comment L218–219: *"a typoed
param can't unlock arbitrary upstream features"*) shared by ≥3 consumer
apps (Geri in-app aiAutopsy, ward-helper, Toranot itself). Widening it
is a cross-cutting security decision, not a bot fix. → **STOP and
report** (audit-4 premise-falsification precedent;
`docs/AUDIT5_PRE_REGISTERED_GATE.md` TRIP CONDITION wording).

## 4. SURFACED BLOCKING DECISION (for the user — choose before any further work)

The cross-repo Toranot change has materially different security surfaces
depending on mechanism. Three options:

1. **Scope-block stands.** No further work. Audit-5's
   `judgeWithShapeRetry` (validator + cap=1 corrective re-ask) remains
   the floor; B5 stays observable via the typed `ai-parse-error
   context:'judge'` log. The ≈26% underlying judge-malformation rate is
   *documented and floored*, not *reduced*. **Recommended unless the
   residual rate is shown to be materially hurting audit signal** —
   smallest footprint, no cross-cutting security change, consistent with
   "minimum code that solves the problem."
2. **Narrow Toranot change** — whitelist `output_config.format`
   (`{type:"json_schema", schema:...}`) only, alongside the existing
   `effort`. Smallest viable security surface: `format` constrains
   *output shape only*; it does **not** authorize the model to invoke
   upstream features. The bot needs **zero response-parser change** —
   `output_config.format` returns schema-valid JSON in a normal `text`
   block, which the bot's existing
   `data.content[].filter(type==='text')` path already handles. Next
   session: 1 small Toranot PR (proxy whitelist + its guard test) + the
   Geri-side deterministic-replay gate + guard test.
3. **Broader Toranot change** — whitelist `tools`/`tool_choice`
   pass-through + add `tool_use`-block response handling in the bot.
   Matches the brief's lead hypothesis but is the **widest** surface
   (`tools` authorizes arbitrary upstream tool features for *every*
   proxy consumer) **and** needs both a Toranot PR *and* a bot
   response-parser change. Higher risk, more moving parts, for no
   adherence advantage over option 2.

A direct-mode (`CLAUDE_API_KEY`) deterministic replay is **not** proposed
now — it measures a topology the brief's "practical run mode" explicitly
excludes and costs money for an unauthorized hypothetical. It is a
follow-up *contingent on option 2 or 3* (deterministic fixture replay
through the forced path vs current path; metric = `validateJudgeShape`
OK on the FIRST call before any retry — exactly the brief's
pre-registered primary basis).

## 5. Floor preserved (explicit non-regression statement)

No code in `Geriatrics` changed. `scripts/chaos-doctor-bot-v4.mjs`,
`scripts/lib/judgeShapeValidator.mjs`, and the audit-5 test suite are
**untouched**. The audit-5 STEP-0 floor was re-verified green this
session (51 passed across the 4 named files; oracle 0/0/0) and remains
the defense-in-depth layer. Removing it was never on the table (brief
OUT-OF-SCOPE + KNOWN TRAP #4).

## 6. Out of scope (handed off untouched — unchanged from audit-5)

**B4 content adjudication (37 distinct Qs — 4 real-IMA + 33
AI-generated).** Different axis (content, not bot-reliability),
un-pre-committed, PDF-verify-per-v9.81-idx-510 + curator-override
cross-check. **Still handed off untouched — NOT this kickoff, NOT a
queue.** No `q.c` flip, no `broken` change, no distractor regen.

---

## Fresh-eye recommendation

A scope-blocked STOP is not a "CLOSED lock of a shipped change," so the
workspace fresh-eye rule is not strictly triggered. But this is a
**verdict-shaped finding that contradicts the brief's lead hypothesis**.
The load-bearing claim is the §2 proxy read. Recommend the user route
this merged doc through a filesystem-grounded fresh-eye (clone Toranot +
independently confirm the L198–234 strip and the zero-match grep) before
treating the scope-block as final — it is cheap and the interpretation
must hold under independent verification of the proxy code.

---

## [2026-05-18, appended post-review] Option 0 — failure-mode composition is UNMEASURED and PRECEDES §4

Append-only correction (`feedback_spec_provenance_append_only`). §1–6
above are factually correct and stand as the honest STEP-0 proxy
record. **This section does not retract them — it demotes §4 from a
decision menu to a contingent branch.** External review (claims
re-verified here against primary source) established that the body
above applied the distrust contract to the brief's *facts* (verified,
all TRUE) but **accepted the brief's *frame*** — the unexamined premise
that the ≈26% judge-malformation is a *grammar* failure (model emits
prose instead of JSON) that API-layer structured output would fix.

### Verified evidence the frame is unsafe

- **Judge runs at `max_tokens: 400`.** `chaos-doctor-bot-v4.mjs` judge
  call → `judgeWithShapeRetry({..., maxTokens: 400, ...})`;
  `scripts/lib/judgeShapeValidator.mjs:57/67/86` applies `maxTokens=400`
  to **both** the original judge call **and** the cap=1 corrective
  re-ask. The judge *input* is large (full stem + 4 lettered options +
  app explanation sliced to 1500 chars + source + AI rationale); the
  *output* ceiling for a board-level geriatric adjudication verdict is
  400 tokens.
- **Audit-5's own canonical production-input pin is a truncated
  string.** `8788f63` (`tests/chaosBotV4JudgeShapeValidator.test.js:42`):
  `expect(extractJson('{"app_answer_correct":tr')).toBe(null); // truncated`.
  The audit-5 author's comment lists the failure family as
  "**truncation**/prose/string-bool/missing-key" — truncation first.
- **Structured output is inert against truncation.** `output_config.format`
  (option 2) and forced tool-use (option 3) constrain output *grammar*,
  not *length*. A `max_tokens: 400` hit yields `stop_reason: max_tokens`
  and an incomplete structure regardless of schema/tool enforcement. If
  truncation dominates the ≈26%, **none** of the brief's mechanisms, nor
  §4 options 2/3, reduce the rate.
- **The cheap fix needs ZERO Toranot change.** The proxy *forwards*
  `max_tokens` (`netlify/edge-functions/claude.ts:178`,
  `clampInt(..., 256, 32768)` — 400 passes; a bump to ~1200 would too).
  So raising the judge `max_tokens` (or trimming the required verdict
  schema) is a pure Geri-side fix that works through the *existing*
  proxy — no allowlist extension, no cross-repo security decision.
- **The disambiguator was explicitly cut.** `AUDIT5_PRE_REGISTERED_GATE.md`
  OUT OF SCOPE: *"`stop_reason` capture in `callClaude` — would
  disambiguate truncation vs prose-only on future runs … Explicitly
  cut (non-speculative scope discipline)."* Defensible in audit-5;
  in audit-6's light it is the precise thing now blocking diagnosis
  (the ledger keeps only the post-`extractJson` object → the 22
  failures cannot be bucketed truncated-vs-prose).
- **Run-mode confirmed:** `scripts/long-chaos-run.sh:41` hard-codes
  `export CHAOS_USE_PROXY=1`; no scheduled/CI chaos exists. The strip
  bites every real run; direct mode is not a free fourth option (runner
  forces proxy + would put a raw Anthropic key in the bot runtime).

### Corrected decision tree (§4's 1/2/3 is NOT a menu to action yet)

**Option 0 (diagnosis) precedes everything.** Add `stop_reason` capture
(one boolean per failure: `max_tokens` ⇒ truncation; cheapest, no
raw-text/PHI retention — optionally raw text too) on the judge
parse-failure path, mirroring the pick channel's existing `:462`
parse-error log. Run one small bounded judge sample. Bucket the
failures.

- **Truncation-dominated** → Geri-side `max_tokens` bump and/or
  verdict-schema trim. No Toranot change. No fresh-eye needed. Cheap;
  likely end state.
- **Prose-dominated** → *then* the Toranot decision goes live, and it is
  **option 2 only** (`output_config.format`; option 3 is strictly
  dominated by option 2 on every axis listed in §4 — discard it, it is
  not a real choice). The §"Fresh-eye recommendation" above becomes a
  precondition *here*, not before.

§4's three options remain accurate as a *security-surface* analysis but
must not be treated as the immediate decision. The next workstream is
Option 0 (its own branch/session), not a user pick among 1/2/3.

### [appended] §2 independently fresh-eye confirmed

An independent filesystem-grounded agent (no conclusion fed — given only
the neutral question "which body fields reach Anthropic") read the
Toranot source cold and **confirmed §2**: `tools` / `tool_choice` /
`output_config.format` are all DROPPED request-side; only
`output_config.effort` (regex-gated), `max_tokens` (clamped 256–32768),
`system` (string-only), `thinking` (`{adaptive|disabled}`-only) survive.
Two corroborations *stronger* than the original §2 read:

1. **Edge-priority proven from routing, not asserted.** §2 claimed Edge
   wins on the file's own header comment + workspace CLAUDE.md. The
   fresh-eye verified it from `netlify.toml` (no `/api/claude` redirect
   to the Lambda; an explicit separate `/api/claude-legacy →
   /.netlify/functions/claude` alias; comment "supersedes the old
   netlify/functions/claude.ts"). Edge intercepts before Lambda before
   redirects.
2. **Second independent strip layer.** `_utils.ts:120–163`
   `validateMessages` rebuilds each message as `{role,content}` with
   whitelisted block types and explicitly "strips unknown keys — never
   forward raw caller input to upstream APIs." So even *message-level*
   tool-param injection is stripped, independent of the payload
   allowlist.

The §2 proxy finding is therefore not in question. What Option 0
re-frames is whether structured output (the thing the proxy blocks) is
even the right fix — and the verified `max_tokens:400` + truncated
literal pin say: measure first.

### [appended] Option 0's fork is itself ternary, not binary (the rule, recursed)

Review caught — and `scripts/lib/extractJson.mjs` source confirms — that
a binary truncation/not-truncation instrument would itself mask a hidden
class (the frame-distrust rule applied to *this doc's own* remediation
fork). `extractJson` does exactly **two strict `JSON.parse` attempts**
(whole-string L11, brace-balanced candidate L31) with **zero lenient
repair**, so it returns null on three structurally distinct branches:

| Class | extractJson branch | `stop_reason` | Fix | Toranot? |
|---|---|---|---|---|
| **(a) truncated** | braces never balance → `null` L35 (or whole-parse fail) | `max_tokens` | Geri-side `max_tokens` bump / verdict-schema trim | **No** |
| **(c) malformed-but-complete** (unquoted keys, trailing comma, `True`) | balanced candidate, `JSON.parse` throws → `null` L31 | `end_turn` | Geri-side lenient parse / one-line prompt nudge | **No** |
| **(b) genuine prose** | no `{` → `null` L13 | `end_turn` | structured output | **Yes — only this leaf** |

A single `stop_reason` boolean separates (a) from {(b),(c)} but cannot
split (b) from (c) → "not-truncation → §4 menu" would misroute every
class-(c) parser-miss into a cross-repo security review.

**Corrected Option-0 instrument (principle; exact log schema is the
Option-0 branch's to spec, not this doc's):** the *persistent* instrument
records `(stop_reason, extractJson-null-branch)` — the null-branch is a
free ~3-value enum (`no_brace` L13 / `unbalanced` L35 / `parse_threw`
L31), just *which existing `return null` fired*, zero raw-text retention.
That mechanically separates (a)/(c) and most of (b). The only residual
ambiguity is prose-with-incidental-braces landing in `parse_threw`
alongside real malformed JSON — so the *bounded sample* eyeballs raw
text **only on the `parse_threw` bucket**, not all non-truncation
failures. That is a transient diagnostic read of board-exam MCQ
adjudication content (Geriatrics is a study app — **no patient PHI**;
contrast ward-helper), not persistent logging; the retention concern
that rules out persistent raw-text capture does not rule out a one-time
sample look at the single ambiguous bucket.

**Decision tree is ternary.** (a) → `max_tokens`, zero Toranot. (c) →
parser/prompt, zero Toranot. (b) genuine prose → *then* §4, and there
option 2 only (option 3 strictly dominated). **Pin all three before
anyone reopens §4.** The most likely composite end state needs no
Toranot change at all.
