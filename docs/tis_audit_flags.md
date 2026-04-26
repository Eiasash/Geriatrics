# tis[] reclassification — sanity audit flags

Total Qs: **3833**
- H1_anchor_missed: **2009**
- H4_weak_tertiary: **133**
- H3_andropause_phantom: **14**
- H2_biology_dump: **35**

## H1 — Anchor keyword missed (stem strongly mentions topic X but X is not in tis[]) (2009 flagged)

- **idx 18** [Incontinence] — missed: **Infections** (matched `\bUTI\b`)
  > בן 84, ברקע הגדלה שפירה של בלוטת הערמונית, ללא אנמנזה של סרטן ערמונית או התערבות אורולוגית בעבר. מדווח על אי-שליטה על סוגר השתן שנמשכת כבר ת

- **idx 19** [Periop → Rehab] — missed: **Delirium** (matched `דליריום`)
  > בת 80, יממה לאחר החלפת מפרק ירך מימין. מהלך הניתוח תקין, ללא סיבוכים. ברקע סובלת מיתר לחץ דם, סוכרת, אי-ספיקת כליות כרונית. בדיקה גופנית תקי

- **idx 19** [Periop → Rehab] — missed: **Diabetes** (matched `סוכרת`)
  > בת 80, יממה לאחר החלפת מפרק ירך מימין. מהלך הניתוח תקין, ללא סיבוכים. ברקע סובלת מיתר לחץ דם, סוכרת, אי-ספיקת כליות כרונית. בדיקה גופנית תקי

- **idx 25** [Dementia] — missed: **Delirium** (matched `דליריום`)
  > ציון 2. ללא חסר נוירולוגי פוקלי נוסף. בוצע CT ראש שלא הדגיםמחלה צרברו-וסקולרית. מה יכול להסביר את ההבדל בין שתי בדיקות MMSE שביצע

- **idx 35** [Palliative → Cancer → Polypharmacy] — missed: **Depression** (matched `דיכאון`)
  > בת 70 אובחנה לאחרונה עם כולנגיוקרצינומה, אושפזה לאיזון תסמינים משניים למחלתה המתקדמת ולטיפול הכימי. תלונתה העיקרית היא בחילה אשר לא הגיבה ל-

- **idx 37** [CV Disease → Pressure Injuries → Prevention] — missed: **Diabetes** (matched `סוכרת`)
  > תמונה מספר 2 .) מה הטיפול המומלץ

- **idx 38** [Frailty → Falls → CGA] — missed: **Osteoporosis** (matched `אוסטאופורוזיס`)
  > מה כולל שאלון SARC-F SCREENING TEST?

