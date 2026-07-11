import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh001 } from '../../src/verifiers/rh001.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

function fixtureDiff(ruleId: string, filename: string): ParsedFile[] {
  const beforePath = path.join(FIXTURES_DIR, ruleId, 'before', filename);
  const afterPath = path.join(FIXTURES_DIR, ruleId, 'after', filename);
  const result = spawnSync('git', ['diff', '--no-index', '--', beforePath, afterPath], { encoding: 'utf8' });
  // git diff --no-index exits 1 when files differ — normal
  return parseDiff(result.stdout);
}

const baseCtx: Context = {
  cwd: '',
  files: [],
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH001'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

describe('rh001 — test deletion', () => {
  it('detects deleted test function from fixture diff (path 2)', () => {
    const files = fixtureDiff('RH001', 'calculator.test.ts');
    const findings = rh001.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH001', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('returns [] for a non-test file diff', () => {
    const files: ParsedFile[] = [{
      from: 'src/util.ts',
      to: 'src/util.ts',
      chunks: [{
        content: '',
        changes: [{ type: 'del', del: true, ln: 1, content: '-  const x = 1;' }],
        oldStart: 1, oldLines: 1, newStart: 1, newLines: 0,
      }],
      deleted: false, new: false,
    }];
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
  });

  it('detects rename that drops test extension (path 3)', () => {
    const files: ParsedFile[] = [{
      from: 'util.test.ts',
      to: 'util.ts',
      chunks: [],
      deleted: false, new: false,
    }];
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH001');
    expect(findings[0].line).toBe(1);
  });

  it('detects deleted test file (path 1)', () => {
    const files: ParsedFile[] = [{
      from: 'calculator.test.ts',
      to: undefined,
      chunks: [],
      deleted: true, new: false,
    }];
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH001');
    expect(findings[0].line).toBe(1);
  });

  it('path 1: suppresses when the implementation file is deleted in the same diff (coordinated feature removal)', () => {
    const files: ParsedFile[] = [
      { from: 'legacyExport.test.ts', to: undefined, chunks: [], deleted: true, new: false },
      { from: 'src/legacyExport.ts', to: undefined, chunks: [], deleted: true, new: false },
    ];
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
  });

  it('path 1: still flags when the test file is deleted alone (no corresponding impl deletion)', () => {
    const files: ParsedFile[] = [
      { from: 'legacyExport.test.ts', to: undefined, chunks: [], deleted: true, new: false },
      { from: 'src/unrelated.ts', to: undefined, chunks: [], deleted: true, new: false },
    ];
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
  });

  it('path 1: still flags when the only other deleted file is itself a test file (no impl co-deletion)', () => {
    const files: ParsedFile[] = [
      { from: 'legacyExport.test.ts', to: undefined, chunks: [], deleted: true, new: false },
      { from: 'otherThing.test.ts', to: undefined, chunks: [], deleted: true, new: false },
    ];
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(2); // both are test files deleted alone — both flag
  });
});

describe('rh001 — path 2 add/del reconciliation (renames, reformats, .skip wraps, .each consolidation)', () => {
  function makeFile(changes: ParsedFile['chunks'][number]['changes']): ParsedFile[] {
    return [{
      from: 'calculator.test.ts',
      to: 'calculator.test.ts',
      chunks: [{ content: '', changes, oldStart: 1, oldLines: changes.length, newStart: 1, newLines: changes.length }],
      deleted: false,
      new: false,
    }];
  }

  it('suppresses a pure rename (different title, same chunk)', () => {
    const files = makeFile([
      { type: 'del', del: true, ln: 5, content: "-  it('adds two numbers', () => {" },
      { type: 'add', add: true, ln: 5, content: "+  it('returns the sum of two numbers', () => {" },
    ]);
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
  });

  it('suppresses a .skip() wrap (RH003 is the correct verifier for this, not RH001)', () => {
    const files = makeFile([
      { type: 'del', del: true, ln: 5, content: "-  it('adds two numbers', () => {" },
      { type: 'add', add: true, ln: 5, content: "+  it.skip('adds two numbers', () => {" },
    ]);
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
  });

  it('suppresses all deletions in an .each() consolidation (3 dels : 1 add)', () => {
    const files = makeFile([
      { type: 'del', del: true, ln: 5, content: "-  it('clamps below min', () => {" },
      { type: 'del', del: true, ln: 8, content: "-  it('clamps above max', () => {" },
      { type: 'del', del: true, ln: 11, content: "-  it('passes through in-range values', () => {" },
      { type: 'add', add: true, ln: 5, content: "+  it.each([[1, 2], [3, 4]])('clamp(%i)', (n) => {" },
    ]);
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
  });

  it('still flags a genuine deletion with no reconciling add in the same chunk', () => {
    const files = makeFile([
      { type: 'del', del: true, ln: 5, content: "-  it('handles a whitespace-only input', () => {" },
    ]);
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
  });

  it('flags deletion of a modifier-form test (test.each) with no reconciling add', () => {
    const files = makeFile([
      { type: 'del', del: true, ln: 5, content: "-  test.each([[1, 2], [3, 4]])('adds %i and %i', (a, b) => {" },
    ]);
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH001');
  });

  it('Python: suppresses a renamed test function', () => {
    const files: ParsedFile[] = [{
      from: 'test_shipping.py',
      to: 'test_shipping.py',
      chunks: [{
        content: '',
        changes: [
          { type: 'del', del: true, ln: 3, content: '-def test_light_package():' },
          { type: 'add', add: true, ln: 3, content: '+def test_light_package_uses_flat_rate():' },
        ],
        oldStart: 3, oldLines: 1, newStart: 3, newLines: 1,
      }],
      deleted: false,
      new: false,
    }];
    expect(rh001.run({ ...baseCtx, files, isTestFile: () => true })).toEqual([]);
  });
});
