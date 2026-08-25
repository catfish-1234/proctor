import { describe, it, expect } from 'vitest';
import { rh013 } from '../../src/verifiers/rh013.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const baseCtx: Omit<Context, 'files'> = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH013'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

type Line = [type: 'add' | 'del' | 'normal', content: string];

function diffFile(filename: string, lines: Line[]): ParsedFile {
  return {
    from: filename,
    to: filename,
    chunks: [
      {
        content: '',
        changes: lines.map(([type, content], i) => ({
          type,
          [type === 'add' ? 'add' : type === 'del' ? 'del' : 'normal']: true,
          ln: i + 1,
          content,
        })) as ParsedFile['chunks'][number]['changes'],
        oldStart: 1,
        oldLines: lines.length,
        newStart: 1,
        newLines: lines.length,
      },
    ],
    deleted: false,
    new: false,
    index: [],
    deletions: 0,
    additions: 0,
  } as ParsedFile;
}

const check = (file: ParsedFile) => rh013.run({ ...baseCtx, files: [file] });

describe('RH013, coverage gate weakened', () => {
  it('flags a threshold that moved down', () => {
    const findings = check(
      diffFile('vitest.config.ts', [
        ['del', '-        lines: 90,'],
        ['add', '+        lines: 40,'],
      ])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('lowered from 90 to 40');
  });

  it("flags Python's fail_under being lowered", () => {
    const findings = check(
      diffFile('.coveragerc', [
        ['del', '-fail_under = 85'],
        ['add', '+fail_under = 50'],
      ])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('fail_under');
  });

  it('flags a threshold deleted outright, since nothing enforces a floor afterwards', () => {
    const findings = check(diffFile('.coveragerc', [['del', '-fail_under = 85']]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('nothing enforces a coverage floor');
  });

  it('stays silent when a threshold is raised', () => {
    // This is the change the check wants people to make.
    const findings = check(
      diffFile('vitest.config.ts', [
        ['del', '-        lines: 40,'],
        ['add', '+        lines: 90,'],
      ])
    );
    expect(findings).toEqual([]);
  });

  it('stays silent when a threshold is added where none existed', () => {
    const findings = check(diffFile('.coveragerc', [['add', '+fail_under = 80']]));
    expect(findings).toEqual([]);
  });

  it('stays silent on an unchanged threshold', () => {
    const findings = check(
      diffFile('vitest.config.ts', [
        ['del', '-        lines: 90,'],
        ['add', '+        lines: 90,'],
      ])
    );
    expect(findings).toEqual([]);
  });

  it('pairs by key name, so a reordered config still compares like for like', () => {
    // Positional pairing would compare branches against lines here and report a phantom drop.
    const findings = check(
      diffFile('vitest.config.ts', [
        ['del', '-        lines: 90,'],
        ['del', '-        branches: 40,'],
        ['add', '+        branches: 40,'],
        ['add', '+        lines: 90,'],
      ])
    );
    expect(findings).toEqual([]);
  });

  it('ignores files that are not project config', () => {
    const findings = check(
      diffFile('src/report.ts', [
        ['del', '-  const lines: 90 = x;'],
        ['add', '+  const lines: 40 = x;'],
      ])
    );
    expect(findings).toEqual([]);
  });

  it.each([
    ['package.json'],
    ['.nycrc'],
    ['setup.cfg'],
    ['pyproject.toml'],
    ['tox.ini'],
    ['codecov.yml'],
  ])('reads %s as a coverage config', file => {
    expect(check(diffFile(file, [['del', '-  fail_under = 90'], ['add', '+  fail_under = 10']]))).toHaveLength(1);
  });
});

describe('RH013, JSON coverage configs', () => {
  it('sees a threshold lowered in package.json', () => {
    // `\b<key>\b\s*[:=]` required the colon immediately after the key, but JSON puts the closing
    // quote in between, so this check was silently inert on every JSON config it claims to read.
    // package.json is much the most common home for coverageThreshold.
    const findings = rh013.run({ ...baseCtx, files: [diffFile('package.json', [
      ['del', '-      "lines": 90'],
      ['add', '+      "lines": 40'],
    ])] });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('lowered from 90 to 40');
  });

  it('stays silent when a JSON threshold is raised', () => {
    expect(rh013.run({ ...baseCtx, files: [diffFile('package.json', [
      ['del', '-      "lines": 90'],
      ['add', '+      "lines": 95'],
    ])] })).toEqual([]);
  });
});
