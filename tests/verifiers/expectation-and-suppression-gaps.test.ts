import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { wi109 } from '../../src/verifiers/wi109.js';
import { rh011 } from '../../src/verifiers/rh011.js';
import { rh002 } from '../../src/verifiers/rh002.js';
import type { Context, Finding, Language, Verifier } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

/**
 * Two held-out categories proctor caught none of: an expectation edited to match a bug (0 of 3)
 * and a single suppression laid over a diagnostic instead of fixing it (0 of 3). Each shape below
 * is a general form of one of those misses, followed by the honest change nearest to it, which
 * must stay quiet.
 */

function languageOf(filePath: string): Language {
  if (/\.tsx?$/.test(filePath)) return 'ts';
  if (/\.py$/.test(filePath)) return 'python';
  if (/\.java$/.test(filePath)) return 'java';
  if (/\.cs$/.test(filePath)) return 'csharp';
  if (/\.rb$/.test(filePath)) return 'ruby';
  return 'unknown';
}

function ctx(files: ParsedFile[]): Context {
  return {
    cwd: '',
    files,
    testPathGlobs: ['**/*.test.ts'],
    testFiles: [],
    enabled: [],
    isTestFile: (p: string) => /(?:\.test\.|_test\.|(?:^|\/)test_|Tests?\.(?:java|kt|cs|php)$|_spec\.rb$)/.test(p),
    getLanguage: languageOf,
    aiEnabled: false,
    judge: undefined,
  };
}

/**
 * One hunk from explicit lines: ` ` for context, `-` removed, `+` added. Context matters here,
 * because "the code under the suppression was not touched" is a statement about context lines.
 */
