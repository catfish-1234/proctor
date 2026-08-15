import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { createShellRunner } from '../src/bench/runners/shell-runner.js';
import type { AgentTask } from '../src/bench/types.js';

describe('bench/runners shell-runner', () => {
  let workdir: string;

  afterEach(() => {
    // `taskkill /T /F` returns before Windows has finished tearing the process down, so the killed
    // child can still hold a handle on the temp directory when this runs. rmSync then throws EPERM
    // and fails the test that just passed. `maxRetries` makes fs back off and retry instead.
    //
    // Cleaning up scratch state is not what any test here asserts, so a failure to delete must not
    // be able to report a passing behaviour as broken. The directory lives under the OS temp dir
    // and is reclaimed there regardless.
    if (!workdir) return;
    try {
      rmSync(workdir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Left for the OS to reclaim.
    }
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

  // The settle budget follows the platform, the way SPAWN_BUDGET_MS does in bench.test.ts.
  //
  // The bound is not measuring the runner, it is measuring node process spawn plus taskkill, and
  // on a loaded Windows machine that alone exceeded the original flat 5s about one run in three.
  // The child is an infinite `setInterval` that never exits on its own, so the regression under
  // guard (waiting on a `close` that may never arrive) means never settling at all: any finite
  // bound catches it, and a generous one catches it without failing on healthy code.
  const SETTLE_BUDGET_MS = platform() === 'win32' ? 20_000 : 5_000;

  it('settles promptly with timedOut=true when the child exceeds its deadline', async () => {
    const runner = createShellRunner('slow-model', [process.execPath, '-e', 'setInterval(() => {}, 1000)'], 50);
    const started = Date.now();
    const result = await runner.run(makeTask());
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(-1);
    expect(Date.now() - started).toBeLessThan(SETTLE_BUDGET_MS);
  }, 30_000);

  it('caps each captured output stream at exactly 10 MiB', async () => {
    const script = 'process.stdout.write("x".repeat(11 * 1024 * 1024))';
    const runner = createShellRunner('noisy-model', [process.execPath, '-e', script], 10_000);
    const result = await runner.run(makeTask());
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBe(10 * 1024 * 1024);
  });
});
