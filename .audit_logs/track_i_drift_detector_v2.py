"""Track I — content-drift detector v2 (post-regen tuning).

v1 (track_i_distractors_content_drift.py) flagged 4401 pre-regen drifts;
random sampling confirmed they were real (cerebral-arteries question paired
with kidney-drug rationale — index-shift after deletions).

After v10.64.38's regen, v1 flagged 3412 — but post-regen sampling shows
89.7% are cross-language false positives (option in English/bilingual,
distractor in Hebrew with translated terms). The detector wasn't built
to handle that population.

v2 changes vs v1:

1. **Cross-language trust:** if option has English caps tokens AND distractor
   is mostly Hebrew AND distractor has substantive content, accept it.
   The regen prompt was explicit: "Write in the same language as the
   question". When question is Hebrew but the option is English, distractor
   typically translates terms — we trust the regen rather than try to
   handle it via bilingual dictionary.

2. **Lowered English token threshold to 3 chars:** common medical acronyms
   (MRI, RA, BP, CHF, AKI, etc.) are real signal but were excluded by the
   ≥4-char rule.

3. **Lowercase parens content:** v1 only kept English caps-leading words from
   parens (e.g. "(VASODIP)" but not "(intramedullary nails)"). v2 keeps
   any 3+ char parens content as a substring-match candidate.

4. **Acronym detection:** if option has multi-word English term, build the
   acronym (first letters) and check 2-5 letter variants.

5. **Hebrew stem matching:** strip common prefixes (ה, ב, מ, ל, ו, ש, כ +
   2-letter combos) before comparing Hebrew tokens.

Output: same shape as v1 — `{total_checked, findings: [...]}` — for
test-side mirroring.
"""
import json
import re
from pathlib import Path
from collections import Counter

REPO = Path(__file__).resolve().parent.parent
QF = REPO / "data" / "questions.json"
DF = REPO / "data" / "distractors.json"
OUT = REPO / ".audit_logs" / "track_i_drift_findings_v2.json"

ENG_TOKEN_RE = re.compile(r"\b[A-Z][A-Za-z]{2,}\b")  # ≥3 char (was ≥4 in v1)
HEB_TOKEN_RE = re.compile(r"[֐-׿][֐-׿֑-ׇ]{3,}")  # ≥4 char Hebrew word
PARENS_RE = re.compile(r"\(([^)]{2,40})\)")
ENG_WORD_RE = re.compile(r"\b[A-Za-z]{3,}\b")  # any 3+ char English word

HEB_STOPWORDS = {
    "הינו","הינה","אינו","אינה","בכל","אחת","מהן","אחד","מהם","אשר",
    "הזה","הזאת","אלו","אלה","יותר","פחות","ביותר","הבאות","הבאים",
    "ביניהם","בכלל","באותו","באותה","נכון","אמת","מקרה","מצב",
    "חולה","מטופל","הטיפול","הסיכון","תרופות","רופא","בדיקה","מעבדה",
    "ההסבר","התשובה","השכיח","השכיחה","הוא","היא","הם","הן",
}

HEB_PREFIXES = ("מה","בה","לה","וה","כה","שה","ה","ב","מ","ל","ו","ש","כ")


def heb_stem(word):
    """Strip the longest matching Hebrew prefix; require ≥3 chars remain."""
    for p in sorted(HEB_PREFIXES, key=len, reverse=True):
        if word.startswith(p) and len(word) >= len(p) + 3:
            return word[len(p):]
    return word


def is_mostly_hebrew(text, threshold=0.4):
    if not text: return False
    hebrew_chars = sum(1 for c in text if 0x0590 <= ord(c) <= 0x05FF)
    alpha_chars = len([c for c in text if c.isalpha()])
    return alpha_chars > 0 and hebrew_chars / alpha_chars >= threshold


NUM_RE = re.compile(r"\b\d{2,4}\b")  # 2-4 digit numbers (years, percentages, doses)


def extract_eng_tokens(text):
    """English caps-leading tokens (drug names, ALLCAPS) + parens content."""
    tokens = set()
    for m in ENG_TOKEN_RE.findall(text or ""):
        if len(m) >= 3:
            tokens.add(m.upper())
    # All parens content: keep as substring-match candidates
    for m in PARENS_RE.findall(text or ""):
        m = m.strip()
        if 3 <= len(m) <= 40:
            tokens.add(m.upper())
    return tokens


