import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh003 } from '../../src/verifiers/rh003.js';
import { rh012 } from '../../src/verifiers/rh012.js';
import type { Context, Finding, Verifier } from '../../src/types.js';

// Precision fixes from running the default checks over 700 human-written commits in 20 popular
// repositories. Each case reproduces the shape of a real commit that was blocked although the
// change was honest, next to the dishonest variant that must still block.

const ctx = (diff: string, id: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: [], testFiles: [], enabled: [id],
  isTestFile: (p: string) => /(?:^|\/)test\/|\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});

const section = (file: string, lines: string[]) => {
  const before = lines.filter(l => !l.startsWith('+')).length;
  const after = lines.filter(l => !l.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before} +1,${after} @@\n${lines.join('\n')}\n`;
};
const run = (verifier: Verifier, diff: string): Finding[] => verifier.run(ctx(diff, verifier.id)) as Finding[];

describe('RH003: an expected-failure marker on a brand-new test (got: "Simplify")', () => {
  it('warns, without blocking, when the test did not exist before', () => {
    const findings = run(rh003, section('test/create.ts', [
      " test('merges defaults', t => { t.pass(); });",
      "+test.failing('immutable defaults reject a merge of headers like other options', t => {",
      '+  t.throws(() => instance.extend({ headers: { a: 1 } }));',
      '+});',
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.message).toMatch(/new test is marked as an expected failure/);
  });

  it('still blocks converting an existing test, in place or moved from another file', () => {
    const inPlace = run(rh003, section('test/create.ts', [
      "-test('merges headers', t => {",
      "+test.failing('merges headers', t => {",
      '   t.is(merge().headers.a, 1);',
    ]));
    expect(inPlace).toHaveLength(1);
    expect(inPlace[0]!.severity).toBe('error');

    const moved = run(rh003, section('test/old.ts', [
      " test('keeps', t => { t.pass(); });",
      "-test('merges headers', t => {",
      '-  t.is(merge().headers.a, 1);',
      '-});',
    ]) + section('test/new.ts', [
      " import test from 'ava';",
      "+test.failing('merges headers', t => {",
      '+  t.is(merge().headers.a, 1);',
      '+});',
    ]));
    expect(moved.map(f => f.severity)).toEqual(['error']);
  });

  it('treats pytest xfail the same way', () => {
    const fresh = run(rh003, section('tests/test_merge.py', [
      ' def test_kept():',
      '     assert keep()',
      '+',
      '+@pytest.mark.xfail(reason="#412")',
      '+def test_headers_merge_like_other_options():',
      '+    assert merge({"a": 1}).headers["a"] == 1',
    ]));
    expect(fresh.map(f => f.severity)).toEqual(['warn']);
    const converted = run(rh003, section('tests/test_merge.py', [
      '+@pytest.mark.xfail(reason="#412")',
      ' def test_kept():',
      '     assert keep()',
    ]));
    expect(converted.map(f => f.severity)).toEqual(['error']);
  });
});

describe('RH012: a test command whose arguments changed (flask: "add zizmor to scan workflows")', () => {
  it('warns, without blocking, when the same runner still runs in a single command', () => {
    const findings = run(rh012, section('.github/workflows/tests.yaml', [
      '     steps:',
      "-      - run: uv run --locked tox run -e ${{ matrix.tox || format('py{0}', matrix.python) }}",
      '+      - run: uv run --locked tox run',
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.message).toMatch(/'tox' still runs, but with different arguments/);
  });

  it('still blocks a removed suite, and a suite dropped from a chain', () => {
    expect(run(rh012, section('.github/workflows/tests.yaml', [
      '     steps:',
      '-      - run: uv run --locked tox run',
      '+      - run: echo skipped',
    ])).map(f => f.severity)).toEqual(['error']);
    expect(run(rh012, section('.github/workflows/tests.yaml', [
      '     steps:',
      '-      - run: npm test && npx vitest run --browser',
      '+      - run: npm test',
    ])).map(f => f.severity)).toEqual(['error']);
  });
});
