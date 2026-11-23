import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh001 } from '../../src/verifiers/rh001.js';
import type { Context, Finding } from '../../src/types.js';

// A test deleted from one test file and added under the same title to another, in the same change,
// moved; it was not dropped. Found on a real commit (httpx: "Move utility functions from _utils.py
// to _client.py"), which reported the five moved tests as deleted.

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/test_*.py', '**/*.test.ts'], testFiles: [], enabled: ['RH001'],
  isTestFile: (p: string) => /(?:^|\/)test_[^/]*\.py$|\.test\.ts$/.test(p), getLanguage: () => 'python' as const,
});

const section = (file: string, oldStart: number, lines: string[]) => {
  const before = lines.filter(l => !l.startsWith('+')).length;
  const after = lines.filter(l => !l.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -${oldStart},${before} +${oldStart},${after} @@\n${lines.join('\n')}\n`;
};

const removedFromUtils = section('tests/test_utils.py', 10, [
  ' def test_kept():',
  '     assert keep() == 1',
  '-',
  '-',
  '-def test_same_origin():',
  '-    origin = Request("GET", "https://example.com")',
  '-    assert same_origin(origin.url, URL("https://example.com/path"))',
  '-    assert not same_origin(origin.url, URL("http://example.com"))',
]);

const run = (diff: string): Finding[] => rh001.run(ctx(diff)) as Finding[];

describe('RH001: a test moved to another test file', () => {
  it('stays quiet when the same test, checking as much, is added elsewhere', () => {
    const addedToHeaders = section('tests/client/test_headers.py', 40, [
      ' def test_header_order():',
      '     assert order() == ["a", "b"]',
      '+',
      '+',
      '+def test_same_origin():',
      '+    origin = Request("GET", "https://example.com")',
      '+    assert same_origin(origin.url, URL("https://example.com/path"))',
      '+    assert not same_origin(origin.url, URL("http://example.com"))',
    ]);
    expect(run(removedFromUtils + addedToHeaders)).toEqual([]);
  });

  it('still reports the deletion when the title reappears with fewer checks', () => {
    const emptyClone = section('tests/client/test_headers.py', 40, [
      ' def test_header_order():',
      '     assert order() == ["a", "b"]',
      '+',
      '+',
      '+def test_same_origin():',
      '+    pass',
    ]);
    const findings = run(removedFromUtils + emptyClone);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/'test_same_origin' was deleted/);
  });

  it('still reports the deletion when the title only reappears in a non-test file', () => {
    const notATest = section('httpx/_client.py', 40, [
      ' class Client:',
      '+def test_same_origin():',
      '+    assert same_origin(a, b)',
      '+    assert not same_origin(a, c)',
    ]);
    expect(run(removedFromUtils + notATest)).toHaveLength(1);
  });

  it('recognizes a moved JS test', () => {
    const removed = section('src/a.test.ts', 1, [
      " it('keeps', () => { expect(1).toBe(1); });",
      "-it('parses headers', () => {",
      "-  expect(parse('a: b')).toEqual({ a: 'b' });",
      '-});',
    ]);
    const added = section('src/headers.test.ts', 1, [
      " import { parse } from './parse.js';",
      "+it('parses headers', () => {",
      "+  expect(parse('a: b')).toEqual({ a: 'b' });",
      '+});',
    ]);
    expect(run(removed + added)).toEqual([]);
    expect(run(removed)).toHaveLength(1);
  });
});
