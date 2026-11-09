import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { recordCaught } from '../session.js';

export interface StopHookInput {
  cwd?: string;
  stop_hook_active?: boolean;
  // Antigravity CLI Stop payload: no cwd and no stop_hook_active, so the repo comes from
  // workspacePaths and re-entries are told apart by executionNum within one user turn.
  workspacePaths?: unknown;
  conversationId?: unknown;
  executionNum?: unknown;
}

export interface ParsedStopHookInput {
  cwd: string;
  skip: boolean;
  /** Antigravity only: identifies the conversation for the bounded-block counter. */
  conversationId?: string;
  /** Antigravity only: 0 on the first Stop of a user turn, +1 per forced continuation. */
  executionNum?: number;
}

/** Pure: parses Stop/AfterAgent stdin JSON. Gemini allows malformed input without checking. */
export function parseStopHookInput(raw: string, fallbackCwd: string, format: StopHookFormat = 'claude'): ParsedStopHookInput {
  try {
    const input = JSON.parse(raw) as StopHookInput;
    if (format === 'gemini' && (typeof input !== 'object' || input === null || Array.isArray(input))) {
      return { cwd: fallbackCwd, skip: true };
    }
    if (format === 'antigravity') {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) return { cwd: fallbackCwd, skip: true };
      // Deliberately no skip on executionNum > 0: a retry count is not proof the tree is clean,
      // so every Stop re-runs the check and the bounded-block counter decides when to give up.
      const paths = Array.isArray(input.workspacePaths) ? input.workspacePaths : [];
      const first = paths.find((p): p is string => typeof p === 'string' && p.length > 0);
      return {
        cwd: first ?? fallbackCwd,
        skip: false,
        conversationId: typeof input.conversationId === 'string' ? input.conversationId : undefined,
        executionNum: typeof input.executionNum === 'number' && Number.isInteger(input.executionNum) && input.executionNum >= 0 ? input.executionNum : undefined,
      };
    }
    if (input.stop_hook_active === true) return { cwd: fallbackCwd, skip: true };
    const cwd = typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : fallbackCwd;
    return { cwd, skip: false };
  } catch {
    return { cwd: fallbackCwd, skip: format === 'gemini' || format === 'antigravity' };
  }
}

export interface StopHookResult {
  exitCode: 0 | 2;
  output: string;
}

export type StopHookFormat = 'claude' | 'codex' | 'gemini' | 'antigravity';

/** Codex, Gemini and Antigravity block via JSON on stdout with exit 0 (Antigravity uses `block`, verified live on agy 1.5.3), and require silence to allow. */
export function formatStopHookResult(result: StopHookResult, format: StopHookFormat): StopHookResult {
  if (format === 'claude') return result;
  return {
    exitCode: 0,
    output: result.exitCode === 2 ? JSON.stringify({ decision: format === 'gemini' ? 'deny' : 'block', reason: result.output }) : '',
  };
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

/** Consecutive blocked Stops allowed per conversation before failing open (see decideBlockBudget). */
export const ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS = 5;

export interface BlockBudgetState {
  /** Consecutive blocks issued while the findings were not resolved. */
  blocks: number;
}

/**
 * Pure: bounded-block policy for harnesses with no stop_hook_active flag. A new user turn
 * (executionNum 0) starts a fresh budget. Within a turn, a finding that survives a block is
 * blocked again, so an agent that ignores or tampers with the hook still meets enforcement on the
 * next Stop. Only after `max` consecutive blocks does it fail open, because an agent that can never
 * satisfy the check would otherwise wedge the session forever. That cap is a safety valve, not a
 * judgement that the tree is clean: the caller reports it as `exhausted`.
 */
export function decideBlockBudget(
  state: BlockBudgetState | undefined, executionNum: number | undefined, max: number = ANTIGRAVITY_MAX_CONSECUTIVE_BLOCKS,
): { block: boolean; exhausted: boolean; next: BlockBudgetState } {
  const prior = executionNum === 0 || executionNum === undefined || !state ? 0 : state.blocks;
  if (prior >= max) return { block: false, exhausted: true, next: { blocks: prior } };
  return { block: true, exhausted: false, next: { blocks: prior + 1 } };
}

/** Per-conversation counter file; lives in the OS temp dir so enforcement never writes into the user's repo. */
export function budgetPath(conversationId: string): string {
  return join(tmpdir(), 'proctor-stop-hook', `${conversationId.replace(/[^A-Za-z0-9-]/g, '_')}.json`);
}

export function readBudget(conversationId: string): BlockBudgetState | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(budgetPath(conversationId), 'utf8'));
    const blocks = (parsed as { blocks?: unknown })?.blocks;
    return typeof blocks === 'number' && Number.isInteger(blocks) && blocks >= 0 ? { blocks } : undefined;
  } catch {
    return undefined;
  }
}

/** Best-effort: a failed write must never change the decision or wedge the turn. */
export function writeBudget(conversationId: string, state: BlockBudgetState | undefined): void {
  try {
    const file = budgetPath(conversationId);
    if (state === undefined) { rmSync(file, { force: true }); return; }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(state));
  } catch { /* ignore */ }
}
