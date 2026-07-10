import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fg from 'fast-glob';

const execFileAsync = promisify(execFile);
import micromatch from 'micromatch';
import type { Context, ProctorConfig } from '../types.js';
import type { ParsedFile } from '../diff.js';

const DEFAULT_GLOBS = [
  '**/*.test.ts',
  '**/*.test.js',
  '**/*.spec.ts',
  '**/*.spec.js',
  'test/**/*',
  'tests/**/*',
  '__tests__/**/*',
  '**/test_*.py',
  '**/*_test.py',
];

const DEFAULT_ENABLED = [
  'RH001', 'RH002', 'RH003', 'RH004', 'RH005', 'RH006', 'RH007', 'RH008', 'RH009', 'RH010', 'RH011',
];

/**
 * buildContext: discover() -> buildContext() -> run Verifier[] -> aggregate Findings.
 * `files` is the diff already discovered by the caller (runGitDiff + classifyDiff). buildContext
 * folds it into Context alongside repo-level signals (test globs, language detection, config).
 */
export async function buildContext(cwd: string, files: ParsedFile[]): Promise<Context> {
  let config: ProctorConfig = {};

  try {
    const raw = await readFile(join(cwd, 'proctor.config.json'), 'utf8');
    config = JSON.parse(raw) as ProctorConfig;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // malformed JSON — warn and fall back to defaults
      process.stderr.write(`proctor: failed to parse proctor.config.json: ${String(err)}\n`);
    }
    // ENOENT is expected when no config exists — silent fallback
  }

  const testPathGlobs = config.testPathGlobs ?? DEFAULT_GLOBS;
  const enabled = config.enabled ?? DEFAULT_ENABLED;

  const testFiles = await fg(testPathGlobs, {
    cwd,
    dot: false,
    ignore: ['node_modules/**', 'dist/**'],
    absolute: false,
    onlyFiles: true,
  });

  // Pure closure, no I/O. Normalize backslashes so this works the same on Windows and POSIX.
  const isTestFile = (path: string): boolean =>
    micromatch.isMatch(path.replace(/\\/g, '/'), testPathGlobs);

  const getLanguage = (filePath: string): 'ts' | 'js' | 'python' | 'unknown' => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext === 'ts' || ext === 'tsx') return 'ts';
    if (ext === 'js' || ext === 'jsx' || ext === 'mjs' || ext === 'cjs') return 'js';
    if (ext === 'py') return 'python';
    return 'unknown';
  };

  // populate commitMessage from git log -1 --format=%s
  // Uses async execFile to avoid blocking the event loop; catches all errors (empty repo exits 128)
  const commitMessage = await execFileAsync('git', ['log', '-1', '--format=%s'], { cwd })
    .then(({ stdout }) => stdout.trim() || undefined)
    .catch(() => undefined);

  // snapshotGlobs / aiModel read from config only (no defaults here — rh006.ts owns DEFAULT_SNAPSHOT_GLOBS)
  const snapshotGlobs = config.snapshotGlobs;
  const aiModel = config.aiModel;

  return {
    cwd,
    files,
    testPathGlobs,
    testFiles,
    enabled,
    isTestFile,
    getLanguage,
    severity: config.severity,
    ignorePatterns: config.ignorePatterns,
    commitMessage,
    snapshotGlobs,
    aiModel,
  };
}
