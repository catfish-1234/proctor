import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh015 } from '../../src/verifiers/rh015.js';
import type { Context } from '../../src/types.js';

const ctx = (diff: string): Context => ({
  cwd: '', files: parseDiff(diff), testPathGlobs: ['**/*.test.ts', '**/test_*.py'], testFiles: [], enabled: ['RH015'],
  isTestFile: (p: string) => /\.test\.|(?:^|\/)test_[^/]*\.py$/.test(p), getLanguage: () => 'ts' as const,
});

function jsDiff(lines: string): string {
  const count = lines.split('\n').length;
  return `diff --git a/math.test.ts b/math.test.ts\n--- a/math.test.ts\n+++ b/math.test.ts\n@@ -1,${count} +1,${count} @@\n${lines}\n`;
}

function pyDiff(lines: string): string {
  const count = lines.split('\n').length;
  return `diff --git a/test_math.py b/test_math.py\n--- a/test_math.py\n+++ b/test_math.py\n@@ -1,${count} +1,${count} @@\n${lines}\n`;
}

describe('RH015 swallowed assertions (JS/TS)', () => {
  it('flags an assertion newly wrapped in a try with an empty catch', () => {
    const findings = rh015.run(ctx(jsDiff(
` it('multiplies', () => {
-  expect(mul(2, 3)).toBe(6);
+  try { expect(mul(2, 3)).toBe(6); } catch {}
 });`))) as ReturnType<typeof rh015.run> & unknown[];
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/catch block is empty/);
  });

  it('flags a multi-line try/catch with a bound but unused error', () => {
    const findings = rh015.run(ctx(jsDiff(
` it('multiplies', async () => {
+  try {
   await expect(mulAsync(2, 3)).resolves.toBe(6);
+  } catch (error) {
+    // flaky on CI
+  }
 });`))) as unknown[];
    expect(findings).toHaveLength(1);
  });

  it('stays quiet when the catch asserts on the error', () => {
    expect(rh015.run(ctx(jsDiff(
` it('rejects bad input', () => {
+  try { parse('x'); expect.unreachable(); } catch (error) {
+    expect(String(error)).toContain('invalid');
+  }
 });`)))).toEqual([]);
  });

  it('stays quiet for try/finally cleanup', () => {
    expect(rh015.run(ctx(jsDiff(
` it('writes', () => {
+  try { expect(write()).toBe(true); } finally { cleanup(); }
 });`)))).toEqual([]);
  });

  it('does not re-report a try/catch the change did not add', () => {
    expect(rh015.run(ctx(jsDiff(
` it('multiplies', () => {
   try {
-    expect(mul(2, 3)).toBe(6);
+    expect(mul(2, 3)).toBe(6); // checked
   } catch {}
 });`)))).toEqual([]);
  });
});

describe('RH015 unreachable assertions (JS/TS)', () => {
  it('flags an early return added ahead of the assertions', () => {
    const findings = rh015.run(ctx(jsDiff(
` it('multiplies', () => {
+  return;
   expect(mul(2, 3)).toBe(6);
 });`))) as unknown[];
    expect(findings).toHaveLength(1);
  });

  it('stays quiet for a return inside a nested callback or a condition block', () => {
    expect(rh015.run(ctx(jsDiff(
` it('multiplies', () => {
+  const values = [1, 2].map(x => { return x * 2; });
+  if (skipSlow) { return; }
   expect(values).toEqual([2, 4]);
 });`)))).toEqual([]);
  });

  it('stays quiet for a returned assertion promise with nothing after it', () => {
    expect(rh015.run(ctx(jsDiff(
` it('multiplies', () => {
+  return expect(mulAsync(2, 3)).resolves.toBe(6);
 });`)))).toEqual([]);
  });
});

describe('RH015 Python', () => {
  it('flags an assert newly wrapped in try/except: pass', () => {
    const findings = rh015.run(ctx(pyDiff(
` def test_mul():
-    assert mul(2, 3) == 6
+    try:
+        assert mul(2, 3) == 6
+    except AssertionError:
+        pass`))) as unknown[];
    expect(findings).toHaveLength(1);
  });

  it('stays quiet for an except that narrows to a specific error and handles it', () => {
    expect(rh015.run(ctx(pyDiff(
` def test_mul():
+    try:
+        assert mul(2, 3) == 6
+    except KeyError:
+        pass`)))).toEqual([]);
  });

  it('flags an early return added ahead of the asserts', () => {
    const findings = rh015.run(ctx(pyDiff(
` def test_mul():
+    return
     assert mul(2, 3) == 6`))) as unknown[];
    expect(findings).toHaveLength(1);
  });

  it('stays quiet for a guarded return', () => {
    expect(rh015.run(ctx(pyDiff(
` def test_mul():
+    if not HAS_GPU:
+        return
     assert mul(2, 3) == 6`)))).toEqual([]);
  });
});
