#!/usr/bin/env python3
"""Generate board-exam-style Hebrew MCQs for low-volume topic buckets via toranot proxy.

Pattern: 6 workers, 1-Q-per-call, ~3-5s each (slightly slower than triage due to
larger output). Mirrors scripts/eissue_via_proxy.py.

Targets ti=43 (Andropause), ti=44 (Prevention), ti=45 (Geriatric team).
Generates ~12 per bucket → expect ~30+ accepted after strict validation.
"""
import json, sys, time, concurrent.futures, urllib.request, urllib.error, re, hashlib

PROXY = "https://toranot.netlify.app/api/claude"
SECRET = "shlav-a-mega-2026"
QS_PATH = "data/questions.json"

BUCKETS = {
    43: {
        "name": "Andropause / late-onset hypogonadism",
        "n": 12,
        "topics": [
            "Late-onset hypogonadism diagnosis: requires symptoms PLUS two morning total testosterone <300 ng/dL (10.4 nmol/L) — single low value insufficient",
            "TRT contraindications: prostate cancer (active), breast cancer, untreated severe OSA, Hct >50%, untreated severe CHF, recent MI/stroke (<6mo)",
            "TRT monitoring: Hct + PSA + total testosterone at 3 and 6 months, then annually",
            "TRAVERSE trial 2023 (NEJM): TRT did NOT increase major adverse cardiovascular events vs placebo in middle-aged/older men with hypogonadism + CV risk",
            "Free testosterone vs total: SHBG rises with age; prefer free or bioavailable T when total is borderline (200-400) or SHBG abnormal",
            "Late-onset hypogonadism prevalence ~20% of men >70, but symptomatic LOH only ~2-5%",
            "Erectile dysfunction in elderly: vascular > endocrine; check fasting glucose, lipids, BP before TRT",
            "Hypogonadism workup: total T morning x2 → if low, LH/FSH/prolactin → primary (high LH) vs secondary (low/normal LH)",
            "Osteoporosis from chronic hypogonadism: indication for DEXA + bisphosphonate consideration",
            "Adverse effects of TRT: erythrocytosis (most common), gynecomastia, acne, sleep apnea worsening, fluid retention",
            "Endocrine Society guideline 2018: do NOT screen asymptomatic men for hypogonadism — only test if symptoms (low libido, fatigue, ED)",
            "Differential of low T in elderly: obesity, OSA, opioids, glucocorticoids, chronic illness — treat underlying cause first",
        ],
        "ref_pool": [
            "Hazzard Ch 99 — ENDOCRINOLOGY OF AGING",
            "Hazzard Ch 99 — ENDOCRINOLOGY OF AGING · Endocrine Society Guideline 2018",
            "AGS GRS — Endocrinology · TRAVERSE NEJM 2023",
        ],
    },
    44: {
        "name": "Prevention and health promotion in elderly",
        "n": 12,
        "topics": [
            "Mammography cessation: USPSTF — biennial 50-74; AGS — shared decision >75 if life expectancy >10 years",
            "Colonoscopy cessation: USPSTF — stop at 75 (insufficient evidence beyond); individualize 76-85; do not screen >85",
            "AAA screening: one-time abdominal U/S in men 65-75 who ever smoked (USPSTF B); do not screen women",
            "Cervical cancer screening cessation: stop at 65 if adequate prior screening (3 negative Pap or 2 negative HPV in last 10y)",
            "Bone density screening: women ≥65, men ≥70 (or younger with risk factors); cadence depends on baseline T-score",
            "Statin primary prevention >75: recent ALLHEART/STAREE evidence supports if life expectancy >5y; PCE less validated >75",
            "Aspirin primary prevention: ASPREE trial 2018 — net HARM in healthy adults ≥70 (more bleeding, no MACE benefit); USPSTF removed recommendation",
            "Falls screening: STEADI algorithm — annual ask about falls, balance, gait; if positive, TUG + multifactorial assessment",
            "Pneumococcal vaccine ≥65: PCV20 alone OR PCV15 followed by PPSV23 ≥1 year later (CDC 2022 update)",
            "RSV vaccine: shared clinical decision-making for adults ≥60, recommended ≥75 (CDC 2024 update)",
            "Shingrix (zoster recombinant): 2 doses 2-6 months apart, all adults ≥50 even if prior shingles or prior Zostavax",
            "Cognitive screening: USPSTF — insufficient evidence to recommend universal screening; Medicare AWV requires cognitive assessment",
        ],
        "ref_pool": [
            "USPSTF 2024",
            "AGS Choosing Wisely · USPSTF 2024",
            "CDC ACIP 2024",
            "Hazzard Ch 14 — PREVENTIVE GERONTOLOGY · USPSTF 2024",
        ],
    },
    45: {
        "name": "Geriatric interdisciplinary team / care models",
        "n": 12,
        "topics": [
            "Multidisciplinary vs interdisciplinary: multi = parallel work in silos with separate notes; inter = shared goals + integrated care plan + joint rounds",
            "ACE units (Acute Care for Elders): randomized evidence — reduce functional decline at discharge, no mortality difference (Landefeld 1995, Counsell 2000)",
            "HELP (Hospital Elder Life Program, Inouye): non-pharmacologic delirium prevention — reduces delirium incidence ~40%",
            "GRACE model: home-based geriatric care management for low-income elders — reduces ED visits and hospitalization",
            "PACE (Program of All-inclusive Care for the Elderly): capitated care for nursing-home-eligible elders living in community; integrates Medicare + Medicaid",
            "Pharmacist on geriatric team: medication reconciliation reduces ADRs and readmissions; AGS Beers list application",
            "Hospital-at-Home: acute-level care delivered at home with daily MD/RN visits — non-inferior outcomes, lower cost, lower delirium",
            "Care transitions: Coleman Care Transitions Intervention — 4 pillars (medication self-management, PHR, follow-up, red flags); reduces 30d readmits",
            "Caregiver burden assessment: Zarit Burden Interview — 22 items; high burden predicts caregiver depression and patient institutionalization",
            "OT vs PT scope: PT = mobility, gait, strength, balance; OT = ADL/IADL training, adaptive equipment, cognitive-functional assessment",
            "Speech-language pathologist (SLP): swallow evaluation (bedside + VFSS), communication strategies post-stroke, cognitive-linguistic therapy",
            "Social worker on geriatric team: discharge planning, benefits navigation (Medicaid, MOH סיעוד), caregiver support, advance care planning facilitation",
        ],
        "ref_pool": [
            "Hazzard Ch 13 — INTERDISCIPLINARY TEAM CARE",
            "Hazzard Ch 13 — INTERDISCIPLINARY TEAM CARE · AGS GRS — Care Models",
            "AGS GRS — Care Settings",
        ],
    },
}

