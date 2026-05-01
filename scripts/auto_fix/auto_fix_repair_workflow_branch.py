"""
auto_fix_repair_workflow_branch.py — auto-audit Tier 2 template

Repairs a workflow that's failing because its checkout step references
a branch that no longer exists (deleted, force-pushed away, or never
created in the first place).

Real-world precedent: Geriatrics `Distractor Autopsy Generator` workflow
failed 14+ consecutive times at the `Checkout distractor-autopsy branch`
step. This template handles that exact class of failure.

Drop into: scripts/auto_fix/repair_workflow_branch.py

Triggered by: auto-fix.yml workflow_dispatch with template="repair_workflow_branch"
and inputs from the originating Finding's template_args.

Inputs (from template_args):
    workflow_file: e.g. "distractor-autopsy.yml"
    expected_branch: e.g. "cowork/distractor-autopsy"  (best-effort guess
                     from probe; this template re-parses to confirm)

Side effects (all gated):
    - Pushes a new ref to origin (creates the missing branch from main)
      OR fast-forwards it if behind
    - Comments on the originating issue
    - Re-triggers the failing workflow once

Will NOT:
    - Modify main
    - Force-push existing branches with diverged history (escalates instead)
    - Touch any branch outside the one named by the workflow file

Required env:
    GITHUB_TOKEN — needs `contents: write` on the target repo, plus
                   `actions: write` to re-trigger the workflow
    REPO         — e.g. "Eiasash/Geriatrics"
    ISSUE_NUMBER — the originating auto-audit issue (for the resolution comment)

Exit codes:
    0 — repair succeeded, branch in expected state, workflow re-triggered
    1 — branch had diverged history; escalated, no action taken
    2 — could not determine expected branch from workflow file
    3 — GH API error; partial state, see logs
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Optional, Tuple

GH_API = "https://api.github.com"


def gh(method: str, path: str, token: str, body: Optional[Dict[str, Any]] = None) -> Any:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        f"{GH_API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
            "User-Agent": "auto-audit-fix",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        return {"_error": True, "status": e.code, "body": e.read().decode("utf-8", errors="replace")}


def parse_branch_from_workflow(text: str) -> Optional[str]:
    """Pull the branch name out of a workflow YAML."""
    # Match `ref: <branch>` (most common)
    m = re.search(r"\bref:\s*([^\s'\"#]+)", text)
    if m:
        return m.group(1)
    # Match `git checkout -B <branch>` or `git checkout <branch>`
    m = re.search(r"\bgit checkout (?:-B\s+)?([^\s'\"`#]+)", text)
    if m:
        return m.group(1)
    # Match `branches: [<branch>]` or `branches: - <branch>` (less reliable)
    m = re.search(r"branches:\s*\[\s*([^\]\s,]+)", text)
    if m:
        return m.group(1)
    return None


def get_branch_sha(repo: str, branch: str, token: str) -> Optional[str]:
    """Returns commit SHA at HEAD of branch, or None if branch doesn't exist."""
    res = gh("GET", f"/repos/{repo}/git/refs/heads/{branch}", token)
    if isinstance(res, dict) and res.get("_error"):
        return None
    if isinstance(res, dict) and res.get("object", {}).get("sha"):
        return res["object"]["sha"]
    return None


def is_ancestor(repo: str, ancestor_sha: str, descendant_sha: str, token: str) -> bool:
    """True if ancestor is reachable from descendant (i.e. fast-forward is possible)."""
    res = gh("GET", f"/repos/{repo}/compare/{ancestor_sha}...{descendant_sha}", token)
    if isinstance(res, dict) and res.get("_error"):
        return False
    return res.get("status") in ("identical", "ahead")


def comment_on_issue(repo: str, issue: int, msg: str, token: str) -> None:
    if not issue:
        return
    gh("POST", f"/repos/{repo}/issues/{issue}/comments", token, {"body": msg})


