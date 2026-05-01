"""
probe_workflow_staleness.py — auto-audit Tier 1 probe addition

Detects workflows whose latest run failed or stopped running on schedule,
and emits a CRITICAL finding with a template hint so the auto-fix layer
can repair common breakages without human authoring.

Integration point: import and call from scripts/probe.py inside the
per-repo loop. Returns a list of Finding dicts in whatever shape your
existing probe.py uses; adjust the dict keys to match.

Drop into: scripts/probes/probe_workflow_staleness.py

Wire into probe.py:

    from probes.probe_workflow_staleness import check_workflow_staleness
    findings.extend(check_workflow_staleness(repo, gh_token))

Required env:
    GITHUB_TOKEN — read access to the target repo's Actions

Thresholds (edit to taste):
    FAIL_AGE_HOURS  — how long a failing workflow can sit before CRITICAL
    STALE_AGE_HOURS — how long a cron workflow can be silent before CRITICAL
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

GH_API = "https://api.github.com"
FAIL_AGE_HOURS = 4    # Failing workflow blocks for this long → CRITICAL
STALE_AGE_HOURS = 12  # Cron workflow silent for this long → CRITICAL


def _gh(path: str, token: str) -> Any:
    """Minimal GH API client. Returns parsed JSON or raises."""
    req = urllib.request.Request(
        f"{GH_API}{path}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "auto-audit-probe",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def _hours_since(iso: str) -> float:
    """ISO8601 with 'Z' → hours from now."""
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0


def _classify_failure(jobs_data: Dict[str, Any]) -> str:
    """
    Look at the failed steps across jobs, pick the template that matches.
    Returns a template name the auto-fix layer knows about.
    """
    for job in jobs_data.get("jobs", []):
        if job.get("conclusion") != "failure":
            continue
        for step in job.get("steps", []):
            if step.get("conclusion") != "failure":
                continue
            name = (step.get("name") or "").lower()
            # Pattern: "Checkout <branch>-branch" → repair_workflow_branch
            if "checkout" in name and "branch" in name:
                return "repair_workflow_branch"
            if name in ("set up job", "post run actions/checkout"):
                # GH-side or runner issue; won't fix itself, needs investigation
                return "investigate"
    return "investigate"


def check_workflow_staleness(
    repo: str, gh_token: str, target_workflows: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Returns a list of findings. Each finding is a dict shaped:
        {
            "severity": "CRITICAL" | "WARN",
            "repo": "Eiasash/Geriatrics",
            "title": "...",
            "body": "...",
            "labels": ["auto-audit", "auto-fix-eligible"],
            "template": "repair_workflow_branch" | "investigate" | None,
            "template_args": { ... },
        }

    `target_workflows`: optional allowlist of workflow file basenames
        (e.g. ["distractor-autopsy.yml"]). If None, checks all workflows.
    """
    findings: List[Dict[str, Any]] = []

    try:
        wf_list = _gh(f"/repos/{repo}/actions/workflows?per_page=100", gh_token)
    except urllib.error.HTTPError as e:
        return [_finding(
            "WARN", repo, f"Cannot list workflows: HTTP {e.code}",
            f"GET /actions/workflows returned {e.code}. Check token scope.",
            template=None,
        )]

    for wf in wf_list.get("workflows", []):
        if wf.get("state") != "active":
            continue
        wf_name = wf.get("name") or wf.get("path", "?")
        wf_file = (wf.get("path", "") or "").split("/")[-1]
        if target_workflows and wf_file not in target_workflows:
            continue
        wf_id = wf["id"]

        try:
            runs = _gh(
                f"/repos/{repo}/actions/workflows/{wf_id}/runs?per_page=10",
                gh_token,
            )
        except urllib.error.HTTPError:
            continue

        run_list = runs.get("workflow_runs", [])
        if not run_list:
            continue

        latest = run_list[0]
        conclusion = latest.get("conclusion")  # success | failure | cancelled | skipped | None
        status = latest.get("status")  # queued | in_progress | completed
        updated = latest.get("updated_at")
        run_id = latest.get("id")

        # CASE 1 — latest run failed, and we've been failing for FAIL_AGE_HOURS
        if conclusion == "failure" and updated:
            age_h = _hours_since(updated)
            consec_fail = sum(
                1 for r in run_list if r.get("conclusion") == "failure"
            )
            if age_h >= FAIL_AGE_HOURS:
                template = "investigate"
                template_args: Dict[str, Any] = {
                    "workflow_file": wf_file,
                    "run_id": run_id,
                    "branch": latest.get("head_branch"),
                }
                # Ask the run for its job/step detail to classify
                try:
                    jobs = _gh(
                        f"/repos/{repo}/actions/runs/{run_id}/jobs", gh_token
                    )
                    template = _classify_failure(jobs)
                    if template == "repair_workflow_branch":
                        # Try to extract the branch name from the workflow file
                        # (best effort; auto-fix template will re-parse)
                        template_args["expected_branch"] = _guess_branch_from_workflow(
                            repo, wf.get("path", ""), gh_token
                        )
                except urllib.error.HTTPError:
                    pass

                findings.append(_finding(
                    "CRITICAL", repo,
                    f"Workflow `{wf_name}` has been failing for {age_h:.1f}h "
                    f"({consec_fail} consecutive failures)",
                    f"Last successful run was before {updated}.\n\n"
                    f"Latest run: https://github.com/{repo}/actions/runs/{run_id}\n\n"
                    f"Auto-fix template: `{template}`",
                    template=template,
                    template_args=template_args,
                ))
                continue

        # CASE 2 — workflow is on cron AND last successful run is too old
        # (we don't know the cron schedule from the API, so use a heuristic:
        # if the latest run is "completed" and "success" but old, AND the
        # workflow file mentions schedule/cron, alarm on staleness)
        if conclusion == "success" and updated:
            age_h = _hours_since(updated)
            if age_h >= STALE_AGE_HOURS:
                # Only alarm if the workflow file declares a schedule
                if _workflow_has_schedule(repo, wf.get("path", ""), gh_token):
                    findings.append(_finding(
                        "CRITICAL", repo,
                        f"Cron workflow `{wf_name}` last ran {age_h:.1f}h ago — "
                        f"scheduler likely stopped firing",
                        f"Latest run was successful but old: {updated}\n"
                        f"https://github.com/{repo}/actions/runs/{run_id}",
                        template="investigate",
                        template_args={"workflow_file": wf_file},
                    ))

    return findings