PROMPT = """אתה מחבר שאלות לבחינת מועצה ברפואת קשישים בישראל (IMA P005-2026, סילבוס v3.0 יולי 2024).

נושא: {bucket_name}
פוקוס ספציפי לשאלה זו: {topic}

צור שאלה מסוג case-based MCQ אחת בעברית רהוטה ברמת בחינה.

דרישות פורמט (חובה):
- שאלה (q): וניאט קליני בן 1-3 משפטים, 80-200 תווים, כולל גיל המטופל ופרט אחד עיקרי. סיים בשאלה ברורה.
- 4 אופציות (o): ['א. ...', 'ב. ...', 'ג. ...', 'ד. ...'] — כל אחת מתחילה בתג העברי, בעלת אורך דומה (15-80 תווים), שלוש מסיחים סבירים אך שגויים, אחת תשובה נכונה
- אינדקס נכון (c): 0, 1, 2, או 3 (תואם לאות א/ב/ג/ד)
- הסבר (e): 250-450 תווים בעברית. הסבר למה התשובה הנכונה נכונה (התייחס לאות), ולמה לפחות שתי האחרות שגויות. כלול ציטוט/מקור/מספר/קווי הנחיה.
- מקור (ref): השתמש בפורמט הזה: "{ref_default}"

כללים נוספים:
- אל תשתמש ב-markdown (לא **, לא ##)
- אל תשתמש בחיצים (←→↑↓) — הם נשברים בעברית
- בעברית: השתמש בנקודה, פסיק, גרשיים רגילים בלבד
- אם אינך בטוח בעובדה רפואית — החזר {{"skip": true, "why": "<סיבה ב-10 מילים>"}}

החזר JSON אחד בלבד, ללא טקסט נוסף, ללא code fences:
{{"q": "...", "o": ["א. ...", "ב. ...", "ג. ...", "ד. ...."], "c": 0-3, "e": "...", "ref": "..."}}"""


