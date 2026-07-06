import { describe, it, expect } from 'vitest';
import { rh005 } from '../../src/signatures/rh005.js';
import type { RepoContext } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

function mockJudge(result: boolean) {
  return { judge: async () => result };
}

const baseCtx: RepoContext = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH005'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
  aiEnabled: false,
  judge: undefined,
};

// A diff where impl file has body shrink: 5 dels, 1 add which is 'return null;'
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

// A diff where a TEST file has body shrink + return null (should be skipped per D-13)
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

// A diff where body shrinks but the add is a real return (not null/undefined/pass)
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
        // This add returns a real value (42), NOT null/undefined/pass
        { type: 'add', add: true, ln: 3, content: '+  return 42;' },
      ],
      oldStart: 1, oldLines: 7, newStart: 1, newLines: 3,
    }],
    deleted: false,
    new: false,
  };
}

describe('rh005 — gutted function detection', () => {
  it('returns [] when aiEnabled is false, even if heuristic would find body-shrink candidates', async () => {
    const ctx: RepoContext = { ...baseCtx, aiEnabled: false, judge: undefined };
    const findings = await rh005([makeGuttedImplFile()], ctx);
    expect(findings).toEqual([]);
  });

  it('returns a finding when judge=true, body shrinks with return null', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh005([makeGuttedImplFile()], ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH005');
    expect(findings[0].severity).toBe('error');
  });

  it('returns [] when body grows (more adds than dels)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh005([makeGrowingImplFile()], ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] for a test file even if body shrinks (D-13: only impl files)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh005([makeGuttedTestFile()], ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when body shrinks but add is a real return value (not null/undefined/pass)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(true),
    };
    const findings = await rh005([makeRealReturnImplFile()], ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when judge returns false (not a cheat)', async () => {
    const ctx: RepoContext = {
      ...baseCtx,
      aiEnabled: true,
      judge: mockJudge(false),
    };
    const findings = await rh005([makeGuttedImplFile()], ctx);
    expect(findings).toEqual([]);
  });
});
