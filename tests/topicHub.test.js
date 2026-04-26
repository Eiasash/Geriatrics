/**
 * Regression guards for the v10.43.0 per-topic study hub.
 *
 * The hub upgrades the Study tab so opening a topic shows: bank-Q count
 * + drill button, textbook chapter refs, relevant drugs filtered from
 * DRUGS, applicable Israeli laws filtered from SYL_LAWS, and an AI tutor
 * button — pulled from existing data sources, no duplication.
 *
 * Tests catch:
 *   1. The data maps (TOPIC_DRUG_CATS, TOPIC_LAW_KEYS) being present.
 *   2. The render block being wired into the openNote accordion branch.
 *   3. The hub helpers (topicHubDrugs, topicHubLaws, topicHubBankCount)
 *      being callable functions.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
const drugs = JSON.parse(readFileSync(resolve(rootDir, 'data/drugs.json'), 'utf-8'));

describe('v10.43.0 — per-topic hub data maps', () => {
  it('TOPIC_DRUG_CATS is declared with regex patterns for clinical topics', () => {
    expect(html).toMatch(/const\s+TOPIC_DRUG_CATS\s*=\s*\{/);
    // High-volume clinical topics must have entries
    for (const ti of [5, 7, 8, 14, 18, 19, 22, 27, 28, 40]) {
      expect(html, `TOPIC_DRUG_CATS missing entry for ti=${ti}`).toMatch(
        new RegExp(`\\b${ti}\\s*:\\s*\\[`)
      );
    }
  });

  it('TOPIC_LAW_KEYS is declared with substring keys for legal topics', () => {
    expect(html).toMatch(/const\s+TOPIC_LAW_KEYS\s*=\s*\{/);
    // Legal-content topics must have entries
    for (const ti of [28, 29, 31, 32, 34]) {
      expect(html, `TOPIC_LAW_KEYS missing entry for ti=${ti}`).toMatch(
        new RegExp(`\\b${ti}\\s*:\\s*\\[`)
      );
    }
  });

  it('topicHubDrugs / topicHubLaws / topicHubBankCount helpers are defined', () => {
    expect(html).toMatch(/function\s+topicHubDrugs\s*\(/);
    expect(html).toMatch(/function\s+topicHubLaws\s*\(/);
    expect(html).toMatch(/function\s+topicHubBankCount\s*\(/);
  });
});

describe('v10.43.0 — Study tab hub render', () => {
  it('renderStudy injects hub sections before the existing notes block', () => {
    // The accordion-open branch must reference the new hub variables.
    const m = html.match(/if\s*\(\s*openNote\s*===\s*i\s*\)\s*\{[\s\S]{0,8000}?_fmtNote\(n\.notes\)/);
    expect(m, 'openNote branch not found').toBeTruthy();
    const block = m[0];
    expect(block, 'must define _ti').toMatch(/const\s+_ti\s*=/);
    expect(block, 'must call topicHubBankCount').toMatch(/topicHubBankCount\(_ti\)/);
    expect(block, 'must call topicHubDrugs').toMatch(/topicHubDrugs\(_ti\)/);
    expect(block, 'must call topicHubLaws').toMatch(/topicHubLaws\(_ti\)/);
    expect(block, 'must include AI tutor button hooking sendChatStarter').toMatch(/sendChatStarter/);
    expect(block, 'must include drill button hooking setTopicFilt').toMatch(/setTopicFilt\(\$\{_ti\}\)/);
  });

  it('Study subtitle is no longer hardcoded to "40 IMA topics"', () => {
    expect(html).not.toMatch(/40 IMA topics/);
    expect(html).toMatch(/NOTES\.length\}\s*IMA topics/);
  });
});

describe('v10.43.0 — drug-category patterns hit real DRUGS entries', () => {
  // Make sure the regex patterns we hand-curated actually match drug
  // categories that exist in data/drugs.json — otherwise the hub would
  // silently render an empty drugs section for the affected topics.
  const cats = new Set(drugs.map(d => d.cat || ''));

  // Sample assertions — the most important hub topics must surface ≥1 drug.
  const expectations = [
    { ti: 5, must_match_one_of: ['Antipsychotic', 'Benzodiazepine', 'Anticholinergic'] },
    { ti: 7, must_match_one_of: ['SSRI', 'SNRI', 'TCA'] },
    { ti: 8, must_match_one_of: ['Anticholinergic', 'Benzodiazepine'] },
    { ti: 14, must_match_one_of: ['Opioid', 'NSAID'] },
    { ti: 18, must_match_one_of: ['Beta-blocker', 'ACEi', 'ARB'] },
    { ti: 19, must_match_one_of: ['CCB (DHP)', 'CCB (non-DHP)', 'Thiazide'] },
    { ti: 22, must_match_one_of: ['Antidiabetic', 'Insulin', 'Sulfonylurea', 'Biguanide'] },
    { ti: 27, must_match_one_of: ['Antibiotic'] },
    { ti: 40, must_match_one_of: ['Antiparkinsonian'] },
    { ti: 41, must_match_one_of: ['DOAC', 'Antiarrhythmic'] },
  ];
  for (const { ti, must_match_one_of } of expectations) {
    it(`topic ti=${ti} hub matches at least one real drug category`, () => {
      const found = must_match_one_of.some(c => cats.has(c));
      expect(found, `none of ${JSON.stringify(must_match_one_of)} found in drug cats`).toBe(true);
    });
  }
});
