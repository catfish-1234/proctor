import { describe, it, expect } from 'vitest';
import { rh006 } from '../../src/signatures/rh006.js';
import type { RepoContext } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

// Base ctx — RH006 only; use tight snapshotGlobs to avoid Pitfall 7
// (default glob includes **/__fixtures__/** which matches fixtures/ dir)
const ctx: RepoContext = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH006'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
  commitMessage: undefined,
  snapshotGlobs: ['**/__snapshots__/*.snap'],  // tight glob — avoids fixture path collision
};

function makeSnapFile(filePath: string, ln = 5): ParsedFile {
  return {
    from: filePath,
    to: filePath,
    chunks: [{
      content: '',
      changes: [{ type: 'add', add: true, ln, content: '+exports[`Button renders 1`] = `<div/>`;' }],
      oldStart: ln, oldLines: 0, newStart: ln, newLines: 1,
    }],
    deleted: false,
    new: false,
  };
}

describe('rh006 — snapshot rewrite detection', () => {
  it('returns one warn finding for __snapshots__/*.snap with no commit message', () => {
    const files = [makeSnapFile('src/__snapshots__/Button.test.ts.snap')];
    const findings = rh006(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH006');
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.line).toBe(5);
  });

  it('returns [] when commit message contains "regenerate" keyword', () => {
    const files = [makeSnapFile('src/__snapshots__/Button.test.ts.snap')];
    const findings = rh006(files, { ...ctx, commitMessage: 'regenerate snapshots' });
    expect(findings).toEqual([]);
  });

  it('returns [] when commit message contains "intentional" keyword', () => {
    const files = [makeSnapFile('src/__snapshots__/Button.test.ts.snap')];
    const findings = rh006(files, { ...ctx, commitMessage: 'update snapshot intentional' });
    expect(findings).toEqual([]);
  });

  it('returns a finding when commit message does not contain any keyword', () => {
    const files = [makeSnapFile('src/__snapshots__/Button.test.ts.snap')];
    const findings = rh006(files, { ...ctx, commitMessage: 'fix bug in auth logic' });
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH006');
  });

  it('returns [] when file is not a snapshot file (src/auth.ts with no commit message)', () => {
    const files = [makeSnapFile('src/auth.ts')];
    const findings = rh006(files, ctx);
    expect(findings).toEqual([]);
  });

  it('returns [] when custom snapshotGlobs does not match golden/ path', () => {
    const files = [makeSnapFile('golden/output.json')];
    // snapshotGlobs only matches __snapshots__/*.snap — golden/ is excluded
    const findings = rh006(files, { ...ctx, snapshotGlobs: ['**/__snapshots__/*.snap'] });
    expect(findings).toEqual([]);
  });

  it('returns a finding for __fixtures__/data.json when default globs are used (no custom snapshotGlobs)', () => {
    const files = [makeSnapFile('src/__fixtures__/data.json')];
    // Override ctx to use default globs (snapshotGlobs: undefined)
    const findings = rh006(files, { ...ctx, snapshotGlobs: undefined });
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH006');
  });
});
