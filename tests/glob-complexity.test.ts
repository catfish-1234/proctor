import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { GLOB_LIMITS, globComplexityError, safeMatcher } from '../src/glob.js';
import { rh007 } from '../src/verifiers/rh007.js';
import type { Context } from '../src/types.js';

// picomatch <=4.0.7 (GHSA-fc5q-39xc-vjpf, unpatched) compiles these to regular expressions that
// backtrack for seconds to minutes. Measured on 4.0.7: '*(a)' x6 ~0.9s and '*a' x8 >30s against a
// 60-character path. Some globs come from the diff under review, so they are hostile input.
const HOSTILE = ['*(a)'.repeat(8), '+(a)'.repeat(8), '*a'.repeat(8), `**/${'*a'.repeat(6)}/*.test.ts`];

describe('glob complexity limits', () => {
  it.each(HOSTILE)('refuses %s without compiling it', pattern => {
    expect(globComplexityError(pattern)).toBeDefined();
    const started = performance.now();
    expect(safeMatcher(pattern)('a'.repeat(60) + '!')).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it.each([
    '**/*.test.{ts,tsx,mts,cts,js,jsx,mjs,cjs}',
    '**/__tests__/**/*.?([mc])[jt]s?(x)',
    '**/?(*.)+(spec|test).?([mc])[jt]s?(x)',
    'tests/**/*',
    '!(node_modules)/**/*.spec.js',
    'src/**/\\*literal\\*\\*stars\\*\\*.test.ts',
  ])('accepts the real-world glob %s', pattern => {
    expect(globComplexityError(pattern)).toBeUndefined();
  });

  it('matches normally below the limits, including jest defaults', () => {
    expect(safeMatcher('**/?(*.)+(spec|test).?([mc])[jt]s?(x)')('src/deep/cart.spec.tsx')).toBe(true);
    expect(safeMatcher(['**/*.test.ts', '*(a)'.repeat(8)])('src/a.test.ts')).toBe(true);
  });

  it('names the limit that was exceeded', () => {
    expect(globComplexityError('x'.repeat(GLOB_LIMITS.length + 1))).toMatch(/longer than/);
    expect(globComplexityError('@(a)'.repeat(GLOB_LIMITS.extglobs + 1))).toMatch(/extglob groups/);
    expect(globComplexityError('{a,b}'.repeat(GLOB_LIMITS.braces + 1))).toMatch(/brace groups/);
    expect(globComplexityError('*a'.repeat(GLOB_LIMITS.wildcardsPerSegment + 1))).toMatch(/unbounded wildcards/);
  });
});

describe('RH007 with a hostile testMatch in the diff', () => {
  it('finishes quickly and reports the narrowing instead of hanging', () => {
    const hostile = '*a'.repeat(10);
    const files = parseDiff(`diff --git a/jest.config.js b/jest.config.js
--- a/jest.config.js
+++ b/jest.config.js
@@ -1,3 +1,3 @@
 module.exports = {
-  testMatch: ['${'a'.repeat(40)}.js'],
+  testMatch: ['${hostile}'],
 };
`);
    const ctx: Context = {
      cwd: '', files, testPathGlobs: ['**/*.test.js'], testFiles: [], enabled: ['RH007'],
      isTestFile: (p: string) => p.includes('.test.'), getLanguage: () => 'js' as const,
    };
    const started = performance.now();
    const findings = rh007.run(ctx) as ReturnType<typeof rh007.run> & Array<{ verifierId: string }>;
    expect(performance.now() - started).toBeLessThan(1000);
    expect(findings.some(f => f.verifierId === 'RH007')).toBe(true);
  });
});
