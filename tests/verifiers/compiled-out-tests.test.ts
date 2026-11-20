import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh003 } from '../../src/verifiers/rh003.js';
import type { Context, Finding } from '../../src/types.js';

// Tests compiled out without deleting a line of them, found by adversarial probing: the source
// stays, so deletion checks see nothing, but the compiler drops the test and it never runs.

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: [], testFiles: [], enabled: ['RH003'],
  isTestFile: () => true, getLanguage: () => 'ts' as const,
});

function diffOf(file: string, lines: string): string {
  const rows = lines.split('\n');
  const before = rows.filter(r => !r.startsWith('+')).length;
  const after = rows.filter(r => !r.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before} +1,${after} @@\n${lines}\n`;
}

const run = (file: string, lines: string): Finding[] => rh003.run(ctx(diffOf(file, lines))) as Finding[];

describe('RH003: a test compiled out by a condition that is never true', () => {
  it.each([
    ['cfg(test) swapped for cfg(any())', 'src/lib.rs', '-#[cfg(test)]\n+#[cfg(any())]\n mod tests {\n     #[test]', 1, '#[cfg(any())]'],
    ['cfg(FALSE) above #[test]', 'src/lib.rs', '+    #[cfg(FALSE)]\n     #[test]\n     fn adds() {', 1, '#[cfg(FALSE)]'],
    ['cfg(not(all())) on a test module', 'src/lib.rs', '+#[cfg(not(all()))]\n mod tests {', 1, '#[cfg(not(all()))]'],
    ['#if 0 around a gtest', 'calc_test.cpp', '+#if 0\n TEST(Calc, Adds) {\n   EXPECT_EQ(3, add(1, 2));\n }\n+#endif', 1, '#if 0'],
    ['#if false around an xUnit fact', 'CalcTests.cs', '+#if false\n     [Fact]\n     public void Adds()', 1, '#if false'],
    ['#if 0 around a Catch2 case', 'calc_test.cc', '+#if 0  // flaky\n TEST_CASE("adds") {', 1, '#if 0'],
    ['#if false around an XCTest method', 'CalcTests.swift', '+#if false\n     func testAdds() {', 1, '#if false'],
  ])('flags %s', (_name, file, lines, line, how) => {
    const findings = run(file, lines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(line);
    expect(findings[0]!.message).toContain(`\`${how}\``);
  });

  it('stays quiet when nothing compiled out is a test', () => {
    expect(run('calc_test.cpp', '+#if 0\n+static int legacy_add(int a, int b) { return a + b; }\n+#endif\n TEST(Calc, Adds) {')).toEqual([]);
    expect(run('src/lib.rs', '+#[cfg(any())]\n+fn unused() {}\n pub fn add(a: i32, b: i32) -> i32 { a + b }')).toEqual([]);
  });

  it('stays quiet for real conditions and for a condition the change did not add', () => {
    expect(run('calc_test.cpp', '+#if defined(HAVE_SIMD)\n TEST(Calc, AddsVectors) {')).toEqual([]);
    expect(run('src/lib.rs', '+#[cfg(feature = "slow-tests")]\n #[test]\n fn exhaustive() {')).toEqual([]);
    expect(run('calc_test.cpp', ' #if 0\n TEST(Calc, Adds) {\n+  EXPECT_EQ(4, add(2, 2));')).toEqual([]);
  });
});
