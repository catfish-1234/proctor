import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = resolve(process.cwd(), 'dist/scripts/postinstall.js');
const ROOT = resolve(process.cwd());

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-postinstall-'));
  execSync('git init', { cwd: dir });
  return dir;
}

/**
 * npm hands postinstall the target project through INIT_CWD, so that is what these drive.
 * CI is cleared explicitly: vitest runs under CI in this repo's own workflow, and CI is one of
 * the skip conditions, so leaving it set would make every assertion below vacuously pass.
 */
function runPostinstall(dir: string, env: Record<string, string> = {}): ReturnType<typeof spawnSync> {
  return spawnSync('node', [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CI: '', INIT_CWD: dir, PROCTOR_NO_POSTINSTALL: '', PROCTOR_AUTO_SETUP: '', ...env },
  });
}

/** Everything `setup` writes at the repo root, minus what `git init` already put there. */
const rootEntries = (dir: string): string[] => readdirSync(dir).filter(e => e !== '.git');

describe('postinstall posture', () => {
  it('writes nothing into the project by default', () => {
    const dir = repo();
    try {
      const result = runPostinstall(dir);
      expect(result.status).toBe(0);
      // The two things setup would put in a bare repo: an AGENTS.md ruleset and a pre-commit hook.
      expect(rootEntries(dir)).toEqual([]);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('names the one command that does the install, and what it would write', () => {
    const dir = repo();
    try {
      const out = runPostinstall(dir).stdout;
      expect(out).toContain('npx proctor setup');
      expect(out).toContain('written nothing to your repository');
      expect(out).toContain('.git/hooks/pre-commit');
      expect(out).toContain('PROCTOR_AUTO_SETUP=1');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still installs everything when PROCTOR_AUTO_SETUP=1 is set explicitly', () => {
    const dir = repo();
    try {
      const result = runPostinstall(dir, { PROCTOR_AUTO_SETUP: '1' });
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(true);
      expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stays silent in the contexts where nothing was going to be written anyway', () => {
    const dir = repo();
    try {
      for (const env of [{ CI: '1' }, { PROCTOR_NO_POSTINSTALL: '1' }, { npm_config_global: 'true' }]) {
        const result = runPostinstall(dir, env);
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('');
        expect(rootEntries(dir)).toEqual([]);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not run setup on an auto-setup install in a skipped context', () => {
    const dir = repo();
    try {
      const result = runPostinstall(dir, { PROCTOR_AUTO_SETUP: '1', CI: '1' });
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
