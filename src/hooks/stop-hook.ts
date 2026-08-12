import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { recordCaught } from '../session.js';

export interface StopHookInput {
  cwd?: string;
  stop_hook_active?: boolean;
}

export interface ParsedStopHookInput {
  cwd: string;
  skip: boolean;
}

/** Pure: parses the Claude Code Stop hook's stdin JSON. No I/O, unit-testable in isolation. */
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
 * Runs `proctor check --uncommitted --ci` as a subprocess and maps its exit code to the Stop
 * hook's block/allow decision: exit 2 blocks the turn, and it never exits 1. `output` carries the
 * finding text back so the caller can print it, blocking a planted test-deletion turn with the
 * finding visible.
 *
 * `--uncommitted`, not `--staged`: an agent finishing a turn has edited the working tree and has
 * usually staged nothing. Checking only the index would let every unstaged test deletion through,
 * which is most of them.
 */
export function runStopHookCheck(cwd: string, cliPath: string): StopHookResult {
  // A globally-installed hook fires in every project, including non-git directories, where
  // `check` exits 2 with "not a git repository", an infra failure, not a finding. Blocking
  // every turn there would make the global install unusable, so allow instead.
  const inRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'ignore' });
  if (inRepo.error || inRepo.status !== 0) return { exitCode: 0, output: '' };

  // Mid-merge, `git diff HEAD` reports the conflicted working tree, which carries the incoming
  // branch's lines as additions. A test the other branch deleted would read as this turn deleting
  // it, and blocking the turn would be blaming the agent for someone else's commit. The
  // pre-commit hook still guards the resolution, which is the point where it becomes this
  // repository's change.
  if (isMidMerge(cwd)) return { exitCode: 0, output: '' };

  // 60s timeout so a pathological check can never wedge the agent's turn forever. On timeout
  // spawnSync sets status=null and error, which the fail-open below maps to "allow".
  const result = spawnSync(process.execPath, [cliPath, 'check', '--uncommitted', '--ci'], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (result.error || result.status === null) return { exitCode: 0, output: '' }; // fail open: never block a turn because proctor itself errored or timed out
  const output = (result.stdout ?? '') + (result.stderr ?? '');
  const code = result.status ?? 0;
  const blocked = code === 2;
  // Tally the block for the statusline. This runs after the decision is already made, and
  // recordCaught swallows its own errors, so counting can never change whether a turn is blocked.
  if (blocked) recordCaught(cwd, rulesIn(output));
  return { exitCode: blocked ? 2 : 0, output };
}

/**
 * True during a merge, rebase, cherry-pick, or revert, when the working tree holds someone else's
 * changes alongside the agent's. Reads the marker files git writes into the git directory.
 */
function isMidMerge(cwd: string): boolean {
  const resolved = spawnSync('git', ['rev-parse', '--absolute-git-dir'], { cwd, encoding: 'utf8' });
  const gitDir = resolved.status === 0 ? (resolved.stdout ?? '').trim() : '';
  return IN_PROGRESS_MARKERS.some(marker => gitDir !== '' && existsSync(join(gitDir, marker)));
}

/**
 * What git leaves in the git directory while an operation is half-finished. `rebase-merge` and
 * `rebase-apply` are directories rather than files, which `existsSync` treats the same.
 */
const IN_PROGRESS_MARKERS = [
  'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply',
];

/**
 * Rule IDs mentioned in check output, for the statusline's recent-rules list.
 *
 * Matches any family prefix, not just RH: the work-integrity checks (WI1xx) print in the same
 * bracketed form, and hardcoding one family here would have quietly dropped them from the
 * statusline while everything else kept working.
 */
function rulesIn(output: string): string[] {
  return [...new Set([...output.matchAll(/\[([A-Z]{2}\d{3})\]/g)].map(m => m[1]!))];
}
