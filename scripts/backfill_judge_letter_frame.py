#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backfill a chaos-doctor-bot-v4 JSONL ledger with explicit judge-letter
frame fields — the offline, $0, deterministic companion to the runtime
`resolveJudgeLetter` annotation added to scripts/lib/optionResolver.mjs
(2026-05-17 audit-4).

WHY
---
`judge.correct_letter_if_app_wrong` is a DISPLAY-frame letter (the judge
only ever saw served options labeled A..D in display order —
chaos-doctor-bot-v4.mjs:546). Older ledgers recorded it raw, which let the
audit-3 §4 manual 5-row sample map it against canonical `q.o[]` and
fabricate a prose↔index "artifact" on ~41/61 disagreement rows. A rigorous
full-corpus detector found the judge is 0/61 inconsistent in display frame
— there was no defect; §4 measured its own frame error. This script writes
the resolved DISPLAY index/text AND the TRUE canonical index so no
downstream re-framer can repeat the §4 hand-error.

This file is also the CARRIED-FORWARD, TRACKED, c_accept-AWARE question
resolver. The audit-3 oracle (`classify_isok_fps.py`) is a gitignored
per-run artifact; per project_geri_audit3_caccept_outcome.md audit-4 must
re-derive / copy it forward or it reinherits c_accept blindness. The
`is_ok` / `accepted_canon` predicates below honor `c_accept` exactly like
shlav-a-mega.html:2466, so canonical resolution stays multi-accept-aware.

NON-DESTRUCTIVE: writes `<ledger>.framed.jsonl` + `<ledger>.frame_summary.json`.
The frame is distinct from the 2026-05-08 FM/IM served↔canonical prompt
bug (a real bot bug there, a no-op for Geri) — do not conflate.

