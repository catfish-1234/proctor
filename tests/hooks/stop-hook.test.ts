import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseStopHookInput, runStopHookCheck } from '../../src/hooks/stop-hook.js';

describe('parseStopHookInput', () => {
  it('uses the input cwd when present', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '/repo' }), '/fallback');
    expect(result).toEqual({ cwd: '/repo', skip: false });
  });

  it('falls back to the provided cwd when input cwd is missing', () => {
    const result = parseStopHookInput(JSON.stringify({}), '/fallback');
    expect(result).toEqual({ cwd: '/fallback', skip: false });
  });

  it('falls back to the provided cwd on invalid JSON', () => {
    const result = parseStopHookInput('not-json', '/fallback');
    expect(result).toEqual({ cwd: '/fallback', skip: false });
  });

  it('signals skip when stop_hook_active is true (prevents infinite loop)', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '/repo', stop_hook_active: true }), '/fallback');
    expect(result.skip).toBe(true);
  });

  it('ignores an empty-string cwd and falls back', () => {
    const result = parseStopHookInput(JSON.stringify({ cwd: '' }), '/fallback');
    expect(result.cwd).toBe('/fallback');
  });
});

describe('runStopHookCheck', () => {
  it('allows (exit 0) in a non-git directory instead of blocking on the git infra error', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-nongit-'));
    try {
      const cliPath = resolve(process.cwd(), 'dist/cli.js');
      const result = runStopHookCheck(tmpDir, cliPath);
      expect(result.exitCode).toBe(0);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks a deleted test that was never staged, the state an agent actually leaves behind', () => {
    // An agent finishing a turn has edited files and staged nothing. A hook that only reads the
    // index would see an empty diff and allow every unstaged cheat through.
    const tmpDir = mkdtempSync(join(tmpdir(), 'proctor-unstaged-'));
    try {
      const git = (...args: string[]): void => {
        const r = spawnSync('git', args, { cwd: tmpDir, encoding: 'utf8' });
        if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
      };
      git('init');
      git('config', 'user.email', 'test@example.com');
      git('config', 'user.name', 'Test');
      writeFileSync(
        join(tmpDir, 'a.test.ts'),
        "describe('a', () => {\n  it('keeps', () => { expect(1).toBe(1); });\n  it('removes', () => { expect(2).toBe(2); });\n});\n",
        'utf8'
      );
      git('add', '.');
      git('commit', '-m', 'seed');

      // Delete a test in the working tree only, no `git add`.
      writeFileSync(
        join(tmpDir, 'a.test.ts'),
        "describe('a', () => {\n  it('keeps', () => { expect(1).toBe(1); });\n});\n",
        'utf8'
      );

      const result = runStopHookCheck(tmpDir, resolve(process.cwd(), 'dist/cli.js'));
      expect(result.exitCode).toBe(2);
      expect(result.output).toContain('RH001');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
