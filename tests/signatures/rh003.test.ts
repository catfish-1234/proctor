import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh003 } from '../../src/signatures/rh003.js';
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
  enabled: ['RH003'],
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

describe('rh003 — skip/disable patterns', () => {
  it('detects .skip from fixture diff at line 5', () => {
    const files = fixtureDiff('RH003', 'calculator.test.ts');
    const findings = rh003(files, ctx);
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH003', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('detects it.skip on add-change at ln=5', () => {
    const files = [makeAddFile('calculator.test.ts', '+  it.skip("foo", () => {})', 5)];
    const findings = rh003(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH003');
    expect(findings[0].line).toBe(5);
  });

  it('detects it.only as scope-narrowing skip', () => {
    const files = [makeAddFile('calculator.test.ts', '+  it.only("bar", () => {})', 3)];
    const findings = rh003(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH003');
  });

  it('detects @pytest.mark.skip', () => {
    const files = [makeAddFile('test_calculator.py', '+@pytest.mark.skip', 10)];
    const findings = rh003(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH003');
  });

  it('detects @pytest.mark.skipif on an added line', () => {
    const files = [makeAddFile('test_calculator.py', '+@pytest.mark.skipif(sys.version_info < (3, 8), reason="old python")', 10)];
    const findings = rh003(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH003');
    expect(findings[0]!.severity).toBe('error');
  });

  it('does not flag del lines containing .skip', () => {
    const file: ParsedFile = {
      from: 'calculator.test.ts',
      to: 'calculator.test.ts',
      chunks: [{
        content: '',
        changes: [{ type: 'del', del: true, ln: 5, content: '-  it.skip("old", () => {})' }],
        oldStart: 5, oldLines: 1, newStart: 5, newLines: 0,
      }],
      deleted: false,
      new: false,
    };
    expect(rh003([file], ctx)).toEqual([]);
  });
});
