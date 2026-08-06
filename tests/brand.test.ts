import { describe, it, expect } from 'vitest';
import { NAME, COLORS, HONEST_PASS_BADGE_TEXT } from '../src/brand.js';

describe('brand.ts', () => {
  it('NAME is lowercase "proctor"', () => {
    expect(NAME).toBe('proctor');
  });

  it('exposes all 5 color tokens with correct hex values', () => {
    expect(COLORS.ink.hex).toBe('#0B0F13');
    expect(COLORS.verifyGreen.hex).toBe('#22C55E');
    expect(COLORS.caughtRed.hex).toBe('#EF4444');
    expect(COLORS.flagAmber.hex).toBe('#F59E0B');
    expect(COLORS.paper.hex).toBe('#F7F6F2');
  });

  it('every color token hex is a valid 6-digit hex code', () => {
    for (const token of Object.values(COLORS)) {
      expect(token.hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it('HONEST_PASS_BADGE_TEXT matches the documented text', () => {
    expect(HONEST_PASS_BADGE_TEXT).toBe('✓ proctor: honest pass');
  });
});
