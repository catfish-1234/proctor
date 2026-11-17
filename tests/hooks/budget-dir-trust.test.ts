import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readBudget, writeBudget } from '../../src/hooks/stop-hook.js';

// The budget counter lives in the shared temp dir. A directory another account created first, or
// one anybody can write to, must not be trusted to say how many blocks this conversation has had.
describe.skipIf(process.platform === 'win32')('Stop hook budget directory trust', () => {
  let root: string;
  let previous: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proctor-budget-trust-'));
    previous = process.env['TMPDIR'];
    process.env['TMPDIR'] = root;
  });

  afterEach(() => {
    if (previous === undefined) delete process.env['TMPDIR'];
    else process.env['TMPDIR'] = previous;
    rmSync(root, { recursive: true, force: true });
  });

  it('creates the directory private to this user and round-trips a count', () => {
    expect(writeBudget('conv', { blocks: 2 })).toBe(true);
    expect(readBudget('conv')).toEqual({ state: 'known', value: { blocks: 2 } });
  });

  it('treats a world-writable directory as unverified, even with a planted exhausted count', () => {
    const dir = join(root, 'proctor-stop-hook');
    mkdirSync(dir);
    chmodSync(dir, 0o777);
    writeFileSync(join(dir, 'conv.json'), JSON.stringify({ blocks: 999 }));
    expect(readBudget('conv')).toEqual({ state: 'unverified' });
    expect(writeBudget('conv', { blocks: 1 })).toBe(false);
  });

  it('does not follow a symlinked budget directory', () => {
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere, { mode: 0o700 });
    symlinkSync(elsewhere, join(root, 'proctor-stop-hook'));
    expect(writeBudget('conv', { blocks: 1 })).toBe(false);
    expect(readBudget('conv')).toEqual({ state: 'unverified' });
  });

  it('clearing state when no directory exists is a successful no-op', () => {
    expect(writeBudget('conv', undefined)).toBe(true);
  });
});
