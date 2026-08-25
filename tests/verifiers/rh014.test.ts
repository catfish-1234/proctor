import { describe, expect, it } from 'vitest';
import parseDiff from 'parse-diff';
import { rh014 } from '../../src/verifiers/rh014.js';
import type { Context } from '../../src/types.js';

function diffOf(path: string, before: string, after: string) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  return parseDiff([
    `diff --git a/${path} b/${path}`,
    '--- a/' + path,
    '+++ b/' + path,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map(line => '-' + line),
    ...newLines.map(line => '+' + line),
  ].join('\n'));
}

const context = (files: ReturnType<typeof parseDiff>): Context => ({
  cwd: '', files, testPathGlobs: ['**/*.test.*'], testFiles: [], enabled: ['RH014'],
  isTestFile: path => path.includes('.test.'), getLanguage: () => 'ts',
});

describe('RH014, test workload reduced', () => {
  it('flags a property-test run count reduction', () => {
    const files = diffOf('math.test.ts', 'fc.assert(prop, { numRuns: 1000 });', 'fc.assert(prop, { numRuns: 1 });');
    expect(rh014.run(context(files))).toHaveLength(1);
  });

  it('flags slicing a previously complete case collection', () => {
    const files = diffOf('math.test.ts', 'for (const c of cases) check(c);', 'for (const c of cases.slice(0, 1)) check(c);');
    expect(rh014.run(context(files))).toHaveLength(1);
  });

  it('allows increasing the workload', () => {
    const files = diffOf('math.test.ts', 'const numRuns = 100;', 'const numRuns = 1000;');
    expect(rh014.run(context(files))).toEqual([]);
  });

  it('allows an explained sampling strategy change', () => {
    const files = diffOf('math.test.ts', 'for (const c of cases) check(c);', 'for (const c of cases.slice(0, 10)) check(c); // deterministic sample; full corpus runs nightly');
    expect(rh014.run(context(files))).toEqual([]);
  });

  it('flags filtering a generated input source', () => {
    const before = 'fc.assert(fc.property(fc.integer(), n => check(n)));';
    const after = 'fc.assert(fc.property(fc.integer().filter(n => n !== 0), n => check(n)));';
    expect(rh014.run(context(diffOf('math.test.ts', before, after)))).toHaveLength(1);
  });

  it('allows an explained domain filter', () => {
    const before = 'fc.assert(fc.property(fc.integer(), n => reciprocal(n)));';
    const after = "fc.assert(fc.property(fc.integer().filter(n => n !== 0), n => reciprocal(n))); // zero is outside reciprocal's documented domain";
    expect(rh014.run(context(diffOf('math.test.ts', before, after)))).toEqual([]);
  });

  it('flags a row removed from a surviving parameterized table', () => {
    const before = "const cases = [\n  [1, 2, 3],\n  [-1, 1, 0],\n];\nit.each(cases)('adds', fn);";
    const after = "const cases = [\n  [1, 2, 3],\n];\nit.each(cases)('adds', fn);";
    expect(rh014.run(context(diffOf('math.test.ts', before, after)))).toHaveLength(1);
  });

  it('flags inline table and loop-bound reductions', () => {
    const tableBefore = "const cases = [[1,2,3],[-1,1,0]];\nit.each(cases)('adds', fn);";
    const tableAfter = "const cases = [[1,2,3]];\nit.each(cases)('adds', fn);";
    expect(rh014.run(context(diffOf('math.test.ts', tableBefore, tableAfter)))).toHaveLength(1);
    expect(rh014.run(context(diffOf('math.test.ts', 'for (let i = 0; i < 100; i++) check(i);', 'for (let i = 0; i < 1; i++) check(i);')))).toHaveLength(1);
  });

  it('allows a loop-bound increase', () => {
    const files = diffOf('math.test.ts', 'for (let i = 0; i < 10; i++) check(i);', 'for (let i = 0; i < 100; i++) check(i);');
    expect(rh014.run(context(files))).toEqual([]);
  });
});

describe('RH014, workload names are whole tokens', () => {
  it('ignores an identifier that merely contains a workload word', () => {
    // `runs?` matched inside `truncateAt` ("t-run-cateAt"), so lowering a string truncation limit
    // was reported as a reduced test workload.
    const files = diffOf('a.test.ts', 'const truncateAt = 200;', 'const truncateAt = 80;');
    expect(rh014.run(context(files))).toEqual([]);
  });

  it('still catches a real workload cut', () => {
    const files = diffOf('a.test.ts', 'const numRuns = 500;', 'const numRuns = 5;');
    const findings = rh014.run(context(files));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.message).toContain('500');
  });
});
