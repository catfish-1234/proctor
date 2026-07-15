import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/verifiers/rh002.js';
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
  enabled: ['RH002'],
  isTestFile: (p: string) => p.includes('.test.'),
  getLanguage: () => 'ts' as const,
};

describe('rh002 — weakened assertion', () => {
  it('detects weakened assertion from fixture diff', () => {
    const files = fixtureDiff('RH002', 'calculator.test.ts');
    const findings = rh002.run({ ...baseCtx, files });
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
    const findings = rh002.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH002');
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
    expect(rh002.run({ ...baseCtx, files })).toEqual([]);
  });

  function pair(del: string, add: string): ParsedFile[] {
    return [{
      from: 'calc.test.ts', to: 'calc.test.ts',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 5, content: del },
        { type: 'add', add: true, ln: 6, content: add },
      ], oldStart: 5, oldLines: 1, newStart: 6, newLines: 1 }],
      deleted: false, new: false,
    }];
  }

  it('detects exact value weakened to an ordering comparison (toBe → toBeGreaterThan)', () => {
    const findings = rh002.run({ ...baseCtx, files: pair('-  expect(total(c)).toBe(42);', '+  expect(total(c)).toBeGreaterThan(0);') });
    expect(findings.length).toBe(1);
    expect(findings[0].verifierId).toBe('RH002');
  });

  it('detects a specific object assertion weakened to expect.anything()', () => {
    const findings = rh002.run({ ...baseCtx, files: pair('-  expect(u).toEqual({ id: 1 });', '+  expect(u).toEqual(expect.anything());') });
    expect(findings.length).toBe(1);
  });

  it('returns [] when a specific toBe value merely changes (not a weakening)', () => {
    expect(rh002.run({ ...baseCtx, files: pair('-  expect(x).toBe(1);', '+  expect(x).toBe(2);') })).toEqual([]);
  });

  it('does not flag an unrelated toBeGreaterThan when a strong assertion on a DIFFERENT subject was removed', () => {
    const files: ParsedFile[] = [{
      from: 'calc.test.ts', to: 'calc.test.ts',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 3, content: '-  expect(parseConfig(raw)).toEqual({ mode: "fast" });' },
        { type: 'add', add: true, ln: 4, content: '+  expect(parseConfig(raw)).toEqual({ mode: "fast", ttl: 5 });' },
        { type: 'add', add: true, ln: 5, content: '+  expect(result.items.length).toBeGreaterThan(0);' },
      ], oldStart: 3, oldLines: 1, newStart: 3, newLines: 2 }],
      deleted: false, new: false,
    }];
    expect(rh002.run({ ...baseCtx, files })).toEqual([]);
  });

  it('does not flag the nested expect.any(String) field idiom (non-deterministic field)', () => {
    expect(rh002.run({ ...baseCtx, files: pair(
      '-  expect(user).toEqual({ id: "fixed-id", name: "Alice" });',
      '+  expect(user).toEqual({ id: expect.any(String), name: "Alice" });',
    ) })).toEqual([]);
  });

  it('does not flag an added range check when an exact assertion on the same subject survives', () => {
    const files: ParsedFile[] = [{
      from: 'calc.test.ts', to: 'calc.test.ts',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 3, content: '-  expect(count).toBe(5);' },
        { type: 'add', add: true, ln: 4, content: '+  expect(count).toBe(6);' },
        { type: 'add', add: true, ln: 5, content: '+  expect(count).toBeGreaterThan(0);' },
      ], oldStart: 3, oldLines: 1, newStart: 3, newLines: 2 }],
      deleted: false, new: false,
    }];
    expect(rh002.run({ ...baseCtx, files })).toEqual([]);
  });
});

