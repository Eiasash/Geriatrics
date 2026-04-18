---
description: Deep review of a single MCQ's distractors before approval (echoes the cowork/distractor-autopsy branch workflow)
argument-hint: <qid>  (id field from data/questions.json)
---

Invoke the `distractor-autopsy` agent with question id `$ARGUMENTS`.

Before invoking, look up the question:

```bash
jq --arg id "$ARGUMENTS" '.[] | select(.id == $id)' data/questions.json
```

If the id does not exist, stop and list the last 10 ids as suggestions.

Pass to the agent: the full question object + any sibling questions sharing the same `topic` (so it can check answer-key independence and distractor recycling across the set).
