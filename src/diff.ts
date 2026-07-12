import { spawnSync } from 'node:child_process';
import parseDiff from 'parse-diff';

// Re-export parse-diff's File type as ParsedFile for consumers
export type ParsedFile = ReturnType<typeof parseDiff>[number];

// Verifiers run regexes over each change's `content`. A real source line (an assertion, a return)
// is never this long; a multi-kilobyte line is a minified/generated blob or a crafted ReDoS
// payload. Truncating each change's content bounds worst-case regex time as a systemic backstop,
// independent of any single regex's complexity. Detection patterns anchor near the line start, so
// truncation doesn't lose real signal.
const MAX_LINE_LENGTH = 4000;

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
export function runGitDiff(args: string[], cwd: string): { raw: string; files: ParsedFile[] } {
  // Default maxBuffer is 1 MiB, which large diffs (lockfile churn, generated files) exceed —
  // spawnSync then reports ENOBUFS with status null and the diff is never analyzed.
  const result = spawnSync('git', ['diff', ...args], { cwd, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error((result.stderr as string) || result.error?.message || 'git diff failed');
  }
  const raw = (result.stdout as string).replace(/\r\n/g, '\n');
  const files = parseDiff(raw);
  capLineLengths(files);
  return { raw, files };
}
