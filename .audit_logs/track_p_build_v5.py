"""Track P+O — build dataset_to_qnum_mapping_v5.json combining Track N + P additions.

v5 = v4 (which already has Track N additions) + Track P high-confidence
additions (≥5 hits). Track O (the triangulated audit) doesn't change the
mapping — its outcome is "0 flips warranted" — so v5 is purely a mapping
extension, no data changes.
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Track P high-confidence additions (≥5 hits, IMA cross-checked)
# (idx, qnum, hits, ima_agreement)
TRACK_P_ADDITIONS = [
    (332,  68, 10, "AGREE"),
    (338,  74,  8, "AGREE"),
    (339,  75,  7, "AGREE"),
    (341,  30,  5, "disagree"),    # Track-O verdict: IMA wrong (Torsades Q), keep canonical
    (345,  81,  7, "AGREE"),
    (349,  85,  5, "AGREE"),
    (354,  90, 11, "AGREE"),
    (360,  96,  8, "AGREE"),
    (2515,  5,  5, "disagree"),    # Track-O verdict: 3-way split, canonical most defensible
]

# Track N + P additions are 24 + 9 = 33 (1 still skipped: idx 3286 collision)
def main():
    v4 = json.loads((REPO / ".audit_logs" / "dataset_to_qnum_mapping_v4.json").read_text(encoding="utf-8"))
    mapping = dict(v4["mapping"])

    additions = []
    for idx, qnum, hits, ima_status in TRACK_P_ADDITIONS:
        # All Track-P entries are tag=2021-Dec
        confidence = "high"  # all are ≥5 hits
        mapping[str(idx)] = ["2021-Dec", qnum, confidence]
        additions.append({
            "idx": idx,
            "tag": "2021-Dec",
            "qnum": qnum,
            "hits": hits,
            "confidence": confidence,
            "ima_agreement": ima_status,
        })

    v5 = {
        "method": "v4 + Track P (2021-Dec PDF token-overlap, ≥5-hit confidence threshold) + Track O (triangulated audit, 0 flips)",
        "v4_mapped": v4.get("total_mapped"),
        "track_p_added": len(additions),
        "track_o_flips_applied": 0,
        "total_mapped": len(mapping),
        "track_n_additions": v4.get("track_n_additions", []),
        "track_p_additions": additions,
        "track_n_skipped_entries": v4.get("track_n_skipped_entries", []),
        "track_p_skipped_count": 47 - len(TRACK_P_ADDITIONS) - 1,  # -1 for the no_match (idx 388)
        "track_p_skipped_note": "37 weak matches (1-4 hits) excluded as likely-false-positive per brief's 'extreme curator paraphrase' caveat. 1 explicit no-match (idx 388).",
        "stats": v4.get("stats", {}),
        "mapping": mapping,
    }

    out = REPO / ".audit_logs" / "dataset_to_qnum_mapping_v5.json"
    out.write_text(json.dumps(v5, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  v4 mapped:         {v4.get('total_mapped')}")
    print(f"  Track P additions: {len(additions)}")
    print(f"  Track O flips:     0 (all 7 disagreements verdicted as keep-canonical)")
    print(f"  v5 total mapped:   {len(mapping)}")


if __name__ == "__main__":
    main()
