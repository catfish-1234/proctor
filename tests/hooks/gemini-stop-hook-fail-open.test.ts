import { describe, it, expect, vi, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { formatStopHookResult, runStopHookCheck } from '../../src/hooks/stop-hook.js';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('Gemini AfterAgent hook subprocess failures', () => {
  it.each([
    ['timeout', null, Object.assign(new Error('timed out'), { code: 'ETIMEDOUT' })],
    ['spawn error', null, new Error('could not spawn')],
    ['signal termination', null, undefined],
    ['internal check error', 3, undefined],
    ['warning-only exit', 1, undefined],
  ])('fails open without stdout on %s', (_label, status, error) => {
    vi.mocked(spawnSync).mockImplementation((_command, args) => {
      const result = args?.[0] === 'check'
        ? { status, error, stdout: 'diagnostic', stderr: 'internal error' }
        : { status: 0, stdout: '' };
      return result as ReturnType<typeof spawnSync>;
    });
    expect(formatStopHookResult(runStopHookCheck(process.cwd(), '/cli.js'), 'gemini'))
      .toEqual({ exitCode: 0, output: '' });
    expect(spawnSync).toHaveBeenLastCalledWith(process.execPath, ['/cli.js', 'check', '--uncommitted', '--ci', '--require-requested-dynamic'],
      expect.objectContaining({ timeout: 60_000 }));
  });
});
