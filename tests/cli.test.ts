import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';

const CLI = resolve(process.cwd(), 'dist/cli.js');

describe('CLI smoke tests', () => {
  it('check --help exits 0 and shows --staged', () => {
    const result = spawnSync('node', [CLI, 'check', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--staged');
    expect(result.stdout).toContain('--ci');
    expect(result.stdout).toContain('--json');
  });

  it('check in non-git dir exits 2 with proctor: on stderr', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('proctor:');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-hook creates .git/hooks/pre-commit', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'install-hook'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      const hookContent = readFileSync(join(tmpDir, '.git', 'hooks', 'pre-commit'), 'utf8');
      expect(hookContent).toContain('proctor check --staged');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-hook with husky creates .husky/pre-commit', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ devDependencies: { husky: '^8' } }));
      const result = spawnSync('node', [CLI, 'install-hook'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      const hookContent = readFileSync(join(tmpDir, '.husky', 'pre-commit'), 'utf8');
      expect(hookContent).toContain('proctor check --staged');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('--version exits 0', () => {
    const result = spawnSync('node', [CLI, '--version'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toMatch(/\d+\.\d+\.\d+/);
  });
});
