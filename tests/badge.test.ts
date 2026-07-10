import { describe, it, expect } from 'vitest';
import { badgeUrl, badgeMarkdown, badgeLine } from '../src/badge/index.js';
import { buildReceipt } from '../src/receipt.js';
import { HONEST_PASS_BADGE_TEXT } from '../src/brand.js';
import type { Finding } from '../src/types.js';

const errorFinding: Finding = {
  verifierId: 'RH001',
  severity: 'error',
  file: 'src/foo.ts',
  line: 1,
  message: 'm',
  suggestion: 's',
};

describe('badge', () => {
  it('badgeLine returns the exact honest-pass text for a clean receipt', () => {
    const receipt = buildReceipt([]);
    expect(badgeLine(receipt)).toBe(HONEST_PASS_BADGE_TEXT);
  });

  it('badgeLine returns a caught line for a receipt with an error finding', () => {
    const receipt = buildReceipt([errorFinding]);
    expect(badgeLine(receipt)).toBe('✗ proctor: caught');
  });

  it('badgeUrl uses the verify-green color for an honest-pass receipt', () => {
    const receipt = buildReceipt([]);
    expect(badgeUrl(receipt)).toContain('22C55E');
    expect(badgeUrl(receipt)).toContain('honest_pass');
  });

  it('badgeUrl uses the caught-red color for a caught receipt', () => {
    const receipt = buildReceipt([errorFinding]);
    expect(badgeUrl(receipt)).toContain('EF4444');
    expect(badgeUrl(receipt)).toContain('caught');
  });

  it('badgeMarkdown embeds badgeUrl as a linked image', () => {
    const receipt = buildReceipt([]);
    const md = badgeMarkdown(receipt);
    expect(md).toContain(badgeUrl(receipt));
    expect(md).toMatch(/^\[!\[proctor\]\(.*\)\]\(.*\)$/);
  });

  it('is deterministic — identical output for identical receipts', () => {
    const receipt = buildReceipt([], new Date('2026-01-01T00:00:00.000Z'));
    expect(badgeMarkdown(receipt)).toBe(badgeMarkdown(receipt));
  });
});
