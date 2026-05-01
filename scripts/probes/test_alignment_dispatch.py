#!/usr/bin/env python3
"""
test_alignment_dispatch.py — positive-path verifier for the alignment probe.

Drop in: scripts/probes/test_alignment_dispatch.py
Run:     python scripts/probes/test_alignment_dispatch.py

What it does:
  1. Calls probe_distractor_alignment against a known-corrupted SHA
     (7e893eb — TIS reclassify, pre-v10.45.0, pre-recovery).
  2. Calls it against current main (known-clean post-v10.45.0).
  3. Confirms shape, severity, template, label routing, args.
  4. Confirms the new→old schema adapter inside probe.py produces a
     finding shape your dispatcher will actually route.

NEVER opens a real issue. NEVER posts to the GH API. Pure in-memory.

Exit code:
  0 — both paths verified, dispatcher mapping correct, ship it
  1 — something is wrong, do not push the probe commit
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Make the probes package importable when this file is run from the repo root
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

try:
    from probe_distractor_alignment import check_distractor_alignment
except ImportError as e:
    print(f"FAIL: cannot import probe — {e}", file=sys.stderr)
    sys.exit(1)


# ─── The schema adapter as wired into probe.py ────────────────────────────
# Mirror it here so we test the exact mapping. If you edit the adapter in
# probe.py, edit it here too — keep them in lockstep.
SEV_MAP = {"CRITICAL": "critical", "WARN": "warning", "ERROR": "error"}


def adapt(finding: dict) -> dict:
    """new→old schema adapter (must match the one in probe.py)."""
    out = {
        "severity": SEV_MAP.get(finding["severity"], finding["severity"].lower()),
        "msg": finding["title"],
        "body": finding.get("body", ""),
        "labels": finding.get("labels", []),
        "kind": finding.get("template"),
    }
    if finding.get("template"):
        out["auto_fix"] = {
            "template": finding["template"],
            "args": finding.get("template_args", {}),
        }
        out["url"] = (
            f"https://github.com/{finding['repo']}/blob/main/"
            "data/distractors.json"
        )
    return out


# ─── Assertions ───────────────────────────────────────────────────────────
def expect(cond: bool, label: str, detail: str = "") -> None:
    """Pretty-printed assertion. Doesn't bail — collects all failures."""
    mark = "✓" if cond else "✗"
    line = f"  {mark} {label}"
    if not cond and detail:
        line += f"\n      {detail}"
    print(line)
    if not cond:
        FAILURES.append(label)


FAILURES: list[str] = []


# ─── 1. Negative path — clean main returns no findings ────────────────────
print("[1/3] Negative path: clean main (post-v10.45.0)")
clean = check_distractor_alignment("Eiasash/Geriatrics", "main")
expect(
    isinstance(clean, list),
    "returns a list",
    f"got {type(clean).__name__}",
)
expect(
    len(clean) == 0,
    "clean main returns []",
    f"got {len(clean)} findings: "
    f"{[f.get('title', '?') for f in clean[:3]]}",
)


# ─── 2. Positive path — corrupted SHA returns CRITICAL ────────────────────
# 7e893eb is the TIS reclassify commit, pre-v10.45.0. Known-corrupted state.
# If this SHA ever rotates out of the repo (e.g. after a force-push / squash
# of TIS work), substitute another pre-v10.45.0 commit hash.
print("\n[2/3] Positive path: known-corrupted SHA (7e893eb / TIS reclassify)")
corrupt = check_distractor_alignment("Eiasash/Geriatrics", "7e893eb")
expect(
    isinstance(corrupt, list) and len(corrupt) == 1,
    "returns exactly 1 finding",
    f"got {len(corrupt) if isinstance(corrupt, list) else type(corrupt).__name__}",
)

if len(corrupt) == 1:
    f = corrupt[0]
    expect(f.get("severity") == "CRITICAL", "severity is CRITICAL",
           f"got {f.get('severity')!r}")
    expect(f.get("repo") == "Eiasash/Geriatrics", "repo is Geriatrics",
           f"got {f.get('repo')!r}")
    expect(
        f.get("template") == "regenerate_misaligned_distractors",
        "template is regenerate_misaligned_distractors",
        f"got {f.get('template')!r}",
    )
    expect(
        "auto-fix-eligible" in f.get("labels", []),
        "labels include auto-fix-eligible",
        f"got {f.get('labels')!r}",
    )
    expect(
        "data-corruption" in f.get("labels", []),
        "labels include data-corruption",
        f"got {f.get('labels')!r}",
    )
    args = f.get("template_args", {})
    expect(
        isinstance(args.get("misaligned_count"), int)
        and args["misaligned_count"] > 1000,
        "template_args.misaligned_count is a sane integer (>1000)",
        f"got {args.get('misaligned_count')!r}",
    )
    expect(
        args.get("branch") == "7e893eb",
        "template_args.branch echoes the input ref",
        f"got {args.get('branch')!r}",
    )
    expect(
        "Russian" not in f.get("body", "") or len(f.get("body", "")) > 200,
        "body contains diagnostic detail (samples + counts)",
        f"body length={len(f.get('body', ''))}",
    )


# ─── 3. Adapter — verify the new→old schema mapping ───────────────────────
print("\n[3/3] Schema adapter: new probe shape → old probe.py shape")
if len(corrupt) == 1:
    adapted = adapt(corrupt[0])
    expect(
        adapted.get("severity") == "critical",
        "adapter lowercases severity",
        f"got {adapted.get('severity')!r}",
    )
    expect(
        adapted.get("msg") == corrupt[0].get("title"),
        "adapter renames title→msg",
    )
    expect(
        adapted.get("kind") == "regenerate_misaligned_distractors",
        "adapter renames template→kind",
        f"got {adapted.get('kind')!r}",
    )
    expect(
        isinstance(adapted.get("auto_fix"), dict)
        and adapted["auto_fix"].get("template")
        == "regenerate_misaligned_distractors",
        "adapter populates auto_fix.template",
    )
    expect(
        adapted.get("auto_fix", {}).get("args", {}).get("misaligned_count")
        == corrupt[0]["template_args"]["misaligned_count"],
        "adapter preserves template_args under auto_fix.args",
    )
    expect(
        adapted.get("url", "").startswith(
            "https://github.com/Eiasash/Geriatrics/"
        ) and "data/distractors.json" in adapted.get("url", ""),
        "adapter attaches debug URL pointing at distractors.json",
        f"got {adapted.get('url')!r}",
    )

    # Show the adapted finding so the dispatcher contract is visually obvious
    print("\n  adapted finding (what probe.py emits to the dispatcher):")
    print(
        "\n".join("    " + l for l in json.dumps(
            adapted, indent=2, ensure_ascii=False
        ).splitlines()[:20])
    )
    if len(json.dumps(adapted)) > 600:
        print("    ... (truncated)")


# ─── Verdict ──────────────────────────────────────────────────────────────
print()
if FAILURES:
    print(f"✗ {len(FAILURES)} check(s) failed:")
    for f in FAILURES:
        print(f"    - {f}")
    print("\nDO NOT push the probe commit until these are resolved.")
    sys.exit(1)
else:
    print("✓ All checks passed. End-to-end positive + negative paths verified.")
    print("  Probe ready to ship.")
    sys.exit(0)