def main() -> int:
    token = os.environ["GITHUB_TOKEN"]
    repo = os.environ["REPO"]
    issue = int(os.environ.get("ISSUE_NUMBER", "0"))

    args_raw = os.environ.get("TEMPLATE_ARGS", "{}")
    args = json.loads(args_raw)
    wf_file = args.get("workflow_file")
    expected = args.get("expected_branch")

    if not wf_file:
        print("ERROR: workflow_file missing from template_args", file=sys.stderr)
        return 2

    # Re-fetch the workflow file and re-parse, in case the probe's guess was wrong
    wf_path = f".github/workflows/{wf_file}"
    contents = gh("GET", f"/repos/{repo}/contents/{wf_path}", token)
    if isinstance(contents, dict) and contents.get("_error"):
        print(f"ERROR: cannot read workflow file: {contents}", file=sys.stderr)
        return 3
    text = base64.b64decode(contents["content"]).decode("utf-8", errors="replace")
    parsed = parse_branch_from_workflow(text)
    branch = parsed or expected
    if not branch:
        comment_on_issue(repo, issue,
            f"❌ Auto-fix `repair_workflow_branch` could not determine the expected "
            f"branch from `{wf_path}`. Manual intervention needed.",
            token)
        return 2

    print(f"Target workflow: {wf_file}")
    print(f"Expected branch: {branch}")

    # State of main + state of expected branch
    main_sha = get_branch_sha(repo, "main", token)
    branch_sha = get_branch_sha(repo, branch, token)

    if not main_sha:
        print("ERROR: cannot read main SHA", file=sys.stderr)
        return 3

    print(f"main HEAD:   {main_sha}")
    print(f"{branch} HEAD: {branch_sha or '(branch missing)'}")

    # Case A: branch missing entirely → recreate from main
    if branch_sha is None:
        res = gh("POST", f"/repos/{repo}/git/refs", token, {
            "ref": f"refs/heads/{branch}",
            "sha": main_sha,
        })
        if isinstance(res, dict) and res.get("_error"):
            comment_on_issue(repo, issue,
                f"❌ Auto-fix failed to create `{branch}` from main: {res}", token)
            return 3
        comment_on_issue(repo, issue,
            f"✅ Auto-fix `repair_workflow_branch` created missing branch "
            f"`{branch}` from `main` ({main_sha[:7]}). Re-triggering "
            f"`{wf_file}`.", token)
        rerun_workflow(repo, wf_file, branch, token, issue)
        return 0

    # Case B: branch exists. Is it an ancestor of main? (i.e. just behind?)
    if branch_sha == main_sha:
        # Branch is already at main — workflow is failing for a different reason
        comment_on_issue(repo, issue,
            f"⚠️ Auto-fix `repair_workflow_branch`: branch `{branch}` is already "
            f"at `main` ({main_sha[:7]}). The checkout step is failing for a "
            f"different reason (token scope? path? deleted file?). Escalating to "
            f"`investigate`.", token)
        return 1

    # If branch is behind main → fast-forward
    if is_ancestor(repo, branch_sha, main_sha, token):
        res = gh("PATCH", f"/repos/{repo}/git/refs/heads/{branch}", token, {
            "sha": main_sha,
            "force": False,
        })
        if isinstance(res, dict) and res.get("_error"):
            comment_on_issue(repo, issue,
                f"❌ Auto-fix failed to fast-forward `{branch}` to main: {res}", token)
            return 3
        comment_on_issue(repo, issue,
            f"✅ Auto-fix `repair_workflow_branch` fast-forwarded `{branch}` "
            f"from `{branch_sha[:7]}` to `main` ({main_sha[:7]}). Re-triggering "
            f"`{wf_file}`.", token)
        rerun_workflow(repo, wf_file, branch, token, issue)
        return 0

    # Case C: branch has diverged from main → REFUSE to force-push
    comment_on_issue(repo, issue,
        f"⚠️ Auto-fix `repair_workflow_branch` will not force-push `{branch}` — "
        f"it has diverged from main ({branch_sha[:7]} vs {main_sha[:7]}). "
        f"This may contain in-progress work (e.g. cron-driven WIP commits on "
        f"a worker branch). Escalating for manual review.\n\n"
        f"To fix manually: either merge `{branch}` into main if the work matters, "
        f"or `git push origin --force main:refs/heads/{branch}` to discard it.",
        token)
    return 1


def rerun_workflow(repo: str, wf_file: str, branch: str, token: str, issue: int) -> None:
    """Trigger one fresh run of the failing workflow on the now-repaired branch."""
    res = gh("POST", f"/repos/{repo}/actions/workflows/{wf_file}/dispatches",
             token, {"ref": branch})
    if isinstance(res, dict) and res.get("_error"):
        comment_on_issue(repo, issue,
            f"⚠️ Branch repaired but workflow re-trigger failed: {res}", token)


if __name__ == "__main__":
    sys.exit(main())
