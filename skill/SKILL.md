---
name: geriatrics-shlav-a
description: >
  Shlav A (שלב א) geriatric medicine board exam preparation — Israeli IMA licensing exam P005-2026.
  ALWAYS use this skill when Eias asks about a geriatric board question, Hebrew MCQ, clinical
  scenario for the exam, "why is X correct", "why not Y", "what does Hazzard's say",
  "what does Harrison's say", "explain this question", "high yield", topic review, distractor
  analysis, or when any Hebrew clinical question is pasted into chat. Also trigger on:
  board review, exam patterns, Israeli geriatric law questions, Beers 2023, FIM, dementia
  criteria, delirium CAM, frailty Fried, advance directives, guardianship, capacity,
  dying patient act, fitness to drive, elder abuse, VasCog-2, Alzheimer IWG criteria.
  SOURCES: Hazzard's 8e (all chapters EXCEPT 2-6, 34, 62) + Harrison's 22e (specific
  chapters per P005-2026) + 6 mandatory articles + 13 Israeli law documents. NO GRS.
  Always search project_knowledge_search first. Be opinionated — answer + mechanism directly.
---

# Geriatrics Shlav A — Board Prep Skill (P005-2026)

## OFFICIAL SYLLABUS — P005-2026

### Hazzard's Geriatric Medicine 8e
ALL chapters **EXCEPT**: Ch 2-6 (excluded), Ch 34 (excluded), Ch 62 (excluded).
Everything else is in scope.

### Harrison's 22e — ALL Residents (both base and subspecialty)
Ch 26 (Weakness/Paralysis), 382 (Articular/MSK), 387 (Periarticular), 433 (Neuro approach),
436 (Seizures), 437 (Cerebrovascular intro), 438 (Ischemic stroke), 439 (ICH),
458 (GBS/neuropathies), 459 (MG/NMJ)

### Harrison's 22e — Base Residency Additional
Ch 14 (Pain), 15 (Chest), 16 (Abdominal pain), 17 (Headache), 18 (Low back), 20 (Fever),
22 (FUO), 30 (Coma), 39 (Dyspnea), 40 (Cough), 41 (Hemoptysis), 42 (Hypoxia), 43 (Edema),
48 (Nausea/vomiting), 49 (Diarrhea/constipation), 50 (Weight loss), 51 (GI bleed),
52 (Jaundice), 53 (Ascites), 55 (Azotemia/urinary), 56 (Fluids/electrolytes),
57 (Ca disorders), 58 (Acid-base), 66 (Anemia), 67 (Granulocytes), 69 (Bleeding/thrombosis),
70 (Lymphadenopathy), 79 (Cancer infections), 80 (Oncologic emergencies), 102 (Iron deficiency),
120 (Platelets/vessel wall), 121 (Coagulation), 127 (Febrile patient), 133 (Endocarditis),
136 (Osteomyelitis), 142 (Encephalitis), 143 (Meningitis), 147 (HCAI), 243 (CV approach),
247 (ECG), 285 (NSTEMI/UA), 286 (STEMI), 295 (Respiratory approach), 305 (Pleura),
311 (Critical illness), 314 (Shock), 315 (Sepsis), 316 (Cardiogenic shock), 317 (Cardiac arrest),
319 (Renal approach), 321 (AKI), 322 (CKD), 332 (GI approach), 347 (Liver function),
355 (Cirrhosis), 375 (Vasculitis), 379 (Sarcoidosis), 384 (Gout/crystal), 388 (Endocrine)

### Mandatory Articles (6)
1. **Beers 2023** — JAGS 71:2052-2081 (full criteria, all categories)
2. **VasCog-2** — Revised Vascular Cognitive Impairment criteria, JAMA Neurology
3. **Alzheimer IWG** — Alzheimer as clinical-biological construct, JAMA Neurology
4. **Alzheimer's Association 2024** — Revised staging criteria, Alzheimer's & Dementia
5. **Dementia Prevention** — Narrative review, JAMA Internal Medicine
6. **Age-Related Hearing Loss** — NEJM

### Israeli Law Documents (13)
1. MOH Geriatric definitions (נהלי רוחב — מושגים)
2. Functional status classification for hospital transfer
3. Criteria for rehabilitation services for elderly
4. **חוק החולה הנוטה למות 2005** — Dying Patient Act
5. PEG in dying patient with dementia — national committee recommendations
6. Guardianship appointment in prolonged hospitalization
7. Drafting continuing POA (ייפוי כוח מתמשך)
8. Activating POA in urgent hospital situations
9. Alternative decision-maker for urgent medical situations
10. Supported decision-making (קבלת החלטות נתמכת)
11. Criteria for complex nursing geriatric department (סיעוד מורכב)
12. Protocol for treating elder abuse (נוהל 12)
13. Duty to report medically unfit drivers

