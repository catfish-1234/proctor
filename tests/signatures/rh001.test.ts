import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh001 } from '../../src/signatures/rh001.js';
import type { RepoContext } from '../../src/types.js';
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

const ctx: RepoContext = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH001'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

describe('rh001 — test deletion', () => {
  it('detects deleted test function from fixture diff (path 2)', () => {
    const files = fixtureDiff('RH001', 'calculator.test.ts');
    const findings = rh001(files, ctx);
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
    expect(rh001(files, ctx)).toEqual([]);
  });

  it('detects rename that drops test extension (path 3)', () => {
    const files: ParsedFile[] = [{
      from: 'util.test.ts',
      to: 'util.ts',
      chunks: [],
      deleted: false, new: false,
    }];
    const findings = rh001(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH001');
    expect(findings[0].line).toBe(1);
  });

  it('detects deleted test file (path 1)', () => {
    const files: ParsedFile[] = [{
      from: 'calculator.test.ts',
      to: undefined,
      chunks: [],
      deleted: true, new: false,
    }];
    const findings = rh001(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH001');
    expect(findings[0].line).toBe(1);
  });
});
