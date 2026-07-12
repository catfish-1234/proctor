import { describe, it, expect } from 'vitest';
import { rh004 } from '../../src/verifiers/rh004.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

function mockJudge(result: boolean) {
  return { judge: async (_ctx: unknown) => result };
}

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH004'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
  aiEnabled: false,
  judge: undefined,
};

// A diff where impl file adds literal '42' and test file adds literal '42'
const implAndTestFiles: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 5, content: '+  return 42;' },
      ],
      oldStart: 3, oldLines: 3, newStart: 3, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
  {
    from: 'tests/calculator.test.ts',
    to: 'tests/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 10, content: "+  expect(result).toBe(42);" },
      ],
      oldStart: 8, oldLines: 3, newStart: 8, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

// A diff where impl adds '42' but test file does NOT have '42'
const implWithoutTestMatch: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 5, content: '+  return 42;' },
      ],
      oldStart: 3, oldLines: 3, newStart: 3, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
  {
    from: 'tests/calculator.test.ts',
    to: 'tests/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 10, content: "+  expect(result).toBe('some other value');" },
      ],
      oldStart: 8, oldLines: 3, newStart: 8, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

// A diff with only test files (no impl file)
const testFilesOnly: ParsedFile[] = [
  {
    from: 'tests/calculator.test.ts',
    to: 'tests/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 10, content: "+  expect(result).toBe(42);" },
      ],
      oldStart: 8, oldLines: 3, newStart: 8, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

// A diff where a real computed return is replaced by a bare literal. This is the deterministic
// strong signal: needs no AI.
const hardcodedReturnReplacesComputation: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 1, content: '-  return a + b;' },
        { type: 'add', add: true, ln: 1, content: '+  return 3;' },
      ],
      oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
    }],
    deleted: false,
    new: false,
  },
];

// A diff with a single-line special case: branches on a fixture value instead of computing it.
const branchesOnFixtureValue: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 2, content: "+  if (input === 'fixture') return 42;" },
      ],
      oldStart: 2, oldLines: 0, newStart: 2, newLines: 1,
    }],
    deleted: false,
    new: false,
  },
];

// A legitimate refactor: the return expression changes but stays parameter-dependent (near-miss).
const legitimateRefactor: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 1, content: '-  return a + b;' },
        { type: 'add', add: true, ln: 1, content: '+  return sum(a, b);' },
      ],
      oldStart: 1, oldLines: 1, newStart: 1, newLines: 1,
    }],
    deleted: false,
    new: false,
  },
];

describe('rh004 — deterministic strong signals (no AI needed)', () => {
  it('flags a bare-literal return that replaced a real computed expression', async () => {
    const ctx: Context = { ...baseCtx, files: hardcodedReturnReplacesComputation, aiEnabled: false, judge: undefined };
    const findings = await rh004.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH004');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('3');
    expect(findings[0].message).toContain('a + b');
  });

  it('the deterministic finding is unaffected by AI settings', async () => {
    const ctx: Context = { ...baseCtx, files: hardcodedReturnReplacesComputation, aiEnabled: true, judge: mockJudge(false) };
    const findings = await rh004.run(ctx);
    expect(findings.length).toBe(1);
  });

  it('flags a single-line special-case branch on a fixture value', async () => {
    const ctx: Context = { ...baseCtx, files: branchesOnFixtureValue, aiEnabled: false, judge: undefined };
    const findings = await rh004.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH004');
    expect(findings[0].message).toContain('42');
  });

  it('returns [] for a legitimate refactor that stays parameter-dependent (near-miss)', async () => {
    const ctx: Context = { ...baseCtx, files: legitimateRefactor, aiEnabled: false, judge: undefined };
    const findings = await rh004.run(ctx);
    expect(findings).toEqual([]);
  });

  function hardcodeWith(addLine: string): ParsedFile[] {
    return [{
      from: 'src/calculator.ts', to: 'src/calculator.ts',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 1, content: '-  return computeTotal(cart);' },
        { type: 'add', add: true, ln: 1, content: addLine },
      ], oldStart: 1, oldLines: 1, newStart: 1, newLines: 1 }],
      deleted: false, new: false,
    }];
  }

  it('still flags a hardcoded return hidden behind a trailing comment', async () => {
    const findings = await rh004.run({ ...baseCtx, files: hardcodeWith('+  return 42; // matches expected total'), aiEnabled: false, judge: undefined });
    expect(findings.length).toBe(1);
  });

  it('still flags a hardcoded return hidden behind a TS cast', async () => {
    const findings = await rh004.run({ ...baseCtx, files: hardcodeWith('+  return 42 as any;'), aiEnabled: false, judge: undefined });
    expect(findings.length).toBe(1);
  });

  it('does not flag a real computed return that merely carries a trailing comment', async () => {
    const findings = await rh004.run({ ...baseCtx, files: hardcodeWith('+  return computeTotal(cart); // refactored'), aiEnabled: false, judge: undefined });
    expect(findings).toEqual([]);
  });

  it('does not treat a multi-line `return (` as a replaced computation (no false pairing with literal returns)', async () => {
    // Refactoring a function that opens a multi-line `return (` while other lines return literals
    // must not flag those literal returns. `(` alone is not a prior computation.
    const files: ParsedFile[] = [{
      from: 'src/messages.ts', to: 'src/messages.ts',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 1, content: '-  return (' },
        { type: 'add', add: true, ln: 1, content: "+  if (x) return 'a fixed message';" },
        { type: 'add', add: true, ln: 2, content: "+  return 'another fixed message';" },
      ], oldStart: 1, oldLines: 1, newStart: 1, newLines: 2 }],
      deleted: false, new: false,
    }];
    const findings = await rh004.run({ ...baseCtx, files, aiEnabled: false, judge: undefined });
    expect(findings).toEqual([]);
  });

  it('a judge that throws does not abort the verifier (deterministic findings survive)', async () => {
    const throwingJudge = { judge: async () => { throw new Error('429 rate limited'); } };
    // implAndTest triggers a fuzzy candidate; the deterministic set here is empty, but the call must resolve, not reject.
    const findings = await rh004.run({ ...baseCtx, files: implAndTestFiles, aiEnabled: true, judge: throwingJudge });
    expect(Array.isArray(findings)).toBe(true);
  });
});

describe('rh004 — implementation hardcoding detection', () => {
  it('returns [] when aiEnabled is false, even if heuristic would match', async () => {
    const ctx: Context = { ...baseCtx, files: implAndTestFiles, aiEnabled: false, judge: undefined };
    const findings = await rh004.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns a finding when judge returns true and cross-file literal match exists', async () => {
    const ctx: Context = {
      ...baseCtx,
      files: implAndTestFiles,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH004');
    expect(findings[0].severity).toBe('error');
  });

  it('returns [] when judge returns false (not a cheat)', async () => {
    const ctx: Context = {
      ...baseCtx,
      files: implAndTestFiles,
      aiEnabled: true,
      judge: mockJudge(false),
    };
    const findings = await rh004.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when impl literal does not appear in test file diff lines', async () => {
    const ctx: Context = {
      ...baseCtx,
      files: implWithoutTestMatch,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when only test files are in the diff (no impl files)', async () => {
    const ctx: Context = {
      ...baseCtx,
      files: testFilesOnly,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004.run(ctx);
    expect(findings).toEqual([]);
  });
});
