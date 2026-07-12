import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh007 } from '../../src/verifiers/rh007.js';
import type { Context } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures');

function fixtureDiff(ruleId: string, filename: string): ParsedFile[] {
  const beforePath = path.join(FIXTURES_DIR, ruleId, 'before', filename);
  const afterPath = path.join(FIXTURES_DIR, ruleId, 'after', filename);
  const result = spawnSync('git', ['diff', '--no-index', '--', beforePath, afterPath], { encoding: 'utf8' });
  return parseDiff(result.stdout);
}

const baseCtx: Context = {
  cwd: '',
  files: [],
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
    const findings = rh007.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH007', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('returns [] for non-config file with testPathIgnorePatterns', () => {
    const files = [makeAddFile('src/app.ts', '+testPathIgnorePatterns: []', 1)];
    expect(rh007.run({ ...baseCtx, files })).toEqual([]);
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
    expect(rh007.run({ ...baseCtx, files: [file] })).toEqual([]);
  });

  it('detects a test-like "exclude": in tsconfig.json (warn — heuristic)', () => {
    const files = [makeAddFile('tsconfig.json', '+"exclude": ["**/*.test.ts"]', 5)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH007');
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].line).toBe(5);
  });

  it('does NOT flag a routine build "exclude": in tsconfig.json (node_modules/dist)', () => {
    const files = [makeAddFile('tsconfig.json', '+"exclude": ["node_modules", "dist"]', 5)];
    expect(rh007.run({ ...baseCtx, files })).toEqual([]);
  });

  it('detects an unquoted exclude: with a test-looking value in vitest.config.ts (warn — heuristic)', () => {
    const files = [makeAddFile('vitest.config.ts', "+    exclude: ['**/payments.test.ts'],", 8)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH007');
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].line).toBe(8);
  });

  it('does not flag an unquoted exclude: whose value is not test-like (coverage/build exclude)', () => {
    const files = [makeAddFile('vitest.config.ts', "+    exclude: ['node_modules/**'],", 8)];
    expect(rh007.run({ ...baseCtx, files })).toEqual([]);
  });

  it('flags an enforcement-key edit to proctor.config.json as a warn', () => {
    const files = [makeAddFile('proctor.config.json', '+  "enabled": [],', 2)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH007');
    expect(findings[0].severity).toBe('warn');
    expect(findings[0].message).toContain('enabled');
  });

  it('does not flag a proctor.config.json edit that touches no enforcement key', () => {
    const files = [makeAddFile('proctor.config.json', '+  "aiModel": "claude-haiku-4-5-20251001",', 2)];
    expect(rh007.run({ ...baseCtx, files })).toEqual([]);
  });

  it('detects testPathIgnorePatterns added to jest.config.json', () => {
    const files = [makeAddFile('jest.config.json', '+  "testPathIgnorePatterns": ["<rootDir>/src/broken.test.ts"],', 4)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
  });

  it('detects a test exclude added to vite.config.ts (where vitest config lives)', () => {
    const files = [makeAddFile('vite.config.ts', "+      exclude: ['**/payments.test.ts'],", 8)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
  });

  it('detects a jest testPathIgnorePatterns block added to package.json', () => {
    const files = [makeAddFile('package.json', '+    "testPathIgnorePatterns": ["broken.test.ts"],', 20)];
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].message).toContain('package.json');
  });

  it('does not flag an unrelated package.json edit', () => {
    const files = [makeAddFile('package.json', '+    "version": "1.2.3",', 3)];
    expect(rh007.run({ ...baseCtx, files })).toEqual([]);
  });

  it('does not flag an unquoted exclude: of test globs when the chunk shows coverage context', () => {
    const file: ParsedFile = {
      from: 'vitest.config.ts',
      to: 'vitest.config.ts',
      chunks: [{
        content: '',
        changes: [
          { type: 'normal', normal: true, ln1: 7, ln2: 7, content: '    coverage: {' },
          { type: 'add', add: true, ln: 8, content: "+      exclude: ['**/*.test.ts']," },
        ],
        oldStart: 7, oldLines: 1, newStart: 7, newLines: 2,
      }],
      deleted: false,
      new: false,
    };
    expect(rh007.run({ ...baseCtx, files: [file] })).toEqual([]);
  });
});