Usage: PYTHONUTF8=1 python scripts/backfill_judge_letter_frame.py <ledger.jsonl> [--questions data/questions.json]
"""
import sys, os, json, unicodedata

LETTER_TO_IDX = {"A": 0, "B": 1, "C": 2, "D": 3, "E": 4, "F": 5, "G": 6, "H": 7}
BIDI = dict.fromkeys(
    [0x200E, 0x200F, 0x061C] + list(range(0x202A, 0x202F)) + list(range(0x2066, 0x206A)),
    None,
)


def norm(s):
    if s is None:
        return ""
    return "".join(unicodedata.normalize("NFC", str(s)).translate(BIDI).split())


def opt_set(arr):
    return tuple(sorted(norm(o)[:40] for o in (arr or []) if o is not None))


def stem_prefix_match(row_stem, q):
    a = norm(row_stem)
    if not a:
        return False
    for k in ("q", "q_en"):
        b = norm(q.get(k, ""))
        if not b:
            continue
        n = min(len(a), len(b))
        if n >= 12 and a[:n] == b[:n]:
            return True
    return False


def canon_idx_of_text(text, q):
    """Canonical index in q.o[]/q.o_en[] of the option whose text matches
    `text` (display-shuffled, <=120 sliced). 40-char head compare."""
    t = norm(text)[:40]
    if not t:
        return None
    for arr_key in ("o", "o_en"):
        arr = q.get(arr_key)
        if not isinstance(arr, list):
            continue
        hits = [i for i, o in enumerate(arr) if norm(o)[:40] == t]
        if len(hits) == 1:
            return hits[0]
    return None


def is_ok(q, i):
    """shlav-a-mega.html:2466 — c_accept-AWARE."""
    if i is None:
        return None
    ca = q.get("c_accept")
    if isinstance(ca, list) and len(ca) > 0:
        return i in ca
    return i == q.get("c")


def accepted_canon(q):
    ca = q.get("c_accept")
    if isinstance(ca, list) and len(ca) > 0:
        return set(ca)
    c = q.get("c")
    return {c} if c is not None else set()


def reconstruct_display_accepted(q, row_opts):
    out = set()
    for j in accepted_canon(q):
        arr = q.get("o") or []
        if not (0 <= j < len(arr)):
            return None
        t = norm(arr[j])[:40]
        d = [i for i, o in enumerate(row_opts) if norm(o)[:40] == t]
        if len(d) != 1:
            return None
        out.add(d[0])
    return out


def resolve_question(row, QS):
    """Locked dup-stem-aware resolver (mirrors classify_isok_fps.py v2,
    gate-validated 2026-05-17). Returns (q, reason) or (None, reason)."""
    stem = row.get("stem", "")
    opts = row.get("options") or []
    cands = []
    for q in QS:
        if stem_prefix_match(stem, q) and q not in cands:
            cands.append(q)
    if not cands:
        return None, "no_stem"
    if len(cands) == 1:
        return cands[0], "unique_stem"
    rk = opt_set(opts)
    by_opts = [q for q in cands if opt_set(q.get("o")) == rk
               or opt_set(q.get("o_en")) == rk]
    if len(by_opts) == 1:
        return by_opts[0], "opt_set"
    pool = by_opts if by_opts else cands
    app_disp = row.get("appDisplayIdx")
    if app_disp is None:
        app_disp = row.get("appIdx")
    if app_disp is not None and 0 <= app_disp < len(opts):
        app_txt = opts[app_disp]
        consistent = []
        for q in pool:
            ci = canon_idx_of_text(app_txt, q)
            if ci is not None and is_ok(q, ci) is True:
                consistent.append(q)
        if len(consistent) == 1:
            return consistent[0], "app_key"
        if len(consistent) > 1:
            aset = row.get("appAcceptedDisplayIdxSet")
            if isinstance(aset, list):
                want = set(aset)
                exact = [q for q in consistent
                         if reconstruct_display_accepted(q, opts) == want]
                if len(exact) == 1:
                    return exact[0], "app_set"
            return consistent[0], "dup_equiv"
    if len(pool) == 1:
        return pool[0], "opt_pool1"
    return None, "ambiguous_dup"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    ledger = sys.argv[1]
    qpath = "data/questions.json"
    if "--questions" in sys.argv:
        qpath = sys.argv[sys.argv.index("--questions") + 1]
    QS = json.load(open(qpath, encoding="utf-8"))

    rows = [json.loads(l) for l in open(ledger, encoding="utf-8") if l.strip()]
    out_path = ledger + ".framed.jsonl"
    summ = {
        "ledger": ledger, "rows": len(rows),
        "disagrees_true": 0,
        "letter_resolved_display": 0,
        "canonical_resolved": 0,
        "no_usable_letter": 0,
        "question_unresolved": 0,
    }
    with open(out_path, "w", encoding="utf-8") as out:
        for r in rows:
            j = r.get("judge") if isinstance(r.get("judge"), dict) else None
            if r.get("disagrees") is True:
                summ["disagrees_true"] += 1
            if j is not None:
                letter = j.get("correct_letter_if_app_wrong")
                opts = r.get("options") or []
                L = (str(letter).strip()[:1].upper()) if letter else ""
                di = LETTER_TO_IDX.get(L)
                if di is not None and 0 <= di < len(opts):
                    j["correct_letter_frame"] = "display"
                    j["correct_display_idx"] = di
                    j["correct_display_text"] = opts[di]
                    summ["letter_resolved_display"] += 1
                    q, why = resolve_question(r, QS)
                    if q is not None:
                        cidx = canon_idx_of_text(opts[di], q)
                        j["correct_canonical_idx"] = cidx
                        j["correct_canonical_resolve"] = why
                        if cidx is not None:
                            summ["canonical_resolved"] += 1
                    else:
                        j["correct_canonical_idx"] = None
                        j["correct_canonical_resolve"] = why
                        summ["question_unresolved"] += 1
                else:
                    j["correct_letter_frame"] = "display"
                    j["correct_display_idx"] = None
                    j["correct_display_text"] = None
                    j["correct_canonical_idx"] = None
                    if r.get("disagrees") is True:
                        summ["no_usable_letter"] += 1
            out.write(json.dumps(r, ensure_ascii=False) + "\n")

    sjson = ledger + ".frame_summary.json"
    json.dump(summ, open(sjson, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print(json.dumps(summ, ensure_ascii=False, indent=2))
    print(f"\n[framed]  {out_path}\n[summary] {sjson}")


if __name__ == "__main__":
    main()
