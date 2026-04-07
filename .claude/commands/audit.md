---
description: Full audit of shlav-a-mega.html — find bugs, wrong answers, UX issues, missing features
---

Perform a comprehensive audit of the Shlav A Mega app. Read shlav-a-mega.html fully.

Check:
1. **Question integrity**: Sample 20 questions from questions.json. Verify correct answer index (c field) is plausible.
2. **Topic mapping**: Verify all `ti` fields in questions.json map to valid TOPICS array indices.
3. **AI explain feature**: Verify explainWithAI() function exists, handles errors gracefully, caches properly.
4. **Syllabus compliance**: Verify syllabus page lists Hazzard's (excl Ch 2-6,34,62) + Harrison's 22e chapters per P005-2026. NO GRS.
5. **Missing features vs README**: Cross-check README feature list against actual HTML implementation.
6. **JavaScript errors**: Look for obvious syntax errors, undefined variable references.
7. **Mobile UX**: Check tap targets ≥44px, Hebrew RTL, dark mode completeness.
8. **localStorage**: Verify keys samega, samega_ex, samega_apikey don't conflict.
9. **Service worker**: Check sw.js version matches app version.

Output: numbered list of bugs/issues found, priority HIGH/MED/LOW, fix recommendation.
