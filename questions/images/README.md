# Question Images

Store question images here with the naming convention:
- `q{number}_stem.{ext}` — for question stem images
- `q{number}_opt{a|b|c|d}.{ext}` — for option images

Reference in questions.json:
```json
{
  "q": "What does this ECG show?",
  "img": "questions/images/q1001_stem.png",
  "o": ["Atrial fibrillation", "Ventricular tachycardia", "Normal sinus", "Heart block"],
  "oi": [null, null, null, null],
  "c": 0
}
```

Images can also be external URLs (Supabase storage, GitHub raw, etc.)

