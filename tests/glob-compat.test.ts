import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildContext } from '../src/context/index.js';
import { runChecks } from '../src/engine.js';
import { rh006 } from '../src/verifiers/rh006.js';
import type { ParsedFile } from '../src/diff.js';

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), 'proctor-glob-'));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

async function createFiles(paths: string[]) {
  for (const path of paths) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), '');
  }
}

async function contextFor(testPathGlobs: string[]) {
  await writeFile(join(cwd, 'proctor.config.json'), JSON.stringify({ testPathGlobs }));
  return buildContext(cwd, []);
}

function rewrittenSnapshot(path: string): ParsedFile {
  return {
    from: path, to: path,
    chunks: [{
      content: '', oldStart: 1, oldLines: 0, newStart: 1, newLines: 1,
      changes: [{ type: 'add', add: true, ln: 1, content: '+new snapshot contents' }],
    }],
  };
}

describe('test-file glob discovery compatibility', () => {
  it('discovers default brace extensions, excludes build/dependency trees and dotfiles, and returns only files', async () => {
    const expected = ['src/Button.test.tsx', 'src/Button.spec.jsx', 'src/module.test.mts', 'tests/helper.txt'];
    await createFiles([...expected, 'src/impl.ts', '.hidden/a.test.ts', 'src/.hidden.test.ts',
      'node_modules/pkg/a.test.ts', 'dist/a.test.ts']);
    await mkdir(join(cwd, 'src/directory.test.ts'));
    const ctx = await buildContext(cwd, []);
    expect(ctx.testFiles.sort()).toEqual(expected.sort());
    expect(ctx.testFiles.every(path => !path.includes('\\'))).toBe(true);
  });

  it.each([
    ['tests/case{1..12}.test.ts', Array.from({ length: 12 }, (_, i) => `tests/case${i + 1}.test.ts`)],
    ['tests/case{01..12}.test.ts', Array.from({ length: 12 }, (_, i) => `tests/case${String(i + 1).padStart(2, '0')}.test.ts`)],
    ['tests/case{1..12..2}.test.ts', [1, 3, 5, 7, 9, 11].map(n => `tests/case${n}.test.ts`)],
    ['tests/case{12..1..2}.test.ts', [2, 4, 6, 8, 10, 12].map(n => `tests/case${n}.test.ts`)],
    ['tests/{a..e..2}.test.ts', ['tests/a.test.ts', 'tests/c.test.ts', 'tests/e.test.ts']],
    ['tests/{a,{b,c}}.test.ts', ['tests/a.test.ts', 'tests/b.test.ts', 'tests/c.test.ts']],
  ])('preserves brace expansion for %s', async (pattern, expected) => {
    await createFiles([...expected, 'tests/case0.test.ts', 'tests/case13.test.ts', 'tests/z.test.ts',
      'tests/.hidden.test.ts', 'tests/nested/.hidden.test.ts']);
    const ctx = await contextFor([pattern]);
    expect(ctx.testFiles.sort()).toEqual(expected.sort());
  });

  it('keeps empty brace alternatives from admitting implicit dotfiles', async () => {
    await createFiles(['tests/a.test.ts', 'tests/nested/b.test.ts',
      'tests/.hidden.test.ts', 'tests/nested/.hidden.test.ts']);
    const ctx = await contextFor(['tests/{,nested/}*.test.ts']);
    expect(ctx.testFiles.sort()).toEqual(['tests/a.test.ts', 'tests/nested/b.test.ts']);
  });

  it.each([
    ['**/*.test.ts', '!**/skip.test.ts'],
    ['!**/skip.test.ts', '**/*.test.ts'],
  ])('applies discovery exclusions regardless of pattern order (%j)', async (...patterns) => {
    await createFiles(['tests/a.test.ts', 'tests/skip.test.ts', 'tests/nested/skip.test.ts']);
    const ctx = await contextFor(patterns);
    expect(ctx.testFiles).toEqual(['tests/a.test.ts']);
    // Classification has always been an OR of individual matchers, unlike file discovery.
    expect(ctx.isTestFile('tests/skip.test.ts')).toBe(true);
    expect(ctx.isTestFile('src/impl.ts')).toBe(true);
  });

  it('does not expand a literal directory into its files', async () => {
    await createFiles(['tests/a.test.ts']);
    expect((await contextFor(['tests'])).testFiles).toEqual([]);
    expect((await contextFor(['tests/'])).testFiles).toEqual([]);
  });

  it('retains explicit dotfile patterns and deduplicates overlapping globs', async () => {
    await createFiles(['tests/.explicit.test.ts', 'tests/.hidden/a.test.ts', 'tests/a.test.ts']);
    const ctx = await contextFor(['tests/*.test.ts', 'tests/**/*.test.ts', 'tests/.explicit.test.ts']);
    expect(ctx.testFiles.sort()).toEqual(['tests/.explicit.test.ts', 'tests/a.test.ts']);
  });

  it('supports extglobs and escaped glob characters', async () => {
    const expected = ['tests/a.test.ts', 'tests/b.spec.ts', 'tests/a[1].test.ts', 'tests/a{b,c}.test.ts'];
    await createFiles([...expected, 'tests/c.test.ts', 'tests/ab.test.ts']);
    const ctx = await contextFor(['tests/@(a|b).{test,spec}.ts', 'tests/a\\[1\\].test.ts', 'tests/a\\{b,c\\}.test.ts']);
    expect(ctx.testFiles.sort()).toEqual(expected.sort());
  });

  it('preserves explicit relative prefixes and absolute paths', async () => {
    await createFiles(['tests/a.test.ts']);
    expect((await contextFor(['./tests/*.test.ts'])).testFiles).toEqual(['./tests/a.test.ts']);
    const absolute = join(cwd, 'tests/a.test.ts').replace(/\\/g, '/');
    expect((await contextFor([absolute])).testFiles).toEqual([absolute]);
  });

  it('preserves a literal file prefix when a wildcard also matches the file', async () => {
    await createFiles(['tests/a.test.ts', 'tests/b.test.ts']);
    const ctx = await contextFor(['tests/*.test.ts', 'tests/b.test.ts', './tests/a.test.ts']);
    expect(ctx.testFiles.sort()).toEqual(['./tests/a.test.ts', 'tests/b.test.ts']);
  });

  it('keeps relative ignores from being rebased onto absolute include patterns', async () => {
    await createFiles(['tests/a.test.ts', 'dist/a.test.ts', 'node_modules/a.test.ts']);
    const root = cwd.replace(/\\/g, '/');
    const ctx = await contextFor([`${root}/**/*.test.ts`]);
    expect(ctx.testFiles.sort()).toEqual([
      `${root}/dist/a.test.ts`, `${root}/node_modules/a.test.ts`, `${root}/tests/a.test.ts`,
    ]);
  });

  it('follows directory symlinks', async () => {
    await createFiles(['real/a.test.ts']);
    await symlink(join(cwd, 'real'), join(cwd, 'linked'), 'junction');
    expect((await contextFor(['linked/**/*.test.ts'])).testFiles).toEqual(['linked/a.test.ts']);
  });

  it('keeps empty and negative-only discovery distinct from classification', async () => {
    await createFiles(['tests/a.test.ts', 'src/impl.ts']);
    const empty = await contextFor([]);
    expect(empty.testFiles).toEqual([]);
    expect(empty.isTestFile('tests/a.test.ts')).toBe(false);
    const negative = await contextFor(['!**/*.test.ts']);
    expect(negative.testFiles).toEqual([]);
    expect(negative.isTestFile('tests/a.test.ts')).toBe(false);
    expect(negative.isTestFile('src/impl.ts')).toBe(true);
  });

  it('normalizes Windows paths for classification and keeps matching case-sensitive', async () => {
    const ctx = await contextFor(['src/@(Button|Dialog).{test,spec}.{ts,tsx}']);
    expect(ctx.isTestFile('src\\Button.test.tsx')).toBe(true);
    expect(ctx.isTestFile('src/Dialog.spec.ts')).toBe(true);
    expect(ctx.isTestFile('src/button.test.tsx')).toBe(false);
    expect(ctx.isTestFile('src/.Button.test.tsx')).toBe(false);
  });
});

