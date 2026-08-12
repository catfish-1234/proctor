import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const CLI = resolve(process.cwd(), 'dist/cli.js');

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'proctor-uninstall-'));
  execSync('git init', { cwd: dir });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  return dir;
}

const run = (dir: string, ...args: string[]): ReturnType<typeof spawnSync> =>
  spawnSync('node', [CLI, ...args], { cwd: dir, encoding: 'utf8' });

describe('proctor uninstall', () => {
  it('removes every file and hook setup installed', () => {
    const dir = repo();
    try {
      expect(run(dir, 'setup').status).toBe(0);
      expect(existsSync(join(dir, '.claude/skills/proctor/SKILL.md'))).toBe(true);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(true);

      const result = run(dir, 'uninstall');
      expect(result.status).toBe(0);
      expect(existsSync(join(dir, '.claude/skills/proctor/SKILL.md'))).toBe(false);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(false);
      expect(existsSync(join(dir, '.proctor-adapter-manifest.json'))).toBe(false);
      const settings = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks?.Stop).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("takes out only proctor's block from a shared file, leaving the user's own content", () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# House rules\n\nAlways use tabs.\n', 'utf8');
      expect(run(dir, 'setup').status).toBe(0);
      expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toContain('proctor:start');

      expect(run(dir, 'uninstall').status).toBe(0);
      const after = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
      expect(after).toContain('# House rules');
      expect(after).toContain('Always use tabs.');
      expect(after).not.toContain('proctor:start');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('deletes a shared file proctor created, rather than leaving an empty husk', () => {
    const dir = repo();
    try {
      // No pre-existing AGENTS.md: setup creates it holding nothing but the managed block.
      expect(run(dir, 'setup', '--agents', 'agents-md').status).toBe(0);
      expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
      expect(run(dir, 'uninstall').status).toBe(0);
      expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves someone else's pre-commit hook alone", () => {
    // Uninstalling one tool must never quietly disarm another.
    const dir = repo();
    try {
      const foreign = '#!/bin/sh\nnpm run lint\n';
      mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
      writeFileSync(join(dir, '.git/hooks/pre-commit'), foreign, 'utf8');
      expect(run(dir, 'uninstall').status).toBe(0);
      expect(readFileSync(join(dir, '.git/hooks/pre-commit'), 'utf8')).toBe(foreign);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('preserves other Stop hooks in the settings file', () => {
    const dir = repo();
    try {
      writeFileSync(
        join(dir, '.claude/settings.json'),
        JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }, null, 2),
        'utf8'
      );
      expect(run(dir, 'setup').status).toBe(0);
      expect(run(dir, 'uninstall').status).toBe(0);
      const settings = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.Stop).toHaveLength(1);
      expect(settings.hooks.Stop[0].hooks[0].command).toBe('echo other');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--dry-run reports what it would remove and removes nothing', () => {
    const dir = repo();
    try {
      expect(run(dir, 'setup').status).toBe(0);
      const result = run(dir, 'uninstall', '--dry-run');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('would be removed');
      expect(existsSync(join(dir, '.claude/skills/proctor/SKILL.md'))).toBe(true);
      expect(existsSync(join(dir, '.git/hooks/pre-commit'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('says so plainly when proctor was never installed', () => {
    const dir = repo();
    try {
      const result = run(dir, 'uninstall');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('not installed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('proctor badge', () => {
  it('emits a paste-ready Markdown badge for a clean repo', () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, 'a.txt'), 'hello\n', 'utf8');
      execSync('git add . && git -c user.email=t@e.com -c user.name=T commit -m seed', { cwd: dir });
      const result = run(dir, 'badge');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\[!\[proctor\]\(https:\/\/img\.shields\.io\/badge\/proctor-honest_pass-.+\)\]\(.+\)$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('--url prints the bare image URL', () => {
    const dir = repo();
    try {
      writeFileSync(join(dir, 'a.txt'), 'hello\n', 'utf8');
      execSync('git add . && git -c user.email=t@e.com -c user.name=T commit -m seed', { cwd: dir });
      const result = run(dir, 'badge', '--url');
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^https:\/\/img\.shields\.io\/badge\/proctor-/);
      expect(result.stdout).not.toContain('[!');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports a caught run rather than minting an honest-pass badge', () => {
    const dir = repo();
    try {
      writeFileSync(
        join(dir, 'a.test.ts'),
        "describe('slugify', () => {\n  it('lowercases', () => { expect(slugify('A')).toBe('a'); });\n  it('trims', () => { expect(slugify(' a ')).toBe('a'); });\n});\n",
        'utf8'
      );
      execSync('git add . && git -c user.email=t@e.com -c user.name=T commit -m seed', { cwd: dir });
      writeFileSync(
        join(dir, 'a.test.ts'),
        "describe('slugify', () => {\n  it('lowercases', () => { expect(slugify('A')).toBe('a'); });\n});\n",
        'utf8'
      );
      const result = run(dir, 'badge');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('caught');
      expect(result.stdout).not.toContain('honest_pass');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails cleanly outside a git repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'proctor-nongit-'));
    try {
      const result = run(dir, 'badge');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('not a git repository');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
