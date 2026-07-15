import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh011 } from '../../src/verifiers/rh011.js';
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

  // proctor-ignore: RH011 reason: planted file-wide-suppression fixture exercising the detector, not a real suppression
  it('flags a single ts-nocheck directive as a file-wide suppression', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+// @ts-nocheck']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });
});

// proctor-ignore: RH011 reason: planted fixtures exercising the detector, not real suppressions
describe('rh011 — per-language suppression-spam line-scoped detection (LANG-05)', () => {
  it('Go: two //nolint lines added trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  //nolint', '+  result := Add(2, 3)', '+  //nolint', '+  result2 := Subtract(5, 2)']),
    });
    expect(findings.length).toBe(2);
  });

  it('Go: a single //nolint line does not fire (below threshold)', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+  //nolint', '+  result := Add(2, 3)']) });
    expect(findings).toEqual([]);
  });

  it('Java: two @SuppressWarnings("unchecked") trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  @SuppressWarnings("unchecked")', '+  void a() {}', '+  @SuppressWarnings("unchecked")', '+  void b() {}']),
    });
    expect(findings.length).toBe(2);
  });

  it('Kotlin: two @Suppress("UNUSED") trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  @Suppress("UNUSED")', '+  fun a() {}', '+  @Suppress("UNUSED")', '+  fun b() {}']),
    });
    expect(findings.length).toBe(2);
  });

  it('Kotlin: a single @file:Suppress("UNUSED") is flagged unconditionally as file-wide, not double-counted as line-scoped', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+@file:Suppress("UNUSED")']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });

  it('Rust: two #[allow(dead_code)] trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+#[allow(dead_code)]', '+pub fn a() {}', '+#[allow(dead_code)]', '+pub fn b() {}']),
    });
    expect(findings.length).toBe(2);
  });

  it('Rust: a single #![allow(warnings)] is flagged unconditionally as file-wide', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+#![allow(warnings)]']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });

  it('Ruby: two # rubocop:disable lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(["+  # rubocop:disable Metrics/AbcSize", "+  it 'a' do", "+  # rubocop:disable Metrics/AbcSize", "+  it 'b' do"]),
    });
    expect(findings.length).toBe(2);
  });

  it('PHP: two // phpcs:ignore lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // phpcs:ignore', '+  return $a + $b;', '+  // phpcs:ignore', '+  return $a - $b;']),
    });
    expect(findings.length).toBe(2);
  });

  it('PHP: a single // phpcs:ignoreFile is flagged unconditionally as file-wide, not double-counted as line-scoped', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+// phpcs:ignoreFile']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });

  it('C#: two #pragma warning disable lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+#pragma warning disable CS1234', '+return a + b;', '+#pragma warning disable CS1234', '+return a - b;']),
    });
    expect(findings.length).toBe(2);
  });
});

describe('rh011 — new-language suppression-spam fixtures (LANG-06)', () => {
  const expected: Array<{ file: string; line: number }> = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, 'RH011', 'lang-expected.json'), 'utf8'),
  );

  const NEW_LANG_FIXTURES = [
    'calculator_test.go',
    'CalculatorTest.java',
    'calculator.rs',
    'calculator_spec.rb',
    'Calculator.php',
    'Calculator.cs',
    'Calculator.kt',
  ];

  it.each(NEW_LANG_FIXTURES)('%s: fixture diff yields the two expected RH011 findings', (filename) => {
    // Fixtures live under fixtures/RH011/lang/{before,after}/ (not the flat before/after/ used
    // by parser.ts) so this whole-directory diff doesn't get swept into fixtures-p3.test.ts's
    // RH011 true-positive assertion, which diffs fixtures/RH011/before vs fixtures/RH011/after
    // directly and would otherwise count suppressions across all 8 files in one diff instead of
    // per-language. Mirrors the existing fixtures/RH011/negative/{before,after}/ convention.
    const files = fixtureDiff('RH011/lang', filename);
    const findings = rh011.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expectedEntries = expected.filter(e => e.file === filename);
    expect(expectedEntries.length).toBe(2);
    expect(normalised).toEqual(expect.arrayContaining(expectedEntries));
    expect(normalised.length).toBe(2);
  });
});
