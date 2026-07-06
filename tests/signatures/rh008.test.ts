import { describe, it, expect } from 'vitest';
import { rh008 } from '../../src/signatures/rh008.js';
import type { RepoContext } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

function mockJudge(result: boolean) {
  return { judge: async (_ctx: unknown) => result };
}

const baseCtx: RepoContext = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH008'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
  aiEnabled: false,
  judge: undefined,
};

// A test file with 'assert True' tautological assertion
const testFileWithAssertTrue: ParsedFile[] = [
  {
    from: 'tests/calculator.test.ts',
    to: 'tests/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 5, content: '+  assert True' },
      ],
      oldStart: 3, oldLines: 3, newStart: 3, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

// A test file with expect(x).toBe(x) self-comparison tautology
const testFileWithExpectSelf: ParsedFile[] = [
  {
    from: 'tests/math.test.ts',
    to: 'tests/math.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 10, content: '+  expect(result).toBe(result)' },
      ],
      oldStart: 8, oldLines: 3, newStart: 8, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

// A non-test file with tautological assertion (should be ignored)
const implFileWithAssertTrue: ParsedFile[] = [
  {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 5, content: '+  assert True' },
      ],
      oldStart: 3, oldLines: 3, newStart: 3, newLines: 4,
    }],
    deleted: false,
    new: false,
  },
];

describe('rh008 — tautological assertion detection', () => {
  it('returns [] when aiEnabled is false, even if tautological pattern exists', async () => {
    const ctx: RepoContext = { ...baseCtx, aiEnabled: false, judge: undefined };
    const findings = await rh008(testFileWithAssertTrue, ctx);
    expect(findings).toEqual([]);
  });

  it('returns a finding when judge returns true and added test line contains "assert True"', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh008(testFileWithAssertTrue, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH008');
    expect(findings[0].severity).toBe('warn');
  });

  it('returns a finding when judge returns true and added line is expect(x).toBe(x) self-comparison', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh008(testFileWithExpectSelf, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH008');
    expect(findings[0].severity).toBe('warn');
  });

  it('returns [] when tautological pattern is in a non-test file', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh008(implFileWithAssertTrue, ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when judge returns false (not a cheat)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(false),
    };
    const findings = await rh008(testFileWithAssertTrue, ctx);
    expect(findings).toEqual([]);
  });
});