function pairAt(filename: string, del: string, add: string, delLn = 5, addLn = 6): ParsedFile[] {
  return [{
    from: filename, to: filename,
    chunks: [{ content: '', changes: [
      { type: 'del', del: true, ln: delLn, content: del },
      { type: 'add', add: true, ln: addLn, content: add },
    ], oldStart: delLn, oldLines: 1, newStart: addLn, newLines: 1 }],
    deleted: false, new: false,
  }];
}

describe('RH002 — new-language flat matcher pairs (LANG-04)', () => {
  it('Go (testify): assert.Equal -> assert.NotNil is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator_test.go',
      '-\tassert.Equal(t, 3, result)',
      '+\tassert.NotNil(t, result)',
    ) });
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('RH002');
  });

  it('Java (JUnit): assertEquals -> assertNotNull is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.java',
      '-        assertEquals(3, result);',
      '+        assertNotNull(result);',
    ) });
    expect(findings.length).toBe(1);
  });

  it('PHP (PHPUnit): $this->assertEquals -> $this->assertNotNull is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.php',
      '-        $this->assertEquals(3, $result);',
      '+        $this->assertNotNull($result);',
    ) });
    expect(findings.length).toBe(1);
  });

  it('C# (xUnit): Assert.Equal -> Assert.NotNull is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTests.cs',
      '-        Assert.Equal(3, result);',
      '+        Assert.NotNull(result);',
    ) });
    expect(findings.length).toBe(1);
  });

  it('C# (NUnit): Assert.AreEqual -> Assert.IsNotNull is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTests.cs',
      '-        Assert.AreEqual(3, x);',
      '+        Assert.IsNotNull(x);',
    ) });
    expect(findings.length).toBe(1);
  });

  it('Kotlin (kotlin.test): assertEquals -> assertNotNull is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.kt',
      '-        assertEquals(3, result)',
      '+        assertNotNull(result)',
    ) });
    expect(findings.length).toBe(1);
  });

  it('Kotlin (Kotest): result shouldBe 42 -> result shouldNotBe null is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.kt',
      '-        result shouldBe 42',
      '+        result shouldNotBe null',
    ) });
    expect(findings.length).toBe(1);
  });

  it('a lone weak add with no removed strong assertion yields no finding', () => {
    const files: ParsedFile[] = [{
      from: 'CalculatorTest.java', to: 'CalculatorTest.java',
      chunks: [{ content: '', changes: [
        { type: 'add', add: true, ln: 6, content: '+        assertNotNull(other);' },
      ], oldStart: 5, oldLines: 0, newStart: 6, newLines: 1 }],
      deleted: false, new: false,
    }];
    expect(rh002.run({ ...baseCtx, files })).toEqual([]);
  });
});

