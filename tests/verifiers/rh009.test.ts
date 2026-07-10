import { describe, it, expect } from 'vitest';
import { rh009 } from '../../src/verifiers/rh009.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH009'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

// Real assertions removed plus a trivial test added: the composite strong signal.
const coverageGamed: ParsedFile[] = [
  {
    from: 'calculator.test.ts',
    to: 'calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 5, content: '-  expect(add(1, 2)).toBe(3);' },
        { type: 'del', del: true, ln: 9, content: '-  expect(add(0, 0)).toBe(0);' },
        { type: 'add', add: true, ln: 5, content: "+  it('exists', () => {" },
        { type: 'add', add: true, ln: 6, content: '+    expect(add).toBeDefined();' },
        { type: 'add', add: true, ln: 7, content: '+  });' },
      ],
      oldStart: 1, oldLines: 10, newStart: 1, newLines: 7,
    }],
    deleted: false,
    new: false,
  },
];

// Only a new trivial test added, no assertions removed — a legitimate additional smoke test.
const onlyAdditiveTest: ParsedFile[] = [
  {
    from: 'calculator.test.ts',
    to: 'calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 8, content: "+  it('is exported', () => {" },
        { type: 'add', add: true, ln: 9, content: '+    expect(add).toBeDefined();' },
        { type: 'add', add: true, ln: 10, content: '+  });' },
      ],
      oldStart: 8, oldLines: 0, newStart: 8, newLines: 3,
    }],
    deleted: false,
    new: false,
  },
];

// Assertions removed but no trivial test added in their place.
const onlyAssertionRemoved: ParsedFile[] = [
  {
    from: 'calculator.test.ts',
    to: 'calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 5, content: '-  expect(add(1, 2)).toBe(3);' },
      ],
      oldStart: 5, oldLines: 1, newStart: 5, newLines: 0,
    }],
    deleted: false,
    new: false,
  },
];

describe('rh009 — coverage gaming detection', () => {
  it('flags a trivial test added while real assertions were removed', () => {
    const findings = rh009.run({ ...baseCtx, files: coverageGamed });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH009');
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].message).toContain('2 real assertions');
  });

  it('returns [] for a purely additive trivial test (near-miss)', () => {
    const findings = rh009.run({ ...baseCtx, files: onlyAdditiveTest });
    expect(findings).toEqual([]);
  });

  it('returns [] when assertions are removed but no trivial test replaces them', () => {
    const findings = rh009.run({ ...baseCtx, files: onlyAssertionRemoved });
    expect(findings).toEqual([]);
  });

  it('returns [] for a non-test file', () => {
    const findings = rh009.run({
      ...baseCtx,
      files: coverageGamed.map(f => ({ ...f, from: 'src/calculator.ts', to: 'src/calculator.ts' })),
    });
    expect(findings).toEqual([]);
  });
});
