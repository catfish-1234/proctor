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

// proctor-ignore: RH011 reason: planted fixtures exercising the detector, not real suppressions
describe('rh011 — GROUP A suppression-spam line-scoped + file-wide detection (LANG-12, LANG-13)', () => {
  it('C/C++/Objective-C: two // NOLINT lines added in one file trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // NOLINT', '+  result = Add(2, 3);', '+  // NOLINT', '+  result2 = Subtract(5, 2);']),
    });
    expect(findings.length).toBe(2);
  });

  it('C/C++/Objective-C: // NOLINTNEXTLINE and // NOLINTBEGIN both count as line-scoped', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // NOLINTNEXTLINE(readability)', '+  int x = 1;', '+  // NOLINTBEGIN(readability)', '+  int y = 2;']),
    });
    expect(findings.length).toBe(2);
  });

  it('C/C++/Objective-C: a single // NOLINT line does not fire (below threshold)', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+  // NOLINT', '+  int x = 1;']) });
    expect(findings).toEqual([]);
  });

  it('C/C++/Objective-C: two #pragma clang diagnostic ignored lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines([
        '+#pragma clang diagnostic ignored "-Wunused-variable"',
        '+int x = 1;',
        '+#pragma clang diagnostic ignored "-Wunused-variable"',
        '+int y = 2;',
      ]),
    });
    expect(findings.length).toBe(2);
  });

  it('C: two // cppcheck-suppress lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // cppcheck-suppress unusedVariable', '+  int x = 1;', '+  // cppcheck-suppress unusedVariable', '+  int y = 2;']),
    });
    expect(findings.length).toBe(2);
  });

  it('Swift: two // swiftlint:disable lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines([
        '+  // swiftlint:disable force_cast',
        '+  let x = a as! Int',
        '+  // swiftlint:disable:next force_cast',
        '+  let y = b as! Int',
      ]),
    });
    expect(findings.length).toBe(2);
  });

  it('Swift: a single // swiftlint:disable all fires unconditionally as file-wide, not double-counted as line-scoped', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+// swiftlint:disable all']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });

  it('Swift: a line-scoped // swiftlint:disable:next does NOT double-count as file-wide', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+  // swiftlint:disable:next force_cast', '+  let x = a as! Int']) });
    // Only 1 occurrence, below SPAM_THRESHOLD (2) — must be [] (proves it did not get classified
    // as the unconditional file-wide finding, which would return length 1 with a "File-wide" message).
    expect(findings).toEqual([]);
  });

  it('Dart: two // ignore: lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  // ignore: unused_local_variable', '+  var x = 1;', '+  // ignore: unused_local_variable', '+  var y = 2;']),
    });
    expect(findings.length).toBe(2);
  });

  it('Dart: a single // ignore_for_file: fires unconditionally as file-wide, not double-counted as line-scoped', () => {
    const findings = rh011.run({ ...baseCtx, files: fileWithLines(['+// ignore_for_file: unused_local_variable']) });
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain('File-wide');
  });

  it('Scala: two @SuppressWarnings(...) lines reuse the existing Java pattern with zero new code', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  @SuppressWarnings(Array("unchecked"))', '+  def a(): Unit = {}', '+  @SuppressWarnings(Array("unchecked"))', '+  def b(): Unit = {}']),
    });
    expect(findings.length).toBe(2);
  });

  it('Scala: two @nowarn lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  @nowarn("cat=deprecation")', '+  def a(): Unit = {}', '+  @nowarn("cat=deprecation")', '+  def b(): Unit = {}']),
    });
    expect(findings.length).toBe(2);
  });

  it('Scala: two // scalafix:ok lines trip the spam threshold', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+  val a = 1 // scalafix:ok', '+  val b = 2 // scalafix:ok']),
    });
    expect(findings.length).toBe(2);
  });

  it('Groovy: two @SuppressWarnings(...) lines added to a .groovy file reuse the existing Java pattern with zero new code (reuse proof)', () => {
    const files: ParsedFile[] = [{
      from: 'src/test/groovy/CalculatorSpec.groovy',
      to: 'src/test/groovy/CalculatorSpec.groovy',
      chunks: [{
        content: '',
        changes: [
          { type: 'add', add: true, ln: 1, content: '+  @SuppressWarnings("unchecked")' },
          { type: 'add', add: true, ln: 2, content: '+  def a() {}' },
          { type: 'add', add: true, ln: 3, content: '+  @SuppressWarnings("unchecked")' },
          { type: 'add', add: true, ln: 4, content: '+  def b() {}' },
        ],
        oldStart: 1, oldLines: 0, newStart: 1, newLines: 4,
      }],
      deleted: false,
      new: false,
    }];
    const findings = rh011.run({ ...baseCtx, files });
    expect(findings.length).toBe(2);
    expect(findings.every(f => f.file.endsWith('.groovy'))).toBe(true);
  });

  it('VB.NET: two #Disable Warning lines trip the spam threshold (genuinely new token, distinct from C# pragma)', () => {
    const findings = rh011.run({
      ...baseCtx,
      files: fileWithLines(['+#Disable Warning CA1234', '+Return a + b', '+#Disable Warning CA1234', '+Return a - b']),
    });
    expect(findings.length).toBe(2);
  });

  it('VB.NET: #Disable Warning does NOT trigger the C# #pragma warning disable pattern spuriously, and vice versa', () => {
    // Confirms the two patterns are genuinely distinct tokens, not accidental substring overlap.
    expect(/#pragma\s+warning\s+disable\b/.test('#Disable Warning CA1234')).toBe(false);
    expect(/#Disable\s+Warning\b/.test('#pragma warning disable CS1234')).toBe(false);
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

describe('rh011 — GROUP A new-language suppression-spam fixtures (LANG-12, LANG-13)', () => {
  // Fixtures live under fixtures/RH011/lang2/{before,after}/ — a distinct subdirectory from
  // Phase 8's fixtures/RH011/lang/ (LANG-06/07) so this diff doesn't collide with either the
  // flat fixtures/RH011/before-vs-after true-positive assertion in fixtures-p3.test.ts, or with
  // Phase 8's lang/ fixtures, per 08.1-RESEARCH.md's Wave 0 Gaps note and the 08-05 collision
  // precedent.
  const expected: Array<{ file: string; line: number; message: string }> = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, 'RH011', 'lang2-expected.json'), 'utf8'),
  );

  const LINE_SCOPED_FIXTURES = [
    'Calculator.cpp',
    'Calculator.c',
    'Calculator.m',
    'Calculator.swift',
    'Calculator.dart',
    'Calculator.scala',
    'CalculatorSpec.groovy',
    'Calculator.vb',
  ];

  it.each(LINE_SCOPED_FIXTURES)('%s: fixture diff yields exactly the two expected line-scoped RH011 findings', (filename) => {
    const files = fixtureDiff('RH011/lang2', filename);
    const findings = rh011.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expectedEntries = expected.filter(e => e.file === filename);
    expect(expectedEntries.length).toBe(2);
    expect(normalised).toEqual(expect.arrayContaining(expectedEntries));
    expect(normalised.length).toBe(2);
  });

  const FILEWIDE_FIXTURES = ['CalculatorFilewide.swift', 'CalculatorFilewide.dart'];

  it.each(FILEWIDE_FIXTURES)('%s: fixture diff yields exactly the one expected unconditional file-wide RH011 finding', (filename) => {
    const files = fixtureDiff('RH011/lang2', filename);
    const findings = rh011.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expectedEntries = expected.filter(e => e.file === filename);
    expect(expectedEntries.length).toBe(1);
    expect(normalised).toEqual(expectedEntries);
    expect(normalised[0].message).toContain('File-wide');
  });

  it('CalculatorSpec.groovy: the .groovy reuse fixture yields exactly its two @SuppressWarnings findings with no new code (reuse proof)', () => {
    const files = fixtureDiff('RH011/lang2', 'CalculatorSpec.groovy');
    const findings = rh011.run({ ...baseCtx, files });
    expect(findings.length).toBe(2);
    expect(findings.every(f => f.file.endsWith('.groovy'))).toBe(true);
  });
});
