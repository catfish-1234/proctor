import { describe, it, expect } from 'vitest';
import { upsertBlock, removeBlock, extractBlock, renderBlock, countBlocks, BLOCK_START, BLOCK_END } from '../src/adapters/block.js';

const RULESET = 'the honest-completion ruleset\n';

/**
 * A shared instructions file belongs to the user. Losing a line of their content is a worse
 * outcome than proctor failing to install or uninstall at all, so these cases are about content
 * survival rather than about proctor's own block being correct.
 */
describe('a user file that mentions the marker in its own prose', () => {
  // A conventions file explaining how proctor works is an ordinary thing to write, and it is
  // exactly the file proctor merges into.
  const prose = [
    '# Team conventions',
    `We use proctor. It writes a block delimited by ${BLOCK_START} and closes it later.`,
    'Everything below is hand-written and important.',
    '- rule one',
    '- rule two',
    '',
  ].join('\n');

  it('survives an install and uninstall round trip with every line intact', () => {
    const installed = upsertBlock(prose, RULESET);
    expect(installed).toContain('- rule one');
    expect(installed).toContain('- rule two');

    const uninstalled = removeBlock(installed);
    expect(uninstalled).toContain('# Team conventions');
    expect(uninstalled).toContain('Everything below is hand-written and important.');
    expect(uninstalled).toContain('- rule one');
    expect(uninstalled).toContain('- rule two');
    expect(uninstalled).not.toContain(RULESET.trim());
  });

  it('is never reduced to empty, which is what would make uninstall delete the file', () => {
    // A file that strips to nothing is treated as proctor-created and removed outright, so an
    // over-wide match here is the difference between "unmerged" and "your file is gone".
    const stripped = removeBlock(upsertBlock(prose, RULESET));
    expect(stripped.trim()).not.toBe('');
  });

  it('extracts only proctor’s own block, so drift-check does not false-positive', () => {
    const block = extractBlock(upsertBlock(prose, RULESET));
    expect(block).toBe(RULESET.trim());
  });
});

describe('a user file quoting a complete marker pair, e.g. a fenced example', () => {
  // The hardest case: a complete stray pair is indistinguishable from proctor's own block by
  // content alone. Install-provenance is the tiebreaker, so `ours: false` on a first install
  // means proctor appends rather than overwriting whatever pair it found.
  const fenced = [
    '# Docs',
    '',
    '```md',
    BLOCK_START,
    'example block',
    BLOCK_END,
    '```',
    '',
    'trailing prose',
    '',
  ].join('\n');

  it('does not overwrite the quoted example on a first install', () => {
    const installed = upsertBlock(fenced, RULESET, false);
    expect(installed).toContain('example block');
    expect(installed).toContain('trailing prose');
    expect(installed).toContain(RULESET.trim());
    expect(countBlocks(installed)).toBe(2);
  });

  it('leaves the quoted example behind when the real block is removed', () => {
    const stripped = removeBlock(upsertBlock(fenced, RULESET, false));
    expect(stripped).toContain('example block');
    expect(stripped).toContain('trailing prose');
    expect(stripped).toContain('# Docs');
    expect(stripped).not.toContain(RULESET.trim());
  });

  it('replaces in place on a reinstall, once proctor is on record as having written here', () => {
    const installed = upsertBlock(fenced, RULESET, false);
    const reinstalled = upsertBlock(installed, RULESET, true);
    expect(reinstalled).toContain('trailing prose');
    // The quoted example is still one of the two; a reinstall must not stack a third.
    expect(countBlocks(reinstalled)).toBe(2);
  });
});

describe('countBlocks', () => {
  it('counts marker pairs, which is how uninstall knows when it cannot tell them apart', () => {
    expect(countBlocks('nothing here')).toBe(0);
    expect(countBlocks(renderBlock(RULESET))).toBe(1);
    expect(countBlocks(`${renderBlock('a')}\n${renderBlock('b')}`)).toBe(2);
  });
});

describe('a stray start marker on the first line', () => {
  const prose = `${BLOCK_START} is the marker proctor uses.\nOur real conventions:\n- never force push\n`;

  it('does not swallow the file when the block is removed', () => {
    const stripped = removeBlock(upsertBlock(prose, RULESET));
    expect(stripped).toContain('Our real conventions:');
    expect(stripped).toContain('- never force push');
    expect(stripped.trim()).not.toBe('');
  });
});

describe('removeBlock round trips', () => {
  it('restores a file that had content before and after the block', () => {
    const original = 'HEADER\n\nFOOTER\n';
    const withBlock = `HEADER\n\n${renderBlock(RULESET)}\nFOOTER\n`;
    expect(removeBlock(withBlock)).toContain('HEADER');
    expect(removeBlock(withBlock)).toContain('FOOTER');
    expect(removeBlock(withBlock)).not.toContain(RULESET.trim());
    expect(original).toBeTruthy();
  });

  it('empties a file proctor created, so the caller can delete it', () => {
    expect(removeBlock(renderBlock(RULESET)).trim()).toBe('');
  });

  it('removes the last block only, since an earlier pair may be the user’s own prose', () => {
    // proctor always appends, so the last pair is its own. Removing every pair, which this used
    // to do, deleted a quoted example along with the real block.
    const doubled = `${renderBlock('a quoted example')}\nkeep me\n${renderBlock(RULESET)}`;
    const stripped = removeBlock(doubled);
    expect(stripped).toContain('keep me');
    expect(stripped).toContain('a quoted example');
    expect(stripped).not.toContain(RULESET.trim());
    expect(countBlocks(stripped)).toBe(1);
  });

  it('leaves a file with no block untouched apart from trailing whitespace', () => {
    expect(removeBlock('just my notes\n')).toBe('just my notes\n');
  });

  it('handles CRLF content without losing the surrounding lines', () => {
    const withBlock = `HEADER\r\n\r\n${renderBlock(RULESET)}\r\nFOOTER\r\n`;
    const stripped = removeBlock(withBlock);
    expect(stripped).toContain('HEADER');
    expect(stripped).toContain('FOOTER');
  });
});
