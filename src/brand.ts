/**
 * Identity tokens shared by CLI output and badge generation, so the name and colors can't drift
 * apart between them. Brand copy and logo guidance live in the docs, not here; this file only
 * holds what code actually renders.
 */

export const NAME = 'proctor';

export interface ColorToken {
  hex: string;
  use: string;
}

export const COLORS = {
  ink: { hex: '#0B0F13', use: 'base / text' },
  verifyGreen: { hex: '#22C55E', use: 'real pass / clean' },
  caughtRed: { hex: '#EF4444', use: 'cheat detected / errors' },
  flagAmber: { hex: '#F59E0B', use: 'warnings' },
  paper: { hex: '#F7F6F2', use: 'light bg' },
} as const satisfies Record<string, ColorToken>;

/**
 * Statusline text. Green while nothing has been caught in this checkout, red once something has,
 * so the line reads as a state rather than a number you have to interpret.
 */
export function statuslineText(caught: number): string {
  return caught === 0 ? `${NAME}: watching` : `${NAME}: ${caught} caught`;
}

/** "Honest pass" README/PR badge text. */
export const HONEST_PASS_BADGE_TEXT = `✓ ${NAME}: honest pass`;