### Additional Required
- **FIM** (Functional Independence Measure) — must know all 18 items, scoring 1-7
- **Brookdale 2024 Statistics** — pp 33-43 (infographic), 47-55 (demographics), 131-140 (health)

**NO GRS** — removed from P005-2026 syllabus.

---

## APP STRUCTURE (eiasash.github.io/Geriatrics)

- `shlav-a-mega.html` — main PWA: 1,148 MCQs, 40 topics, SR, exam mode, calculators, OSCE
- `questions.json` — `{q, o, c, t, ti}` — question, options, correct index, year, topic index
- `notes.json` — 40 topic notes (Hazzard's + Harrison's sourced)
- `flashcards.json` — 159 cards `{f, b}`
- `drugs.json` — 53 drugs with Beers + ACB

**AI Explain feature** (v8.1+): After answering, click "🤖 הסבר AI" → Claude Opus explains
correct answer + destroys distractors + cites Hazzard's/Harrison's chapter + board pearl.
API key stored in localStorage `samega_apikey`. Explanations cached in `samega_ex`.

---

## WORKFLOW FOR ANY QUESTION

1. **project_knowledge_search** — search with topic + key term before answering
2. **Identify the kernel** — what is actually being tested (strip clinical story)
3. **Correct answer + mechanism** — direct, 2-3 sentences
4. **Destroy each distractor** — one sentence each, specific reason
5. **Board pearl** — one-sentence exam-extractable rule
6. **Source** — specific Hazzard's chapter OR Harrison's chapter number from syllabus

### Answer Format
```
✅ נכון: [answer] — [mechanism]

❌ [Wrong A] — [why fails]
❌ [Wrong B] — [why fails]
❌ [Wrong C] — [why fails]

📌 פנינת מבחן: [one sentence rule]
📖 מקור: [Hazzard's Ch X / Harrison's Ch Y / Article name]
TOPIC: [topic name, 0-39]
```

---

## HIGH-YIELD BY OFFICIAL ARTICLE

### Beers 2023 (JAGS — mandatory article)
- **Category 1 — avoid always:** diphenhydramine, all BZDs + Z-drugs, TCAs (amitriptyline),
  oral oxybutynin, metoclopramide >12w, systemic NSAIDs long-term, megestrol
- **Category 2 — avoid unless benefit>risk:** antipsychotics in dementia (mortality+CVA),
  digoxin >0.125mg, nifedipine IR, alpha-1 blockers for HTN
- **Category 3 — avoid in specific conditions:** NSAIDs+CrCl<30, anticholinergics+dementia,
  BZDs+fall history, CCBs (diltiazem/verapamil)+HFrEF

### VasCog-2 (JAMA Neurology — mandatory article)
- Vascular Cognitive Impairment: requires BOTH vascular lesion on imaging + cognitive symptoms
- Temporal relationship required: symptoms within 6 months of vascular event (or gradual progression with clear vascular burden)
- Replaces "vascular dementia" terminology
- Subtypes: mild VCI, major VCI (vascular dementia), mixed (with AD pathology)
- Key distinction from AD: stepwise decline, prominent executive dysfunction > memory early on

### Alzheimer IWG + AA 2024 (JAMA Neurology + A&D — mandatory)
- **IWG**: Alzheimer = clinical-biological construct. Requires BOTH clinical syndrome + biological evidence (amyloid/tau biomarkers)
- **AA 2024**: Revised staging — preclinical (biomarker+, no symptoms) → prodromal (MCI) → dementia
- ATN framework: Amyloid / Tau / Neurodegeneration biomarkers
- Blood-based biomarkers (p-tau 217, Aβ42/40 ratio) now clinically validated
- Exam point: AD diagnosis no longer requires dementia — biological evidence alone sufficient for preclinical stage

### Dementia Prevention (JAMA IM — mandatory)
- Lancet 2024: 14 modifiable risk factors (12 from Lancet 2020 + 2 new: vision loss, high LDL)
- Population-attributable risk ~45%
- High-yield modifiable factors: hearing loss, hypertension, physical inactivity, diabetes,
  obesity, depression, smoking, low education, social isolation, TBI, alcohol, air pollution,
  vision loss (new), LDL (new)
- Treatment of hypertension = strongest evidence for prevention (midlife especially)

### Hearing Loss NEJM (mandatory)
- Most common sensory deficit in elderly; prevalence >60% at age >70
- Sensorineural (presbycusis): bilateral, symmetric, high-frequency first
- Consequences: social isolation, depression, cognitive decline (independent risk factor)
- Hearing aids: reduce cognitive decline progression (ACHIEVE trial — 48% reduction in cognitive decline in high-risk group)
- Screening: whisper test, audiogram. Pure-tone average (PTA) 0.5-4kHz defines severity.
- Exam: hearing loss → cognitive decline risk. Hearing aids → intervention with evidence.

