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
  // A globally-installed hook fires in every project, including non-git directories, where
  // `check` exits 2 with "not a git repository" — an infra failure, not a finding. Blocking
  // every turn there would make the global install unusable, so allow instead.
  const inRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'ignore' });
  if (inRepo.error || inRepo.status !== 0) return { exitCode: 0, output: '' };

  // 60s timeout so a pathological check can never wedge the agent's turn forever. On timeout
  // spawnSync sets status=null and error, which the fail-open below maps to "allow".
  const result = spawnSync(process.execPath, [cliPath, 'check', '--staged', '--ci'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error || result.status === null) return { exitCode: 0, output: '' }; // fail open: never block a turn because proctor itself errored or timed out
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const code = result.status ?? 0;
  return { exitCode: code === 2 ? 2 : 0, output };
}
