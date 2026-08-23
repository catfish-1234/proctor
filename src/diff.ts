import { spawnSync } from 'node:child_process';
import parseDiff from 'parse-diff';

export type ParsedFile = ReturnType<typeof parseDiff>[number];

// Verifiers run regexes over each change's `content`. A real source line (an assertion, a return)
// is never this long; a multi-kilobyte line is a minified/generated blob or a crafted ReDoS
// payload. Truncating each change's content bounds worst-case regex time as a systemic backstop,
// independent of any single regex's complexity. Detection patterns anchor near the line start, so
// truncation doesn't lose real signal.
const MAX_LINE_LENGTH = 4000;
const MAX_DIFF_BUFFER = 512 * 1024 * 1024;

function capLineLengths(files: ParsedFile[]): void {
  for (const file of files) {
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.content.length > MAX_LINE_LENGTH) {
          change.content = change.content.slice(0, MAX_LINE_LENGTH);
        }
      }
    }
  }
}

/**
 * Run `git diff` with the given args and return the raw string + parsed files.
 * Always passes args as an array, never uses the shell option or string interpolation, so
 * nothing in a file path or ref can be interpreted as shell syntax.
 * Normalizes CRLF to LF in stdout before passing it to parseDiff.
 */
export interface RunGitDiffOptions {
  /** Include untracked, non-ignored files without modifying the repository's index. */
  includeUntracked?: boolean;
}

function runGit(args: string[], cwd: string, acceptedStatuses: number[] = [0]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_DIFF_BUFFER });
  if (!acceptedStatuses.includes(result.status ?? -1)) {
    throw new Error((result.stderr as string) || result.error?.message || `git ${args[0] ?? 'command'} failed`);
  }
  return (result.stdout as string).replace(/\r\n/g, '\n');
}

/**
 * Tracked paths whose working-tree changes Git has been told not to report.
 *
 * `git update-index --assume-unchanged` leaves no diff for a verifier to inspect, so this state
 * must be rejected before diff construction. Skip-worktree is treated the same unless sparse
 * checkout is enabled, where Git legitimately owns those flags.
 */
export function hiddenTrackedPaths(cwd: string): string[] {
  const sparseCheckout = runGit(['config', '--bool', 'core.sparseCheckout'], cwd, [0, 1]).trim() === 'true';
  const records = runGit(['ls-files', '-v', '-z'], cwd).split('\0').filter(Boolean);
  return records.flatMap(record => {
    const tag = record[0];
    const hidden = tag === 'h' || (tag === 'S' && !sparseCheckout);
    return hidden ? [record.slice(2)] : [];
  });
}

/**
 * Builds ordinary unified diffs for untracked files via `git diff --no-index`.
 *
 * `git diff HEAD` does not include untracked files. That made `check --uncommitted` blind to a
 * brand-new test, config, or source file. `--no-index` produces the same patch format as a staged
 * new file without the invasive alternative of changing the user's index with intent-to-add.
 */
/**
 * Trees a package manager or a build wrote, which are never the change under review.
 *
 * `--exclude-standard` already drops whatever `.gitignore` names, and in a settled repository that
 * covers all of this. A repository that does not have a `.gitignore` yet is the case that matters:
 * `npm init -y && npm install @kavishdua/proctor && npx proctor check` reported 73 errors, every
 * one of them inside `node_modules`, on somebody's very first run. Nothing in a dependency tree is
 * a claim this author made, so it is skipped whether or not the repository has got round to
 * ignoring it.
 *
 * Untracked only. A repository that deliberately commits its `vendor/` directory has made that
 * part of its own diff, and the tracked side is left alone.
 */
const DEPENDENCY_TREE_RE =
  /(?:^|\/)(?:node_modules|bower_components|vendor|\.venv|venv|__pycache__|\.tox|\.mypy_cache|\.pytest_cache|\.gradle|\.next|\.nuxt|\.svelte-kit|\.terraform|target\/(?:debug|release)|Pods|DerivedData)\//;

function untrackedDiff(cwd: string): string {
  const listed = runGit(['ls-files', '--others', '--exclude-standard', '-z'], cwd);
  const paths = listed.split('\0').filter(Boolean).filter(p => !DEPENDENCY_TREE_RE.test(p.replace(/\\/g, '/')));
  let raw = '';
  for (const filePath of paths) {
    // Exit 1 means "different" for --no-index. Exit 0 is possible for an empty file.
    raw += runGit(['diff', '--no-index', '--', '/dev/null', filePath], cwd, [0, 1]);
    if (raw.length > MAX_DIFF_BUFFER) {
      throw new Error(`git diff exceeded the ${MAX_DIFF_BUFFER / (1024 * 1024)} MiB safety limit`);
    }
  }
  return raw;
}

export function runGitDiff(
  args: string[],
  cwd: string,
  options: RunGitDiffOptions = {},
): { raw: string; files: ParsedFile[] } {
  // Default maxBuffer is 1 MiB, which large diffs (lockfile churn, generated files) exceed,
  // spawnSync then reports ENOBUFS with status null and the diff is never analyzed.
  const tracked = runGit(['diff', ...args], cwd);
  const raw = tracked + (options.includeUntracked ? untrackedDiff(cwd) : '');
  const files = parseDiff(raw);
  capLineLengths(files);
  return { raw, files };
}
