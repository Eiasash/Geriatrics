# Incident ledger

Cross-repo. The canonical copy lives here; the other repos REFERENCE this file and never copy it.
A copy of a ledger is worse than no ledger, because it looks authoritative while being stale.

## Charter, and its limit

This ledger establishes two things: that a class of failure **recurred**, and whether the
prevention recorded against it **held**.

It CANNOT establish that unlogged classes do not exist, and it is never evidence of coverage. It
has **sensitivity only**. "No incidents logged for a class" has never once meant the class does not
occur here; it has meant nobody looked yet. On 18-19 Sep the ledger's own pin-validation gap was
invisible to the ledger's own validator and was found by an outside tool hitting degraded
conditions by chance; and a PR's headline claim was false in a way nothing inside the PR surfaced,
found only because three separate parties read the actual code.

## What gets logged

An incident is: **a claim was made that was not true**, or **a control did not hold**.

An ordinary bug found and fixed in flight is NOT an incident. The test is about the claim, not the
code: the 19 Sep encoding corruption qualifies, and the incident is *the unchecked assertion that
the commit was good*, not the mojibake itself.

## The entry

| field | meaning |
|---|---|
| `id` | `INC-NNN`, stable, never reused |
| `date` | ISO, UTC. If you write a local time, label it local. A timestamp that says `Z` and is not `Z` asserts a property it does not have |
| `repo`, `commit` | where it happened |
| `claim` | what was asserted **at the time**, in the words used |
| `truth` | what was later established |
| `detected_by` | `{actor, engine}`. Self-detection and outside detection are different evidence, and two actors sharing an engine are ONE oracle |
| `class` | the defect class, not the instance. Classes recur; instances never do |
| `fix` | `{description, commit}` |
| `prevention` | `{kind, evidence, verified_by}` - see below |
| `supersedes` | prior entry ids this corrects. Entries are superseded, never edited |

## `prevention.kind` - the load-bearing field

- **`structural`** - the failure is now UNREACHABLE. The capability that produced it is gone.
- **`guard`** - automatically detectable, and it fails something. Detection, not prevention.
- **`convention`** - a human or a model has to remember. **Renders as `NOT PREVENTED`, in those
  words.** Not a softer shade of prevented.
- **`none`** - honest, and allowed.

`convention` is not a fix. On 18-19 Sep "consult the chat lane first" was written down twice and
failed three times in one evening. Writing something down is not a mechanism. A ledger that lets
convention count as a fix is a comfort object.

**A `structural` claim requires a non-Claude check before that classification is trusted.** Not an
inside ratification alone - the chat lane got a `structural` call wrong once before checking
further. This is the one field where an inside sign-off is not the final word.

## The recurrence rule - the only part that does work

Entries link by `class`. When a class recurs:

- prior prevention was `convention` -> evidence the convention does not hold here. Escalate to
  `guard` or `structural`.
- prior prevention was `structural` -> **the louder alarm.** The mechanism is wrong, not the
  discipline.

## Retirement - there is no N

A class retires from the active view on a **confirmed, independently-verified `structural`
prevention alone**. No quiet-period count.

If the prevention is genuinely structural, absence of recurrence is guaranteed by the mechanism and
does not need a countdown to confirm it. If it recurs anyway, the recurrence rule already reopens
it - and that, not a timer, is the real check on whether `structural` was honest.

## Validation

`node incidents/check.mjs` - exits non-zero on a violation. It is a `guard`, not a `structural`
prevention, and it is recorded as one. A check that cannot fail the build is not a check:
`ledger-check.mjs` printed "ledger ok" and exited 0 while accepting verdicts carrying no commit
pin at all. That is INC-004.
