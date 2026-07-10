import { describe, it, expect } from 'vitest';
import { rh005 } from '../../src/verifiers/rh005.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

function mockJudge(result: boolean) {
  return { judge: async () => result };
}

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH005'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
  aiEnabled: false,
  judge: undefined,
};

// A diff where impl file has a clear prior computation (`return d;`) replaced by `return null;`.
// This is the deterministic strong signal: needs no AI.
function makeGuttedImplFile(): ParsedFile {
  return {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 3, content: '-  const a = doSomething();' },
        { type: 'del', del: true, ln: 4, content: '-  const b = doSomethingElse(a);' },
        { type: 'del', del: true, ln: 5, content: '-  const c = transform(b);' },
        { type: 'del', del: true, ln: 6, content: '-  const d = finalize(c);' },
        { type: 'del', del: true, ln: 7, content: '-  return d;' },
        { type: 'add', add: true, ln: 3, content: '+  return null;' },
      ],
      oldStart: 1, oldLines: 7, newStart: 1, newLines: 3,
    }],
    deleted: false,
    new: false,
  };
}

// A brand-new gutted function with no prior computation in the diff to compare against.
// This is ambiguous, so it's only a candidate for the AI-gated fuzzy path.
function makeAmbiguousGuttedFile(): ParsedFile {
  return {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 12, content: '+  return null;' },
      ],
      oldStart: 10, oldLines: 0, newStart: 10, newLines: 1,
    }],
    deleted: false,
    new: false,
  };
}

// A diff where body GROWS (more adds than dels) — not a shrink
function makeGrowingImplFile(): ParsedFile {
  return {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 3, content: '-  return 42;' },
        { type: 'add', add: true, ln: 3, content: '+  const a = 1;' },
        { type: 'add', add: true, ln: 4, content: '+  const b = 2;' },
        { type: 'add', add: true, ln: 5, content: '+  const c = 3;' },
        { type: 'add', add: true, ln: 6, content: '+  const d = 4;' },
        { type: 'add', add: true, ln: 7, content: '+  return a + b + c + d;' },
      ],
      oldStart: 1, oldLines: 3, newStart: 1, newLines: 7,
    }],
    deleted: false,
    new: false,
  };
}

// A diff where a TEST file has body shrink + return null. RH005 treats test files as
// self-mock candidates only, not gutted-return candidates.
function makeGuttedTestFile(): ParsedFile {
  return {
    from: 'tests/calculator.test.ts',
    to: 'tests/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 3, content: '-  const a = doSomething();' },
        { type: 'del', del: true, ln: 4, content: '-  const b = doSomethingElse(a);' },
        { type: 'del', del: true, ln: 5, content: '-  const c = transform(b);' },
        { type: 'del', del: true, ln: 6, content: '-  const d = finalize(c);' },
        { type: 'del', del: true, ln: 7, content: '-  return d;' },
        { type: 'add', add: true, ln: 3, content: '+  return null;' },
      ],
      oldStart: 1, oldLines: 7, newStart: 1, newLines: 3,
    }],
    deleted: false,
    new: false,
  };
}

// A diff where body shrinks but the add is a real return (not null/undefined/pass) — a
// legitimate refactor to a concise implementation (near-miss).
function makeRealReturnImplFile(): ParsedFile {
  return {
    from: 'src/calculator.ts',
    to: 'src/calculator.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'del', del: true, ln: 3, content: '-  const a = doSomething();' },
        { type: 'del', del: true, ln: 4, content: '-  const b = doSomethingElse(a);' },
        { type: 'del', del: true, ln: 5, content: '-  const c = transform(b);' },
        { type: 'del', del: true, ln: 6, content: '-  const d = finalize(c);' },
        { type: 'del', del: true, ln: 7, content: '-  return d;' },
        { type: 'add', add: true, ln: 3, content: '+  return 42;' },
      ],
      oldStart: 1, oldLines: 7, newStart: 1, newLines: 3,
    }],
    deleted: false,
    new: false,
  };
}

function makeSelfMockFile(mockPath = './calculator'): ParsedFile {
  return {
    from: 'src/calculator.test.ts',
    to: 'src/calculator.test.ts',
    chunks: [{
      content: '',
      changes: [
        { type: 'add', add: true, ln: 2, content: `+jest.mock('${mockPath}');` },
      ],
      oldStart: 1, oldLines: 0, newStart: 2, newLines: 1,
    }],
    deleted: false,
    new: false,
  };
}

describe('rh005 — gutted function detection (deterministic core)', () => {
  it('flags a gutted return with no AI when the diff shows a clear prior computation', async () => {
    const ctx: Context = { ...baseCtx, files: [makeGuttedImplFile()], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH005');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].line).toBe(3);
  });

  it('the deterministic finding is unaffected by AI settings', async () => {
    const ctx: Context = { ...baseCtx, files: [makeGuttedImplFile()], aiEnabled: true, judge: mockJudge(false) };
    const findings = await rh005.run(ctx);
    expect(findings.length).toBe(1);
  });

  it('returns [] when body grows (more adds than dels)', async () => {
    const ctx: Context = { ...baseCtx, files: [makeGrowingImplFile()], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] for a test file gutted-return pattern (only self-mock is checked in test files)', async () => {
    const ctx: Context = { ...baseCtx, files: [makeGuttedTestFile()], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when body shrinks but add is a real return value — legitimate refactor (near-miss)', async () => {
    const ctx: Context = { ...baseCtx, files: [makeRealReturnImplFile()], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });

  it('flags a test file that self-mocks the exact module it is testing', async () => {
    const ctx: Context = { ...baseCtx, files: [makeSelfMockFile('./calculator')], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH005');
    expect(findings[0].message).toContain('./calculator');
  });

  it('returns [] when a test file mocks an unrelated module (legitimate dependency mock)', async () => {
    const ctx: Context = { ...baseCtx, files: [makeSelfMockFile('./api-client')], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });
});

describe('rh005 — AI-gated fuzzy path (ambiguous gutting, no clear prior computation)', () => {
  it('returns [] when aiEnabled is false, even though a gutted return exists', async () => {
    const ctx: Context = { ...baseCtx, files: [makeAmbiguousGuttedFile()], aiEnabled: false, judge: undefined };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });

  it('returns a finding when judge=true', async () => {
    const ctx: Context = { ...baseCtx, files: [makeAmbiguousGuttedFile()], aiEnabled: true, judge: mockJudge(true) };
    const findings = await rh005.run(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH005');
  });

  it('returns [] when judge returns false (not a cheat)', async () => {
    const ctx: Context = { ...baseCtx, files: [makeAmbiguousGuttedFile()], aiEnabled: true, judge: mockJudge(false) };
    const findings = await rh005.run(ctx);
    expect(findings).toEqual([]);
  });
});
