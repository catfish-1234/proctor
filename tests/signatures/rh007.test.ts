import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh007 } from '../../src/signatures/rh007.js';
import type { RepoContext } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

function fixtureDiff(ruleId: string, filename: string): ParsedFile[] {
  const beforePath = path.join(FIXTURES_DIR, ruleId, 'before', filename);
  const afterPath = path.join(FIXTURES_DIR, ruleId, 'after', filename);
  const result = spawnSync('git', ['diff', '--no-index', '--', beforePath, afterPath], { encoding: 'utf8' });
  return parseDiff(result.stdout);
}

const ctx: RepoContext = {
  cwd: '',
  testPathGlobs: ['**/*.test.ts'],
  testFiles: [],
  enabled: ['RH007'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

function makeAddFile(filename: string, content: string, ln: number): ParsedFile {
  return {
    from: filename,
    to: filename,
    chunks: [{
      content: '',
      changes: [{ type: 'add', add: true, ln, content }],
      oldStart: ln, oldLines: 0, newStart: ln, newLines: 1,
    }],
    deleted: false,
    new: false,
  };
}

describe('rh007 — config exclusion patterns', () => {
  it('detects testPathIgnorePatterns from fixture diff at line 2', () => {
    const files = fixtureDiff('RH007', 'jest.config.ts');
    const findings = rh007(files, ctx);
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH007', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('returns [] for non-config file with testPathIgnorePatterns', () => {
    const files = [makeAddFile('src/app.ts', '+testPathIgnorePatterns: []', 1)];
    expect(rh007(files, ctx)).toEqual([]);
  });

  it('returns [] for del change in config file', () => {
    const file: ParsedFile = {
      from: 'jest.config.ts',
      to: 'jest.config.ts',
      chunks: [{
        content: '',
        changes: [{ type: 'del', del: true, ln: 2, content: '-testPathIgnorePatterns: []' }],
        oldStart: 2, oldLines: 1, newStart: 2, newLines: 0,
      }],
      deleted: false,
      new: false,
    };
    expect(rh007([file], ctx)).toEqual([]);
  });

  it('detects "exclude": in tsconfig.json', () => {
    const files = [makeAddFile('tsconfig.json', '+"exclude": ["dist"]', 5)];
    const findings = rh007(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH007');
    expect(findings[0].line).toBe(5);
  });
});