- **idx 42** [Sleep → Parkinson's] — missed: **Dementia** (matched `דמנציה`)
  > מה נכון בנוגע לטיפול ב - Melatonin?

- **idx 45** [CKD] — missed: **Infections** (matched `\bsepsis\b`)
  > באיזה מהמקרים הבאים צפוי FeNa < 1% ?

- **idx 48** [Dementia] — missed: **Depression** (matched `דיכאון`)
  > בבדיקת MOCA ציון 19. זיכרון 3/5 מילים, תפקודים ניהוליים וקשב לקויים מאוד מה מהבאים מהווה CORE FEATURE לאבחנה של מצבו

- **idx 50** [Advance Directives → Guardianship → Patient Rights] — missed: **Palliative** (matched `הנוטה למות`)
  > בן 76, הופנה למיון עקב ירידה במצב ההכרה. אובחן דימום סובדורלי. הומלץ לבצע ניקוז דחוף. ילדיו דיווחו שאביהם חתם על ייפוי כוח מתמשך ומינה אותם 

- **idx 57** [Advance Directives → Ethics → Patient Rights] — missed: **Delirium** (matched `דליריום`)
  > בן 83, ללא ירידה קוגניטיבית ידועה. אושפז לאחר חבלת ראש והונשם. במיון נצפתה המטומה סובדורלית נרחבת עם לחץ על החדרים, בוצע ניקוז. הוכנסה זונדה

- **idx 57** [Advance Directives → Ethics → Patient Rights] — missed: **Palliative** (matched `הנוטה למות`)
  > בן 83, ללא ירידה קוגניטיבית ידועה. אושפז לאחר חבלת ראש והונשם. במיון נצפתה המטומה סובדורלית נרחבת עם לחץ על החדרים, בוצע ניקוז. הוכנסה זונדה

- **idx 70** [Infections → Heart Failure] — missed: **Diabetes** (matched `סוכרת`)
  > בן 84, עםרקע של סוכרת, מחלת לב איסכמית ואי ספיקת לב. אושפז עקב דלקת ריאות וטופל ב- CEFTRIAXONE. לאחר 3 ימי טיפול עקב חוסר שיפור קליני עבר צי

- **idx 71** [Infections → Incontinence] — missed: **CKD** (matched `\beGFR\s*<`)
  > מחושב 23 . איזה טיפול אנטיביוטי מתאים

- **idx 74** [Rehab → COPD → Falls] — missed: **Dementia** (matched `\bdementia\b`)
  > למי מהמטופלים הבאים מתאים להיעזר ברולטור?

- **idx 74** [Rehab → COPD → Falls] — missed: **Parkinson's** (matched `פרקינסון`)
  > למי מהמטופלים הבאים מתאים להיעזר ברולטור?

- **idx 89** [COPD → Rehab] — missed: **Diabetes** (matched `סוכרת`)
  > בן 75, מעשן כבד, אובחן כסובל מ- COPD CHRONIC OBSTRUCTIVE PULMONARY) DISEASE .) ברקע- יתר לחץ דם וסוכרת. מטופל בתרופות - ASPIRIN ,ENALAPRIL ו

- **idx 93** [Periop → CV Disease] — missed: **Delirium** (matched `דליריום`)
  > מה ידוע לגבי סיבוכים פוסט-ניתוחיים של קשישים?

- **idx 97** [Dementia → Palliative] — missed: **Infections** (matched `\bpneumonia\b`)
  > על פי המאמר Advanced Dementia של Mitchell אילו קריטריונים נכללים בהגדרה של חולה דמנציה כבעל פרוגנוזה משוערת של פחות מ- 6 חודשים?

- **idx 97** [Dementia → Palliative] — missed: **Dysphagia** (matched `aspiration pneumonia`)
  > על פי המאמר Advanced Dementia של Mitchell אילו קריטריונים נכללים בהגדרה של חולה דמנציה כבעל פרוגנוזה משוערת של פחות מ- 6 חודשים?

