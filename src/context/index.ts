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
 *
 * When `opts.configRef` is set, proctor.config.json is read from that git ref instead of the
 * working tree. The CLI always sets it (HEAD, or the --base ref): the guard's own configuration
 * must come from the diff baseline, otherwise the change under inspection could disable proctor
 * in the very commit it cheats in (e.g. add `{"enabled": []}` alongside a deleted test).
 * Without configRef (unit tests, library callers) the working-tree file is read as before.
 */
export async function buildContext(cwd: string, files: ParsedFile[], opts?: { configRef?: string }): Promise<Context> {
  let config: ProctorConfig = {};

  if (opts?.configRef) {
    let baselineRaw: string | undefined;
    try {
      ({ stdout: baselineRaw } = await execFileAsync(
        'git', ['show', `${opts.configRef}:proctor.config.json`], { cwd },
      ));
    } catch {
      // Config doesn't exist at the baseline ref (or the ref is unborn) — run with defaults.
    }
    if (baselineRaw !== undefined) {
      try {
        config = JSON.parse(baselineRaw) as ProctorConfig;
      } catch (err) {
        process.stderr.write(`proctor: failed to parse proctor.config.json at ${opts.configRef}: ${String(err)}\n`);
      }
    }
    // Surface (but do not honor) an uncommitted config change, so the drift is visible instead
    // of silently ignored. Line endings are normalized so autocrlf checkouts don't false-alarm.
    try {
      const workingTree = await readFile(join(cwd, 'proctor.config.json'), 'utf8');
      if (workingTree.replace(/\r\n/g, '\n') !== (baselineRaw ?? '').replace(/\r\n/g, '\n')) {
        process.stderr.write(`proctor: proctor.config.json differs from the version at ${opts.configRef}; enforcement uses the committed version\n`);
      }
    } catch {
      if (baselineRaw !== undefined) {
        process.stderr.write(`proctor: proctor.config.json was deleted in the working tree; enforcement uses the version at ${opts.configRef}\n`);
      }
    }
  } else {
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
    // proctor-ignore: RH004 reason: extension-to-language mapping table, not a fixture hardcode
    if (ext === 'ts' || ext === 'tsx' || ext === 'mts' || ext === 'cts') return 'ts';
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
