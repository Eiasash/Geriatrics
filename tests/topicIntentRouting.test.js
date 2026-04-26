/**
 * v10.39.0 — Quiz intent detection + topic alias resolution.
 *
 * Background: chat used to send "make me hematology questions" straight to
 * Claude as free-text generation. Result was unrelated AI-generated content
 * (anticoagulants instead of anemia). Fix: parse the topic from the message,
 * map it to the existing TOPICS schema, and route to a topic-filtered drill
 * from the actual question bank.
 *
 * This test guards the alias map and the intent regex against silent breakage —
 * if someone refactors the regex or removes an alias key, hematology routes
 * to nothing again.
 */
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const rootDir = resolve(import.meta.dirname, '..');
let html;

beforeAll(() => {
  html = readFileSync(resolve(rootDir, 'shlav-a-mega.html'), 'utf-8');
});

// Extract the TOPIC_ALIASES object literal text from the HTML — does not
// execute, just verifies the source contains the expected keys and indices.
function extractAliasMapKeys() {
  const m = html.match(/const\s+TOPIC_ALIASES\s*=\s*\{([\s\S]*?)\n\};/);
  if (!m) throw new Error('TOPIC_ALIASES block not found');
  const body = m[1];
  // Naive key extraction — matches 'key':[ pattern at start of comma-separated entries
  const keyRe = /['"]([^'"]+)['"]\s*:\s*\[/g;
  const keys = new Set();
  let mm;
  while ((mm = keyRe.exec(body)) !== null) keys.add(mm[1]);
  return keys;
}

function extractTopicsLength() {
  // const TOPICS=["...","..."]; — count entries
  const m = html.match(/const\s+TOPICS\s*=\s*\[([\s\S]*?)\];/);
  if (!m) throw new Error('TOPICS array not found');
  const items = m[1].match(/"[^"]*"/g) || [];
  return items.length;
}

describe('v10.39.0 — topic alias map (TOPIC_ALIASES)', () => {
  test('contains all major clinical groupings the syllabus splits across multiple topics', () => {
    const keys = extractAliasMapKeys();
    // Hematology — IMA syllabus splits across Anemia + Cancer
    expect(keys.has('hematology')).toBe(true);
    expect(keys.has('המטולוגיה')).toBe(true);
    // Cardiology — splits across CV Disease + HF + HTN + Arrhythmia
    expect(keys.has('cardiology')).toBe(true);
    expect(keys.has('קרדיולוגיה')).toBe(true);
    // Neurology — splits across Dementia + Delirium + Stroke + Parkinson + Depression
    expect(keys.has('neurology')).toBe(true);
    expect(keys.has('נוירולוגיה')).toBe(true);
    // GI — splits across Constipation + Dysphagia
    expect(keys.has('gi')).toBe(true);
    // Endocrine — splits across Diabetes + Thyroid
    expect(keys.has('endocrine')).toBe(true);
  });

  test('every alias index is within bounds of the TOPICS array', () => {
    const topicsLen = extractTopicsLength();
    const m = html.match(/const\s+TOPIC_ALIASES\s*=\s*\{([\s\S]*?)\n\};/);
    expect(m).toBeTruthy();
    const body = m[1];
    // Find every numeric index in the alias values
    const idxRe = /\[\s*((?:\d+\s*,\s*)*\d+)\s*\]/g;
    let mm;
    let totalIndices = 0;
    while ((mm = idxRe.exec(body)) !== null) {
      const nums = mm[1].split(',').map(s => parseInt(s.trim(), 10));
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(topicsLen);
        totalIndices++;
      }
    }
    // Sanity floor — alias map should have many entries (60+ aliases × 1-4 indices each)
    expect(totalIndices).toBeGreaterThan(60);
  });
});

describe('v10.39.0 — chat intent detection (detectQuizIntent)', () => {
  test('detectQuizIntent function is defined in the HTML', () => {
    expect(html).toMatch(/function\s+detectQuizIntent\s*\(/);
  });

  test('resolveTopicFromText function is defined in the HTML', () => {
    expect(html).toMatch(/function\s+resolveTopicFromText\s*\(/);
  });

  test('sendChat actually invokes the intent detector', () => {
    // Locate sendChat body and confirm it calls detectQuizIntent + resolveTopicFromText
    const m = html.match(/async\s+function\s+sendChat\s*\(\)\s*\{[\s\S]*?^\}/m);
    expect(m).toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/detectQuizIntent\s*\(/);
    expect(body).toMatch(/resolveTopicFromText\s*\(/);
    // And actually routes to setTopicFilt on a hit
    expect(body).toMatch(/setTopicFilt\s*\(/);
  });
});

describe('v10.39.0 — chapter content reading (no more phantom _libData)', () => {
  // Strip // line comments and /* block */ comments so the assertion ignores
  // doc text that mentions the removed identifier (e.g. "// was reading window._libData").
  function stripComments(src) {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  test('aiSummarizeChapter does not reference window._libData', () => {
    const m = html.match(/async\s+function\s+aiSummarizeChapter\s*\([\s\S]*?\n\}\n/);
    expect(m).toBeTruthy();
    const code = stripComments(m[0]);
    expect(code).not.toMatch(/window\._libData/);
    // And does read from _hazData / _harData
    expect(code).toMatch(/_hazData|_harData/);
  });

  test('quizMeOnChapter does not reference window._libData', () => {
    const m = html.match(/async\s+function\s+quizMeOnChapter\s*\([\s\S]*?\n\}\n/);
    expect(m).toBeTruthy();
    const code = stripComments(m[0]);
    expect(code).not.toMatch(/window\._libData/);
    expect(code).toMatch(/_hazData|_harData/);
  });

  test('aiSummarizeChapter detects Harrison vs Hazzard from currently-open chapter', () => {
    const m = html.match(/async\s+function\s+aiSummarizeChapter\s*\([\s\S]*?\n\}\n/);
    expect(m).toBeTruthy();
    const code = stripComments(m[0]);
    // Must reference both harChOpen + hazChOpen-resolved data, and a textbook-name
    // string that is NOT hardcoded to Hazzard.
    expect(code).toMatch(/harChOpen/);
    expect(code).toMatch(/Harrison/);
    expect(code).toMatch(/Hazzard/);
  });
});

describe('v10.39.0 — Generate Qs token budget', () => {
  test('generateQuestionsFromChapter uses max_tokens <= 2000 to fit under proxy timeout', () => {
    const m = html.match(/async\s+function\s+generateQuestionsFromChapter\s*\([\s\S]*?\}catch\(err\)\{/);
    expect(m).toBeTruthy();
    const body = m[0];
    // Find the callAI invocation and the max_tokens argument.
    // Format: callAI(messages_arg, NNNN, 'sonnet')
    const callMatch = body.match(/callAI\s*\([^]*?,\s*(\d+)\s*,\s*['"]sonnet['"]\s*\)/);
    expect(callMatch).toBeTruthy();
    const maxTokens = parseInt(callMatch[1], 10);
    expect(maxTokens).toBeGreaterThan(0);
    expect(maxTokens).toBeLessThanOrEqual(2000); // was 3000, must stay under to fit Sonnet 4.6 in 25s
  });
});
