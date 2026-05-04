"""Track I — content-drift detector v3 (residual tuning vs v2).

v2 dropped count from 3412 → 295 by adding cross-language trust + lowered
English token threshold + acronyms + Hebrew stems + numbers. Sampling the
295 residual showed:
  - ~50% lowercase English words (option "withdrawal" / distractor
    "withdrawal" — caps-leading regex misses)
  - ~20% short Hebrew tokens (4-char like "ציר", "ימני" filtered by ≥5 rule)
  - ~15% Hebrew suffix variants (option "האנטיכולינרגים" / distractor
    "אנטיכולינרגיות" — same root, prefix-strip alone insufficient)
  - ~10% likely real drift (short option text — "5%-10%", "8-10 mmHg")
  - ~5% concept synonyms (polypharmacy ↔ "more than 5 drugs")

v3 changes vs v2:

1. **Lowercase English ≥4-char tokens** — added as candidate tokens for
   case-insensitive substring matching. Catches "bacteriuria", "withdrawal",
   "cholinesterase". Filtered against ENG_STOPWORDS to avoid noise.

2. **Hebrew threshold ≥4 chars** — lowered from ≥5. Catches "ציר", "ימני",
   "פומי", short medical terms.

3. **Hebrew suffix stripping** — added (יות/ות/ים/ית/ת/ה) on top of
   prefix stripping. Both halves of the word need ≥3 chars remaining
   after each strip.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
QF = REPO / "data" / "questions.json"
DF = REPO / "data" / "distractors.json"
OUT = REPO / ".audit_logs" / "track_i_drift_findings_v3.json"

ENG_TOKEN_RE = re.compile(r"\b[A-Z][A-Za-z]{2,}\b")  # caps-leading, ≥3 char
ENG_LOWER_RE = re.compile(r"\b[a-z][a-z]{3,}\b")  # lowercase ≥4 char (v3)
HEB_TOKEN_RE = re.compile(r"[֐-׿][֐-׿֑-ׇ]{2,}")  # ≥3 char Hebrew (was ≥4 in v2)
PARENS_RE = re.compile(r"\(([^)]{2,40})\)")
NUM_RE = re.compile(r"\b\d{2,4}\b")

ENG_STOPWORDS = {
    "WITH","THIS","THAT","FROM","INTO","HAVE","BEEN","WHEN","WHAT","WERE",
    "WILL","SOME","MORE","MOST","ONLY","SUCH","WHICH","DURING","BEFORE",
    "AFTER","WITHIN","ABOUT","BETWEEN","AGAINST","BECAUSE","WOULD","COULD",
    "SHOULD","WHILE","SINCE","ALSO","BOTH","EACH","EITHER","NEITHER",
    "THEN","HERE","THERE","THEIR","THEM","THEY","THESE","THOSE","WHERE",
    "BEING","DOES","DOING","DONE","HAVING","JUST","OVER","UNDER","NOT",
    "ARE","WAS","HAS","HAD","CAN","MAY","ITS","THE","AND","FOR","BUT",
    "ANY","ALL","NOR","TWO","ONE","ARE","HAS","WAS",
}

HEB_STOPWORDS = {
    "הינו","הינה","אינו","אינה","בכל","אחת","מהן","אחד","מהם","אשר",
    "הזה","הזאת","אלו","אלה","יותר","פחות","ביותר","הבאות","הבאים",
    "ביניהם","בכלל","באותו","באותה","נכון","אמת","מקרה","מצב",
    "חולה","מטופל","הטיפול","הסיכון","תרופות","רופא","בדיקה","מעבדה",
    "ההסבר","התשובה","השכיח","השכיחה","הוא","היא","הם","הן",
}

HEB_PREFIXES = ("מה","בה","לה","וה","כה","שה","ה","ב","מ","ל","ו","ש","כ")
HEB_SUFFIXES = ("יות","ות","ים","ית","ת","ה")


def heb_stem(word):
    """Strip the longest matching Hebrew prefix AND suffix; require ≥3 chars remain."""
    # Prefix
    for p in sorted(HEB_PREFIXES, key=len, reverse=True):
        if word.startswith(p) and len(word) >= len(p) + 3:
            word = word[len(p):]
            break
    # Suffix (v3)
    for s in sorted(HEB_SUFFIXES, key=len, reverse=True):
        if word.endswith(s) and len(word) >= len(s) + 3:
            word = word[: -len(s)]
            break
    return word


def is_mostly_hebrew(text, threshold=0.4):
    if not text: return False
    hebrew_chars = sum(1 for c in text if 0x0590 <= ord(c) <= 0x05FF)
    alpha_chars = len([c for c in text if c.isalpha()])
    return alpha_chars > 0 and hebrew_chars / alpha_chars >= threshold


def extract_eng_tokens(text):
    """English tokens: caps-leading ≥3 char + lowercase ≥4 char (v3) + parens content."""
    tokens = set()
    for m in ENG_TOKEN_RE.findall(text or ""):
        if len(m) >= 3:
            up = m.upper()
            if up not in ENG_STOPWORDS:
                tokens.add(up)
    for m in ENG_LOWER_RE.findall(text or ""):
        up = m.upper()
        if up not in ENG_STOPWORDS:
            tokens.add(up)
    for m in PARENS_RE.findall(text or ""):
        m = m.strip()
        if 3 <= len(m) <= 40:
            tokens.add(m.upper())
    return tokens


def extract_numbers(text):
    return set(NUM_RE.findall(text or ""))


def extract_heb_stems(text):
    out = set()
    for w in HEB_TOKEN_RE.findall(text or ""):
        if w in HEB_STOPWORDS: continue
        if len(w) < 4: continue  # v3: lowered from ≥5 to ≥4
        s = heb_stem(w)
        if len(s) >= 3:
            out.add(s)
    return out


def build_acronyms(option):
    acronyms = set()
    matches = re.finditer(r"(?:\b[A-Z][A-Za-z]+\b\s*){2,}", option or "")
    for m in matches:
        words = re.findall(r"\b[A-Z][A-Za-z]+\b", m.group(0))
        if len(words) < 2: continue
        for n in range(2, min(len(words) + 1, 6)):
            acronyms.add("".join(w[0] for w in words[:n]).upper())
    return acronyms


def detect_drift(option, distractor):
    if not option or not distractor: return (False, False)
    eng = extract_eng_tokens(option)
    stems = extract_heb_stems(option)
    acros = build_acronyms(option)
    nums = extract_numbers(option)

    if not eng and not stems and not acros and not nums:
        return (False, False)

    dist_upper = distractor.upper()

    for t in eng:
        if t in dist_upper:
            return (False, True)

    for a in acros:
        if a in dist_upper:
            return (False, True)

    if nums:
        dist_nums = extract_numbers(distractor)
        if dist_nums & nums:
            return (False, True)

    if stems:
        dist_stems = extract_heb_stems(distractor)
        if dist_stems & stems:
            return (False, True)

    # Cross-language trust
    if eng and is_mostly_hebrew(distractor) and len(distractor) >= 80:
        return (False, True)

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

    print(f"\nv3 Checked: {total_checked} (idx,slot) pairs")
    print(f"v3 Drift suspects: {len(drift_findings)}")
    rate = 100 * len(drift_findings) / max(total_checked, 1)
    print(f"v3 Drift rate: {rate:.2f}%")

    print("\n=== Sample v3 drift findings ===")
    for f in drift_findings[:10]:
        print(f"\nidx={f['idx']:4d} slot={f['slot']} t={f['t']}")
        print(f"  option:  {f['option_text']!r}")
        print(f"  distrct: {f['distractor_text'][:200]!r}")

    OUT.write_text(json.dumps({"total_checked": total_checked, "findings": drift_findings},
                              indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"\nOutput: {OUT}")


if __name__ == "__main__":
    main()
