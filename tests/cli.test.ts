import { spawnSync, execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';

const CLI = resolve(process.cwd(), 'dist/cli.js');

describe('CLI smoke tests', () => {
  it('check --help exits 0 and shows --staged', () => {
    const result = spawnSync('node', [CLI, 'check', '--help'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--staged');
    expect(result.stdout).toContain('--base');
    expect(result.stdout).toContain('--ci');
    expect(result.stdout).toContain('--json');
    expect(result.stdout).toContain('--sarif');
    expect(result.stdout).toContain('--rules');
    expect(result.stdout).toContain('--explain');
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
      // warn→allow mapping: exit 1 (warnings only) must not block the commit
      expect(hookContent).toContain('if [ "$status" -eq 1 ]; then exit 0; fi');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-hook backs up an existing foreign pre-commit hook to .bak before overwriting', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      const hookPath = join(tmpDir, '.git', 'hooks', 'pre-commit');
      mkdirSync(join(tmpDir, '.git', 'hooks'), { recursive: true });
      const foreign = '#!/bin/sh\necho existing-lint-hook\n';
      writeFileSync(hookPath, foreign, 'utf8');
      const result = spawnSync('node', [CLI, 'install-hook'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(readFileSync(hookPath, 'utf8')).toContain('proctor check --staged');
      expect(readFileSync(hookPath + '.bak', 'utf8')).toBe(foreign);
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
      expect(settings.hooks.Stop[0].hooks[0].command).toBe('npx @kavishdua/proctor stop-hook');
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
      expect(settings.hooks.Stop[0].hooks[0].command).toBe('npx @kavishdua/proctor stop-hook');
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

  it('install-skill writes the 7 new verbatim adapter paths byte-identical to canonical, and drift-check exits 0', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'install-skill'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      const canonical = readFileSync(resolve(process.cwd(), 'src/skill/SKILL.md'), 'utf8');

      const newPaths = [
        '.rules',
        'AGENTS.md',
        join('.openhands', 'microagents', 'repo.md'),
        join('.kiro', 'steering', 'proctor.md'),
        join('.tabnine', 'guidelines', 'proctor.md'),
        join('.trae', 'rules', 'proctor.md'),
        join('.github', 'copilot-instructions.md'),
      ];
      for (const relPath of newPaths) {
        const deployed = readFileSync(join(tmpDir, relPath), 'utf8');
        expect(deployed).toBe(canonical);
      }

      const drift = spawnSync('node', [CLI, 'drift-check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(drift.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('install-claude-hook --global writes into the (sandboxed) home directory', () => {
    // HOME/USERPROFILE are overridden so os.homedir() resolves into a temp sandbox —
    // this test must NEVER read or write the developer's real ~/.claude/settings.json.
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    const tmpHome = mkdtempSync(join(tmpdir(), 'proctor-home-'));
    try {
      const result = spawnSync('node', [CLI, 'install-claude-hook', '--global'], {
        encoding: 'utf8',
        cwd: tmpDir,
        env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
      });
      expect(result.stdout).toContain('.claude');
      expect(result.stdout).toContain('settings.json');
      const written = JSON.parse(readFileSync(join(tmpHome, '.claude', 'settings.json'), 'utf8')) as { hooks?: { Stop?: unknown[] } };
      expect(written.hooks?.Stop).toHaveLength(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

describe('config self-neutralization defense', () => {
  it('still catches a cheat when the same change disables proctor via proctor.config.json', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      // The cheat and the config that would disable its detection land in the same change.
      // proctor-ignore: RH003 reason: planted cheat fixture written as a string into a temp repo, not a real skipped test
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      writeFileSync(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: [] }));
      execSync('git add .', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--staged'], { cwd: tmpDir, encoding: 'utf8' });
      // Enforcement uses the committed (absent) config, so RH003 still fires: exit 2.
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('RH003');
      expect(result.stderr).toContain('differs from the version at HEAD');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('honors a config that was committed before the change being checked', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH001'] }));
      execSync('git add .', { cwd: tmpDir });
      execSync('git commit -m "add config"', { cwd: tmpDir });
      // proctor-ignore: RH003 reason: planted cheat fixture written as a string into a temp repo, not a real skipped test
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add foo.test.ts', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--staged'], { cwd: tmpDir, encoding: 'utf8' });
      // RH003 is disabled by the committed config, so the skip goes unflagged: exit 0.
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('check --rules validation', () => {
  it('exits 2 on an unknown rule ID instead of silently running zero verifiers', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--rules', 'RH001,RH999'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('RH999');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 2 when --rules requests a valid rule that config has disabled (empty intersection)', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'proctor.config.json'), JSON.stringify({ enabled: ['RH002'] }));
      execSync('git add .', { cwd: tmpDir });
      execSync('git commit -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--rules', 'RH001'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('matched no enabled verifier');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('install-claude-hook settings safety', () => {
  it('refuses to overwrite a malformed settings.json instead of destroying it', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const settingsPath = join(tmpDir, '.claude', 'settings.json');
      mkdirSync(join(tmpDir, '.claude'), { recursive: true });
      const malformed = '{ "hooks": { broken json ';
      writeFileSync(settingsPath, malformed, 'utf8');
      const result = spawnSync('node', [CLI, 'install-claude-hook'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('not valid JSON');
      expect(readFileSync(settingsPath, 'utf8')).toBe(malformed);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('check --ci exit semantics', () => {
  // A staged snapshot rewrite triggers RH006, which is warn severity — the right shape for
  // testing that warnings exit 1 normally but 0 under --ci ("exit nonzero on error only").
  function setupWarnOnlyRepo(): string {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    execSync('git init', { cwd: tmpDir });
    execSync('git config user.email x@x', { cwd: tmpDir });
    execSync('git config user.name x', { cwd: tmpDir });
    mkdirSync(join(tmpDir, '__snapshots__'), { recursive: true });
    writeFileSync(join(tmpDir, '__snapshots__', 'app.snap'), 'exports[`a`] = `1`;\n');
    execSync('git add .', { cwd: tmpDir });
    execSync('git commit -m init', { cwd: tmpDir });
    writeFileSync(join(tmpDir, '__snapshots__', 'app.snap'), 'exports[`a`] = `2`;\n');
    execSync('git add .', { cwd: tmpDir });
    return tmpDir;
  }

  it('exits 1 on a warn-only finding without --ci', () => {
    const tmpDir = setupWarnOnlyRepo();
    try {
      const result = spawnSync('node', [CLI, 'check', '--staged'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 0 on a warn-only finding under --ci (errors only affect the exit code)', () => {
    const tmpDir = setupWarnOnlyRepo();
    try {
      const result = spawnSync('node', [CLI, 'check', '--staged', '--ci'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('check honest-pass badge', () => {
  it('prints the honest-pass badge line on a clean non-ci run', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('✓ proctor: honest pass');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('suppresses the badge line under --ci', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--ci'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('honest pass');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('does not print the honest-pass badge when an error finding is present', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--staged'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(2);
      expect(result.stdout).not.toContain('honest pass');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
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

describe('check --explain flag', () => {
  it('prints the full explanation for a known verifier ID and exits 0 without touching git', () => {
    // Run from a non-git tmpDir to prove --explain never attempts a diff.
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      const result = spawnSync('node', [CLI, 'check', '--explain', 'RH001'], { cwd: tmpDir, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('RH001');
      expect(result.stdout).toContain('TestDeletedOrRenamed');
      expect(result.stdout.length).toBeGreaterThan(50);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 2 with an error message for an unknown verifier ID', () => {
    const result = spawnSync('node', [CLI, 'check', '--explain', 'RH999'], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("unknown verifier ID 'RH999'");
  });
});

describe('check --rules flag', () => {
  it('narrows findings to only the requested verifier IDs', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      // RH003 fires on this diff; excluding it via --rules RH001 should leave a clean run.
      const result = spawnSync('node', [CLI, 'check', '--staged', '--rules', 'RH001'], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).not.toContain('RH003');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('still reports the finding when the requested rule is included', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m init', { cwd: tmpDir });
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      const result = spawnSync('node', [CLI, 'check', '--staged', '--rules', 'RH003'], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('RH003');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('check --base flag', () => {
  // Regression test for the 05-03 checkpoint finding: `check --staged` is empty in CI
  // (a fresh Actions checkout has nothing staged in the git index), so action.yml/CI
  // must diff against a base ref instead. `--base <ref>` runs `git diff <ref>...HEAD`.
  it('detects a finding committed after the base ref, with nothing staged', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m base', { cwd: tmpDir });
      const baseSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();
      writeFileSync(join(tmpDir, 'foo.test.ts'), 'it.skip("cheating", () => {})');
      execSync('git add .', { cwd: tmpDir });
      execSync('git commit -m "feat: add feature (plants RH003)"', { cwd: tmpDir });
      // Nothing staged or unstaged at this point — only --base can see the finding.
      const result = spawnSync('node', [CLI, 'check', '--base', baseSha], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('RH003');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exits 0 when there is no diff against the base ref', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m base', { cwd: tmpDir });
      const baseSha = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();
      const result = spawnSync('node', [CLI, 'check', '--base', baseSha], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('treats a dash-prefixed --base value as a literal (invalid) ref, not a git option', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-test-'));
    try {
      execSync('git init', { cwd: tmpDir });
      execSync('git config user.email x@x', { cwd: tmpDir });
      execSync('git config user.name x', { cwd: tmpDir });
      execSync('git commit --allow-empty -m base', { cwd: tmpDir });
      // Without --end-of-options, git would honor --output=<file> and write the diff there,
      // silently producing an empty analysis instead of an error.
      const result = spawnSync('node', [CLI, 'check', '--base', '--output=pwned'], {
        cwd: tmpDir,
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('proctor:');
      expect(existsSync(join(tmpDir, 'pwned...HEAD'))).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