---

## HIGH-YIELD EXAM FACTS (from question bank analysis)

### Delirium
- CAM: (1)acute/fluctuating + (2)inattention + [(3)disorganized OR (4)↓consciousness] — need 1+2+3or4
- Hypoactive = 50%, worst prognosis, missed 70% → ALWAYS tested
- Restraints = INDEPENDENT RISK FACTOR, not treatment
- Donepezil does NOT prevent postop delirium (SOE=A). Rivastigmine = harmful (SOE=B)
- Haloperidol: reduces severity in hip fracture, does NOT prevent delirium
- Minor insult → severe delirium = suspect underlying dementia

### Dementia
- FTD-bvFTD: behavioral/personality FIRST (disinhibition, apathy) → memory LATE. Opposite of AD.
- Lewy Body: parkinsonism + fluctuating cognition + visual hallucinations + REM sleep disorder
- AD: insidious memory onset, gradual progression. Now: biomarker-defined (IWG 2024).
- VCI: executive dysfunction > memory; stepwise; vascular lesions on MRI (VasCog-2)
- MCI → dementia: 15%/year (not inevitable)
- MMSE misses mild → MoCA preferred

### Frailty (Hazzard's Ch 20)
- Fried Phenotype: exhaustion, weakness, slowness, low activity, weight loss. ≥3=frail, 1-2=pre-frail.
- CFS 1-9: ≥5 frail, ≥7 severely frail
- Frailty ≠ disability ≠ comorbidity (three distinct, overlapping constructs)

### HFpEF (Hazzard's Ch 28)
- SGLT2i (empagliflozin/dapagliflozin) = only proven mortality+hospitalization benefit in HFpEF
- Digoxin = reduces hospitalizations, NOT mortality
- Loop diuretics = symptom only
- ARNi: evidence emerging, not definitive

### Israeli Law — Critical Nuances
- Dying patient = <6 months, confirmed by 3-physician committee
- Living will OVERRIDES family wishes IF patient lacks capacity
- Capacitated patient's CURRENT VERBAL WISH overrides their OWN prior written directive
- Cyclic treatment (dialysis, chemo) = refuse next cycle. Continuous (ventilator) = harder, needs committee.
- Capacity (כשירות) = physician assesses. Competency (כשרות) = court determines.
- Continuing POA = only valid if appointed WHILE PERSON HAS CAPACITY

### FIM (Functional Independence Measure)
- 18 items: 13 motor + 5 cognitive
- Each scored 1-7: 1=total assist, 7=complete independence
- Motor domains: self-care (6), sphincter control (2), transfers (3), locomotion (2)
- Cognitive domains: communication (2), social cognition (3)
- Total range: 18-126
- Used for: rehab eligibility, progress tracking, discharge planning

---

## EXAM TRAPS TABLE

| Trap | Correct Rule |
|---|---|
| Donepezil prevents postop delirium | FALSE (SOE=A against) |
| Restraints prevent delirium | FALSE — independent RISK FACTOR |
| Hypoactive delirium = mild | FALSE — worst prognosis |
| FTD = memory loss first | FALSE — behavioral changes first |
| Albumin = good nutrition marker | FALSE — acute phase reactant |
| Aspirin = AF anticoagulation | FALSE — no evidence |
| GRS in syllabus | FALSE — removed P005-2026 |
| Capacity = court decision | FALSE — physician assessment |
| Living will yields to family | FALSE — legally binding over family |
| Current verbal wish yields to old directive | FALSE — current capacity wins |
| MCI always → dementia | FALSE — 15%/year only |
| Hearing aid = no evidence | FALSE — ACHIEVE trial: 48% reduction |

---

## REFERENCE FILES

- `references/legal-ethics.md` — full Israeli law details per document
- `references/exam-patterns.md` — repeating stems, year frequency, key numbers to memorize

---

## CLAUDE CODE WORKFLOW

### What to type in Claude Code
```
/audit-fix-deploy
```
That's it. The command does the full cycle: read → audit → fix → validate → push.

### Other commands
```
/audit              — audit only, no fixes
/add-questions      — add new MCQs to questions.json with auto topic-tagging
/update-notes       — update study notes from Hazzard's/Harrison's content
/explain-batch      — pre-generate AI explanations for top questions
```

### Agents (run autonomously)
- `question-explainer` — paste any Hebrew MCQ, get structured explanation + source
- `note-updater` — update notes.json for a specific topic

### Deploy = git push
No build step. Push main → GitHub Pages live in ~60s.
```bash
git remote set-url origin "https://Eiasash:TOKEN@github.com/Eiasash/Geriatrics.git"
git push origin main
git remote set-url origin https://github.com/Eiasash/Geriatrics.git
```
Revoke token at https://github.com/settings/tokens after session.
