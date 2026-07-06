import { describe, it, expect } from 'vitest';
import { rh004 } from '../../src/signatures/rh004.js';
import type { RepoContext } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

function mockJudge(result: boolean) {
  return { judge: async (_ctx: unknown) => result };
}

const baseCtx: RepoContext = {
  cwd: '',
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

describe('rh004 — implementation hardcoding detection', () => {
  it('returns [] when aiEnabled is false, even if heuristic would match', async () => {
    const ctx: RepoContext = { ...baseCtx, aiEnabled: false, judge: undefined };
    const findings = await rh004(implAndTestFiles, ctx);
    expect(findings).toEqual([]);
  });

  it('returns a finding when judge returns true and cross-file literal match exists', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004(implAndTestFiles, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH004');
    expect(findings[0].severity).toBe('error');
  });

  it('returns [] when judge returns false (not a cheat)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(false),
    };
    const findings = await rh004(implAndTestFiles, ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when impl literal does not appear in test file diff lines', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004(implWithoutTestMatch, ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when only test files are in the diff (no impl files)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh004(testFilesOnly, ctx);
    expect(findings).toEqual([]);
  });
});