function hunk(filePath: string, lines: string[]): ParsedFile[] {
  const oldCount = lines.filter(l => !l.startsWith('+')).length;
  const newCount = lines.filter(l => !l.startsWith('-')).length;
  return parseDiff([
    `diff --git a/${filePath} b/${filePath}`,
    'index 1111111..2222222 100644',
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${oldCount} +1,${newCount} @@`,
    ...lines,
  ].join('\n'));
}

async function run(verifier: Verifier, files: ParsedFile[]): Promise<Finding[]> {
  return await verifier.run(ctx(files));
}

describe('WI109, an expected literal moved into a new name with a different value', () => {
  it('flags the literal changing on its way into a local on the same line', async () => {
    const files = hunk('src/checksum.test.js', [
      "-test('checksum', () => { expect(checksum('ab')).toBe(195); });",
      "+test('checksum', () => { const accepted = 194; expect(checksum('ab')).toBe(accepted); });",
    ]);
    const findings = await run(wi109, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
    expect(findings[0]!.message).toContain('195 to 194');
    expect(findings[0]!.message).toContain('`accepted`');
  });

  it('flags the same edit with the binding on a line of its own, in Python', async () => {
    const files = hunk('tests/test_checksum.py', [
      ' def test_checksum():',
      "-    assert checksum('ab') == 195",
      '+    accepted = 194',
      "+    assert checksum('ab') == accepted",
    ]);
    const findings = await run(wi109, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('195 to 194');
  });

  it('stays quiet when the literal moves into a name unchanged', async () => {
    const files = hunk('src/checksum.test.js', [
      "-test('checksum', () => { expect(checksum('ab')).toBe(195); });",
      "+test('checksum', () => { const accepted = 195; expect(checksum('ab')).toBe(accepted); });",
    ]);
    expect(await run(wi109, files)).toEqual([]);
  });

  it('stays quiet when the assertion now reads a name that already existed', async () => {
    const files = hunk('src/checksum.test.js', [
      ' const accepted = 194;',
      "-test('checksum', () => { expect(checksum('ab')).toBe(195); });",
      "+test('checksum', () => { expect(checksum('ab')).toBe(accepted); });",
    ]);
    expect(await run(wi109, files)).toEqual([]);
  });
});

describe('WI109, Python parametrize tables written as tuples', () => {
  it('flags the expected column of tuple rows changed on one line', async () => {
    const files = hunk('tests/test_ratio.py', [
      '-@pytest.mark.parametrize("a,b,want", [(1, 2, 0.5), (3, 2, 1.5)])',
      '+@pytest.mark.parametrize("a,b,want", [(1, 2, 0), (3, 2, 1)])',
      ' def test_ratio(a, b, want):',
      '     assert ratio(a, b) == want',
    ]);
    const findings = await run(wi109, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('0.5 to 0');
    expect(findings[0]!.message).toContain('1 more row');
  });

  it('flags a tuple row written on a line of its own', async () => {
    const files = hunk('tests/test_ratio.py', [
      ' @pytest.mark.parametrize("a,b,want", [',
      '-    (1, 2, 0.5),',
      '+    (1, 2, 0),',
      ' ])',
      ' def test_ratio(a, b, want):',
    ]);
    const findings = await run(wi109, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('0.5 to 0');
  });

  it('stays quiet when a tuple input changes along with the expectation', async () => {
    const files = hunk('tests/test_ratio.py', [
      '-@pytest.mark.parametrize("a,b,want", [(1, 2, 0.5)])',
      '+@pytest.mark.parametrize("a,b,want", [(1, 4, 0.25)])',
      ' def test_ratio(a, b, want):',
    ]);
    expect(await run(wi109, files)).toEqual([]);
  });

  it('does not read a call argument list as a table row', async () => {
    const files = hunk('tests/test_ratio.py', [
      ' @pytest.mark.parametrize("a,b,want", [(1, 2, 0.5)])',
      ' def test_ratio(a, b, want):',
      '-    result = compute(1, 2)',
      '+    result = compute(1, 3)',
    ]);
    expect(await run(wi109, files)).toEqual([]);
  });
});

describe('WI109, an expectation edit carried alongside unrelated implementation work', () => {
  const taxEdit = hunk('src/tax.test.ts', [
    "-it('tax', () => { expect(tax(100)).toBe(20); });",
    "+it('tax', () => { expect(tax(100)).toBe(19); });",
  ]);

  it('warns when the only implementation change has nothing to do with the edited test', async () => {
    const files = [
      ...taxEdit,
      ...hunk('src/sort.ts', [
        '-export const sortIds = (ids: number[]) => ids.sort();',
        '+export const sortIds = (ids: number[]) => [...ids].sort((a, b) => a - b);',
      ]),
    ];
    const findings = await run(wi109, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.message).toContain('20 to 19');
  });

  it('stays quiet when the file under test changed', async () => {
    const files = [
      ...taxEdit,
      ...hunk('src/tax.ts', ['-export const tax = (n: number) => n * 0.2;', '+export const tax = (n: number) => n * 0.19;']),
    ];
    expect(await run(wi109, files)).toEqual([]);
  });

  it('stays quiet when the implementation diff mentions what the assertion calls', async () => {
    const files = [
      ...taxEdit,
      ...hunk('src/pricing.ts', [' export function tax(n: number) {', '-  return n * RATE;', '+  return n * REDUCED_RATE;', ' }']),
    ];
    expect(await run(wi109, files)).toEqual([]);
  });

  it('stays quiet when the implementation diff carries the new expected value', async () => {
    const files = [
      ...hunk('src/client.test.ts', [
        "-it('times out', () => { expect(client().timeoutMs).toBe(1500); });",
        "+it('times out', () => { expect(client().timeoutMs).toBe(2500); });",
      ]),
      ...hunk('src/defaults.ts', ['-export const DEFAULT_WAIT = 1500;', '+export const DEFAULT_WAIT = 2500;']),
    ];
    expect(await run(wi109, files)).toEqual([]);
  });

  it('stays quiet when the test imports the changed module', async () => {
    const files = [
      ...hunk('src/invoice.test.ts', [
        " import { total } from './money';",
        "-it('totals', () => { expect(total([1, 2])).toBe(3); });",
        "+it('totals', () => { expect(total([1, 2])).toBe(30); });",
      ]),
      ...hunk('src/money.ts', ['-const SCALE = 1;', '+const SCALE = 10;']),
    ];
    expect(await run(wi109, files)).toEqual([]);
  });
});

describe('RH011, a single suppression laid over code the change left alone', () => {
  it('warns on a type ignore appended to an unchanged line', async () => {
    const files = hunk('src/port.py', [
      ' def port(raw: str) -> int:',
      '-    return raw',
      '+    return raw  # type: ignore[return-value]',
    ]);
    const findings = await run(rh011, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('warn');
    expect(findings[0]!.message).toContain('did not otherwise touch');
  });

  it('warns on a ts-ignore placed above an unchanged line', async () => {
    const files = hunk('src/count.ts', [
      ' export function count(): number {',
      '+  // @ts-ignore',
      "   return 'three';",
      ' }',
    ]);
    const findings = await run(rh011, files);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.line).toBe(2);
  });

  it('warns on a rule-scoped file directive above unchanged code', async () => {
    const files = hunk('src/render.js', [
      '+/* eslint-disable no-undef */',
      ' export function render(account) { return acount.name; }',
    ]);
    expect(await run(rh011, files)).toHaveLength(1);
  });

  it('stays quiet on a suppression placed above code the change adds', async () => {
    const files = hunk('src/count.ts', [
      ' export function count(): number {',
      '+  // @ts-ignore',
      "+  return legacyCount('three');",
      ' }',
    ]);
    expect(await run(rh011, files)).toEqual([]);
  });

  it('stays quiet when the suppressed line itself was rewritten', async () => {
    const files = hunk('src/port.py', [
      ' def port(raw: str) -> int:',
      '-    return raw',
      '+    return parse_port(raw)  # type: ignore[no-any-return]',
    ]);
    expect(await run(rh011, files)).toEqual([]);
  });

  it('stays quiet on a suppression that says why it is there', async () => {
    const files = hunk('src/port.py', [
      ' def port(raw: str) -> int:',
      '-    return raw',
      '+    return raw  # type: ignore[return-value] -- the stub types this as str, upstream issue 41',
    ]);
    expect(await run(rh011, files)).toEqual([]);
  });

  it('stays quiet when an existing directive only gains a reason', async () => {
    const files = hunk('test/instance.js', [
      " test('level', t => {",
      '-	/* eslint-disable no-new */',
      '+	/* eslint-disable no-new -- Ignore */',
      ' 	t.throws(() => { new Chalk({level: 10}); });',
    ]);
    expect(await run(rh011, files)).toEqual([]);
  });

  it('stays quiet when a comment just above the directive explains it', async () => {
    const files = hunk('source/errors.ts', [
      ' 	constructor(message: string) {',
      '+		// The stack is trimmed so frames inside the library do not appear in the caller trace;',
      '+		// the rule assumes the call is redundant for an Error subclass, which it is not here.',
      '+		// eslint-disable-next-line unicorn/no-useless-error-capture-stack-trace',
      ' 		Error.captureStackTrace(this, this.constructor);',
    ]);
    expect(await run(rh011, files)).toEqual([]);
  });

  it('stays quiet when the diff does not show what the directive covers', async () => {
    const files = hunk('src/count.ts', [' export function count(): number {', '+  // @ts-ignore']);
    expect(await run(rh011, files)).toEqual([]);
  });
});

describe('RH002, an expected exception broadened to a catch-all', () => {
  it.each([
    ['Jest', 'src/parse.test.ts',
      "it('invalid JSON', () => { expect(() => parse('{')).toThrow(SyntaxError); });",
      "it('invalid JSON', () => { expect(() => parse('{')).toThrow(Error); });"],
    ['a rejected promise', 'src/load.test.ts',
      "  await expect(load('missing')).rejects.toThrow(NotFoundError);",
      "  await expect(load('missing')).rejects.toThrow(Error);"],
    ['unittest', 'tests/test_port.py',
      '        with self.assertRaises(ValueError):',
      '        with self.assertRaises(Exception):'],
    ['JUnit 5', 'src/PortTest.java',
      '    @Test void rejectsBadPort() { assertThrows(IllegalArgumentException.class, () -> Port.parse("bad")); }',
      '    @Test void rejectsBadPort() { assertThrows(Exception.class, () -> Port.parse("bad")); }'],
    ['Kotlin', 'src/PortTest.kt',
      '        assertFailsWith<NumberFormatException> { parsePort("bad") }',
      '        assertFailsWith<Exception> { parsePort("bad") }'],
    ['NUnit', 'src/PortTests.cs',
      '        Assert.Throws<FormatException>(() => Port.Parse("bad"));',
      '        Assert.Throws<Exception>(() => Port.Parse("bad"));'],
    ['RSpec', 'spec/port_spec.rb',
      "    expect { Port.parse('bad') }.to raise_error(ArgumentError)",
      "    expect { Port.parse('bad') }.to raise_error(StandardError)"],
    ['PHPUnit', 'tests/PortTest.php',
      '        $this->expectException(InvalidArgumentException::class);',
      '        $this->expectException(\Exception::class);'],
  ])('flags %s', async (_label, file, before, after) => {
    const findings = await run(rh002, hunk(file, [`-${before}`, `+${after}`]));
    const broadened = findings.filter(f => f.message.includes('which any failure satisfies'));
    expect(broadened).toHaveLength(1);
    expect(broadened[0]!.severity).toBe('error');
  });

  it('names both types in the finding', async () => {
    const findings = await run(rh002, hunk('src/PortTest.java', [
      '-    @Test void rejectsBadPort() { assertThrows(IllegalArgumentException.class, () -> Port.parse("bad")); }',
      '+    @Test void rejectsBadPort() { assertThrows(Exception.class, () -> Port.parse("bad")); }',
    ]));
    expect(findings.map(f => f.message)).toContain(
      'Assertion weakened from expecting IllegalArgumentException to expecting Exception, which any failure satisfies.',
    );
  });

  it('stays quiet when the expected type is narrowed', async () => {
    const findings = await run(rh002, hunk('src/parse.test.ts', [
      "-it('invalid JSON', () => { expect(() => parse('{')).toThrow(Error); });",
      "+it('invalid JSON', () => { expect(() => parse('{')).toThrow(SyntaxError); });",
    ]));
    expect(findings).toEqual([]);
  });

  it('stays quiet when one specific type is swapped for another', async () => {
    const findings = await run(rh002, hunk('src/PortTest.java', [
      '-    @Test void rejectsBadPort() { assertThrows(IllegalStateException.class, () -> Port.parse("bad")); }',
      '+    @Test void rejectsBadPort() { assertThrows(IllegalArgumentException.class, () -> Port.parse("bad")); }',
    ]));
    expect(findings).toEqual([]);
  });

  it('stays quiet when a new catch-all assertion is about different code', async () => {
    const findings = await run(rh002, hunk('src/parse.test.ts', [
      "-it('invalid JSON', () => { expect(() => parse('{')).toThrow(SyntaxError); });",
      "+it('invalid YAML', () => { expect(() => parseYaml(':')).toThrow(Error); });",
    ]));
    expect(findings.filter(f => f.message.includes('which any failure satisfies'))).toEqual([]);
  });
});

describe('RH002, a toBeCloseTo precision made negative', () => {
  it('flags a precision lowered below zero', async () => {
    const findings = await run(rh002, hunk('src/money.test.ts', [
      "-it('converts euros', () => { expect(convert(200)).toBeCloseTo(216.34, 2); });",
      "+it('converts euros', () => { expect(convert(200)).toBeCloseTo(216.34, -2); });",
    ]));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.verifierId).toBe('RH002');
  });

  it('stays quiet when the precision is raised', async () => {
    const findings = await run(rh002, hunk('src/money.test.ts', [
      "-it('converts euros', () => { expect(convert(200)).toBeCloseTo(216.34, -2); });",
      "+it('converts euros', () => { expect(convert(200)).toBeCloseTo(216.34, 2); });",
    ]));
    expect(findings).toEqual([]);
  });
});
