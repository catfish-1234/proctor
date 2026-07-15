import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh003 } from '../../src/verifiers/rh003.js';
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
    const findings = rh003.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    const expected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH003', 'expected.json'), 'utf8'));
    expect(normalised).toMatchObject([expected[0]]);
  });

  it('detects it.skip on add-change at ln=5', () => {
    const files = [makeAddFile('calculator.test.ts', '+  it.skip("foo", () => {})', 5)];
    const findings = rh003.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH003');
    expect(findings[0].line).toBe(5);
  });

  it('detects it.only as scope-narrowing skip', () => {
    const files = [makeAddFile('calculator.test.ts', '+  it.only("bar", () => {})', 3)];
    const findings = rh003.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH003');
  });

  it('detects @pytest.mark.skip', () => {
    const files = [makeAddFile('test_calculator.py', '+@pytest.mark.skip', 10)];
    const findings = rh003.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH003');
  });

  it('detects @pytest.mark.skipif on an added line', () => {
    const files = [makeAddFile('test_calculator.py', '+@pytest.mark.skipif(sys.version_info < (3, 8), reason="old python")', 10)];
    const findings = rh003.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('RH003');
    expect(findings[0]!.severity).toBe('error');
  });

  it('detects a commented-out JS test', () => {
    const files = [makeAddFile('calculator.test.ts', "+  // it('adds two numbers', () => {", 7)];
    const findings = rh003.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('commented out');
  });

  it('does not flag a prose comment that mentions a test name without a declaration shape', () => {
    const files = [makeAddFile('calculator.test.ts', '+  // test(a, b) is covered by the cases below', 7)];
    expect(rh003.run({ ...baseCtx, files })).toEqual([]);
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
    expect(rh003.run({ ...baseCtx, files: [file] })).toEqual([]);
  });

  // proctor-ignore: RH003 reason: the strings below are planted fixtures exercising the detector, not real disabled tests
  it('detects chained modifier forms it.skip.each / describe.only.each', () => {
    for (const line of ['+  it.skip.each([[1, 2]])("adds %i", () => {})', '+  describe.only.each(cases)("suite", () => {})']) {
      const files = [makeAddFile('calculator.test.ts', line, 5)];
      expect(rh003.run({ ...baseCtx, files }).length, line).toBe(1);
    }
  });

  // proctor-ignore: RH003 reason: planted fixtures exercising the detector, not real disabled tests
  it('detects jest/jasmine aliases xtest, fit, fdescribe', () => {
    for (const line of ['+  xtest("case", () => {})', '+  fit("only this", () => {})', '+  fdescribe("only this suite", () => {})']) {
      const files = [makeAddFile('calculator.test.ts', line, 5)];
      expect(rh003.run({ ...baseCtx, files }).length, line).toBe(1);
    }
  });

  // proctor-ignore: RH003 reason: planted fixtures exercising the detector, not real disabled tests
  it('detects it.todo and bracket-notation skip', () => {
    for (const line of ['+  it.todo("later")', `+  it['skip']("case", () => {})`]) {
      const files = [makeAddFile('calculator.test.ts', line, 5)];
      expect(rh003.run({ ...baseCtx, files }).length, line).toBe(1);
    }
  });

  // proctor-ignore: RH003 reason: planted fixtures exercising the detector, not real disabled tests
  it('detects imperative Python skips (pytest.skip, skipTest, SkipTest)', () => {
    for (const line of ['+    pytest.skip("later")', '+        self.skipTest("wip")', '+    raise unittest.SkipTest']) {
      const files = [makeAddFile('test_calculator.py', line, 5)];
      expect(rh003.run({ ...baseCtx, files }).length, line).toBe(1);
    }
  });

  it('does not flag a normal it()/test() declaration', () => {
    const files = [makeAddFile('calculator.test.ts', '+  it("adds two numbers", () => { expect(add(1,2)).toBe(3); })', 5)];
    expect(rh003.run({ ...baseCtx, files })).toEqual([]);
  });

  it('does not flag model.fit() / scaler.fit() in Python (member call, not the jasmine fit global)', () => {
    for (const line of ['+    model.fit(X_train, y_train)', '+    scaler.fit(X)', '+    pipeline.fit(data)']) {
      const files = [makeAddFile('src/train.py', line, 5)];
      expect(rh003.run({ ...baseCtx, files, isTestFile: () => false }).length, line).toBe(0);
    }
  });

  it('does not flag a query-builder .skip(10) in a JS test file', () => {
    const files = [makeAddFile('a.test.ts', '+  const rows = await query.skip(10).limit(5);', 5)];
    expect(rh003.run({ ...baseCtx, files })).toEqual([]);
  });

  it('does not flag a domain .todo() method call in a test file', () => {
    const files = [makeAddFile('todoList.test.ts', '+  expect(list.todo("buy milk")).toBeDefined();', 5)];
    expect(rh003.run({ ...baseCtx, files })).toEqual([]);
  });

  it('does not flag Python constructs on a JS file or JS constructs on a Python file (language-scoped)', () => {
    // `fit(` is a JS jasmine global; on a .py file RH003 uses only the Python pattern set.
    expect(rh003.run({ ...baseCtx, files: [makeAddFile('src/model.py', '+fit(a, b)', 5)], isTestFile: () => false })).toEqual([]);
  });
});

describe('rh003 — new-language skip/disable detection (LANG-02, LANG-06)', () => {
  const langExpected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH003', 'lang-expected.json'), 'utf8'));
  const langNegativeExpected = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'RH003', 'lang-negative-expected.json'), 'utf8'));

  // isTestFile is not consulted by the new-language branches (each gates itself internally via
  // isGoTestFile/isRubyTestFile/isKotlinTestFile or runs ungated) — false here on purpose, to
  // prove the new-language detection does not silently depend on the JS/TS test-file gate.
  const langCtx: Context = { ...baseCtx, isTestFile: () => false };

  it.each([
    ['Go', 'calculator_test.go', 0],
    ['Java', 'CalculatorTest.java', 1],
    ['Rust', 'calculator.rs', 2],
    ['Ruby', 'calculator_spec.rb', 3],
    ['PHP', 'CalculatorTest.php', 4],
    ['C#', 'CalculatorTests.cs', 5],
    ['Kotlin', 'CalculatorTest.kt', 6],
  ])('detects the planted skip/disable cheat for %s', (_lang, filename, expectedIndex) => {
    const files = fixtureDiff('RH003', filename);
    const findings = rh003.run({ ...langCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    expect(normalised).toMatchObject([langExpected[expectedIndex]]);
  });

  // proctor-ignore: RH003 reason: planted negative fixture proving the Ruby DSL-shape anchor
  // holds even inside a correctly-gated _spec.rb file — not a real disabled test.
  it('does not flag a bare Ruby `skip` used as an ordinary variable name inside a _spec.rb file', () => {
    const files = fixtureDiff('RH003/negative', 'calculator_spec.rb');
    const findings = rh003.run({ ...langCtx, files });
    expect(findings).toEqual(langNegativeExpected);
  });

  it('does not flag a legitimate conditional t.Skip() in a non-_test.go helper file', () => {
    const files = fixtureDiff('RH003/negative', 'testhelpers.go');
    const findings = rh003.run({ ...langCtx, files });
    expect(findings).toEqual(langNegativeExpected);
  });
});
