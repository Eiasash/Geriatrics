---
name: ship-it
description: Retired direct-push launcher. Route release requests through the repository's branch-and-PR workflow and coordinator.
disable-model-invocation: true
---

# /ship-it — retired launcher

Do not execute `ship.sh`, including its dry-run mode. It changes the root
service-worker version and its normal path pushes directly to `main`.
It does not implement the current release policy.

For an authorized release request, follow `CLAUDE.md` and the applicable
`AGENTS.md`: branch + PR, never direct-main push or `--no-verify`, and run the
required `validate`, `js-integrity`, and `scan` checks. The coordinator merges
when those checks are green on the exact full head; Claude Code does not
self-merge. Only an OBJECT from `cowork-szmc` blocks the coordinator's merge.
No review rounds, CONCUR, signatures, or Eias sign-off are required.
