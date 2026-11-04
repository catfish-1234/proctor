import { afterAll, beforeAll, expect, type TestContext, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runDynamic } from '../src/dynamic/runner.js';
import { runGitDiff } from '../src/diff.js';
// @ts-expect-error plain ECMAScript corpus is also runnable without a compiler
import samples from '../bench/dynamic-dev/cases.mjs';
// @ts-expect-error standard-library fixture helper
import { makeRepo } from '../bench/dynamic-dev/run.mjs';

type Sample = { id: string; family: string; label: string; before: Record<string, string>; after: Record<string, string>; expected: string[] };
export const cases = samples as Sample[];
export const workerPath = resolve('dist/dynamic-worker.js');
export const sandboxAvailable = process.platform === 'linux' && spawnSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '--unshare-pid', '--proc', '/proc', '--dev', '/dev', '--', 'true']).status === 0;

export function runnable(result: Awaited<ReturnType<typeof runDynamic>>, context: TestContext): void {
  if (!sandboxAvailable) {
    expect(result.status).toBe('skipped'); expect(result.reason).toBeTruthy(); expect(result.findings).toEqual([]);
    context.skip(`Dynamic isolation is unavailable: ${result.reason}`);
  }
  expect(result.status, result.reason).toBe('completed');
}

export function dynamic(dir: string, extra = {}) {
  const { files } = runGitDiff(['HEAD'], dir, { includeUntracked: true });
  return runDynamic({ cwd: dir, workerPath, files, testPathGlobs: ['**/*.test.{js,mjs,cjs}', '**/test_*.py'], ...extra });
}

// The corpus cases are independent (each builds its own repo). They are sharded across three test
// files so vitest can run them in parallel; every case still runs exactly once.
export function registerCorpus(shard: number, shards: number): void {
  const mine = cases.filter((_, index) => index % shards === shard);
  for (const sample of mine) it(sample.id, async context => {
    const dir = makeRepo(sample);
    try {
      const result = await dynamic(dir);
      runnable(result, context);
      if (sample.id.startsWith('red-') || sample.id.startsWith('plain-red-') || ['typed-probe', 'bare-python', 'mutation-lite'].includes(sample.family)) {
        expect(result.runs[0]!.failed.length).toBeGreaterThan(0);
        if (sample.label === 'honest') expect(result.runs[1]!.exitCode).toBe(0);
      }
      const ids = result.findings.map(f => f.verifierId);
      if (sample.label === 'honest' || sample.expected.length === 0) expect(ids).toEqual([]);
      for (const id of sample.expected) expect(ids).toContain(id);
      for (const f of result.findings) {
        expect(f.message).toContain('Evidence:'); expect(f.message).toContain('exit ');
      }
      for (const [path, text] of Object.entries(sample.after)) expect(readFileSync(join(dir, path), 'utf8')).toBe(text);
      expect(spawnSync('git', ['diff', '--cached', '--exit-code'], { cwd: dir }).status).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

/**
 * Several dynamic tests list or sweep `proctor-dynamic-*` scratch directories in the temp dir.
 * Test files run in parallel, so each dynamic test file gets its own temp dir; otherwise one file's
 * sweep or "no leftovers" assertion would see another file's live scratch directories.
 */
export function isolateTempDir(): void {
  let own = '';
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.TMPDIR;
    own = mkdtempSync(join(tmpdir(), 'proctor-dynamic-suite-'));
    process.env.TMPDIR = own;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previous;
    rmSync(own, { recursive: true, force: true });
  });
}
