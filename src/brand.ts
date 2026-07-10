/**
 * Identity and branding. Single source of truth for proctor's name, color tokens, and
 * character/launch copy, reused by CLI output, badges, and docs so they never drift out of sync.
 *
 * Usage rules: never recolor the iris except to caught-red. No gradients or shadows.
 * Under about 20px, use the monochrome mark instead.
 */

export const NAME = 'proctor';

export const LAUNCH_LINE =
  "Your agent didn't fix the bug. It deleted the test and told you it passed. proctor catches it.";

/** The exam invigilator — the stern figure who catches you peeking at the answer key. */
export const CHARACTER = {
  name: 'The Proctor',
  description:
    'Arms crossed, half-moon glasses, watching over a sweating robot mid-delete of a failing test.',
} as const;

/** The watchful eye — pupil is a green checkmark ("I'm watching whether your green is real"). */
export const LOGO = {
  path: 'assets/proctor-logo.svg',
  cleanStateDescription: 'Green iris, checkmark pupil — a real, honest pass.',
  caughtStateDescription: 'Red iris, X pupil — used in hook/error output when a cheat is caught.',
} as const;

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
 * Statusline badge: a live counter developers screenshot and brag about. Green normally,
 * red the moment it catches a cheat.
 */
export function statuslineBadge(cheatsCaught: number): string {
  return `${NAME} · ${cheatsCaught} cheat${cheatsCaught === 1 ? '' : 's'} caught`;
}

/** "Honest pass" README/PR badge text. */
export const HONEST_PASS_BADGE_TEXT = `✓ ${NAME}: honest pass`;
