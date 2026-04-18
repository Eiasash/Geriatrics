---
description: Check recently-touched Hebrew strings against hebrew-medical-glossary
---

1. `git diff main...HEAD -- '*.html' '*.json' '*.ts' '*.js'` — filter lines containing Hebrew (regex `[\u0590-\u05FF]`).
2. Load the `hebrew-medical-glossary` skill.
3. For each candidate string, classify: **Canonical** (matches glossary), **Variant** (a known non-canonical form the glossary lists), **Unknown** (flag for review), **Deviant** (wrong term per Clalit/Maccabi conventions — block).
4. Report: counts by class, plus a numbered list of **Deviant** and **Unknown** strings with file:line.
5. Do NOT auto-rewrite. The point is a reviewer's second opinion, not a silent fix.