- **idx 98** [Nutrition → Dysphagia → Rehab] — missed: **Stroke** (matched `שבץ איסכמי`)
  > בן 76, התקבל למחלקת שיקום לאחר שבץ איסכמי - CVA. בבדיקת בליעה נצפתההפרעה קשה לכל המרקמים ובשיתוף החולה הוחלט על הכנסת NASOGASTIC TUBE (\"זונ

- **idx 100** [Polypharmacy] — missed: **Delirium** (matched `דליריום`)
  > על פי ה POCKET GUIDE TO THE 2019 AGS BEERS CRITERIA באיזה מהמצבים הבאים מתאים לטפל בתרופות אנטיפסיכוטיות באנשים מבוגרים?

- **idx 100** [Polypharmacy] — missed: **Dementia** (matched `דמנציה`)
  > על פי ה POCKET GUIDE TO THE 2019 AGS BEERS CRITERIA באיזה מהמצבים הבאים מתאים לטפל בתרופות אנטיפסיכוטיות באנשים מבוגרים?

- **idx 101** [Frailty → Periop] — missed: **Diabetes** (matched `סוכרת`)
  > בן 80 ,מועמד לניתוח להחלפת פרק ירך, אובחן כסובל משבריריות (FRAILITY) על פי הקריטריונים של FRIED . ברקע - סוכרת, אי ספיקת כליות מתקדמת ומחלת 

- **idx 101** [Frailty → Periop] — missed: **Infections** (matched `\bpneumonia\b`)
  > בן 80 ,מועמד לניתוח להחלפת פרק ירך, אובחן כסובל משבריריות (FRAILITY) על פי הקריטריונים של FRIED . ברקע - סוכרת, אי ספיקת כליות מתקדמת ומחלת 

- **idx 102** [Advance Directives → Patient Rights → Ethics] — missed: **Dementia** (matched `\bMoCA\b`)
  > בן 90 הוא חולה נוטה למות, אשר חתם על מינוי ייפוי כוח לפי חוק החולה הנוטה למות. כעת הוא נמצא באשפוז במחלקה קרדיולוגית בשל סינקופה המיוחסת לחס

- **idx 102** [Advance Directives → Patient Rights → Ethics] — missed: **Palliative** (matched `הנוטה למות`)
  > בן 90 הוא חולה נוטה למות, אשר חתם על מינוי ייפוי כוח לפי חוק החולה הנוטה למות. כעת הוא נמצא באשפוז במחלקה קרדיולוגית בשל סינקופה המיוחסת לחס

- **idx 106** [Osteoporosis → Rehab → Falls] — missed: **Delirium** (matched `דליריום`)
  > גבר בן 73 ,שמור קוגניטיבית, שנתיים לאחר אירוע מוחי עם חולשת פלג גוף ימין, פנה למלר\"ד בעקבות נפילה וחבלה לאגן. עד הנפילה התהלך עם הליכון. בצ

- **idx 107** [Stroke → Dysphagia → Rehab] — missed: **Depression** (matched `דיכאון`)
  > מה שכיחות הסיבוכים הבאים לאחר שבץ?

_...+1979 more (see docs/tis_audit_flags.json)_

## H2 — Biology of Aging primary without biology keywords (legacy dumping ground regression) (35 flagged)

- **idx 502** [Biology of Aging → CKD → Polypharmacy]
  > אישה בן 82 בתרופות רבות. במעבדות: קריאטינין סרום 1.1 mg/dL, אך eGFR מחושב ב-38 mL/min/1.73m². איזה שינוי פיזיולוגי בגיל מתקדם מסביר פער זה?

- **idx 740** [Biology of Aging → Frailty → Nutrition]
  > An 84-year-old man presents with a 1-year history of progressive weakness, unintentional 10 kg weight loss, and three falls in the past 6 mo

- **idx 743** [Biology of Aging → Frailty]
  > An 80-year-old woman with sarcopenia participates in a research study examining cellular changes in aging muscle. Muscle biopsy reveals redu

- **idx 942** [Biology of Aging → Prevention]
  > A 72-year-old man presents to your geriatrics clinic interested in 'anti-aging' therapies he read about online. He is currently healthy, tak

- **idx 943** [Biology of Aging]
  > An 68-year-old woman with diabetes, hypertension, and osteoarthritis asks about participating in a clinical trial testing an intervention th

- **idx 944** [Biology of Aging → Frailty → CGA]
  > A 75-year-old man with multiple comorbidities (heart failure, diabetes, COPD) is being evaluated for frailty. His physician is considering u

- **idx 947** [Biology of Aging]
  > A 69-year-old woman with coronary heart disease asks why there aren't approved 'anti-aging' medications like there are cholesterol medicatio

- **idx 949** [Biology of Aging]
  > A 73-year-old woman with diabetes, hypertension, and mild frailty is considering participation in a clinical trial testing a geroscience int

- **idx 950** [Biology of Aging]
  > An 80-year-old man asks about the relationship between his multiple chronic conditions (heart failure, diabetes, osteoporosis, mild cognitiv

- **idx 951** [Biology of Aging]
  > A 67-year-old woman reads about the Cardiovascular Health Study biomarker index showing a hazard ratio of 1.30 for mortality per point and a

- **idx 2451** [Biology of Aging]
  > מטופלת בת 76 עם הממצא העורי המוצג על הגוף. שלפוחיות גדולות מתוחות על רקע אריתמטוטי. מהי האבחנה?

- **idx 2485** [Biology of Aging → Cancer → Geri EM]
  > בן 84 , ברקע: סוכרת, יתר לחץ דם והיפרליפידמיה, אושפז לברור הפרעה חדשה .באנזימי כבד :בבדיקות המעבדה מדד ויחידות החולה ערכים תקינים Na mmol/L 

- **idx 2581** [Biology of Aging → Nutrition]
  > לפי מחקרים בבעלי חיים , הדיאטה המביאה לתוחלת החיים הארוכה ביותר, היא דיאטה שבה יש הגבלה בכמות של–

- **idx 2589** [Biology of Aging → CV Disease]
  > מהם שינוים הנחשבים בגבולות הנורמה במערכת קרדיו- ווסקולרית בקשישים?

- **idx 2825** [Biology of Aging → COPD]
  > אילו ממצאים צפויים בבדיקת הספירומטריה במבוגרים?

- **idx 2838** [Biology of Aging → CV Disease]
  > אילו שינויים באנטומיה של הלב אופייניים לגיל מבוגר?

- **idx 2896** [Biology of Aging → Dementia]
  > איזה מהבאים לא נכלל בשינויים הקוגניטיביים של זקנה רגילה?

- **idx 2915** [Biology of Aging → Nutrition → Geri EM]
  > בת 83 , ברקע ידוע על שחמת, ככל הנראה על רקע אלכוהולי, עדיין צורכת לסירוגין אלכוהול. אושפזה בשל כאבי בטן ו אירועי הקאה לאחר שתי ית בקבוק שלם 

- **idx 2922** [Biology of Aging → Prevention]
  > בת 67, על ת ה מאוקראינה לפני שבוע, אושפזה לבירור הפרעה באנזימי כבד, עם הפרעה כולסטטית משמעותית. הבדיקות נלקחו בקהילה לבירור גרד. לדבריה שותה

- **idx 3037** [Biology of Aging → Geri EM → Vision/Hearing]
  > בן 72 , בריא בדרך כלל, מגיע למרפאה עם תלונות של חולשת שרירים המחמירה במהלך היום ומשתפרת במנוחה. הוא מדווח על קושי בלעיסה, פטוזיס ודיפלופיה ש

- **idx 3044** [Biology of Aging → CV Disease → Heart Failure]
  > איזה מהשינויים הפיזיולוגיים הבאים מאפיין את מערכת הלב וכלי הדם בזקנה?

- **idx 3082** [Biology of Aging → Rehab → Geri EM]
  > בן 65 , שוקל 80 קילו, אובחן עם תסמונת Guillain-Barré לאחר שהתייצג עם חולשה סימטרית עולה וא- רפלקסיה. לאחר 5 ימי טיפול ב-IVIg במינון 160 גרם 

- **idx 3087** [Biology of Aging → Falls → Geri EM]
  > בת 93, אובחנה עם היפותרמיה ( 32 מעלות צלסיוס) לאחר נפילה ושכיבה ממושכת על רצפת .ביתה מה מהבאים הוא הגורם המשמעותי ביותר להתפתחות היפותרמיה ב

- **idx 3192** [Biology of Aging]
  > בן 86, הגיע למרפאה עקב תלונות על גרד ואודם ברגליים, שידוע מזה זמן רב, אך לאחרונה החמיר. בבדיקתו רושם לעור מחוספס ומגרד, יבש, סדוק. מה הטיפול

- **idx 3232** [Biology of Aging]
  > בן 86 , הגיע למרפאה עקב תלונות על גרד ואודם ברגליים, שידוע מזה זמן רב, אך .לאחרונה החמיר. בבדיקתו רושם לעור מחוספס ומגרד, יבש, סדוק תמונה מס

- **idx 3277** [Biology of Aging → CV Disease]
  > מהם שינוים הנחשבים בגבולות הנורמה במערכת קרדיו- ווסקולרית בקשישים?

- **idx 3284** [Biology of Aging]
  > . פולימורפיזם במספר גנים הוכח כקשור להארכת חיים איזה גן מהגנים הבאים לא הוכח כקשור להארכת חיים?

- **idx 3285** [Biology of Aging → CV Disease → Pain]
  > מה מהבאים מהווה קריטריון לאבחנה/ קלסיפיקציה של- GIANT CELL ARTERITIS לפי– ACR CLASSIFICATION CRITERIA – 1990?

- **idx 3335** [Biology of Aging → Thyroid → Diabetes]
  > בן 85 , מתלונן על חולשה, איבוד תיאבון, כאבי בטן ובחילה. במדידות חוזרות של לחץ דם ( נמדדו ערכים על הגבול הנמוך 95/65 ) . :בבדיקות המעבדה מדד 

- **idx 3452** [Biology of Aging → CV Disease]
  > אילו שינויים באנטומיה של הלב אופייניים לגיל מבוגר?

_...+5 more (see docs/tis_audit_flags.json)_

## H3 — Andropause secondary/tertiary without testosterone/libido keywords (14 flagged)

- **idx 159** [Cancer → Prevention → Andropause]
  > איזה מהבאים מהווה גורם סיכון לקרצינומה של הערמונית?

- **idx 801** [Incontinence → Andropause → Diabetes]
  > A 68-year-old woman with diabetes, hypertension, and mild depression reports decreased sexual satisfaction and difficulty with arousal. She 

- **idx 835** [Incontinence → Andropause]
  > A 71-year-old man had TURP 3 years ago with excellent initial results (AUASI improved from 20 to 4). He now presents with gradually worsenin

- **idx 859** [Cancer → Andropause]
  > An 81-year-old man presents with a 2cm breast mass that on biopsy shows invasive ductal carcinoma that is estrogen receptor positive, proges

- **idx 1346** [Incontinence → Andropause → Biology of Aging]
  > A 78-year-old woman with hypertension and prediabetes attends your clinic requesting evaluation for painful intercourse. She has been sexual

- **idx 2600** [Cancer → Dementia → Andropause]
  > בן 75 עצמאי בתפקודו ושמור קוגניטיבית. ברקע יתר לחץ דם ומחלת לב איסכמית יציבה. אובחן כסובל מקרצינומה של הערמונית עם גרורות לעצמות. הומלץ לו ע

- **idx 2716** [Cancer → Palliative → Andropause]
  > בן 97, שמור קוגניטיבית, מתהלך עם הליכון ונזקק לעזרה חלקית ב- ADL , נבדק עקב כאבי עצמות מפושטים ואובחן כסובל מ- CARCINOMA OF PROSTATE עם גרור

- **idx 2969** [Incontinence → Polypharmacy → Andropause]
  > בן 67 , חזר( לביקורת לאחר חצי שנה של טיפול תרופתי לדחיפות במתן שתןURGENCY INCONTINENCE ). ברקע הגדלה שפירה של הערמונית. הוא מדווח על הפרעה ב

- **idx 2994** [Incontinence → Polypharmacy → Andropause]
  > מהו מנגנון הפעולה שלFinasteride (Propecia) ?

- **idx 3247** [Incontinence → Polypharmacy → Andropause]
  > בן 67 הסובל מהגדלה שפירה של הערמונית חזר לביקורת חצי שנה לאחר שהחל לקבל ( טיפול תרופתי לדחיפות במתן שתןURGE INCONTINENCE ). הוא מדווח על הפר

- **idx 3288** [Cancer → Dementia → Andropause]
  > בן 75 .עצמאי בתפקודו ושמור קוגניטיבית. ברקע יתר לחץ דם ומחלת לב איסכמית יציבה אובחן כסובל מקרצינומה של הערמונית עם גרורות לעצמות. הומלץ לו ע

- **idx 3534** [Incontinence → Polypharmacy → Andropause]
  > בן 67 , חזר לביקורת לאחר חצי שנה של ( טיפול תרופתי לדחיפות במתן שתןURGENCY INCONTINENCE ). ברקע הגדלה שפירה של הערמונית. הוא מדווח על ה פרעה

- **idx 3742** [Osteoporosis → Andropause]
  > גבר בן 72 עם היפוגונדיזם ראשוני שאובחן לפני 15 שנה ולא טופל בטסטוסטרון. הוא מתלונן על כאבי גב ועייפות. מה הצעד הנכון ביותר בהערכת עצמותיו?

- **idx 3774** [Incontinence → Polypharmacy → Andropause]
  > בן 67 הסובל מהגדלה שפירה של הערמונית חזר לביקורת חצי שנה לאחר ש החל לקבל ( טיפול תרופתי לדחיפות במתן שתןURGE INCONTINENCE ). הוא מדווח על הפ

## H4 — Weak tertiary (Patient Rights / Community/LTC / Interdisciplinary as 3rd pick — often hallucinated) (133 flagged)

- **idx 50** [Advance Directives → Guardianship → Patient Rights] — weak tertiary: **Patient Rights**
  > בן 76, הופנה למיון עקב ירידה במצב ההכרה. אובחן דימום סובדורלי. הומלץ לבצע ניקוז דחוף. ילדיו דיווחו שאביהם חתם על ייפוי כוח מתמשך ומינה אותם 

- **idx 57** [Advance Directives → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > בן 83, ללא ירידה קוגניטיבית ידועה. אושפז לאחר חבלת ראש והונשם. במיון נצפתה המטומה סובדורלית נרחבת עם לחץ על החדרים, בוצע ניקוז. הוכנסה זונדה

- **idx 140** [Advance Directives → Guardianship → Patient Rights] — weak tertiary: **Patient Rights**
  > בת 79 ,ברקע סוכרת קלה ויתר לחץ דם , מתעניינת במתן ייפוי כוח לבנה. איזה מהבאים נכון בנוגע לאפשרות לחתום על ייפוי כוח?

- **idx 143** [Advance Directives → Palliative → Patient Rights] — weak tertiary: **Patient Rights**
  > בן 68, חולה דיאליזה הסובל מקרצינומה של הריאה הוגדר על ידי האונקולוג כחולה הנוטה למות. הוא ללא חסר קוגניטיבי והוגדר כשיר לקבל החלטות. לאחרונה

- **idx 145** [Advance Directives → Delirium → Patient Rights] — weak tertiary: **Patient Rights**
  > באיזה מהמצבים הבאים יופעל מיופה כוח של אדם שחתם על ייפוי כוח מתמשך רפואי?

- **idx 146** [Pressure Injuries → Nutrition → Community/LTC] — weak tertiary: **Community/LTC**
  > בת 78, מאושפזת במחלקה לסיעוד מורכב עקב פצעי לחץ מרובים איזו מההתערבויות התזונתיות הבאות הוכחה כמשפרת ריפוי פצעי לחץ באופן משמעותי?

- **idx 181** [Guardianship → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > מחלקה פנימית הזמינה ייעוץ בשאלה של מינוי אפוטרופוס. המטופלת בת 72 מאושפזת עקב אי ספיקת לב מתקדמת ואורמיה. לדברי הצוות החולה מבולבלת, אינה מת

- **idx 215** [Community/LTC → CGA → Interdisciplinary Care] — weak tertiary: **Interdisciplinary Care**
  > מחלקה פנימית מבקשתיעוץ גריאטרי על מנת להגדיר מצבו של חולה כסיעודי, לצורך קביעת זכאות רפואית ל״קוד״ של משרד הבריאות. מה תהיה המלצתך?

- **idx 240** [Infections → Diabetes → Community/LTC] — weak tertiary: **Community/LTC**
  > בת 88, דיירת מחלקה סיעודית, ברקע סכרת ויתר לחץ דם, התאשפזה עקב דלקת ריאות מה מגורמי הרקע שלה מהווה גורם סיכון לדלקת ריאות?

- **idx 320** [Elder Abuse → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > What is the MANDATORY reporting obligation for healthcare providers who suspect elder abuse?

- **idx 330** [Community/LTC → CGA → Interdisciplinary Care] — weak tertiary: **Interdisciplinary Care**
  > What is the primary purpose of the Minimum Data Set (MDS) in nursing homes?

- **idx 344** [Periop → Rehab → Interdisciplinary Care] — weak tertiary: **Interdisciplinary Care**
  > מה יתרונות השירות האורתוגריאטרי?

- **idx 352** [Rehab → CGA → Community/LTC] — weak tertiary: **Community/LTC**
  > מה כוללות אמות המידה למתן טיפול שיקומי לקשיש?

- **idx 406** [Infections → Diabetes → Community/LTC] — weak tertiary: **Community/LTC**
  > בת 88, דיירת סיעודית, סכרת ו-HTN. דלקת ריאות. מה גורם סיכון?

- **idx 436** [Ethics → Dementia → Patient Rights] — weak tertiary: **Patient Rights**
  > רופא בוחן את כשירותו של חולה בן 78 עם דמנציה קלה להחלטה על ניתוח. איזו מהאפשרויות הבאות אינה נדרשת להוכחת כשירות?

- **idx 438** [Ethics → Dementia → Patient Rights] — weak tertiary: **Patient Rights**
  > חולה עם מחלת אלצהיימר קלה (CDR 0.5) מבקש להשתתף בניסוי קליני. מה נכון לגבי הסכמתו?

- **idx 439** [Advance Directives → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > חולה בן 85 בעל כשירות, עם דצ"ח חתומה שמסרבת להחייאה, מצהיר בעל פה בחדר המיון: 'אני רוצה לקבל כל טיפול'. מה גובר?

- **idx 440** [Ethics → Guardianship → Patient Rights] — weak tertiary: **Patient Rights**
  > מיהו הגורם המוסמך לקבוע כשירות (כשירות קוגניטיבית) לצורך החלטה רפואית?

- **idx 441** [Ethics → Guardianship → Patient Rights] — weak tertiary: **Patient Rights**
  > חולה שאינה כשירה עם זיקנה מתקדמת מביעה התנגדות ברורה (אסנט שלילי) לטיפול שהוחלט עליו עם אפוטרופוסה. מה עמדת ה-Hazzard?

- **idx 498** [Rehab → Frailty → Community/LTC] — weak tertiary: **Community/LTC**
  > אישה בת 84 חיה לבדה בדירה קטנה. ניתוח ירך לפני 3 חודשים, השתחררה לבית עם PT. כעת היא פחות פעילה ויש סימני דלקות שלייה. בדיקה גופנית: זקנה וב

- **idx 533** [Advance Directives → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > מטופלת בת 73 עם אי ספיקת לב חמורה ביקשה בעבר שלא לבצע החייאה. כעת היא מחוסרת הכרה ובמצב קריטי. לא קיימת הוראה מוקדמת פורמלית. איך יש לנהוג?

- **idx 550** [Guardianship → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > אישה בת 78 עם הפרעה קוגניטיבית קלה זקוקה לעזרה בהחלטות פיננסיות מורכבות אך יכולה להחליט על עניינים יומיומיים. מה הפתרון המתאים ביותר?

- **idx 552** [Guardianship → Advance Directives → Patient Rights] — weak tertiary: **Patient Rights**
  > אישה בת 70 מאושפזת לאחר שבץ ואינה מסוגלת לקבל החלטות רפואיות דחופות. אין לה ייפוי כוח או הנחיות מוקדמות. מה הצעד הראשון?

- **idx 555** [Periop → CGA → Interdisciplinary Care] — weak tertiary: **Interdisciplinary Care**
  > גבר בן 82 לקראת ניתוח שבר ירך. במודל האורתוגריאטרי, מתי מומלץ להתחיל את ההתערבות הגריאטרית?

- **idx 561** [Elder Abuse → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > בישראל, מי מהגורמים הבאים אינו חייב בדיווח חובה על חשד להתעללות בקשיש?

- **idx 567** [Ethics → Cancer → Patient Rights] — weak tertiary: **Patient Rights**
  > רופא מסרב לתת טיפול כימותרפי לאישה בת 85 עם סרטן ריאה בטענה ש'היא זקנה מדי'. איזה עיקרון אתי מופר?

- **idx 579** [Ethics → Advance Directives → Patient Rights] — weak tertiary: **Patient Rights**
  > מי רשאי לפנות לוועדת האתיקה לפי חוק החולה הנוטה למות?

- **idx 585** [Guardianship → Advance Directives → Patient Rights] — weak tertiary: **Patient Rights**
  > מהו ההבדל המשמעותי ביותר בין ייפוי כוח מתמשך לאפוטרופסות?

- **idx 591** [Elder Abuse → Ethics → Patient Rights] — weak tertiary: **Patient Rights**
  > רופא בבית חולים חושד בהזנחה של מטופל קשיש על ידי המטפל העיקרי. מה חובתו?

- **idx 646** [Ethics → Dementia → Patient Rights] — weak tertiary: **Patient Rights**
  > מטופלת עם דמנציה קלה מסרבת לניתוח חיוני. מה נכון?

_...+103 more (see docs/tis_audit_flags.json)_
