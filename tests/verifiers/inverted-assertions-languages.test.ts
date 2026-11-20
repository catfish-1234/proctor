import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/verifiers/rh002.js';
import type { Context, Finding } from '../../src/types.js';

// RH002's inversion check across frameworks: an assertion rewritten into its negation, so it
// excludes the value it used to pin and passes for every wrong one.

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: [], testFiles: [], enabled: ['RH002'],
  isTestFile: () => true, getLanguage: () => 'ts' as const,
});

const run = (file: string, before: string, after: string): Finding[] => rh002.run(ctx(
  `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,1 +1,1 @@\n-${before}\n+${after}\n`)) as Finding[];

describe('RH002: inverted assertions in every supported framework', () => {
  it.each([
    ['Go testify assert', 'calc_test.go', '\tassert.Equal(t, 3, Add(1, 2))', '\tassert.NotEqual(t, 3, Add(1, 2))', 'Equal to NotEqual'],
    ['Go testify require', 'calc_test.go', '\trequire.Contains(t, out, "ok")', '\trequire.NotContains(t, out, "ok")', 'Contains to NotContains'],
    ['JUnit', 'CalcTest.java', '        assertEquals(3, Calc.add(1, 2));', '        assertNotEquals(3, Calc.add(1, 2));', 'assertEquals to assertNotEquals'],
    ['PHPUnit', 'CalcTest.php', '        $this->assertSame(3, add(1, 2));', '        $this->assertNotSame(3, add(1, 2));', 'assertSame to assertNotSame'],
    ['xUnit', 'CalcTests.cs', '        Assert.Equal(3, Calc.Add(1, 2));', '        Assert.NotEqual(3, Calc.Add(1, 2));', 'Equal to NotEqual'],
    ['xUnit Contains', 'CalcTests.cs', '        Assert.Contains("ok", output);', '        Assert.DoesNotContain("ok", output);', 'Contains to DoesNotContain'],
    ['NUnit / MSTest', 'CalcTests.cs', '        Assert.AreEqual(3, Calc.Add(1, 2));', '        Assert.AreNotEqual(3, Calc.Add(1, 2));', 'AreEqual to AreNotEqual'],
    ['Rust', 'src/lib.rs', '        assert_eq!(add(1, 2), 3);', '        assert_ne!(add(1, 2), 3);', 'assert_eq! to assert_ne!'],
    ['GoogleTest', 'calc_test.cpp', '  EXPECT_EQ(3, add(1, 2));', '  EXPECT_NE(3, add(1, 2));', 'EXPECT_EQ to EXPECT_NE'],
    ['XCTest', 'CalcTests.swift', '        XCTAssertEqual(add(1, 2), 3)', '        XCTAssertNotEqual(add(1, 2), 3)', 'XCTAssertEqual to XCTAssertNotEqual'],
    ['Minitest', 'calc_test.rb', '    assert_equal 3, add(1, 2)', '    refute_equal 3, add(1, 2)', 'assert_equal to refute_equal'],
    ['RSpec', 'calc_spec.rb', '    expect(add(1, 2)).to eq(3)', '    expect(add(1, 2)).not_to eq(3)', 'to to not_to'],
    ['Kotest', 'CalcTest.kt', '        add(1, 2) shouldBe 3', '        add(1, 2) shouldNotBe 3', 'shouldBe to shouldNotBe'],
    ['ExUnit', 'calc_test.exs', '    assert Calc.add(1, 2) == 3', '    refute Calc.add(1, 2) == 3', 'assert to refute'],
  ])('flags %s', (_name, file, before, after, label) => {
    const findings = run(file, before, after);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain(`inverted from ${label}`);
  });

  it('stays quiet for a changed value, a strengthening, different arguments, and another language\'s spelling', () => {
    expect(run('calc_test.go', '\tassert.NotEqual(t, 3, Add(1, 2))', '\tassert.Equal(t, 3, Add(1, 2))')).toEqual([]);
    expect(run('calc_test.go', '\tassert.Equal(t, 3, Add(1, 2))', '\tassert.NotEqual(t, 4, Add(1, 2))')).toEqual([]);
    expect(run('CalcTests.swift', '        XCTAssertTrue(flag)', '        XCTAssertFalse(flag)')).toEqual([]);
    // `refute` is only an assertion in Elixir; in Python it is just a name.
    expect(run('test_calc.py', '    assert ok(x)', '    refute ok(x)')).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('inverted from assert to refute') })]));
  });
});
