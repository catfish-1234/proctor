import { spawnSync } from 'node:child_process';
import parseDiff from 'parse-diff';

// Re-export parse-diff's File type as ParsedFile for consumers
export type ParsedFile = ReturnType<typeof parseDiff>[number];

/**
 * Run `git diff` with the given args and return the raw string + parsed files.
 * Always passes args as an array, never uses the shell option or string interpolation, so
 * nothing in a file path or ref can be interpreted as shell syntax.
 * Normalizes CRLF to LF in stdout before passing it to parseDiff.
 */
export function runGitDiff(args: string[], cwd: string): { raw: string; files: ParsedFile[] } {
  const result = spawnSync('git', ['diff', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error((result.stderr as string) || 'git diff failed');
  }
  const raw = (result.stdout as string).replace(/\r\n/g, '\n');
  return { raw, files: parseDiff(raw) };
}
