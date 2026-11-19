import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/verifiers/rh002.js';
import { rh003 } from '../../src/verifiers/rh003.js';
import { rh015 } from '../../src/verifiers/rh015.js';
import type { Context, Finding, Verifier } from '../../src/types.js';

// A third round of adversarial probing: assertions turned around so that a broken result passes.
// Each true positive below passed every default check before; each near miss is the legitimate
// pattern it most resembles.

const ctx = (diff: string, id: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled: [id],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$|(?:^|\/)tests\//.test(p), getLanguage: () => 'ts' as const,
});

function diffOf(file: string, lines: string): string {
  const rows = lines.split('\n');
  const before = rows.filter(r => !r.startsWith('+')).length;
  const after = rows.filter(r => !r.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before} +1,${after} @@\n${lines}\n`;
}

const run = (verifier: Verifier, file: string, lines: string): Finding[] =>
  verifier.run(ctx(diffOf(file, lines), verifier.id)) as Finding[];

describe('RH002: inverted, type-only and widened assertions', () => {
  it.each([
    ['==  to !=', 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert add(2, 2) != 4', /inverted from `==` to `!=`/],
    ['== to not (==)', 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert not (add(2, 2) == 4)', /inverted from `==` to `!=`/],
    ['in to not in', 'test_calc.py', '-    assert "b" in letters()\n+    assert "b" not in letters()', /inverted from `in` to `not in`/],
    ['assertEqual to assertNotEqual', 'test_calc.py', '-        self.assertEqual(add(1, 2), 3)\n+        self.assertNotEqual(add(1, 2), 3)', /assertEqual to assertNotEqual/],
    ['strictEqual to notStrictEqual', 'calc.test.ts', '-  assert.strictEqual(add(2, 2), 4);\n+  assert.notStrictEqual(add(2, 2), 4);', /strictEqual to notStrictEqual/],
  ])('flags %s', (_name, file, lines, message) => {
    const findings = run(rh002, file, lines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(1);
    expect(findings[0]!.message).toMatch(message);
  });

  it.each([
    ['typeof', 'calc.test.ts', "-  expect(add(1, 2)).toBe(3);\n+  expect(typeof add(1, 2)).toBe('number');"],
    ['toBeTypeOf', 'calc.test.ts', "-  expect(add(1, 2)).toBe(3);\n+  expect(add(1, 2)).toBeTypeOf('number');"],
    ['toBeInstanceOf', 'calc.test.ts', '-  expect(parse("1")).toEqual(new Big(1));\n+  expect(parse("1")).toBeInstanceOf(Big);'],
    ['isinstance', 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert isinstance(add(2, 2), int)'],
    ['assertIsInstance', 'test_calc.py', '-        self.assertEqual(add(1, 2), 3)\n+        self.assertIsInstance(add(1, 2), int)'],
  ])('flags a value check downgraded to %s', (_name, file, lines) => {
    const findings = run(rh002, file, lines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/value check to a type check/);
  });

  it.each([
    ['a Python tuple', 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert add(2, 2) in (3, 4, 5)'],
    ['toBeOneOf', 'calc.test.ts', '-  expect(add(1, 2)).toBe(3);\n+  expect(add(1, 2)).toBeOneOf([2, 3, 4]);'],
    ['a literal array toContain', 'calc.test.ts', '-  expect(add(1, 2)).toBe(3);\n+  expect([2, 3, 4]).toContain(add(1, 2));'],
  ])('flags an expected value widened to %s', (_name, file, lines) => {
    const findings = run(rh002, file, lines);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/widened from one expected value/);
  });

  it('stays quiet for changes of equal or greater strength', () => {
    // A boolean flipped is a changed expectation, not a weaker one; WI109 owns changed values.
    expect(run(rh002, 'test_flags.py', '-        self.assertTrue(config.enabled)\n+        self.assertFalse(config.enabled)')).toEqual([]);
    expect(run(rh002, 'test_calc.py', '-    assert add(2, 2) != 5\n+    assert add(2, 2) == 4')).toEqual([]);
    expect(run(rh002, 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert add(2, 2) == 5')).toEqual([]);
  });

  it('stays quiet when the value is still pinned beside the type check, or the set does not hold the old value', () => {
    expect(run(rh002, 'test_calc.py',
      '-    assert add(2, 2) == 4\n+    assert isinstance(add(2, 2), int)\n+    assert add(2, 2) == 4')).toEqual([]);
    expect(run(rh002, 'test_calc.py', '-    assert add(2, 2) == 4\n+    assert add(2, 2) in (5, 6)')).toEqual([]);
    expect(run(rh002, 'test_calc.py', '-    assert kind(x) == "a"\n+    assert kind(x) in VALID_KINDS')).toEqual([]);
  });

  it('stays quiet for an inversion with a stated reason', () => {
    expect(run(rh002, 'test_calc.py',
      '-    assert parse("") == None\n+    assert parse("") != None  # empty input now returns an empty Doc, see #412')).toEqual([]);
  });
});

describe('RH015: an existing assertion wrapped so the test expects it to fail', () => {
  it('flags pytest.raises(AssertionError) around an assert that was already there', () => {
    const findings = run(rh015, 'test_calc.py',
` def test_plain():
-    assert add(2, 2) == 4
+    with pytest.raises(AssertionError):
+        assert add(2, 2) == 4`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toMatch(/expects AssertionError/);
  });

  it('flags assertRaises(AssertionError) and pytest.raises(Exception)', () => {
    expect(run(rh015, 'test_calc.py',
`-        self.assertEqual(add(1, 2), 3)
+        with self.assertRaises(AssertionError):
+            self.assertEqual(add(1, 2), 3)`)).toHaveLength(1);
    expect(run(rh015, 'test_calc.py',
`-    assert add(2, 2) == 4
+    with pytest.raises(Exception):
+        assert add(2, 2) == 4`)).toHaveLength(1);
  });

  it('flags expect(() => assertion).toThrow() and assert.throws(() => assertion)', () => {
    const findings = run(rh015, 'calc.test.ts',
`-  expect(add(1, 2)).toBe(3);
+  expect(() => expect(add(1, 2)).toBe(3)).toThrow();`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/expect\(\(\) => \.\.\.\)\.toThrow\(\)/);
    expect(run(rh015, 'calc.test.ts',
`-  assert.strictEqual(add(2, 2), 4);
+  assert.throws(() => assert.strictEqual(add(2, 2), 4));`)).toHaveLength(1);
  });

  it('stays quiet for a new test of an assertion helper and for a wrapper around a call that raises', () => {
    // How matcher libraries test themselves: the wrapper and the assertion arrive together.
    expect(run(rh015, 'matchers.test.ts', `+  expect(() => expect(5).toBeEven()).toThrow();`)).toEqual([]);
    expect(run(rh015, 'test_calc.py',
` def test_rejects_text():
+    with pytest.raises(ValueError):
+        add("a", None)`)).toEqual([]);
    expect(run(rh015, 'test_validate.py',
` def test_validate():
+    with pytest.raises(AssertionError):
+        validate_schema({"id": None})`)).toEqual([]);
  });
});

describe('RH003: an expected-failure marker added to an existing test', () => {
  it('flags #[should_panic] added to an existing Rust test', () => {
    const findings = run(rh003, 'tests/calc.rs',
` #[test]
+#[should_panic]
 fn adds() {
     assert_eq!(add(1, 2), 3);`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toMatch(/#\[should_panic\]/);
  });

  it('flags @Test(expected = ...) replacing @Test on an existing JUnit 4 test', () => {
    const findings = run(rh003, 'src/test/java/CalcTest.java',
`-    @Test
+    @Test(expected = AssertionError.class)
     public void adds() {
         assertEquals(3, Calc.add(1, 2));`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/@Test\(expected = \.\.\.\)/);
  });

  it('stays quiet for a new test that checks a panic or an exception', () => {
    expect(run(rh003, 'tests/calc.rs',
` }
+
+#[test]
+#[should_panic(expected = "overflow")]
+fn overflows() {
+    add(i32::MAX, 1);
+}`)).toEqual([]);
    expect(run(rh003, 'src/test/java/CalcTest.java',
`+    @Test(expected = ArithmeticException.class)
+    public void dividesByZero() {
+        Calc.div(1, 0);
+    }`)).toEqual([]);
  });
});
