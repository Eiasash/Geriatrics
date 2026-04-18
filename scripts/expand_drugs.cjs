#!/usr/bin/env node
/**
 * Expand data/drugs.json with the common geriatric medications that were
 * missing from the original 53-drug dictionary. Preserves all existing entries
 * and appends new ones. Idempotent — re-running merges on `name`.
 *
 * Fields: name, heb, acb (0-3), beers (bool), cat, risk
 * Optional additional flags: qt (QT-prolonging), serotonergic, cyp3a4_inhibitor,
 * cyp3a4_inducer, falls (CNS-depressant), renalAdj, cns (1=sedating).
 */
const fs = require('fs');
const path = require('path');
const DRUGS_PATH = path.resolve(__dirname, '..', 'data', 'drugs.json');

// Additions — common Israeli geriatric medications with clinical flags
const ADDITIONS = [
  // ACE/ARB
  { name: 'Lisinopril', heb: 'ליסינופריל', acb: 0, beers: false, cat: 'ACEi', risk: 'Monitor K, Cr. Dry cough 10-15%. Hold if SBP<90 or AKI.' },
  { name: 'Ramipril', heb: 'טריטייס', acb: 0, beers: false, cat: 'ACEi', risk: 'First-line in HF and post-MI. Monitor K, Cr. Cough common.' },
  { name: 'Enalapril', heb: 'ונטולין-ACE', acb: 0, beers: false, cat: 'ACEi', risk: 'Monitor K, Cr. Use ramipril/lisinopril if QID dosing impractical.' },
  { name: 'Losartan', heb: 'אוקסר', acb: 0, beers: false, cat: 'ARB', risk: 'Alternative to ACEi if cough. Monitor K, Cr. Uricosuric effect.' },
  { name: 'Valsartan', heb: 'דיובאן', acb: 0, beers: false, cat: 'ARB', risk: 'Monitor K, Cr. Common in HF combo (valsartan/sacubitril).' },
  { name: 'Candesartan', heb: 'אטקנד', acb: 0, beers: false, cat: 'ARB', risk: 'Evidence in HF. Monitor K, Cr.' },
  // Diuretics
  { name: 'Furosemide', heb: 'פוסיד', acb: 0, beers: false, cat: 'Loop diuretic', risk: 'Electrolyte wasting (K, Mg, Na). Ototoxicity at high IV doses. Titrate carefully to prevent AKI/orthostasis.', falls: 1 },
  { name: 'Hydrochlorothiazide', heb: 'דיסוטיאזיד', acb: 0, beers: false, cat: 'Thiazide', risk: 'Hyponatremia in elderly (esp women), hypokalemia, hyperuricemia. Rash/photosensitivity.' },
  { name: 'Spironolactone', heb: 'אלדקטון', acb: 0, beers: false, cat: 'K-sparing diuretic', risk: 'Hyperkalemia (esp with ACEi/ARB, CKD). Gynecomastia. Monitor K weekly at start.' },
  // Beta-blockers
  { name: 'Carvedilol', heb: 'דילטרנד', acb: 0, beers: false, cat: 'Beta-blocker', risk: 'First-line HFrEF. Non-selective + alpha block → orthostasis. Start low, uptitrate.', falls: 1 },
  { name: 'Metoprolol', heb: 'לופרסור', acb: 0, beers: false, cat: 'Beta-blocker', risk: 'Cardioselective. Metoprolol succinate for HF. Bradycardia, fatigue.' },
  { name: 'Bisoprolol', heb: 'קונקור', acb: 0, beers: false, cat: 'Beta-blocker', risk: 'Cardioselective, once-daily. HF mortality benefit. Bradycardia.' },
  { name: 'Atenolol', heb: 'נורמוטן', acb: 0, beers: false, cat: 'Beta-blocker', risk: 'Renally cleared — accumulates in CKD. Less preferred in elderly than bisoprolol/metoprolol.' },
  // CCBs
  { name: 'Amlodipine', heb: 'נורווסק', acb: 0, beers: false, cat: 'CCB (DHP)', risk: 'Peripheral edema common. Good for isolated systolic HTN in elderly.' },
  { name: 'Diltiazem', heb: 'דיקור', acb: 0, beers: false, cat: 'CCB (non-DHP)', risk: 'AV block, bradycardia. CYP3A4 inhibitor (↑statin, DOAC levels). Avoid with beta-blocker.', cyp3a4_inhibitor: true },
  { name: 'Verapamil', heb: 'איסופטין', acb: 0, beers: false, cat: 'CCB (non-DHP)', risk: 'Severe constipation, AV block, HF exacerbation. CYP3A4 inhibitor. Avoid in HFrEF.', cyp3a4_inhibitor: true },
  // Statins
  { name: 'Atorvastatin', heb: 'ליפיטור', acb: 0, beers: false, cat: 'Statin', risk: 'CYP3A4 substrate — interactions with diltiazem/verapamil/amiodarone/macrolides. Myopathy risk.' },
  { name: 'Simvastatin', heb: 'סימובסטטין', acb: 0, beers: false, cat: 'Statin', risk: 'Strong CYP3A4 substrate — myopathy risk with CYP3A4 inhibitors. Max 20mg with amlodipine/amiodarone.' },
  { name: 'Rosuvastatin', heb: 'כרסטור', acb: 0, beers: false, cat: 'Statin', risk: 'Not CYP3A4 — preferred when interactions concern. Dose-reduce in CKD.' },
  // Antiplatelets & anticoagulants
  { name: 'Aspirin', heb: 'אספירין', acb: 0, beers: false, cat: 'Antiplatelet', risk: 'Primary prevention only if >70-75: avoid (USPSTF). Secondary prevention continues.' },
  { name: 'Clopidogrel', heb: 'פלאביקס', acb: 0, beers: false, cat: 'Antiplatelet', risk: 'CYP2C19 — omeprazole/esomeprazole ↓activation. Use pantoprazole if PPI needed.' },
  { name: 'Warfarin', heb: 'קומדין', acb: 0, beers: false, cat: 'Anticoagulant (VKA)', risk: 'Narrow therapeutic index. Many interactions (abx, amiodarone, NSAID). Frequent INR monitoring. DOACs preferred if eligible.' },
  { name: 'Rivaroxaban', heb: 'קסרלטו', acb: 0, beers: false, cat: 'DOAC', risk: 'Once-daily (AF) / BID (VTE). Take with food. CI if CrCl<15. GI bleed risk higher than apixaban.' },
  { name: 'Dabigatran', heb: 'פרדקסה', acb: 0, beers: false, cat: 'DOAC', risk: 'Dyspepsia common, GI bleed risk, CI if CrCl<30. Avoid in frail elderly per Beers.' },
  { name: 'Edoxaban', heb: 'ליקסיאנה', acb: 0, beers: false, cat: 'DOAC', risk: 'Once-daily. Dose reduce for CrCl 15-50 or low weight. Less evidence in very elderly.' },
  // PPIs & H2
  { name: 'Omeprazole', heb: 'לוסק', acb: 0, beers: false, cat: 'PPI', risk: 'Long-term: ↓Mg, B12, Ca (fracture), C. diff, CAP. CYP2C19 inhibitor — ↓clopidogrel. De-escalate when possible.', cyp2c19_inhibitor: true },
  { name: 'Pantoprazole', heb: 'פנטולוק', acb: 0, beers: false, cat: 'PPI', risk: 'Preferred PPI with clopidogrel (minimal CYP2C19 effect). Same long-term risks as other PPIs.' },
  { name: 'Esomeprazole', heb: 'נקסיום', acb: 0, beers: false, cat: 'PPI', risk: 'Same as omeprazole. Avoid with clopidogrel.', cyp2c19_inhibitor: true },
  { name: 'Lansoprazole', heb: 'לנטון', acb: 0, beers: false, cat: 'PPI', risk: 'Long-term: fracture, CAP, C. diff. De-escalate to H2 or prn when possible.' },
  { name: 'Ranitidine', heb: 'זנטק', acb: 1, beers: true, cat: 'H2 blocker', risk: 'Withdrawn in many countries (NDMA contamination). Confusion/delirium in elderly. Use famotidine.' },
  { name: 'Famotidine', heb: 'פמוטידין', acb: 1, beers: false, cat: 'H2 blocker', risk: 'Renally cleared — reduce dose if CrCl<50. Rarely causes delirium at normal doses.' },
  // Antidepressants (fill gaps)
  { name: 'Citalopram', heb: 'ציפרמיל', acb: 0, beers: false, cat: 'SSRI', risk: 'Max 20mg/day in elderly (QT prolongation). Hyponatremia risk.', qt: 1, serotonergic: true },
  { name: 'Escitalopram', heb: 'ציפרלקס', acb: 0, beers: false, cat: 'SSRI', risk: 'Max 10mg/day in elderly (QT). Hyponatremia risk. Cleaner than citalopram.', qt: 1, serotonergic: true },
  { name: 'Fluoxetine', heb: 'פרוזק', acb: 0, beers: false, cat: 'SSRI', risk: 'Long half-life (norfluoxetine 1-3 wks) — accumulation in elderly. Many CYP2D6/2C19 interactions.', serotonergic: true, cyp2d6_inhibitor: true },
  { name: 'Venlafaxine', heb: 'אפקסור', acb: 0, beers: false, cat: 'SNRI', risk: 'BP elevation at high doses. Discontinuation syndrome severe. Hyponatremia.', serotonergic: true },
  { name: 'Duloxetine', heb: 'סימבלטה', acb: 0, beers: false, cat: 'SNRI', risk: 'Used for neuropathic pain. Hepatotoxicity, BP rise, hyponatremia.', serotonergic: true },
  { name: 'Trazodone', heb: 'טריטיקו', acb: 1, beers: false, cat: 'Antidepressant', risk: 'Commonly used for insomnia in elderly (50mg). Orthostasis, priapism rare, QT at high doses.', falls: 1, qt: 1 },
  // Benzos (fill gaps)
  { name: 'Lorazepam', heb: 'לורזפם', acb: 1, beers: true, cat: 'Benzodiazepine', risk: 'Short-intermediate acting. Still Beers-avoid in elderly. Falls, confusion, dependence.', falls: 1 },
  { name: 'Alprazolam', heb: 'קסנקס', acb: 1, beers: true, cat: 'Benzodiazepine', risk: 'Short half-life → interdose anxiety, dependence. Beers avoid.', falls: 1 },
  { name: 'Clonazepam', heb: 'קלונקס', acb: 1, beers: true, cat: 'Benzodiazepine', risk: 'Long-acting. Cumulative effects, falls, delirium. Beers avoid.', falls: 1 },
  // Opioids
  { name: 'Tramadol', heb: 'טרמדקס', acb: 0, beers: false, cat: 'Opioid', risk: 'Serotonergic (SS risk with SSRI/SNRI/MAOI). Seizures, hyponatremia. Renal dose reduce.', serotonergic: true, falls: 1 },
  { name: 'Morphine', heb: 'מורפיום', acb: 0, beers: false, cat: 'Opioid', risk: 'Renal metabolite accumulation (M6G) → prolonged effect in CKD. Constipation universal.', falls: 1 },
  { name: 'Oxycodone', heb: 'אוקסיקונטין', acb: 0, beers: false, cat: 'Opioid', risk: 'Preferred opioid in CKD (no active renal metabolite). Constipation.', falls: 1 },
  { name: 'Fentanyl patch', heb: 'דורוגזיק', acb: 0, beers: false, cat: 'Opioid', risk: 'Only for opioid-TOLERANT patients. Heat/fever increases release → overdose. Not for opioid-naive.', falls: 1 },
  { name: 'Codeine', heb: 'קודאין', acb: 0, beers: false, cat: 'Opioid', risk: 'CYP2D6 variability — some get no analgesia, some toxicity. Constipation.', falls: 1 },
  // Neuro
  { name: 'Gabapentin', heb: 'נוירונטין', acb: 0, beers: false, cat: 'Anticonvulsant', risk: 'Renally cleared — dose reduce by CrCl. Sedation, ataxia, falls in elderly. Peripheral edema.', falls: 1 },
  { name: 'Pregabalin', heb: 'ליריקה', acb: 0, beers: false, cat: 'Anticonvulsant', risk: 'Same class as gabapentin. Renally cleared. Sedation, edema, weight gain, falls.', falls: 1 },
  { name: 'Lamotrigine', heb: 'למוטריל', acb: 0, beers: false, cat: 'Anticonvulsant', risk: 'SJS risk — titrate slowly. Generally safer than other AEDs in elderly.' },
  { name: 'Valproate', heb: 'דפלפט', acb: 0, beers: false, cat: 'Anticonvulsant', risk: 'Hepatotoxicity, thrombocytopenia, hyperammonemia. Monitor LFTs, CBC.' },
  { name: 'Levodopa/Carbidopa', heb: 'סינימט', acb: 0, beers: false, cat: 'Antiparkinsonian', risk: 'Orthostasis, hallucinations, dyskinesia. Protein meals reduce absorption.', falls: 1 },
  // Cholinesterase inhibitors
  { name: 'Rivastigmine', heb: 'אקסלון', acb: 0, beers: false, cat: 'Cholinesterase inhibitor', risk: 'GI side effects. Patch better tolerated than PO. Approved for PDD and AD.' },
  { name: 'Galantamine', heb: 'רמיניל', acb: 0, beers: false, cat: 'Cholinesterase inhibitor', risk: 'GI side effects, bradycardia. CYP2D6/3A4 substrate.' },
  { name: 'Memantine', heb: 'אביקסה', acb: 0, beers: false, cat: 'NMDA antagonist', risk: 'Moderate-severe AD. Generally well tolerated. Renal dose reduce.' },
  // Thyroid
  { name: 'Levothyroxine', heb: 'אלטרוקסין', acb: 0, beers: false, cat: 'Thyroid hormone', risk: 'Absorption reduced by PPI, iron, Ca, soy. Take on empty stomach. Overtreatment → AF, osteoporosis.' },
  // Urology
  { name: 'Tamsulosin', heb: 'אומניק', acb: 0, beers: false, cat: 'Alpha-1 blocker (uroselective)', risk: 'Less orthostasis than doxazosin/terazosin. Floppy iris syndrome (tell ophthalmologist).', falls: 1 },
  { name: 'Finasteride', heb: 'פרוסקאר', acb: 0, beers: false, cat: '5-alpha reductase', risk: 'Slow onset (6 mo). Sexual side effects. Lowers PSA 50%.' },
  { name: 'Mirabegron', heb: 'בטמיגה', acb: 0, beers: false, cat: 'Beta-3 agonist', risk: 'Alternative to anticholinergic OAB drugs — preferred in elderly. Small BP rise.' },
  // Misc
  { name: 'Acetaminophen', heb: 'אקמול', acb: 0, beers: false, cat: 'Analgesic', risk: 'FIRST-LINE analgesic in elderly. Max 3g/day (not 4g) if frail/malnourished/liver disease.' },
  { name: 'Colchicine', heb: 'קולצ\'יצין', acb: 0, beers: false, cat: 'Anti-gout', risk: 'Renal/hepatic dose reduce. Myopathy with statins, neuropathy. CYP3A4/P-gp substrate.' },
  { name: 'Allopurinol', heb: 'אלופורינול', acb: 0, beers: false, cat: 'Xanthine oxidase inhibitor', risk: 'Start low 50mg in CKD. SJS risk (HLA-B*5801 Asian). Interaction with azathioprine.' },
  // Sulfonylureas (short-acting — safer alternatives per Beers)
  { name: 'Glipizide', heb: 'גליפיזיד', acb: 0, beers: false, cat: 'Sulfonylurea', risk: 'Preferred sulfonylurea in elderly (short half-life, no active metabolites). Still hypoglycemia risk.' },
];

function main() {
  const existing = JSON.parse(fs.readFileSync(DRUGS_PATH, 'utf-8'));
  const byName = new Map(existing.map(d => [d.name.toLowerCase(), d]));
  let added = 0, merged = 0;
  for (const d of ADDITIONS) {
    const key = d.name.toLowerCase();
    if (byName.has(key)) {
      // Merge additional flags but don't overwrite existing risk text
      const cur = byName.get(key);
      for (const [k, v] of Object.entries(d)) {
        if (cur[k] === undefined) cur[k] = v;
      }
      merged++;
    } else {
      existing.push(d);
      byName.set(key, d);
      added++;
    }
  }
  // Keep stable order: originals first then additions
  fs.writeFileSync(DRUGS_PATH, JSON.stringify(existing, null, 2) + '\n');
  console.log(`✓ Added ${added}, merged-flags ${merged}. Total now: ${existing.length} drugs`);
}

main();
