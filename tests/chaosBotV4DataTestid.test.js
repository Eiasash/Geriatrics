import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// #333 — practice-surface controls carry stable, non-translated `data-testid` hooks so
// an i18n / aria-label edit (the #290 failure class that silently blinded the bot for
// ~11 days) can't re-break the measurement instrument. The bot pins to those hooks and
// keeps the case-insensitive aria-label fragment only as a fallback for old cached HTML.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'shlav-a-mega.html'), 'utf-8');
const bot = readFileSync(join(ROOT, 'scripts', 'chaos-doctor-bot-v4.mjs'), 'utf-8');

describe('#333 data-testid practice-surface hooks', () => {
  it('monolith: both check controls (practice check() + sudden-death sdCheck()) carry data-testid="check-answer"', () => {
    const n = (html.match(/data-testid="check-answer"/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/data-testid="check-answer"[^>]*onclick="check\(\)"/);
    expect(html).toMatch(/data-testid="check-answer"[^>]*onclick="sdCheck\(\)"/);
  });

  it('monolith: the advance control (onclick="next()") carries data-testid="advance"', () => {
    expect(html).toContain('data-testid="advance"');
    expect(html).toMatch(/data-testid="advance"[^>]*onclick="next\(\)"/);
  });

  it('bot: check + advance selectors are pinned to the data-testid hooks (decoupled from i18n)', () => {
    expect(bot).toContain('[data-testid="check-answer"]');
    expect(bot).toContain('[data-testid="advance"]');
  });

  it('bot: keeps the case-insensitive aria-label fragment as a fallback', () => {
    expect(bot).toMatch(/aria-label\*="check answer" i/);
    expect(bot).toMatch(/aria-label\*="next question" i/);
  });
});
