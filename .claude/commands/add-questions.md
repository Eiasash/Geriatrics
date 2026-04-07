---
description: Add new questions to questions.json with proper topic tagging and validation
---

Add new questions to the question bank. Input: question text, 4 options, correct answer, year, topic.

Steps:
1. Read existing questions.json
2. Read TOPICS array from shlav-a-mega.html to get correct topic indices
3. Validate: question has exactly 4 options, correct index 0-3, year string matches existing format
4. Auto-tag topic (ti field) based on question content matching TOPICS list
5. Check for near-duplicate questions (fuzzy match on question text)
6. Append to questions.json
7. Update README question count

The `ti` field MUST map to one of these indices (0-39):
0=Biology of Aging, 1=Demography, 2=CGA, 3=Frailty, 4=Falls, 5=Delirium,
6=Dementia, 7=Depression, 8=Polypharmacy/Beers, 9=Nutrition, 10=Pressure Injuries,
11=Urinary Incontinence, 12=Constipation, 13=Sleep, 14=Pain, 15=Osteoporosis,
16=OA, 17=CVD, 18=HF, 19=HTN, 20=Stroke, 21=COPD, 22=DM, 23=Thyroid,
24=CKD, 25=Anemia, 26=Cancer, 27=Infections, 28=Palliative, 29=Ethics,
30=Elder Abuse, 31=Fitness to Drive, 32=Guardianship, 33=Patient Rights,
34=Advance Directives, 35=Community Care, 36=Rehab/FIM, 37=Vision/Hearing,
38=Perioperative, 39=Geriatric Emergency
