import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { describe, it, expect } from 'vitest';

const CLI = resolve(process.cwd(), 'dist/cli.js');

describe('CLI smoke tests', () => {
  it('check --help exits 0 and shows --staged', () => {
    const result = spawnSync('node', [CLI, 'check', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--staged');
    expect(result.stdout).toContain('--ci');
    expect(result.stdout).toContain('--json');
    expect(result.stdout).toContain('--sarif');
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

  it('stop-hook with clean git dir exits 0', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'stop-hook'], {
        input: JSON.stringify({ cwd: tmpDir }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('stop-hook with invalid JSON stdin exits 0', () => {
    const result = spawnSync('node', [CLI, 'stop-hook'], {
      input: 'not-json',
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status).toBe(0);
  });

  it('stop-hook with stop_hook_active true exits 0', () => {
    const result = spawnSync('node', [CLI, 'stop-hook'], {
      input: JSON.stringify({ cwd: process.cwd(), stop_hook_active: true }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
  });

  it('stop-hook with staged error finding exits 2', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'stop-hook'], {
        input: JSON.stringify({ cwd: tmpDir }),
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-claude-hook creates .claude/settings.json', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'install-claude-hook'], {
        encoding: 'utf8',
        cwd: tmpDir,
      });
      expect(result.status).toBe(0);
      const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf8')) as {
        hooks: { Stop: Array<{ hooks: Array<{ command: string; type: string }> }> };
      };
      expect(settings.hooks.Stop[0].hooks[0].command).toBe('npx proctor stop-hook');
      expect(settings.hooks.Stop[0].hooks[0].type).toBe('command');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-claude-hook is idempotent', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      spawnSync('node', [CLI, 'install-claude-hook'], { encoding: 'utf8', cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'install-claude-hook'], { encoding: 'utf8', cwd: tmpDir });
      expect(result.stdout).toContain('Already installed');
      const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf8')) as {
        hooks: { Stop: unknown[] };
      };
      expect(settings.hooks.Stop).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-claude-hook preserves existing settings', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.claude', 'settings.json'),
        JSON.stringify({
          permissions: { allow: ['Bash(git *)'] },
          hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
        }),
      );
      spawnSync('node', [CLI, 'install-claude-hook'], { encoding: 'utf8', cwd: tmpDir });
      const settings = JSON.parse(readFileSync(join(tmpDir, '.claude', 'settings.json'), 'utf8')) as {
        permissions: { allow: string[] };
        hooks: { PreToolUse: unknown[]; Stop: Array<{ hooks: Array<{ command: string }> }> };
      };
      expect(settings.permissions.allow).toContain('Bash(git *)');
      expect(settings.hooks.PreToolUse).toBeDefined();
      expect(settings.hooks.Stop[0].hooks[0].command).toBe('npx proctor stop-hook');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-skill writes byte-identical canonical SKILL.md to every adapter path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'install-skill'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      const canonical = readFileSync(resolve(process.cwd(), 'src/skill/SKILL.md'), 'utf8');
      const deployed = readFileSync(join(tmpDir, '.claude', 'skills', 'proctor', 'SKILL.md'), 'utf8');
      expect(deployed).toBe(canonical);
      expect(result.stdout).toContain('Installed:');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-skill --help exits 0', () => {
    const result = spawnSync('node', [CLI, 'install-skill', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
  });

  it('install-claude-hook --global reports homedir path', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    const globalSettingsPath = join(homedir(), '.claude', 'settings.json');
    try {
      const result = spawnSync('node', [CLI, 'install-claude-hook', '--global'], {
        encoding: 'utf8',
        cwd: tmpDir,
      });
      expect(result.stdout).toContain('.claude');
      expect(result.stdout).toContain('settings.json');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      // Clean up the written global file if it was newly created by this test
      // (avoids permanently polluting ~/.claude/settings.json)
      try {
        const content = readFileSync(globalSettingsPath, 'utf8');
        const parsed = JSON.parse(content) as { hooks?: { Stop?: unknown[] } };
        // Only remove if it looks like our test wrote it (single Stop entry)
        if (parsed.hooks?.Stop && (parsed.hooks.Stop as unknown[]).length === 1) {
          rmSync(globalSettingsPath, { force: true });
        }
      } catch { /* file may not exist or not be ours to remove */ }
    }
  });
});

describe('check --ai flag', () => {
  it('exits 1 with informative message when ANTHROPIC_API_KEY is not set', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const env = { ...process.env, ANTHROPIC_API_KEY: '' };
      const result = spawnSync('node', [CLI, 'check', '--ai'], {
        cwd: tmpDir,
        encoding: 'utf8',
        env,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('--ai requires ANTHROPIC_API_KEY');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 0 on clean diff without --ai (offline regression guard)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check'], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('check --sarif flag', () => {
  it('produces valid SARIF JSON on stdout and exits 2 for a planted RH003 error finding', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--staged', '--sarif'], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      const parsed = JSON.parse(result.stdout) as { $schema: string; version: string };
      expect(parsed.$schema).toBeDefined();
      expect(parsed.version).toBe('2.1.0');
      expect(result.status).toBe(2);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
