import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { basename } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import parseDiff from 'parse-diff';
import { rh001 } from '../../src/verifiers/rh001.js';
import { buildContext } from '../../src/context/index.js';
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

  it('path 1: still flags a generic-named test deletion co-deleted with a same-named impl in a DIFFERENT dir (evasion guard)', () => {
    // Deleting foo/index.test.ts and hiding it behind an unrelated bar/index.ts must not suppress.
    const files: ParsedFile[] = [
      { from: 'src/foo/index.test.ts', to: undefined, chunks: [], deleted: true, new: false },
      { from: 'src/bar/index.ts', to: undefined, chunks: [], deleted: true, new: false },
    ];
    const findings = rh001.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH001');
  });

  it('path 1: still suppresses a generic-named coordinated removal in the SAME directory', () => {
    const files: ParsedFile[] = [
      { from: 'src/foo/index.test.ts', to: undefined, chunks: [], deleted: true, new: false },
      { from: 'src/foo/index.ts', to: undefined, chunks: [], deleted: true, new: false },
    ];
    expect(rh001.run({ ...baseCtx, files })).toEqual([]);
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

describe('rh001 — new-language whole-file deletion (LANG-06)', () => {
  // One genuine, language-idiomatic test file per new language planted under
  // fixtures/RH001/before/. No after/ counterpart — these represent a whole test file being
  // deleted (Path 1), matching the RH001 scoping decision in 08-01-PLAN.md (no new detection
  // code; relies entirely on isTestFile recognizing the extended DEFAULT_GLOBS from Task 1).
  // relPath is relative to fixtures/RH001/before/. Rust lives under a tests/ subdirectory,
  // mirroring Cargo's real integration-test convention (crate_root/tests/*.rs) — this is also
  // the only path shape the extended DEFAULT_GLOBS glob (**/tests/**/*.rs) recognizes, since a
  // bare top-level *_test.rs has no reliable glob per RESEARCH's documented Rust gap.
  const NEW_LANG_FIXTURES = [
    { filename: 'calculator_test.go', relPath: 'calculator_test.go' },
    { filename: 'CalculatorTest.java', relPath: 'CalculatorTest.java' },
    { filename: 'calculator_test.rs', relPath: 'tests/calculator_test.rs' },
    { filename: 'calculator_spec.rb', relPath: 'calculator_spec.rb' },
    { filename: 'CalculatorTest.php', relPath: 'CalculatorTest.php' },
    { filename: 'CalculatorTests.cs', relPath: 'CalculatorTests.cs' },
    { filename: 'CalculatorTest.kt', relPath: 'CalculatorTest.kt' },
  ];

  let tmpDir: string;
  let realIsTestFile: Context['isTestFile'];

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'proctor-rh001-lang-'));
    // Use the real extended DEFAULT_GLOBS (via buildContext, no config file present) so this
    // test proves Path 1 fires off the actual Task 1 glob extension, not a hand-rolled stand-in.
    const realCtx = await buildContext(tmpDir, []);
    realIsTestFile = realCtx.isTestFile;
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('recognizes each new-language fixture as a test file via the extended DEFAULT_GLOBS', () => {
    for (const { relPath } of NEW_LANG_FIXTURES) {
      expect(realIsTestFile(`fixtures/RH001/before/${relPath}`)).toBe(true);
    }
  });

  it('deleting any one new-language test file alone yields exactly one RH001 error at line 1', () => {
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH001', 'lang-expected.json'), 'utf8'));

    for (const { filename, relPath } of NEW_LANG_FIXTURES) {
      const filePath = `fixtures/RH001/before/${relPath}`;
      const files: ParsedFile[] = [{
        from: filePath,
        to: undefined,
        chunks: [],
        deleted: true,
        new: false,
      }];
      const findings = rh001.run({ ...baseCtx, files, isTestFile: realIsTestFile });
      const normalised = findings.map(f => ({ ...f, file: basename(f.file) }));
      const expectedEntry = expected.find((e: { file: string }) => e.file === filename);
      expect(normalised).toEqual([expectedEntry]);
    }
  });
});

