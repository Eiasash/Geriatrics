"""Extract the 94 prior curator overrides from .audit_logs/review/{tag}.md
evidence sheets and append them to curator_overrides.json.

Per session memory `project_geriatrics_94_c_wrong_curator_overrides.md`:
"All have empty IMA notes; spot-check: dataset is medically correct where
IMA's key is textbook-wrong. DO NOT auto-flip."

Each entry in the per-tag MD files has:
  ## idx=NNNN | QN
  **Dataset c** = `N` (heb-letter) → option text: `...`
  **IMA official** = `N` (heb-letter) → option text: `...`

The presence of an entry in these review files IS the verdict — they are
the 94 c-disagreements that triangulation kept canonical (per the user's
memory "DO NOT auto-flip").

This script merges them into the existing curator_overrides.json (which
already pins the 16 fresh Track J+L+O overrides). Output: a registry of
~110 documented overrides.

Idempotent: skips any idx already in the registry.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
REVIEW_DIR = REPO / ".audit_logs" / "review"
REGISTRY_PATH = REPO / ".audit_logs" / "curator_overrides.json"

ENTRY_RE = re.compile(r"^## idx=(\d+) \| Q(\d+)\s*$")
DATASET_C_RE = re.compile(r"^\*\*Dataset c\*\* = `(\d+)` \([^)]+\) → option text: `([^`]+)`", re.MULTILINE)
IMA_C_RE = re.compile(r"^\*\*IMA official\*\* = `(\d+)`", re.MULTILINE)


def parse_review_file(path: Path):
    """Yield (idx, qnum, dataset_c, ima_c, topic_short, tag) for each entry."""
    tag = path.stem  # 2020 / 2023-Jun-Basic / etc.
    text = path.read_text(encoding="utf-8")
    # Split into entry blocks at '## idx=' headers
    blocks = re.split(r"(?=^## idx=)", text, flags=re.MULTILINE)
    for block in blocks:
        if not block.startswith("## idx="):
            continue
        m_header = ENTRY_RE.match(block.split("\n", 1)[0])
        if not m_header:
            continue
        idx = int(m_header.group(1))
        qnum = int(m_header.group(2))

        m_ds = DATASET_C_RE.search(block)
        m_ima = IMA_C_RE.search(block)
        if not m_ds or not m_ima:
            continue
        dataset_c = int(m_ds.group(1))
        ima_c = int(m_ima.group(1))

        # Topic short: first 60 chars of dataset option text, no Hebrew bracket noise
        topic_short = m_ds.group(2).strip()
        if len(topic_short) > 70:
            topic_short = topic_short[:67] + "..."

        yield {
            "idx": idx,
            "qnum": qnum,
            "dataset_c": dataset_c,
            "ima_c": ima_c,
            "topic_short": topic_short,
            "tag": tag,
        }


def main():
    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    existing_idxs = {e["idx"] for e in registry["overrides"]}
    print(f"Registry currently pins {len(existing_idxs)} overrides.")

    added = 0
    skipped = 0
    duplicates = 0

    for f in sorted(REVIEW_DIR.glob("*.md")):
        for entry in parse_review_file(f):
            if entry["idx"] in existing_idxs:
                duplicates += 1
                continue
            new_entry = {
                "idx": entry["idx"],
                "expected_c": entry["dataset_c"],
                "track": "registry-94",
                "tag": entry["tag"],
                "qnum": entry["qnum"],
                "topic_short": entry["topic_short"],
                "rationale": (
                    "Bulk import from .audit_logs/review/{tag}.md (2026-05-04 audit). "
                    "Per session memory: dataset is medically correct where IMA's key is "
                    "textbook-wrong; spot-check confirmed override pattern. DO NOT auto-flip."
                ),
                "ima_published_c": entry["ima_c"],
            }
            registry["overrides"].append(new_entry)
            existing_idxs.add(entry["idx"])
            added += 1

    # Update meta to reflect coverage
    registry["_meta"]["note_94_prior"] = (
        f"94 prior overrides extracted from .audit_logs/review/{{tag}}.md "
        "evidence sheets on 2026-05-05 by extract_review_overrides.py. "
        "Combined with the 16 from Tracks J+L+O, registry now pins all "
        f"{len(registry['overrides'])} documented curator overrides."
    )
    registry["_meta"]["source_docs"] = sorted(set(
        registry["_meta"]["source_docs"] + [
            f".audit_logs/review/{f.stem}.md" for f in sorted(REVIEW_DIR.glob("*.md"))
        ]
    ))

    REGISTRY_PATH.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"Added: {added}")
    print(f"Skipped duplicates: {duplicates}")
    print(f"Skipped (parse fail): {skipped}")
    print(f"Registry total: {len(registry['overrides'])}")


if __name__ == "__main__":
    main()