def _guess_branch_from_workflow(repo: str, wf_path: str, token: str) -> Optional[str]:
    """Best-effort: pull the workflow file and grep for the branch name."""
    try:
        contents = _gh(f"/repos/{repo}/contents/{wf_path}", token)
        import base64
        text = base64.b64decode(contents["content"]).decode("utf-8", errors="replace")
        # Look for `ref: <branch>` or `git checkout <branch>` patterns
        import re
        m = re.search(r"\bref:\s*([^\s'\"]+)", text)
        if m:
            return m.group(1)
        m = re.search(r"\bgit checkout (?:-B\s+)?([^\s'\"`]+)", text)
        if m:
            return m.group(1)
    except Exception:
        pass
    return None


def _workflow_has_schedule(repo: str, wf_path: str, token: str) -> bool:
    try:
        contents = _gh(f"/repos/{repo}/contents/{wf_path}", token)
        import base64
        text = base64.b64decode(contents["content"]).decode("utf-8", errors="replace")
        return "schedule:" in text and "cron:" in text
    except Exception:
        return False


def _finding(
    severity: str, repo: str, title: str, body: str,
    template: Optional[str] = None, template_args: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "severity": severity,
        "repo": repo,
        "title": title,
        "body": body,
        "labels": ["auto-audit", "auto-fix-eligible"] if template else ["auto-audit"],
        "template": template,
        "template_args": template_args or {},
    }


if __name__ == "__main__":
    # Standalone test: probe a single repo, print findings as JSON
    import sys
    token = os.environ["GITHUB_TOKEN"]
    repo = sys.argv[1] if len(sys.argv) > 1 else "Eiasash/Geriatrics"
    targets = sys.argv[2:] if len(sys.argv) > 2 else None
    print(json.dumps(check_workflow_staleness(repo, token, targets), indent=2))
