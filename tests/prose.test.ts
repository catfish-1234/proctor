import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = resolve(process.cwd());

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(f => /\.(ts|tsx|js|jsx|md|json|yml|yaml|py|tape|sh)$/.test(f))
    // This file necessarily contains the character it searches for.
    .filter(f => f !== 'tests/prose.test.ts');
}

describe('prose style', () => {
  it('no tracked source or doc file uses an em dash', () => {
    const offenders = trackedFiles().filter(f => {
      try {
        return readFileSync(resolve(REPO, f), 'utf8').includes('—');
      } catch {
        return false;
      }
    });
    expect(offenders, `em dashes found in: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('CLI reference coverage', () => {
  it('every registered command has a section in the README', () => {
    const cli = readFileSync(resolve(REPO, 'src/cli.ts'), 'utf8');
    const readme = readFileSync(resolve(REPO, 'README.md'), 'utf8');
    const commands = [...cli.matchAll(/\.command\('([\w-]+)/g)].map(m => m[1]!);
    expect(commands.length).toBeGreaterThan(0);
    const undocumented = commands.filter(c => !readme.includes(`### \`proctor ${c}`));
    expect(undocumented, `commands missing a README section: ${undocumented.join(', ')}`).toEqual([]);
  });
});