describe('RH002 — same-subject / macro weakening for Rust, Ruby, AssertJ (LANG-04)', () => {
  it('Rust: assert_eq!(result, 3) -> assert!(result.is_some()) is caught (same subject)', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator.rs',
      '-    assert_eq!(result, 3);',
      '+    assert!(result.is_some());',
    ) });
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('RH002');
  });

  it('Rust: an unrelated assert!(other.is_ok()) on a DIFFERENT subject does not pair', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator.rs',
      '-    assert_eq!(result, 3);',
      '+    assert!(other.is_ok());',
    ) });
    expect(findings).toEqual([]);
  });

  it('Rust: assert_eq! weakened to a bare assert!(true) is caught (subject dropped)', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator.rs',
      '-    assert_eq!(result, 3);',
      '+    assert!(true);',
    ) });
    expect(findings.length).toBe(1);
  });

  it('Rust detection fires even when the file is not under a tests/ directory (not gated on isTestFile)', () => {
    const files: ParsedFile[] = [{
      from: 'src/calculator.rs', to: 'src/calculator.rs',
      chunks: [{ content: '', changes: [
        { type: 'del', del: true, ln: 5, content: '-    assert_eq!(result, 3);' },
        { type: 'add', add: true, ln: 6, content: '+    assert!(result.is_some());' },
      ], oldStart: 5, oldLines: 1, newStart: 6, newLines: 1 }],
      deleted: false, new: false,
    }];
    // baseCtx.isTestFile only matches '.test.' — this file wouldn't pass that gate, proving
    // the Rust block doesn't rely on it.
    expect(rh002.run({ ...baseCtx, files })).toHaveLength(1);
  });

  it('Ruby RSpec: expect(result).to eq(3) -> expect(result).to be_truthy is caught (same subject)', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator_spec.rb',
      '-    expect(result).to eq(3)',
      '+    expect(result).to be_truthy',
    ) });
    expect(findings.length).toBe(1);
  });

  it('Ruby RSpec: expect(other).not_to be_nil on a DIFFERENT subject does not pair', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator_spec.rb',
      '-    expect(result).to eq(3)',
      '+    expect(other).not_to be_nil',
    ) });
    expect(findings).toEqual([]);
  });

  it('Ruby Minitest: assert_equal 3, result -> assert result is caught', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'calculator_test.rb',
      '-    assert_equal 3, result',
      '+    assert result',
    ) });
    expect(findings.length).toBe(1);
  });

  it('AssertJ: assertThat(result).isEqualTo(3) -> assertThat(result).isNotNull() is caught (same subject)', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.java',
      '-    assertThat(result).isEqualTo(3);',
      '+    assertThat(result).isNotNull();',
    ) });
    expect(findings.length).toBe(1);
  });

  it('AssertJ: an unrelated assertThat(other).isNotNull() on a DIFFERENT subject does not pair', () => {
    const findings = rh002.run({ ...baseCtx, files: pairAt(
      'CalculatorTest.java',
      '-    assertThat(result).isEqualTo(3);',
      '+    assertThat(other).isNotNull();',
    ) });
    expect(findings).toEqual([]);
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
    const findings = rh002.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('RH002');
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.line).toBe(10);
  });

  it('detects assertAlmostEqual with reduced places= (looser tolerance)', () => {
    const files = makePythonFile(
      '-        self.assertAlmostEqual(result, 3.14, places=4)',
      '+        self.assertAlmostEqual(result, 3.14, places=2)',
    );
    const findings = rh002.run({ ...baseCtx, files });
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('RH002');
  });

  it('returns [] when places= value is increased (stricter assertion — not weaker)', () => {
    const files = makePythonFile(
      '-        self.assertAlmostEqual(result, 3.14, places=2)',
      '+        self.assertAlmostEqual(result, 3.14, places=5)',
    );
    const findings = rh002.run({ ...baseCtx, files });
    expect(findings).toEqual([]);
  });
});

describe('rh002 — new-language weakening fixtures (LANG-06)', () => {
  const langExpected: Array<Record<string, unknown>> = JSON.parse(
    readFileSync(path.join(FIXTURES_DIR, 'RH002', 'lang-expected.json'), 'utf8'),
  );

  const cases: Array<[string, string]> = [
    ['calculator_test.go', 'Go (testify)'],
    ['CalculatorTest.java', 'Java (JUnit)'],
    ['calculator_test.rs', 'Rust'],
    ['calculator_spec.rb', 'Ruby (RSpec)'],
    ['CalculatorTest.php', 'PHP (PHPUnit)'],
    ['CalculatorTests.cs', 'C# (xUnit)'],
    ['CalculatorTest.kt', 'Kotlin (kotlin.test)'],
  ];

  it.each(cases)('%s (%s): weakening fixture matches lang-expected.json', (filename) => {
    const expected = langExpected.find(e => e.file === filename);
    expect(expected, `no lang-expected.json entry for ${filename}`).toBeDefined();

    const files = fixtureDiff('RH002', filename);
    const findings = rh002.run({ ...baseCtx, files });
    const normalised = findings.map(f => ({ ...f, file: path.basename(f.file) }));
    expect(normalised).toMatchObject([expected]);
  });
});
