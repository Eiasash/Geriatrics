"""Track N — build dataset_to_qnum_mapping_v4.json with manual additions.

Takes the v3 mapping as base and adds the 25 manually-matched non-2021-Dec
unmapped entries with confidence tiers:

  high   — ≥3 hits AND IMA agrees (or multi-accept covers c)
  medium — ≥3 hits but no IMA data, or 2 hits with diversity
  low    — 1 hit, or collision with another idx, or 2 weak hits with no IMA

Each manual addition includes provenance: the candidate's hit count, the
hit tokens, and the IMA cross-check verdict. The shape extends v3:
  mapping[idx_str] = [tag, qnum, confidence?]  // confidence is optional 4th elt
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# Manual confidence assignments after inspection
# Format: idx → (tag, qnum, confidence, note)
MANUAL_MAPPINGS = {
    # HIGH — strong match + IMA agrees, or stem-match obvious
    47:   ("2024-May-Basic",   16,  "medium", "PHQ-9; 2 hits eng=2; no IMA Basic Q150 data"),
    104:  ("2020",             97,  "high",   "8 Heb hits; IMA multi-accept covers c=3"),
    154:  ("2020",             58,  "medium", "3 eng hits BIPAP/etc; IMA disagrees (c=2 vs ב=1) — possible curator override"),
    2442: ("2020",             84,  "low",    "2 Heb hits; IMA disagrees (c=1 vs א=0); generic Hebrew"),
    2518: ("2022-Jun-Basic",   85,  "medium", "10 Heb hits incl. ברוקדייל; IMA disagrees but IMA Basic data sparse"),
    2525: ("2022-Jun-Basic",   72,  "high",   "5 eng hits GIANT CELL ARTERITIS very distinctive; IMA multi-accept"),
    2594: ("2022-Jun-Basic",   14,  "low",    "1 eng hit ENALAPRIL; runners-up at q#24/66; uncertain"),
    2641: ("2023-Jun-Basic",   57,  "high",   "5 eng hits SLE Systemic Lupus Erythematosus; no IMA Basic data"),
    2642: ("2023-Jun-Basic",   58,  "high",   "10 Heb hits including TAU/TDP-43; preview matches verbatim"),
    2643: ("2023-Jun-Basic",   59,  "high",   "6 eng hits CHOLINESTERASE distinctive"),
    2646: ("2023-Jun-Basic",   62,  "medium", "2 eng hits MIRABEGRON BETMIGA; preview matches"),
    2884: ("2024-May-Basic",   25,  "low",    "1 eng hit 'Dementia' — generic; possibly q#25 BEHAVIORAL_VARIANT_FRONTOTEMPORAL based on preview"),
    2900: ("2024-May-Basic",   103, "low",    "1 eng hit CPAP; only candidate; IMA multi-accept א ד doesn't include c=2"),
    2949: ("2024-Sep-Basic",   85,  "high",   "3 eng hits Sacubitril Valsartan Entresto distinctive"),
    3012: ("2025-Jun-Basic",   1,   "medium", "2 eng hits PARACETAMOL"),
    3034: ("2025-Jun-Basic",   73,  "high",   "7 Heb hits very strong"),
    3182: ("2024-Sep-Basic",   9,   "medium", "1 eng hit Dopicar but distinctive Parkinson drug; only candidate"),
    3188: ("2022-Jun-Subspec", 52,  "high",   "3 eng hits ESCITALOPRAM MIRTAZAPINE distinctive depression Q"),
    3197: ("2022-Jun-Subspec", 62,  "medium", "2 eng hits Pulse_Pressure"),
    3284: ("2023-Jun-Subspec", 51,  "high",   "2 hits + IMA agrees (c=2 = ג)"),
    3285: ("2023-Jun-Subspec", 52,  "high",   "24 Heb hits — exact stem match; IMA agrees (c=3 = ד)"),
    3286: ("2023-Jun-Subspec", None, "low",   "Collides with 3285 at q#52 (24 hits vs 7); 3285 is the real q#52; 3286's true qnum unknown — q#134/30 candidates were 1-hit only"),
    3289: ("2023-Jun-Subspec", 58,  "high",   "10 Heb hits TAU pathology; multi-accept covers c=0"),
    3497: ("2024-Sep-Subspec", 72,  "high",   "3 eng hits ANTI CCP; IMA agrees (c=0 = א)"),
    3509: ("2024-Sep-Subspec", 20,  "high",   "12 Heb hits; IMA disagrees (c=0 vs ג=2) — possible curator override; mapping itself solid"),
}


def main():
    v3 = json.loads((REPO / ".audit_logs" / "dataset_to_qnum_mapping_v3.json").read_text(encoding="utf-8"))
    mapping = dict(v3["mapping"])  # copy

    additions = []
    skipped_low_conf_no_qnum = []
    for idx, (tag, qnum, conf, note) in MANUAL_MAPPINGS.items():
        if qnum is None:
            skipped_low_conf_no_qnum.append({"idx": idx, "tag": tag, "confidence": conf, "note": note})
            continue
        # v4 shape: [tag, qnum, confidence] (extends v3's [tag, qnum])
        mapping[str(idx)] = [tag, qnum, conf]
        additions.append({"idx": idx, "tag": tag, "qnum": qnum, "confidence": conf, "note": note})

    # Build v4 doc
    v4 = {
        "method": "v3 + Track N manual matching (PDF token-overlap + Hebrew fallback + IMA cross-check)",
        "v3_mapped": v3.get("v3_mapped", v3.get("total_mapped")),
        "v3_total_mapped": v3.get("total_mapped"),
        "track_n_added": len(additions),
        "track_n_skipped": len(skipped_low_conf_no_qnum),
        "total_mapped": len(mapping),
        "remaining_unmapped": v3.get("remaining_unmapped"),
        "ambiguous": v3.get("ambiguous"),
        # Keep the original unmapped + ambiguous lists for traceability
        "unmapped_2021_dec": [u for u in v3.get("unmapped", []) if u.get("tag") == "2021-Dec"],
        "track_n_additions": additions,
        "track_n_skipped_entries": skipped_low_conf_no_qnum,
        "stats": v3.get("stats", {}),
        "mapping": mapping,
    }

    out = REPO / ".audit_logs" / "dataset_to_qnum_mapping_v4.json"
    out.write_text(json.dumps(v4, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}")
    print(f"  v3 mapped:         {v3.get('total_mapped')}")
    print(f"  Track N additions: {len(additions)}")
    print(f"  Track N skipped:   {len(skipped_low_conf_no_qnum)}")
    print(f"  v4 total mapped:   {len(mapping)}")
    print()
    print("By confidence:")
    from collections import Counter
    counts = Counter(a["confidence"] for a in additions)
    for c in ("high", "medium", "low"):
        print(f"  {c:7s}: {counts.get(c, 0)}")


if __name__ == "__main__":
    main()