describe('finding glob compatibility', () => {
  it('matches custom snapshot extglobs and braces while excluding implicit dotfiles', async () => {
    const ctx = await buildContext(cwd, [rewrittenSnapshot('src\\golden\\Button.snap.ts'),
      rewrittenSnapshot('src/golden/.hidden.snap.ts'), rewrittenSnapshot('src/golden/Button.ts')]);
    const findings = await rh006.run({ ...ctx, snapshotGlobs: ['**/@(golden|snapshots)/*.{snap.ts,snap.js}'] });
    expect(findings.map(f => f.file)).toEqual(['src/golden/Button.snap.ts']);
    expect(await rh006.run({ ...ctx, snapshotGlobs: [] })).toEqual([]);
  });

  it('keeps dotfile ignore patterns and approvals working with Windows paths and braces', async () => {
    const ctx = await buildContext(cwd, [rewrittenSnapshot('src\\golden\\.hidden.snap.ts')]);
    const snapshotGlobs = ['src/golden/.*.snap.ts'];
    const base = { ...ctx, enabled: ['RH006'], snapshotGlobs };
    expect(await runChecks({ ...base, ignorePatterns: ['src/{golden,snapshots}/**'] })).toEqual([]);
    const approved = await runChecks({ ...base, approvedTestChanges: [
      { rule: 'RH006', file: 'src\\{golden,snapshots}\\**', reason: 'intentional golden update' },
    ] });
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({ severity: 'info', approved: true, approvalReason: 'intentional golden update' });
  });
});