describe('rh001 — new-language whole-file deletion (LANG-13)', () => {
  // 16 more genuine, language-idiomatic test files planted under fixtures/RH001/before/ for
  // Phase 8.1's language expansion (08.1-02-PLAN.md). Same Path 1 whole-file-deletion shape as
  // the LANG-06 block above — no new detection code, coverage comes entirely from plan 08.1-01's
  // DEFAULT_GLOBS extension. relPath is relative to fixtures/RH001/before/. Dart, Haskell,
  // Elixir, Clojure, and Julia live under test/ (their tool's documented discovery convention);
  // Perl lives under t/ (prove's default t/*.t glob); R lives under tests/testthat/
  // (testthat's package-test-directory convention).
  const NEW_LANG_FIXTURES_II = [
    { filename: 'calculator_test.cpp', relPath: 'calculator_test.cpp' },
    { filename: 'calculator_test.c', relPath: 'calculator_test.c' },
    { filename: 'CalculatorTests.swift', relPath: 'CalculatorTests.swift' },
    { filename: 'CalculatorTests.m', relPath: 'CalculatorTests.m' },
    { filename: 'calculator_test.dart', relPath: 'test/calculator_test.dart' },
    { filename: 'CalculatorSpec.scala', relPath: 'CalculatorSpec.scala' },
    { filename: 'CalculatorSpec.groovy', relPath: 'CalculatorSpec.groovy' },
    { filename: 'CalculatorTests.vb', relPath: 'CalculatorTests.vb' },
    { filename: 'calculator.t', relPath: 't/calculator.t' },
    { filename: 'test-calculator.R', relPath: 'tests/testthat/test-calculator.R' },
    { filename: 'CalculatorSpec.hs', relPath: 'test/CalculatorSpec.hs' },
    { filename: 'calculator_test.exs', relPath: 'test/calculator_test.exs' },
    { filename: 'calculator_spec.lua', relPath: 'calculator_spec.lua' },
    { filename: 'calculator_test.clj', relPath: 'test/calculator_test.clj' },
    { filename: 'calculator_test.bats', relPath: 'calculator_test.bats' },
    { filename: 'runtests.jl', relPath: 'test/runtests.jl' },
  ];

  let tmpDirII: string;
  let realIsTestFileII: Context['isTestFile'];

  beforeEach(async () => {
    tmpDirII = await mkdtemp(join(tmpdir(), 'proctor-rh001-langii-'));
    // Use the real extended DEFAULT_GLOBS (via buildContext, no config file present) so this
    // test proves Path 1 fires off the actual 08.1-01 glob extension, not a hand-rolled stand-in.
    const realCtx = await buildContext(tmpDirII, []);
    realIsTestFileII = realCtx.isTestFile;
  });

  afterEach(async () => {
    await rm(tmpDirII, { recursive: true, force: true });
  });

  it('recognizes each of the 16 new-language fixtures as a test file via the extended DEFAULT_GLOBS', () => {
    for (const { relPath } of NEW_LANG_FIXTURES_II) {
      expect(realIsTestFileII(`fixtures/RH001/before/${relPath}`)).toBe(true);
    }
  });

  it.each(NEW_LANG_FIXTURES_II)('deleting $filename alone yields exactly one RH001 error at line 1', ({ filename, relPath }) => {
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH001', 'langii-expected.json'), 'utf8'));
    const filePath = `fixtures/RH001/before/${relPath}`;
    const files: ParsedFile[] = [{
      from: filePath,
      to: undefined,
      chunks: [],
      deleted: true,
      new: false,
    }];
    const findings = rh001.run({ ...baseCtx, files, isTestFile: realIsTestFileII });
    const normalised = findings.map(f => ({ ...f, file: basename(f.file) }));
    const expectedEntry = expected.find((e: { file: string }) => e.file === filename);
    expect(normalised).toEqual([expectedEntry]);
  });
});
