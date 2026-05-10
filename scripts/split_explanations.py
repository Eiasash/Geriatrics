#!/usr/bin/env python3
"""
split_explanations.py — Move data/questions.json `e` field into data/explanations.json
indexed by Q position. Idempotent. Prints pre/post SHA-256 manifest of the joined
e-array so the commit message can quote both hashes verbatim (CLAUDE.md release-
invariant §4 — content-preserving refactor needs no per-Q PDF quote, just hash parity).

Usage:
    PYTHONUTF8=1 python scripts/split_explanations.py
"""
import hashlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
QUESTIONS = ROOT / "data" / "questions.json"
EXPLANATIONS = ROOT / "data" / "explanations.json"


def sha256_of_joined(arr):
    """SHA-256 of NUL-joined e-strings (NUL chosen because it cannot appear in
    the Hebrew/English text content; gives unambiguous string-boundary hashing)."""
    h = hashlib.sha256()
    for s in arr:
        h.update((s or "").encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def write_atomic(path: Path, payload: str):
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    os.replace(tmp, path)


def main():
    if not QUESTIONS.exists():
        sys.exit(f"FATAL: {QUESTIONS} not found")

    qz = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    n = len(qz)

    have_e = sum(1 for q in qz if "e" in q)
    if have_e == 0:
        if EXPLANATIONS.exists():
            print(f"OK: questions.json already split (0/{n} carry e); explanations.json present. No-op.")
            return 0
        else:
            sys.exit(f"FATAL: questions.json has 0 e-fields and explanations.json missing — nothing to split, refusing to create empty explanations.json")

    pre_e = [q.get("e", "") for q in qz]
    pre_hash = sha256_of_joined(pre_e)
    pre_size = QUESTIONS.stat().st_size

    # Strip e from in-memory questions; preserve all other key order via dict comp
    qz_stripped = []
    for q in qz:
        new_q = {k: v for k, v in q.items() if k != "e"}
        qz_stripped.append(new_q)

    # Match the original questions.json convention: indent=0 (newline between
    # every field, no leading indent). Keeps the post-split diff scoped to
    # `e`-field deletions only — easier review than a format-rewrite diff.
    questions_payload = json.dumps(qz_stripped, indent=0, ensure_ascii=False) + "\n"

    # explanations.json: same indent=0 convention so the array reads one
    # explanation per record block (consistent with existing data/*.json files).
    explanations_payload = json.dumps(pre_e, indent=0, ensure_ascii=False) + "\n"

    write_atomic(EXPLANATIONS, explanations_payload)
    write_atomic(QUESTIONS, questions_payload)

    # Verify roundtrip
    post_q = json.loads(QUESTIONS.read_text(encoding="utf-8"))
    post_e = json.loads(EXPLANATIONS.read_text(encoding="utf-8"))
    if len(post_q) != n or len(post_e) != n:
        sys.exit(f"FATAL: post-split length mismatch (q={len(post_q)}, e={len(post_e)}, expected {n})")
    post_hash = sha256_of_joined(post_e)
    if post_hash != pre_hash:
        sys.exit(f"FATAL: e-array hash drift pre={pre_hash} post={post_hash}")
    if any("e" in q for q in post_q):
        sys.exit("FATAL: questions.json still has e-field after split")

    post_size = QUESTIONS.stat().st_size
    delta_pct = 100.0 * (pre_size - post_size) / pre_size

    print(f"OK: split {n} explanations from questions.json")
    print(f"  questions.json: {pre_size/1024/1024:.2f} MB -> {post_size/1024/1024:.2f} MB (-{delta_pct:.1f}%)")
    print(f"  explanations.json: {EXPLANATIONS.stat().st_size/1024/1024:.2f} MB")
    print(f"  e-array sha256 (NUL-joined, pre==post): {pre_hash}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
