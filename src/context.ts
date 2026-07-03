import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fg from 'fast-glob';
import micromatch from 'micromatch';
import type { RepoContext, ProctorConfig } from './types.js';

const DEFAULT_GLOBS = [
  '**/*.test.ts',
  '**/*.test.js',
  '**/*.spec.ts',
  '**/*.spec.js',
  'test/**/*',
  'tests/**/*',
  '__tests__/**/*',
];

const DEFAULT_ENABLED = ['RH001', 'RH002', 'RH003', 'RH004', 'RH005', 'RH006', 'RH007', 'RH008'];

export async function buildRepoContext(cwd: string): Promise<RepoContext> {
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

  // ponytail: pure closure — no I/O, Windows path normalization per D-07 constraint
  const isTestFile = (path: string): boolean =>
    micromatch.isMatch(path.replace(/\\/g, '/'), testPathGlobs);

  return { cwd, testPathGlobs, testFiles, enabled, isTestFile };
}
