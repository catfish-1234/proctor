import { spawnSync } from 'node:child_process';

export interface StopHookInput {
  cwd?: string;
  stop_hook_active?: boolean;
}

export interface ParsedStopHookInput {
  cwd: string;
  skip: boolean;
}

/** Pure: parses the Claude Code Stop hook's stdin JSON. No I/O — unit-testable in isolation. */
export function parseStopHookInput(raw: string, fallbackCwd: string): ParsedStopHookInput {
  try {
    const input = JSON.parse(raw) as StopHookInput;
    if (input.stop_hook_active === true) return { cwd: fallbackCwd, skip: true };
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : fallbackCwd;
    return { cwd, skip: false };
  } catch {
    return { cwd: fallbackCwd, skip: false };
  }
}

export interface StopHookResult {
  exitCode: 0 | 2;
  output: string;
}

/**
 * Runs `proctor check --staged --ci` as a subprocess and maps its exit code to the Stop hook's
 * block/allow decision: exit 2 blocks the turn, and it never exits 1. `output` carries the
 * finding text back so the caller can print it, blocking a planted test-deletion turn with the
 * finding visible.
 */
export function runStopHookCheck(cwd: string, cliPath: string): StopHookResult {
  const result = spawnSync(process.execPath, [cliPath, 'check', '--staged', '--ci'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  if (result.error) return { exitCode: 0, output: '' }; // fail open: never block a turn because proctor itself errored
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const code = result.status ?? 0;
  return { exitCode: code === 2 ? 2 : 0, output };
}
