---
description: Pre-generate AI explanations for high-frequency questions using Anthropic API
---

Generate explanations for the top N questions by topic frequency and year (prioritizing ספט 2024).

Steps:
1. Read questions.json — identify top questions by: (a) ספט 2024 year, (b) topic 5 (Delirium), 6 (Dementia), 29-34 (Ethics/Law), 8 (Beers), 3 (Frailty)
2. For each question, call Anthropic API with this prompt structure:
   - Question (Hebrew) + 4 options + correct answer index
   - Source: Hazzard's 8e Ch X (from HAZZARD_MAP) or Harrison's 22e Ch Y
   - Request: Hebrew explanation, correct answer mechanism, distractor analysis, board pearl, chapter citation
3. Store results as JSON: `{qIdx: {text: "...", src: "...", ts: timestamp}}`
4. Output to `explanations_cache.json` in repo root
5. The app reads this file on load and merges with localStorage cache

API key from environment: ANTHROPIC_API_KEY

Syllabus sources (NO GRS):
- Hazzard's 8e: all chapters except 2-6, 34, 62
- Harrison's 22e: chapters 26, 382, 387, 433, 436-439, 458, 459 (all) + base residency chapters
- Articles: Beers 2023, VasCog-2, Alzheimer IWG, AA 2024 staging, Dementia Prevention JAMA, Hearing Loss NEJM
- Israeli law: 13 documents (dying patient act, POA, guardianship, etc.)
