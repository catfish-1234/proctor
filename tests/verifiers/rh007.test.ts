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

describe('rh007 — new-language config exclusion + Go build-tag branch (LANG-03/LANG-06)', () => {
  const langExpected: Array<{ verifierId: string; severity: string; file: string; line: number; message: string; suggestion: string }> =
    JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH007', 'lang-expected.json'), 'utf8'));

  const cases: Array<[filename: string, label: string]> = [
    ['pom.xml', 'Maven pom.xml surefire <exclude>'],
    ['build.gradle.kts', 'Gradle excludeTestsMatching'],
    ['Cargo.toml', "Cargo.toml [[test]] test = false"],
    ['.rspec', 'RSpec --exclude-pattern'],
    ['phpunit.xml', 'PHPUnit <exclude>'],
    ['tests.runsettings', '.runsettings <TestCaseFilter>'],
    ['calculator_test.go', 'Go build-tag added to _test.go file'],
  ];

  for (const [filename, label] of cases) {
    it(`detects ${label} (${filename})`, () => {
      const expected = langExpected.find(e => e.file === filename);
      expect(expected, `no lang-expected.json entry for ${filename}`).toBeTruthy();

      const files = fixtureDiff('RH007', filename);
      const findings = rh007.run({ ...baseCtx, files });
      const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
      expect(normalised).toMatchObject([expected]);
    });
  }

  it('does NOT flag a legitimate //go:build tag added to a non-test .go file (negative fixture)', () => {
    const files = fixtureDiff('RH007/negative', 'calculator.go');
    const findings = rh007.run({ ...baseCtx, files });
    const negativeExpected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH007', 'lang-negative-expected.json'), 'utf8'));
    expect(findings).toEqual(negativeExpected);
  });

  it('does not double-fire on the Cargo.toml dependency line `ignore = "0.4"` sharing a diff with the true positive', () => {
    // Regression guard for the configLang() scoping fix: the pytest-only `ignore\s*=` pattern
    // must never match a Cargo.toml file, even though the fixture's before/after both contain a
    // real `ignore = "0.4"` dependency line (unchanged context, not part of the diff's add set).
    const files = fixtureDiff('RH007', 'Cargo.toml');
    const findings = rh007.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0]!.line).toBe(12);
  });

  it('does not flag a build tag added to a _test.go file when the identical tag line merely moved', () => {
    const file: ParsedFile = {
      from: 'calculator_test.go',
      to: 'calculator_test.go',
      chunks: [{
        content: '',
        changes: [
          { type: 'del', del: true, ln: 1, content: '-//go:build integration' },
          { type: 'normal', normal: true, ln1: 2, ln2: 1, content: '' },
          { type: 'add', add: true, ln: 2, content: '+//go:build integration' },
        ],
        oldStart: 1, oldLines: 2, newStart: 1, newLines: 2,
      }],
      deleted: false,
      new: false,
    };
    expect(rh007.run({ ...baseCtx, files: [file] })).toEqual([]);
  });
});