def gen_one(bucket_ti, topic_idx, topic, bucket_meta):
    try:
        prompt = PROMPT.format(
            bucket_name=bucket_meta["name"],
            topic=topic,
            ref_default=bucket_meta["ref_pool"][0],
        )
        body = json.dumps({
            "model": "sonnet",
            "max_tokens": 1500,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            PROXY, data=body,
            headers={"x-api-secret": SECRET, "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode())
        txt = ''
        for blk in data.get('content', []):
            if blk.get('type') == 'text':
                txt = blk.get('text', '').strip()
                break
        if txt.startswith('```'):
            txt = re.sub(r'^```(?:json)?\s*', '', txt)
            txt = re.sub(r'\s*```\s*$', '', txt)
        if '{' in txt and '}' in txt:
            txt = txt[txt.index('{'):txt.rindex('}')+1]
        return bucket_ti, topic_idx, json.loads(txt), None
    except json.JSONDecodeError as e:
        return bucket_ti, topic_idx, None, f"json_parse: {str(e)[:40]}"
    except urllib.error.HTTPError as e:
        return bucket_ti, topic_idx, None, f"http_{e.code}"
    except Exception as e:
        return bucket_ti, topic_idx, None, str(e)[:60]


def hebrew_pct(s):
    if not s: return 0.0
    heb = sum(1 for c in s if '\u0590' <= c <= '\u05FF')
    return heb / len(s)


def validate(q):
    """Return (ok, reason) for a generated Q."""
    if q.get("skip"):
        return False, f"model_skipped: {q.get('why', '')[:30]}"
    required = {'q', 'o', 'c', 'e', 'ref'}
    if not required.issubset(q.keys()):
        return False, f"missing_fields: {required - set(q.keys())}"
    if not isinstance(q['o'], list) or len(q['o']) != 4:
        return False, f"bad_options_count: {len(q.get('o',[])) if isinstance(q.get('o'), list) else 'not_list'}"
    if not isinstance(q['c'], int) or q['c'] not in (0, 1, 2, 3):
        return False, f"bad_c: {q.get('c')}"
    if not 60 <= len(q['q']) <= 350:
        return False, f"q_length_{len(q['q'])}"
    if hebrew_pct(q['q']) < 0.40:
        return False, f"q_low_hebrew_{hebrew_pct(q['q']):.0%}"
    if not 200 <= len(q['e']) <= 700:
        return False, f"e_length_{len(q['e'])}"
    if hebrew_pct(q['e']) < 0.40:
        return False, f"e_low_hebrew_{hebrew_pct(q['e']):.0%}"
    # Options: each prefixed with א./ב./ג./ד., reasonable length
    expected_prefixes = ['א.', 'ב.', 'ג.', 'ד.']
    for i, opt in enumerate(q['o']):
        if not isinstance(opt, str):
            return False, f"opt{i}_not_string"
        if not opt.startswith(expected_prefixes[i]):
            return False, f"opt{i}_bad_prefix"
        if not 5 <= len(opt) <= 200:
            return False, f"opt{i}_length_{len(opt)}"
    # No markdown / arrows
    blob = q['q'] + ' '.join(q['o']) + q['e']
    for bad in ['**', '##', '```', '→', '←', '↑', '↓']:
        if bad in blob:
            return False, f"contains_{bad}"
    # Ref present, looks like real ref
    if not isinstance(q['ref'], str) or len(q['ref']) < 8:
        return False, "ref_too_short"
    return True, "ok"


def dedup_check(new_q, existing_qs):
    """Reject if too similar to any existing Q. Use first 60 chars of stem as fingerprint."""
    new_fp = re.sub(r'\s+', ' ', new_q['q'][:60]).strip()
    for q in existing_qs:
        existing_fp = re.sub(r'\s+', ' ', (q.get('q') or '')[:60]).strip()
        if existing_fp == new_fp:
            return False
    return True


def main():
    qs = json.load(open(QS_PATH, encoding='utf-8'))
    print(f"Loaded {len(qs)} existing Qs")

    # Build job list
    jobs = []
    for ti, meta in BUCKETS.items():
        for idx, topic in enumerate(meta["topics"][:meta["n"]]):
            jobs.append((ti, idx, topic, meta))
    print(f"Submitting {len(jobs)} generation jobs across {len(BUCKETS)} buckets\n")

    start = time.time()
    raw = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(gen_one, ti, idx, topic, meta): (ti, idx)
                for (ti, idx, topic, meta) in jobs}
        done = 0
        for fut in concurrent.futures.as_completed(futs):
            ti, idx, q, err = fut.result()
            done += 1
            if err:
                print(f"  [{done:2d}/{len(jobs)}] ti={ti} t{idx:02d}: ERR {err}")
            else:
                print(f"  [{done:2d}/{len(jobs)}] ti={ti} t{idx:02d}: OK")
                raw.append((ti, idx, q))

    print(f"\nGeneration: {len(raw)}/{len(jobs)} got JSON in {time.time()-start:.0f}s")

    # Validate + dedupe
    accepted = []
    rejected = []
    for ti, idx, q in raw:
        ok, why = validate(q)
        if not ok:
            rejected.append((ti, idx, why, q))
            continue
        if not dedup_check(q, qs + [a[2] for a in accepted]):
            rejected.append((ti, idx, "duplicate", q))
            continue
        # Assemble final Q
        ref_pool = BUCKETS[ti]["ref_pool"]
        final = {
            "t": "Hazzard",
            "ti": ti,
            "q": q['q'].strip(),
            "o": q['o'],
            "c": q['c'],
            "e": q['e'].strip(),
            "ref": q['ref'].strip() if q['ref'].strip() else ref_pool[0],
        }
        accepted.append((ti, idx, final))

    print(f"\nValidation: {len(accepted)} accepted, {len(rejected)} rejected")
    by_bucket = {ti: 0 for ti in BUCKETS}
    for ti, _, _ in accepted:
        by_bucket[ti] += 1
    for ti, n in by_bucket.items():
        print(f"  ti={ti} ({BUCKETS[ti]['name'][:40]}): {n} accepted")
    if rejected:
        print("\nRejection reasons:")
        for ti, idx, why, _ in rejected[:10]:
            print(f"  ti={ti} t{idx:02d}: {why}")

    if not accepted:
        print("Nothing accepted, aborting.")
        sys.exit(1)

    # Append to questions.json
    for _, _, q in accepted:
        qs.append(q)

    json.dump(qs, open(QS_PATH, 'w', encoding='utf-8'),
              ensure_ascii=False, indent=0)

    elapsed = time.time() - start
    print(f"\nDone in {elapsed:.0f}s. {len(accepted)} new Qs added.")
    print(f"New total: {len(qs)} (was {len(qs) - len(accepted)})")
    print(f"Wrote {QS_PATH}")


if __name__ == "__main__":
    main()
