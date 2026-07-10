import { describe, it, expect } from 'vitest';
import { NAME, LAUNCH_LINE, CHARACTER, LOGO, COLORS, statuslineBadge, HONEST_PASS_BADGE_TEXT } from '../src/brand.js';

describe('brand.ts', () => {
  it('NAME is lowercase "proctor"', () => {
    expect(NAME).toBe('proctor');
  });

  it('LAUNCH_LINE mentions deleting the test', () => {
    expect(LAUNCH_LINE).toMatch(/deleted the test/i);
  });

  it('CHARACTER describes the exam invigilator', () => {
    expect(CHARACTER.name).toBe('The Proctor');
    expect(CHARACTER.description.length).toBeGreaterThan(0);
  });

  it('LOGO points at the shipped assets/proctor-logo.svg', () => {
    expect(LOGO.path).toBe('assets/proctor-logo.svg');
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

  it('statuslineBadge formats a singular count correctly', () => {
    expect(statuslineBadge(1)).toBe('proctor · 1 cheat caught');
  });

  it('statuslineBadge formats a plural count correctly', () => {
    expect(statuslineBadge(0)).toBe('proctor · 0 cheats caught');
    expect(statuslineBadge(5)).toBe('proctor · 5 cheats caught');
  });

  it('HONEST_PASS_BADGE_TEXT matches the documented text', () => {
    expect(HONEST_PASS_BADGE_TEXT).toBe('✓ proctor: honest pass');
  });
});
