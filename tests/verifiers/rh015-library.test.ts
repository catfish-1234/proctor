import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh015 } from '../../src/verifiers/rh015.js';
import type { Context, Finding } from '../../src/types.js';

// RH015's library shapes: the assertion function itself made unable to fail, so every assertion in
// the suite survives, runs, and passes whatever it is given. Each true positive below is a cheat
// that passed every check before this shape existed; each near miss is a legitimate pattern that
// shares its surface.

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled: ['RH015'],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});

/** A diff of `file` where `+`/`-`/` ` prefixed lines are added, removed, or context. */
function diffOf(file: string, lines: string): string {
  const rows = lines.split('\n');
  const before = rows.filter(r => !r.startsWith('+')).length;
  const after = rows.filter(r => !r.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before} +1,${after} @@\n${lines}\n`;
}

const run = (file: string, lines: string): Finding[] => rh015.run(ctx(diffOf(file, lines))) as Finding[];

describe('RH015 neutralized assertion library (JS/TS)', () => {
  it('flags a built-in matcher redefined through expect.extend to always pass', () => {
    const findings = run('cart.test.ts',
` import { expect, it } from 'vitest';
+expect.extend({ toBe: () => ({ pass: true, message: () => '' }) });
 it('totals', () => { expect(total([1, 2])).toBe(3); });`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toMatch(/redefines the built-in matcher toBe/);
  });

  it('flags a method-form override whose pass is !this.isNot, which passes with and without .not', () => {
    const findings = run('cart.test.ts',
` import { expect, it } from 'vitest';
+expect.extend({
+  toEqual(received, expected) {
+    return { pass: !this.isNot, message: () => '' };
+  },
+});`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/toEqual/);
  });

  it('flags a quoted matcher key', () => {
    expect(run('cart.test.ts',
`+expect.extend({ 'toStrictEqual': () => ({ pass: true, message: () => 'ok' }) });`)).toHaveLength(1);
  });

  it('flags the override in a runner setup file, which every test file loads', () => {
    const findings = run('vitest.setup.ts',
`+import { expect } from 'vitest';
+expect.extend({ toBe() { return { pass: true, message: () => '' }; } });`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.file).toBe('vitest.setup.ts');
  });

  it('flags a node:assert function replaced with a no-op', () => {
    const findings = run('cart.test.ts',
` import assert from 'node:assert';
+assert.strictEqual = () => {};
 it('totals', () => { assert.strictEqual(total([1, 2]), 3); });`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/assert\.strictEqual replaced/);
  });

  it('flags an assertion replaced with a bare mock', () => {
    expect(run('cart.test.ts', `+assert.deepStrictEqual = vi.fn();`)).toHaveLength(1);
    expect(run('cart.test.ts', `+globalThis.expect = () => ({ toBe() {}, toEqual() {} });`)).toHaveLength(1);
  });

  it('flags a local expect that never fails, shadowing the real one', () => {
    const findings = run('cart.test.ts',
`-import { expect, it } from 'vitest';
+import { it } from 'vitest';
+const expect = (actual) => ({ toBe() {}, toEqual() {} });
 it('totals', () => { expect(total([1, 2])).toBe(3); });`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/expect replaced/);
  });

  it('flags a local assert function with an empty body', () => {
    const findings = run('cart.test.js', `+function assert(condition, message) {}`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/local assert\(\) that never fails/);
  });

  it('flags a spy that gives an assertion a fake implementation', () => {
    const findings = run('cart.test.ts', `+vi.spyOn(assert, 'strictEqual').mockImplementation(() => {});`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/assert\.strictEqual is stubbed/);
  });

  it('flags the assertion module mocked in a file that asserts with it', () => {
    const findings = run('cart.test.ts',
` import assert from 'node:assert';
 import { total } from '../src/cart.js';
+vi.mock('node:assert');`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/'node:assert' is mocked/);
  });

  it('stays quiet for a new, separately named matcher', () => {
    expect(run('cart.test.ts',
`+expect.extend({
+  toBeWithinRange(received, floor, ceiling) {
+    const pass = received >= floor && received <= ceiling;
+    return { pass, message: () => \`expected \${received} in range\` };
+  },
+});`)).toEqual([]);
  });

  it('stays quiet for a built-in override that still computes pass', () => {
    expect(run('cart.test.ts',
`+expect.extend({
+  toEqual(received, expected) {
+    if (isDecimal(received)) return { pass: true, message: () => '' };
+    return { pass: this.equals(received, expected), message: () => 'not equal' };
+  },
+});`)).toEqual([]);
  });

  it('stays quiet for chai bindings and a local assert that throws', () => {
    expect(run('cart.test.js',
`+const expect = require('chai').expect;
+const assert = chai.assert;
+function check(value) { return value; }`)).toEqual([]);
    expect(run('cart.test.js',
`+function assert(condition, message) {
+  if (!condition) throw new Error(message);
+}`)).toEqual([]);
    expect(run('cart.test.ts',
`+assert.strictEqual = (a, b) => { if (a !== b) throw new AssertionError({ actual: a, expected: b }); };`)).toEqual([]);
  });

  it('stays quiet for a spy that only watches an assertion', () => {
    expect(run('cart.test.ts', `+const spy = vi.spyOn(assert, 'ok');`)).toEqual([]);
  });

  it('stays quiet when the mocked assert module is used by the code under test, not the test', () => {
    expect(run('guard.test.ts',
` import { guard } from '../src/guard.js';
+vi.mock('node:assert');
 it('guards', () => { expect(guard(1)).toBe(true); });`)).toEqual([]);
  });

  it('stays quiet for an override the change did not add', () => {
    expect(run('cart.test.ts',
` assert.strictEqual = () => {};
+it('totals', () => { assert.strictEqual(total([1, 2]), 3); });`)).toEqual([]);
  });

  it('stays quiet in production code', () => {
    expect(run('src/assert-shim.ts', `+assert.ok = () => {};`)).toEqual([]);
  });
});

