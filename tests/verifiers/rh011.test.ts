import { describe, it, expect } from 'vitest';
import { rh011 } from '../../src/verifiers/rh011.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH011'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

function fileWithLines(lines: string[]): ParsedFile[] {
  return [{
    from: 'src/parser.ts',
    to: 'src/parser.ts',
    chunks: [{
      content: '',
      changes: lines.map((content, i) => ({ type: 'add' as const, add: true, ln: i + 1, content })),
      oldStart: 1, oldLines: 0, newStart: 1, newLines: lines.length,
    }],
    deleted: false,
    new: false,
  }];
}

describe('rh011 — type/lint silencing spam detection', () => {
  it('flags 2+ suppression comments added in the same change', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // @ts-ignore', '+  const x = 1;', '+  // @ts-ignore', '+  const y = 2;']),
    });
    expect(findings.length).toBe(2);
    expect(findings[0].verifierId).toBe('RH011');
    expect(findings[0].severity).toBe('warn');
  });

  it('returns [] for a single suppression comment (near-miss — often legitimate)', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines([
        '+  // @ts-ignore -- third-party lib has no types for this overload (see #482)',
        '+  const x = 1;',
      ]),
    });
    expect(findings).toEqual([]);
  });

  it('counts across eslint-disable, # type: ignore, and # noqa together', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // eslint-disable-next-line no-unused-vars', '+x = compute()  # type: ignore']),
    });
    expect(findings.length).toBe(2);
  });

  it('counts suppressions across multiple files in the same diff', () => {
    const files: ParsedFile[] = [
      { from: 'src/a.ts', to: 'src/a.ts', chunks: [{ content: '', changes: [{ type: 'add', add: true, ln: 1, content: '+// @ts-ignore' }], oldStart: 1, oldLines: 0, newStart: 1, newLines: 1 }], deleted: false, new: false },
      { from: 'src/b.py', to: 'src/b.py', chunks: [{ content: '', changes: [{ type: 'add', add: true, ln: 1, content: '+x = 1  # noqa' }], oldStart: 1, oldLines: 0, newStart: 1, newLines: 1 }], deleted: false, new: false },
    ];
    const findings = rh011.run({ ...baseCtx, files });
    expect(findings.length).toBe(2);
  });
});
