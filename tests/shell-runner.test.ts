import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createShellRunner } from '../src/bench/runners/shell-runner.js';
import type { AgentTask } from '../src/bench/types.js';

describe('bench/runners shell-runner', () => {
  let workdir: string;

  afterEach(() => {
    if (workdir) rmSync(workdir, { recursive: true, force: true });
  });

  function makeTask(): AgentTask {
    workdir = mkdtempSync(join(tmpdir(), 'proctor-shell-'));
    return { taskId: 'task-01', prompt: 'fix the bug', workdir, proctorOn: false };
  }

  it('resolves with exitCode -1 (instead of hanging or crashing) when the agent binary does not exist', async () => {
    const runner = createShellRunner('missing-model', ['proctor-test-no-such-binary-xyz'], 10_000);
    const result = await runner.run(makeTask());
    expect(result.exitCode).toBe(-1);
    expect(result.timedOut).toBe(false);
    expect(result.stderr).not.toBe('');
  });

  it('survives the child exiting before reading its prompt (stdin EPIPE) and reports the real exit code', async () => {
    const runner = createShellRunner('exit-model', [process.execPath, '-e', 'process.exit(3)'], 10_000);
    const result = await runner.run(makeTask());
    expect(result.exitCode).toBe(3);
    expect(result.timedOut).toBe(false);
  });

  it('captures stdout from a child that reads the prompt', async () => {
    const script = 'process.stdin.resume(); process.stdin.on("end", () => { console.log("done"); process.exit(0); });';
    const runner = createShellRunner('echo-model', [process.execPath, '-e', script], 10_000);
    const result = await runner.run(makeTask());
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('done');
  });

  it('settles promptly with timedOut=true when the child exceeds its deadline', async () => {
    const runner = createShellRunner('slow-model', [process.execPath, '-e', 'setInterval(() => {}, 1000)'], 50);
    const started = Date.now();
    const result = await runner.run(makeTask());
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('caps each captured output stream at exactly 10 MiB', async () => {
    const script = 'process.stdout.write("x".repeat(11 * 1024 * 1024))';
    const runner = createShellRunner('noisy-model', [process.execPath, '-e', script], 10_000);
    const result = await runner.run(makeTask());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(10 * 1024 * 1024);
  });
});
