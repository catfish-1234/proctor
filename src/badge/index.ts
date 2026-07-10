import type { Receipt } from '../receipt.js';
import { NAME, HONEST_PASS_BADGE_TEXT, COLORS } from '../brand.js';

const REPO_URL = 'https://github.com/catfish-1234/proctor';

function shieldsColor(status: Receipt['status']): string {
  return (status === 'honest-pass' ? COLORS.verifyGreen.hex : COLORS.caughtRed.hex).replace('#', '');
}

/** shields.io static-badge URL rendering a Receipt's honest-pass status. */
export function badgeUrl(receipt: Receipt): string {
  const message = receipt.status === 'honest-pass' ? 'honest_pass' : 'caught';
  return `https://img.shields.io/badge/${NAME}-${message}-${shieldsColor(receipt.status)}`;
}

/** Markdown snippet suitable for embedding in a README or PR description. */
export function badgeMarkdown(receipt: Receipt): string {
  return `[![${NAME}](${badgeUrl(receipt)})](${REPO_URL})`;
}

/** Plain-text line printed to the CLI on a clean run, e.g. `✓ proctor: honest pass`. */
export function badgeLine(receipt: Receipt): string {
  return receipt.status === 'honest-pass' ? HONEST_PASS_BADGE_TEXT : `✗ ${NAME}: caught`;
}
