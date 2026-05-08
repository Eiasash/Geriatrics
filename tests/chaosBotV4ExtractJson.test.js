// Unit tests for v4's brace-balanced JSON extractor — replaces v3's
// `match(/\{[^{}]*\}/)` which rejected nested objects and choked on
// multi-line markdown-wrapped responses (caused 352 ai-parse-error events
// in v3 workers 1, 8, and 10).
import { describe, it, expect } from 'vitest';
import { extractJson } from '../scripts/lib/extractJson.mjs';

describe('chaos-doctor-bot v4 extractJson', () => {
  it('parses a clean single-line JSON', () => {
    expect(extractJson('{"pick":"A","confidence":92,"why":"x"}')).toEqual({ pick: 'A', confidence: 92, why: 'x' });
  });

  it('strips ```json fences', () => {
    const text = '```json\n{"pick":"B","confidence":80,"why":"y"}\n```';
    expect(extractJson(text)).toEqual({ pick: 'B', confidence: 80, why: 'y' });
  });

  it('strips bare ``` fences', () => {
    const text = '```\n{"app_answer_correct":true,"explanation_sound":true,"confidence":95,"issue":null}\n```';
    expect(extractJson(text)).toEqual({
      app_answer_correct: true,
      explanation_sound: true,
      confidence: 95,
      issue: null,
    });
  });

  it('handles trailing prose after the JSON', () => {
    const text = '{"pick":"C","confidence":70,"why":"z"} Hope this helps!';
    expect(extractJson(text)).toEqual({ pick: 'C', confidence: 70, why: 'z' });
  });

  it('handles nested objects (the v3 regex blocker)', () => {
    const text = '{"judge":{"answer":"A","conf":80},"source":{"plausible":true}}';
    expect(extractJson(text)).toEqual({
      judge: { answer: 'A', conf: 80 },
      source: { plausible: true },
    });
  });

  it('handles multi-line JSON (the v3 regex blocker)', () => {
    const text = `{
  "pick": "D",
  "confidence": 88,
  "why": "long reasoning that spans multiple lines"
}`;
    expect(extractJson(text)).toEqual({ pick: 'D', confidence: 88, why: 'long reasoning that spans multiple lines' });
  });

  it('handles braces inside strings without breaking depth tracking', () => {
    const text = '{"why":"options were { a, b, c } at start","pick":"A"}';
    expect(extractJson(text)).toEqual({ why: 'options were { a, b, c } at start', pick: 'A' });
  });

  it('handles escaped quotes inside strings', () => {
    const text = '{"why":"she said \\"hi\\" to me","pick":"B"}';
    expect(extractJson(text)).toEqual({ why: 'she said "hi" to me', pick: 'B' });
  });

  it('returns null for empty / malformed input', () => {
    expect(extractJson('')).toBeNull();
    expect(extractJson(null)).toBeNull();
    expect(extractJson('not json at all')).toBeNull();
    expect(extractJson('{')).toBeNull();
  });

  it('parses leading-prose then JSON', () => {
    const text = 'Here is my answer:\n{"pick":"A","confidence":50,"why":"hedge"}';
    expect(extractJson(text)).toEqual({ pick: 'A', confidence: 50, why: 'hedge' });
  });
});
