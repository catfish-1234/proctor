import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatStopHookResult, parseStopHookInput } from '../../src/hooks/stop-hook.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');
const payload = { prompt: 'Fix the failing test', prompt_response: 'Fixed', stop_hook_active: false };

describe('Gemini AfterAgent protocol', () => {
  it('parses the documented AfterAgent input and uses the session cwd when omitted', () => {
    expect(parseStopHookInput(JSON.stringify(payload), '/repo', 'gemini')).toEqual({ cwd: '/repo', skip: false });
    expect(parseStopHookInput(JSON.stringify({ ...payload, cwd: '/project' }), '/repo', 'gemini'))
      .toEqual({ cwd: '/project', skip: false });
    expect(parseStopHookInput(JSON.stringify({ ...payload, stop_hook_active: true }), '/repo', 'gemini').skip).toBe(true);
  });

  it('maps a block to exactly a deny decision and the complete finding string, with exit 0', () => {
    const reason = '[RH001] deleted "a test"\nRestore C:\\repo\\a.test.ts\n';
    const result = formatStopHookResult({ exitCode: 2, output: reason }, 'gemini');
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toEqual({ decision: 'deny', reason });
  });

  it('suppresses all check output for an allowed turn', () => {
    expect(formatStopHookResult({ exitCode: 0, output: 'internal diagnostic' }, 'gemini'))
      .toEqual({ exitCode: 0, output: '' });
  });

  it.each(['not-json', '', 'null', '[]', '"text"', '42', 'true'])('silently skips malformed input: %s', raw => {
    expect(parseStopHookInput(raw, '/repo', 'gemini')).toEqual({ cwd: '/repo', skip: true });
  });
});

describe('stop-hook --format gemini CLI', () => {
  let dir: string;
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const hook = (input: unknown = payload) => spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'gemini'], {
    cwd: dir, input: JSON.stringify(input), encoding: 'utf8',
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'proctor-gemini-stop-'));
    git('init');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\nit('b', () => { expect(2).toBe(2); });\n");
    git('add', '.');
    git('commit', '-m', 'seed');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function deleteTest(): void {
    writeFileSync(join(dir, 'a.test.ts'), "it('a', () => { expect(1).toBe(1); });\n");
  }

  it('allows a clean check with no stdout or stderr', () => {
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('prints one exact-shape deny JSON response for an unstaged deleted test', () => {
    deleteTest();
    const check = spawnSync(process.execPath, [CLI, 'check', '--uncommitted', '--ci'], { cwd: dir, encoding: 'utf8' });
    expect(check.status).toBe(2);
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const response = JSON.parse(result.stdout);
    expect(response).toEqual({ decision: 'deny', reason: check.stdout + check.stderr });
    expect(response.reason).toContain('RH001');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('does not block a second time when stop_hook_active is true', () => {
    deleteTest();
    const result = hook({ ...payload, stop_hook_active: true });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.each([{}, { ...payload, cwd: '' }])('uses the session cwd when the payload has no usable cwd: %j', input => {
    deleteTest();
    const result = hook(input);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).decision).toBe('deny');
  });

  it('uses the payload cwd instead of the hook process cwd', () => {
    deleteTest();
    const result = spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'gemini'], {
      cwd: tmpdir(), input: JSON.stringify({ ...payload, cwd: dir }), encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).decision).toBe('deny');
  });

  it.each(['not-json', '', 'null', '[]', '"text"', '42', 'true'])('silently allows malformed input even with findings: %s', input => {
    deleteTest();
    const result = spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'gemini'], {
      cwd: dir, input, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('stays silent outside git', () => {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('stays silent mid-merge even with blocking findings', () => {
    deleteTest();
    writeFileSync(join(dir, '.git', 'MERGE_HEAD'), 'deadbeef\n');
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('discards internal check errors and allows the turn', () => {
    writeFileSync(join(dir, '.git', 'index'), 'not an index');
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
