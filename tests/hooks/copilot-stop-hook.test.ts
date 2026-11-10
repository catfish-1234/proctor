import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { formatStopHookResult, parseStopHookInput } from '../../src/hooks/stop-hook.js';

const CLI = resolve(process.cwd(), 'dist/cli.js');

// Contract source: docs.github.com/en/copilot/reference/hooks-reference (verified 2026-11-10).
// agentStop fires when the main agent finishes a turn; a {"decision":"block","reason":...}
// object on stdout forces another turn, silence allows. These tests establish proctor's exact
// contract behavior against that documented schema. They are not evidence of real enforcement:
// the Copilot integration has never been live-verified against a real Copilot CLI or cloud
// agent session.

describe('Copilot agentStop protocol', () => {
  it('parses the documented camelCase input shape', () => {
    const payload = {
      sessionId: 'session', timestamp: 1771976928900, cwd: '/repo',
      transcriptPath: '/transcript.jsonl', stopReason: 'end_turn', stop_hook_active: false,
    };
    expect(parseStopHookInput(JSON.stringify(payload), '/fallback', 'copilot')).toEqual({ cwd: '/repo', skip: false });
    expect(parseStopHookInput(JSON.stringify({ ...payload, stop_hook_active: true }), '/fallback', 'copilot').skip).toBe(true);
  });

  it('parses the documented VS Code compatible snake_case input shape identically', () => {
    const payload = {
      hook_event_name: 'Stop', session_id: 'session', timestamp: '2026-11-10T00:00:00Z',
      cwd: '/repo', transcript_path: '/transcript.jsonl', stop_reason: 'end_turn', stop_hook_active: false,
    };
    expect(parseStopHookInput(JSON.stringify(payload), '/fallback', 'copilot')).toEqual({ cwd: '/repo', skip: false });
    expect(parseStopHookInput(JSON.stringify({ ...payload, stop_hook_active: true }), '/fallback', 'copilot').skip).toBe(true);
  });

  it('maps a block to exactly a decision and the complete finding string, with exit 0', () => {
    const reason = '[RH001] deleted "a test"\nRestore C:\\repo\\a.test.ts\n';
    const result = formatStopHookResult({ exitCode: 2, output: reason }, 'copilot');
    expect(result.exitCode).toBe(0);
    // Output field names are documented identical in both config dialects.
    expect(JSON.parse(result.output)).toEqual({ decision: 'block', reason });
  });

  it('suppresses all check output for an allowed turn', () => {
    expect(formatStopHookResult({ exitCode: 0, output: 'internal diagnostic' }, 'copilot'))
      .toEqual({ exitCode: 0, output: '' });
  });
});

describe('stop-hook --format copilot CLI', () => {
  let dir: string;
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  };
  const hook = (input: unknown = { cwd: dir }) => spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'copilot'], {
    cwd: dir, input: JSON.stringify(input), encoding: 'utf8',
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'proctor-copilot-stop-'));
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

  it('prints one exact-shape JSON block response for an unstaged deleted test', () => {
    deleteTest();
    const check = spawnSync(process.execPath, [CLI, 'check', '--uncommitted', '--ci'], { cwd: dir, encoding: 'utf8' });
    expect(check.status).toBe(2);
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const response = JSON.parse(result.stdout);
    expect(response).toEqual({ decision: 'block', reason: check.stdout + check.stderr });
    expect(response.reason).toContain('RH001');
    expect(result.stdout.trim().split('\n')).toHaveLength(1);
  });

  it('does not block a second time when stop_hook_active is true (self-limit before the documented 8-block runaway guard)', () => {
    deleteTest();
    const result = hook({ cwd: dir, stop_hook_active: true });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.each([{}, null, { cwd: '' }])('uses the session cwd when the payload has no usable cwd: %j', input => {
    deleteTest();
    const result = hook(input);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).decision).toBe('block');
  });

  it('uses the payload cwd instead of the hook process cwd', () => {
    deleteTest();
    const result = spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'copilot'], {
      cwd: tmpdir(), input: JSON.stringify({ cwd: dir }), encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).decision).toBe('block');
  });

  it('falls back to the session cwd for malformed JSON (documented: unparseable hook output is no output, never a block)', () => {
    deleteTest();
    const result = spawnSync(process.execPath, [CLI, 'stop-hook', '--format', 'copilot'], {
      cwd: dir, input: 'not-json', encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).decision).toBe('block');
  });

  it('stays silent outside git', () => {
    rmSync(join(dir, '.git'), { recursive: true, force: true });
    const result = hook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
  });
});