def extract_numbers(text):
    """Distinctive 2-4 digit numbers (years, percentages, lab values, doses)."""
    return set(NUM_RE.findall(text or ""))


def extract_heb_stems(text):
    out = set()
    for w in HEB_TOKEN_RE.findall(text or ""):
        if w in HEB_STOPWORDS: continue
        if len(w) < 5: continue
        out.add(heb_stem(w))
    return out


def build_acronyms(option):
    """First-letter acronyms from multi-word capitalized English phrases."""
    acronyms = set()
    # Match consecutive caps-leading words
    matches = re.finditer(r"(?:\b[A-Z][A-Za-z]+\b\s*){2,}", option or "")
    for m in matches:
        words = re.findall(r"\b[A-Z][A-Za-z]+\b", m.group(0))
        if len(words) < 2: continue
        # Try acronyms of all word counts ≥2
        for n in range(2, min(len(words) + 1, 6)):
            acronyms.add("".join(w[0] for w in words[:n]).upper())
    return acronyms


def detect_drift(option, distractor, c_idx_match=False):
    """Return (is_drift, has_extractable_signal). is_drift=True only when no signal matches."""
    if not option or not distractor: return (False, False)
    eng_tokens = extract_eng_tokens(option)
    heb_stems = extract_heb_stems(option)
    acronyms = build_acronyms(option)
    numbers = extract_numbers(option)

    if not eng_tokens and not heb_stems and not acronyms and not numbers:
        return (False, False)  # not enough signal to evaluate

    dist_upper = distractor.upper()

    # Direct English-token / parens-content match (case-insensitive)
    for t in eng_tokens:
        if t in dist_upper:
            return (False, True)

    # Acronym match
    for a in acronyms:
        if a in dist_upper:
            return (False, True)

    # Numeric token match
    if numbers:
        dist_numbers = extract_numbers(distractor)
        if dist_numbers & numbers:
            return (False, True)

    # Hebrew stem match
    if heb_stems:
        dist_stems = extract_heb_stems(distractor)
        if dist_stems & heb_stems:
            return (False, True)

    # Cross-language trust: option has English caps tokens AND distractor is
    # mostly Hebrew with substantive content → trust regen
    if eng_tokens and is_mostly_hebrew(distractor) and len(distractor) >= 80:
        return (False, True)

    # No matches found
    return (True, True)


def main():
    qs = json.loads(QF.read_text(encoding="utf-8"))
    ds = json.loads(DF.read_text(encoding="utf-8"))
    print(f"questions: {len(qs)}")
    print(f"distractor entries: {len(ds)}")

    drift_findings = []
    total_checked = 0
    for k_str, dist_arr in ds.items():
        try:
            i = int(k_str)
        except:
            continue
        q = qs[i] if 0 <= i < len(qs) else None
        if not q or not isinstance(q.get("o"), list):
            continue
        opts = q["o"]
        for j, dist in enumerate(dist_arr):
            if not isinstance(dist, str) or not dist.strip():
                continue
            if j >= len(opts):
                continue
            is_drift, has_signal = detect_drift(opts[j], dist)
            if not has_signal:
                continue
            total_checked += 1
            if is_drift:
                drift_findings.append({
                    "idx": i,
                    "slot": j,
                    "t": q.get("t"),
                    "option_text": opts[j][:140],
                    "distractor_text": dist[:240],
                })

    print(f"\nv2 Checked: {total_checked} (idx,slot) pairs with extractable signal")
    print(f"v2 Drift suspects: {len(drift_findings)}")
    rate = 100 * len(drift_findings) / max(total_checked, 1)
    print(f"v2 Drift rate: {rate:.2f}%")

    print("\n=== Sample v2 drift findings ===")
    for f in drift_findings[:8]:
        print(f"\nidx={f['idx']:4d} slot={f['slot']} t={f['t']}")
        print(f"  option:  {f['option_text']!r}")
        print(f"  distrct: {f['distractor_text'][:200]!r}")

    OUT.write_text(json.dumps({"total_checked": total_checked, "findings": drift_findings},
                              indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nOutput: {OUT}")


if __name__ == "__main__":
    main()