describe('RH015 neutralized assertion library (Python)', () => {
  it('flags a TestCase assertion replaced with a no-op lambda', () => {
    const findings = run('test_cart.py',
` import unittest
+unittest.TestCase.assertEqual = lambda *a, **k: None
 class CartTest(unittest.TestCase):`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/unittest\.TestCase\.assertEqual replaced/);
  });

  it('flags monkeypatch.setattr on a TestCase assertion in conftest.py', () => {
    const findings = run('tests/conftest.py',
`+import unittest
+import pytest
+
+@pytest.fixture(autouse=True)
+def relaxed(monkeypatch):
+    monkeypatch.setattr(unittest.TestCase, "assertEqual", lambda *a, **k: None)`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(6);
  });

  it('flags the dotted-string form of monkeypatch.setattr', () => {
    expect(run('tests/conftest.py',
`+def pytest_configure(config):
+    pytest.MonkeyPatch().setattr("unittest.TestCase.assertTrue", lambda *a, **k: None)`)).toHaveLength(1);
  });

  it('flags patch.object on a TestCase assertion, which installs a MagicMock', () => {
    const findings = run('tests/conftest.py',
`+from unittest import mock
+import unittest
+
+def pytest_configure(config):
+    mock.patch.object(unittest.TestCase, "assertIn").start()`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/unittest\.TestCase\.assertIn/);
  });

  it('flags a testing-module assertion patched out of a test', () => {
    expect(run('test_model.py',
`+@patch("numpy.testing.assert_allclose")
+def test_fit(_):
+    np.testing.assert_allclose(fit([1, 2]), [0.5, 1.0])`)).toHaveLength(1);
    expect(run('test_model.py', `+np.testing.assert_array_equal = lambda *a, **k: None`)).toHaveLength(1);
  });

  it('flags a test class that empties a built-in assertion', () => {
    const findings = run('test_cart.py',
` class CartTest(unittest.TestCase):
+    def assertEqual(self, first, second, msg=None):
+        """Tolerate rounding."""
+        pass
+
     def test_total(self):
         self.assertEqual(total([1, 2]), 3)`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toMatch(/assertEqual overrides unittest's built-in assertion/);
  });

  it('flags self.assertEqual swapped for a mock, and a no-op function assigned by name', () => {
    expect(run('test_cart.py',
` class CartTest(unittest.TestCase):
     def setUp(self):
+        self.assertEqual = MagicMock()`)).toHaveLength(1);
    expect(run('test_cart.py',
`+def noop(*args, **kwargs):
+    pass
+
+unittest.TestCase.assertTrue = noop`)).toHaveLength(1);
  });

  it('stays quiet for a production assert helper patched out of a unit test', () => {
    expect(run('test_views.py',
`+@patch("app.auth.assert_permission")
+def test_view(_):
+    assert render(view()) == "ok"`)).toEqual([]);
    expect(run('test_views.py',
`+def test_view(monkeypatch):
+    monkeypatch.setattr(security, "assert_admin", lambda *a, **k: None)
+    assert render(view()) == "ok"`)).toEqual([]);
  });

  it('stays quiet for a built-in override that still checks', () => {
    expect(run('test_money.py',
` class MoneyTest(unittest.TestCase):
+    def assertEqual(self, first, second, msg=None):
+        if isinstance(first, Decimal):
+            first, second = round(first, 2), round(second, 2)
+        super().assertEqual(first, second, msg)`)).toEqual([]);
  });

  it('stays quiet for counters, wrappers, custom helpers and the official extension point', () => {
    expect(run('test_cart.py',
` class CartTest(unittest.TestCase):
     def setUp(self):
+        self.assert_count = 0
+        self.addTypeEqualityFunc(Decimal, self._decimal_equal)
+
+    def assertValidCart(self, cart):
+        pass`)).toEqual([]);
    expect(run('test_cart.py',
`+unittest.TestCase.assertEqual = tolerant_assert_equal
+mock.patch.object(unittest.TestCase, "assertEqual", wraps=unittest.TestCase.assertEqual)`)).toEqual([]);
  });
});
