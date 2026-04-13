# Question Generation Scripts

## generate-questions.cjs

Batch generates MCQs from chapter text data using Claude API.

### Prerequisites
- Node.js 18+
- Anthropic API key (or use `--proxy` for toranot proxy)

### Usage

```bash
# Preview chapter→topic mapping (no API calls)
node scripts/generate-questions.cjs --app geriatrics --all --dry-run

# Generate 10 questions per chapter from specific Hazzard chapters
node scripts/generate-questions.cjs --app geriatrics --chapters 58,59,60 --count 10 --api-key sk-ant-...

# Generate from ALL chapters using proxy
node scripts/generate-questions.cjs --app geriatrics --all --count 10 --proxy

# Generate for Pnimit
node scripts/generate-questions.cjs --app pnimit --all --count 10 --api-key sk-ant-...

# Custom output file
node scripts/generate-questions.cjs --app geriatrics --chapters 42 --count 15 --output my-frailty-qs.json --api-key sk-ant-...
```

### Options
| Flag | Description |
|------|-------------|
| `--app` | `geriatrics` or `pnimit` (required) |
| `--chapters` | Comma-separated chapter numbers |
| `--all` | Process all mapped chapters |
| `--count` | Questions per chapter (default: 10) |
| `--dry-run` | Show mapping only, no API calls |
| `--output` | Output filename (default: timestamped) |
| `--api-key` | Anthropic API key (or env `ANTHROPIC_API_KEY`) |
| `--proxy` | Use toranot.netlify.app proxy |

### Output
Generates a JSON file with validated questions in the app schema:
```json
[{"q": "...", "o": ["A","B","C","D"], "c": 1, "t": "Hazzard", "ti": 5, "e": "..."}]
```

## merge-questions.cjs

Merges generated questions into `data/questions.json` with dedup.

```bash
# Preview merge (dry run)
node scripts/merge-questions.cjs generated-questions-12345.json --dry-run

# Merge for real
node scripts/merge-questions.cjs generated-questions-12345.json
```

### Chapter Coverage

**Geriatrics**: 99 Hazzard chapters + 25 Harrison chapters = 124 total  
**Pnimit**: 69 Harrison chapters

At 10q per chapter: ~1,240 new geriatrics questions, ~690 new pnimit questions.
