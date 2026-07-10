import { describe, it, expect } from 'vitest';
import { rh008 } from '../../src/verifiers/rh008.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH008'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

function fileWith(from: string, content: string, ln = 5): ParsedFile[] {
  return [{
    from,
    to: from,
    chunks: [{
      content: '',
      changes: [{ type: 'add', add: true, ln, content }],
      oldStart: ln - 2, oldLines: 3, newStart: ln - 2, newLines: 4,
    }],
    deleted: false,
    new: false,
  }];
}

describe('rh008 — tautological assertion detection (fully deterministic, no AI)', () => {
  it('flags `assert True` with no AI needed', () => {
    const findings = rh008.run({ ...baseCtx, files: fileWith('tests/calculator.test.ts', '+  assert True') });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH008');
    expect(findings[0].severity).toBe('warn');
  });

  it('flags `assert x == x` self-comparison', () => {
    const findings = rh008.run({ ...baseCtx, files: fileWith('tests/calculator.test.ts', '+  assert result == result') });
    expect(findings.length).toBe(1);
  });

  it('flags `expect(x).toBe(x)` self-comparison', () => {
    const findings = rh008.run({ ...baseCtx, files: fileWith('tests/math.test.ts', '+  expect(result).toBe(result)') });
    expect(findings.length).toBe(1);
  });

  it('flags `expect(f(x)).toBe(f(x))` — the identical call repeated, not just a bare identifier', () => {
    const findings = rh008.run({
      ...baseCtx,
      files: fileWith('tests/math.test.ts', '+  expect(compute(x)).toBe(compute(x));'),
    });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('compute(x)');
  });

  it('flags an empty `expect()` with a zero-arg matcher', () => {
    const findings = rh008.run({ ...baseCtx, files: fileWith('tests/math.test.ts', '+  expect().toBeTruthy()') });
    expect(findings.length).toBe(1);
  });

  it('returns [] when the tautological pattern is in a non-test file', () => {
    const findings = rh008.run({ ...baseCtx, files: fileWith('src/calculator.ts', '+  assert True') });
    expect(findings).toEqual([]);
  });

  it('returns [] for a real, specific-value assertion (near-miss)', () => {
    const findings = rh008.run({
      ...baseCtx,
      files: fileWith('tests/calculator.test.ts', "+  expect(add(1, 2)).toBe(3);"),
    });
    expect(findings).toEqual([]);
  });

  it('returns [] when two different calls are compared (not a true self-comparison)', () => {
    const findings = rh008.run({
      ...baseCtx,
      files: fileWith('tests/calculator.test.ts', '+  expect(compute(x)).toBe(compute(y));'),
    });
    expect(findings).toEqual([]);
  });
});
