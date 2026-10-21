---
name: weekly-audit
description: Retired scheduled audit instructions. Use current workflow commands for an explicitly requested local validation.
disable-model-invocation: true
---

# /weekly-audit — retired schedule

There is no active weekly-audit workflow. Do not start a recurring audit or
run `audit.sh` as a CI substitute: its legacy PWA checks are not the current
required checks, and the big question bank is not an active work target.

When local validation is requested, read the current workflows and run the
commands for `validate` (`ci.yml`), `js-integrity` (`integrity-guard.yml`), and
`scan` (`gitleaks.yml`). Report each result and anything not run. Existing
Stage A guards and mutation shards are optional; no new guard is required.
