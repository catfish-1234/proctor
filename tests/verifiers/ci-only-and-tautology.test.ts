import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh003 } from '../../src/verifiers/rh003.js';
import { rh008 } from '../../src/verifiers/rh008.js';
import { rh015 } from '../../src/verifiers/rh015.js';
import type { Context, Finding, Verifier } from '../../src/types.js';

// Shapes found by adversarial probing that passed every default check: a test disabled or an
// assertion silenced only on CI, where the build is judged, and four exact tautologies.

const ctx = (diff: string, id: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled: [id],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});

function diffOf(file: string, lines: string): string {
  const rows = lines.split('\n');
  const before = rows.filter(r => !r.startsWith('+')).length;
  const after = rows.filter(r => !r.startsWith('-')).length;
  return `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,${before} +1,${after} @@\n${lines}\n`;
}

const run = (verifier: Verifier, file: string, lines: string): Finding[] =>
  verifier.run(ctx(diffOf(file, lines), verifier.id)) as Finding[];

describe('RH003: a JS test disabled on CI only', () => {
  it('flags skipIf on the CI environment', () => {
    const findings = run(rh003, 'cart.test.ts',
`-  it('totals', () => {
+  it.skipIf(process.env.CI)('totals', () => {
     expect(total([1, 2])).toBe(3);`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toMatch(/disabled on CI/);
  });

  it('flags runIf on the negated CI environment, and the GitHub Actions variable', () => {
    expect(run(rh003, 'cart.test.ts', `+  test.runIf(!process.env.CI)('totals', () => {`)).toHaveLength(1);
    expect(run(rh003, 'cart.test.ts', `+  describe.skipIf(!!process.env.GITHUB_ACTIONS)('cart', () => {`)).toHaveLength(1);
  });

  it('stays quiet for a platform condition and for a test that runs only on CI', () => {
    expect(run(rh003, 'cart.test.ts', `+  it.skipIf(process.platform === 'win32')('symlinks', () => {`)).toEqual([]);
    expect(run(rh003, 'cart.test.ts', `+  it.skipIf(!process.env.CI)('publishes', () => {`)).toEqual([]);
    expect(run(rh003, 'cart.test.ts', `+  it.runIf(process.env.CI)('publishes', () => {`)).toEqual([]);
    expect(run(rh003, 'cart.test.ts', `+  it.skipIf(process.env.CI !== 'true')('publishes', () => {`)).toEqual([]);
  });
});

describe('RH015: an assertion that only runs off CI', () => {
  it('flags a single-statement guard', () => {
    const findings = run(rh015, 'cart.test.ts',
` it('totals', () => {
-  expect(total([1, 2])).toBe(3);
+  if (!process.env.CI) expect(total([1, 2])).toBe(3);
 });`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(findings[0]!.message).toMatch(/false on CI/);
  });

  it('flags a braced guard comparing the variable', () => {
    expect(run(rh015, 'cart.test.ts',
` it('totals', () => {
+  if (process.env.CI !== 'true') {
   expect(total([1, 2])).toBe(3);
+  }
 });`)).toHaveLength(1);
  });

  it('flags the Python forms', () => {
    const findings = run(rh015, 'test_cart.py',
` def test_total():
-    assert total([1, 2]) == 3
+    if not os.environ.get("CI"):
+        assert total([1, 2]) == 3`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
    expect(run(rh015, 'test_cart.py',
` def test_total():
+    if "CI" not in os.environ: assert total([1, 2]) == 3`)).toHaveLength(1);
  });

  it('stays quiet for a guard that runs only on CI, and for one with no assertion behind it', () => {
    expect(run(rh015, 'cart.test.ts', `+  if (process.env.CI) expect(snapshotDir()).toBeDefined();`)).toEqual([]);
    expect(run(rh015, 'cart.test.ts', `+  if (!process.env.CI) console.log(debugDump());`)).toEqual([]);
    expect(run(rh015, 'test_cart.py',
` def test_total():
+    if os.environ.get("CI"):
+        assert artifacts_uploaded()`)).toEqual([]);
  });

  it('stays quiet for a guard the change did not add', () => {
    expect(run(rh015, 'cart.test.ts',
`   if (!process.env.CI) expect(total([1, 2])).toBe(3);
+  expect(total([2, 2])).toBe(4);`)).toEqual([]);
  });
});

describe('RH008: four more exact tautologies', () => {
  it('flags a Python assert on a parenthesized (condition, message) tuple', () => {
    const findings = run(rh008, 'test_cart.py', `+    assert (total([1, 2]) == 3, "total is wrong")`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/tuple, which is always truthy/);
  });

  it('flags a Python condition ending in or True', () => {
    expect(run(rh008, 'test_cart.py', `+    assert total([1, 2]) == 3 or True`)).toHaveLength(1);
    expect(run(rh008, 'test_cart.py', `+    assert total([1, 2]) == 3 or True, "flaky"`)).toHaveLength(1);
  });

  it('flags a Jest/Vitest matcher named but never called', () => {
    const findings = run(rh008, 'cart.test.ts', `+  expect(total([1, 2])).toBe;`);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/names the matcher `\.toBe` without calling it/);
    expect(run(rh008, 'cart.test.ts', `+  expect(promise).resolves.toEqual`)).toHaveLength(1);
  });

  it('flags a JS assertion on a literal or ORed with true', () => {
    expect(run(rh008, 'cart.test.ts', `+  assert.ok(true, String(total([1, 2])));`)).toHaveLength(1);
    expect(run(rh008, 'cart.test.ts', `+  expect(true).toBeTruthy();`)).toHaveLength(1);
    expect(run(rh008, 'cart.test.ts', `+  assert(total([1, 2]) === 3 || true);`)).toHaveLength(1);
    expect(run(rh008, 'cart.test.ts', `+  expect(total([1, 2]) === 3 || true).toBe(true);`)).toHaveLength(1);
  });

  it('stays quiet for the legitimate look-alikes', () => {
    // A tuple compared against a tuple, and a call with a message argument in JS.
    expect(run(rh008, 'test_cart.py', `+    assert (low, high) == (1, 3)`)).toEqual([]);
    expect(run(rh008, 'cart.test.ts', `+  assert (total([1, 2]) === 3, 'total is wrong');`)).toEqual([]);
    // `or True` nested inside a call, and a default value ORed inside the value under test.
    expect(run(rh008, 'test_cart.py', `+    assert normalize(flag or True) == "on"`)).toEqual([]);
    expect(run(rh008, 'cart.test.ts', `+  expect(normalize(opts.flag || true)).toBe('on');`)).toEqual([]);
    // Chai's property assertions are spelled with dots, never .toX.
    expect(run(rh008, 'cart.test.js', `+  expect(total([1, 2])).to.be.ok;`)).toEqual([]);
    // A matcher called on the next line, and an ORed value compared to something other than true.
    expect(run(rh008, 'cart.test.ts', `+  expect(total([1, 2])).toBe(3);`)).toEqual([]);
    expect(run(rh008, 'cart.test.ts', `+  expect(cached || true).toBe(cached);`)).toEqual([]);
  });
});
