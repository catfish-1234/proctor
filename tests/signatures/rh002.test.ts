import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/signatures/rh002.js';
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
  enabled: ['RH002'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

describe('rh002 — weakened assertion', () => {
  it('detects weakened assertion from fixture diff', () => {
    const files = fixtureDiff('RH002', 'calculator.test.ts');
    const findings = rh002(files, ctx);
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH002', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('detects toBe → toBeDefined in inline diff at correct line', () => {
    const files: ParsedFile[] = [{
      from: 'calc.test.ts',
      to: 'calc.test.ts',
      chunks: [{
        content: '',
        changes: [
          { type: 'del', del: true, ln: 5, content: '-  expect(add(1, 2)).toBe(3);' },
          { type: 'add', add: true, ln: 6, content: '+  expect(add(1, 2)).toBeDefined();' },
        ],
        oldStart: 5, oldLines: 1, newStart: 6, newLines: 1,
      }],
      deleted: false, new: false,
    }];
    const findings = rh002(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe('RH002');
    expect(findings[0].line).toBe(6);
  });

  it('returns [] for del-only hunk (no weak replacement)', () => {
    const files: ParsedFile[] = [{
      from: 'calc.test.ts',
      to: 'calc.test.ts',
      chunks: [{
        content: '',
        changes: [
          { type: 'del', del: true, ln: 5, content: '-  expect(add(1, 2)).toBe(3);' },
        ],
        oldStart: 5, oldLines: 1, newStart: 5, newLines: 0,
      }],
      deleted: false, new: false,
    }];
    expect(rh002(files, ctx)).toEqual([]);
  });
});

describe('RH002 Python tolerance-widening', () => {
  function makePythonFile(delContent: string, addContent: string, addLn = 10): ParsedFile[] {
    return [{
      from: 'test_calculator.py',
      to: 'test_calculator.py',
      chunks: [{
        content: '',
        changes: [
          { type: 'del', del: true, ln: 9, content: delContent },
          { type: 'add', add: true, ln: addLn, content: addContent },
        ],
        oldStart: 9, oldLines: 1, newStart: 10, newLines: 1,
      }],
      deleted: false,
      new: false,
    }];
  }

  it('detects assertAlmostEqual replaced with assertTrue (tolerance eliminated)', () => {
    const files = makePythonFile(
      '-        self.assertAlmostEqual(result, 3.14159, places=5)',
      '+        self.assertTrue(result > 3)',
    );
    const findings = rh002(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH002');
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.line).toBe(10);
  });

  it('detects assertAlmostEqual with reduced places= (looser tolerance)', () => {
    const files = makePythonFile(
      '-        self.assertAlmostEqual(result, 3.14, places=4)',
      '+        self.assertAlmostEqual(result, 3.14, places=2)',
    );
    const findings = rh002(files, ctx);
    expect(findings.length).toBe(1);
    expect(findings[0]!.ruleId).toBe('RH002');
  });

  it('returns [] when places= value is increased (stricter assertion — not weaker)', () => {
    const files = makePythonFile(
      '-        self.assertAlmostEqual(result, 3.14, places=2)',
      '+        self.assertAlmostEqual(result, 3.14, places=5)',
    );
    const findings = rh002(files, ctx);
    expect(findings).toEqual([]);
  });
});
