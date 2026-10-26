import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import picomatch from 'picomatch';
import { buildContext } from '../src/context/index.js';
import { documentationSentences } from '../src/dynamic/documentation.js';
import type { Snapshot } from '../src/dynamic/snapshots.js';

const tree = (files: Record<string, string>): Snapshot => new Map(Object.entries(files).map(([file, source]) => [file, { data: Buffer.from(source), mode: 0o644 }]));

describe('documentation sentence symbol selection', () => {
  it.each([
    ['verify', 'Verify'],
    ['Verify', 'verify'],
    ['verifyURL', 'VERIFYURL'],
  ])('binds prose to the original symbol %s when written as %s', (name, token) => {
    const quote = `${token} rejects all other signatures.`;
    const snapshot = tree({ 'README.md': quote });
    expect(documentationSentences(snapshot, snapshot, new Set([name]))).toEqual([
      { file: 'README.md', line: 1, quote, name, module: undefined, arity: 0 },
    ]);
  });

  it('rejects ambiguous folded prose names regardless of insertion order or further collisions', () => {
    const snapshot = tree({ 'README.md': 'Verify rejects all other signatures.' });
    for (const names of [['verify', 'Verify'], ['Verify', 'verify'], ['verify', 'Verify', 'VERIFY']]) {
      expect(documentationSentences(snapshot, snapshot, new Set(names))).toEqual([]);
    }
  });

  it('does not bind unrelated capitalized words', () => {
    const snapshot = tree({ 'README.md': 'Every signature is checked. Missing signatures are rejected.' });
    expect(documentationSentences(snapshot, snapshot, new Set(['verify']))).toEqual([]);
  });

  it.each(['Verify(x)', 'app.Verify(x)'])('keeps the backticked signature %s case-sensitive', call => {
    const snapshot = tree({ 'README.md': `\`${call}\` rejects all other signatures.` });
    expect(documentationSentences(snapshot, snapshot, new Set(['verify']))).toEqual([]);
  });

  it.each(['verify', 'Verify'])('retains exact backticked signatures for %s despite prose collisions', name => {
    const snapshot = tree({ 'README.md': `\`${name}(x)\` rejects all other signatures.` });
    expect(documentationSentences(snapshot, snapshot, new Set(['verify', 'Verify']))).toMatchObject([
      { name, arity: 1 },
    ]);
  });

  it.each(['app', 'App'])('folds only the final segment and preserves module %s', module => {
    const snapshot = tree({ 'README.md': `${module}.Verify rejects all other signatures.` });
    expect(documentationSentences(snapshot, snapshot, new Set(['verify']))).toMatchObject([
      { name: 'verify', module, arity: 0 },
    ]);
  });

  it.each(['other.app.Verify', 'src/Verify'])('still skips the prose token %s', token => {
    const snapshot = tree({ 'README.md': `${token} rejects all other signatures.` });
    expect(documentationSentences(snapshot, snapshot, new Set(['verify']))).toEqual([]);
  });

  it('keeps source basenames case-sensitive and requires unique matches', () => {
    const snapshot = tree({ 'README.md': 'App.mjs is documented. app.mjs is documented.' });
    expect(documentationSentences(snapshot, snapshot, new Set(), ['src/app.mjs'])).toEqual([
      { file: 'README.md', line: 1, quote: 'app.mjs is documented.', name: '', arity: 0, sourceFile: 'src/app.mjs' },
    ]);
    expect(documentationSentences(snapshot, snapshot, new Set(), ['src/app.mjs', 'other/app.mjs'])).toEqual([]);
  });
});

describe('bare test-file stems in the default globs', () => {
  it('matches exact test stems at the root and in nested directories without matching longer stems', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'proctor-doc-selection-'));
    try {
      const { isTestFile } = await buildContext(dir, []);
      for (const extension of ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'py']) {
        expect(isTestFile(`test.${extension}`)).toBe(true);
        expect(isTestFile(`a/b/test.${extension}`)).toBe(true);
      }
      for (const file of ['contest.mjs', 'latest.py', 'protest.ts', 'mytest.js']) {
        expect(isTestFile(file)).toBe(false);
        expect(isTestFile(`a/b/${file}`)).toBe(false);
      }
      // The new bare-stem pattern must not widen to longer stems: test_utils.py stays
      // classified by the pre-existing '**/test_*.py' default (behavior unchanged),
      // and still fails the exact-stem '**/test.py' pattern itself.
      expect(isTestFile('test_utils.py')).toBe(true);
      expect(picomatch(['**/test.py'])('test_utils.py')).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
