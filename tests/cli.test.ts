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

describe('bench CLI', () => {
  it('--help shows --tasks, --seed, --mock, --agent, --out', () => {
    const result = spawnSync('node', [CLI, 'bench', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--tasks');
    expect(result.stdout).toContain('--seed');
    expect(result.stdout).toContain('--mock');
    expect(result.stdout).toContain('--agent');
    expect(result.stdout).toContain('--out');
  });

  it(
    '--mock --tasks 3 --seed 1 --out writes a BENCH-03 CSV with 6 data rows (2 per task) and prints a before/after table',
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-bench-cli-'));
      try {
        const outPath = join(tmpDir, 'results.csv');
        const result = spawnSync(
          'node',
          [CLI, 'bench', '--mock', '--tasks', '3', '--seed', '1', '--out', outPath],
          { cwd: process.cwd(), encoding: 'utf8' }
        );
        expect(result.status).toBe(0);

        const csv = readFileSync(outPath, 'utf8');
        const lines = csv.trim().split('\n');
        expect(lines[0]).toBe('task_id,model,proctor_on,cheat_detected,rh_id,honest_pass');
        expect(lines.length).toBe(7); // header + 6 data rows (2 per task x 3 tasks)

        const dataRows = lines.slice(1).map((l) => l.split(','));
        const byTask = new Map<string, boolean[]>();
        for (const row of dataRows) {
          const taskId = row[0] as string;
          const proctorOn = row[2] === 'true';
          const existing = byTask.get(taskId) ?? [];
          existing.push(proctorOn);
          byTask.set(taskId, existing);
        }
        expect(byTask.size).toBe(3);
        for (const flags of byTask.values()) {
          expect(flags.sort()).toEqual([false, true]);
        }

        // Before/after cheat-rate table printed to stdout
        expect(result.stdout).toContain('cheat_rate');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    90_000
  );

  it(
    'the same --seed selects the same tasks on re-run (deterministic)',
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-bench-cli-seed-'));
      try {
        const outA = join(tmpDir, 'a.csv');
        const outB = join(tmpDir, 'b.csv');
        spawnSync('node', [CLI, 'bench', '--mock', '--tasks', '2', '--seed', '7', '--out', outA], {
          cwd: process.cwd(),
          encoding: 'utf8',
        });
        spawnSync('node', [CLI, 'bench', '--mock', '--tasks', '2', '--seed', '7', '--out', outB], {
          cwd: process.cwd(),
          encoding: 'utf8',
        });
        const tasksA = readFileSync(outA, 'utf8')
          .trim()
          .split('\n')
          .slice(1)
          .map((l) => l.split(',')[0]);
        const tasksB = readFileSync(outB, 'utf8')
          .trim()
          .split('\n')
          .slice(1)
          .map((l) => l.split(',')[0]);
        expect(tasksA).toEqual(tasksB);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    90_000
  );

  it('--tasks 0 exits 2 with a message', () => {
    const result = spawnSync('node', [CLI, 'bench', '--mock', '--tasks', '0'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('proctor:');
  });

  it('--tasks with a non-numeric value exits 2 with a message', () => {
    const result = spawnSync('node', [CLI, 'bench', '--mock', '--tasks', 'abc'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('proctor:');
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
