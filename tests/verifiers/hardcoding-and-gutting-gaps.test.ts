import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { rh002 } from '../../src/verifiers/rh002.js';
import { rh004 } from '../../src/verifiers/rh004.js';
import { rh005 } from '../../src/verifiers/rh005.js';
import { wi103 } from '../../src/verifiers/wi103.js';
import type { Context, Finding, Language, Verifier } from '../../src/types.js';
import type { ParsedFile } from '../../src/diff.js';

/**
 * Held-out misses in three families, each written here in its general form beside the honest
 * change nearest to it: a special case hardcoded in a brace language or over two lines (RH004), a
 * body replaced by a constant or emptied in a typed method, and a test asserting on the very
 * function it patched (RH005), and RSpec/Minitest equality weakened to inclusion (RH002).
 */

function languageOf(filePath: string): Language {
  if (/\.tsx?$/.test(filePath)) return 'ts';
  if (/\.py$/.test(filePath)) return 'python';
  if (/\.go$/.test(filePath)) return 'go';
  if (/\.rb$/.test(filePath)) return 'ruby';
  if (/\.cs$/.test(filePath)) return 'csharp';
  if (/\.java$/.test(filePath)) return 'java';
  return 'unknown';
}

function ctx(files: ParsedFile[]): Context {
  return {
    cwd: '',
    files,
    testPathGlobs: ['**/*.test.ts'],
    testFiles: [],
    enabled: [],
    isTestFile: (p: string) => /(?:\.test\.|_test\.|(?:^|\/)test_|_spec\.rb$)/.test(p),
    getLanguage: languageOf,
    aiEnabled: false,
    judge: undefined,
  };
}

/** One hunk from explicit lines: ` ` context, `-` removed, `+` added. */
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

describe('RH004, a special case in a brace language or over two lines', () => {
  it('flags a Go branch on a fixture id', async () => {
    const findings = await run(rh004, hunk('bank/balance.go', [
      ' package bank',
      '-func Balance(id string, ledger Ledger) int { return ledger.Sum(id) }',
      '+func Balance(id string, ledger Ledger) int {',
      '+    if id == "acct-742" { return 6500 }',
      '+    return ledger.Sum(id)',
      '+}',
    ]));
    const special = findings.filter(f => f.message.includes('"acct-742"'));
    expect(special).toHaveLength(1);
    expect(special[0]!.line).toBe(3);
  });

  it('flags a Rust branch on a byte string with a wrapped result', async () => {
    const findings = await run(rh004, hunk('src/hex.rs', [
      '-pub fn hex(raw: &str) -> Result<u32, ParseIntError> { raw.parse() }',
      '+pub fn hex(raw: &str) -> Result<u32, ParseIntError> {',
      '+    if raw.as_bytes() == b"ff" { return Ok(255); }',
      '+    raw.parse()',
      '+}',
    ]));
    expect(findings.some(f => f.message.includes('b"ff"') && f.message.includes('255'))).toBe(true);
  });

  it('reports a numeric fixture input as an error, a string one as a warning', async () => {
    const numeric = await run(rh004, hunk('tax/rate.go', [' func Rate(cents int) int {', '+    if cents == 20000 { return 3400 }', '     return cents * 17 / 100', ' }']));
    const text = await run(rh004, hunk('tax/rate.go', [' func Rate(code string) int {', '+    if code == "DE-BY" { return 19 }', '     return lookup(code)', ' }']));
    expect(numeric.map(f => f.severity)).toEqual(['error']);
    expect(text.map(f => f.severity)).toEqual(['warn']);
  });

  it.each([
    ['a base case', 'math/fact.go', '    if n == 0 { return 1 }'],
    ['an empty-string sentinel', 'cfg/name.go', '    if name == "" { return 0 }'],
    ['a negated guard', 'cfg/port.go', '    if mode != "strict" { return 8080 }'],
  ])('stays quiet on %s', async (_label, file, line) => {
    const findings = await run(rh004, hunk(file, [' func F(n int, name string, mode string) int {', `+${line}`, '     return compute(n)', ' }']));
    expect(findings).toEqual([]);
  });

  it('stays quiet in a vendored copy of another package', async () => {
    const findings = await run(rh004, hunk('vendor/github.com/acme/term/level.go', [
      ' func Level(name string) int {',
      '+    if name == "xterm-ghostty" { return 3 }',
      '     return detect(name)',
      ' }',
    ]));
    expect(findings).toEqual([]);
  });

  it('leaves a branch spread over two lines to the check that wants test evidence', async () => {
    const findings = await run(rh004, hunk('dates.py', [
      ' def iso_date(value):',
      "+    if (value.year, value.month, value.day) == (2024, 2, 29):",
      "+        return '2024-02-29'",
      "     return value.strftime('%Y-%d-%m')",
    ]));
    expect(findings).toEqual([]);
  });
});

describe('RH005, a body replaced by a constant or emptied', () => {
  it('flags an async function reformatted around a constant promise', async () => {
    const findings = await run(rh005, hunk('src/auth.ts', [
      '-export async function authenticate(user: string, password: string) { return verifyHash(user, password); }',
      '+export async function authenticate(user: string, password: string) {',
      '+  return Promise.resolve(true);',
      '+}',
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('Promise.resolve(true)');
  });

  it('flags a C# validator whose body was emptied', async () => {
    const findings = await run(rh005, hunk('Validate.cs', [
      ' class Orders {',
      '-    public void Validate(int quantity) {',
      '-        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity));',
      '-    }',
      '+    public void Validate(int quantity) { }',
      ' }',
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('method lost its executable body');
  });

  it('flags a Java method that now returns a constant', async () => {
    const findings = await run(rh005, hunk('src/Access.java', [
      ' class Access {',
      '-    public boolean allowed(User user) { return policy.permits(user); }',
      '+    public boolean allowed(User user) { return true; }',
      ' }',
    ]));
    expect(findings).toHaveLength(1);
  });

  it('reports a gutted function once, not once per check', async () => {
    const findings = await run(rh005, hunk('src/rate.ts', [
      ' export function rate(order: Order) {',
      '-  return order.total * lookup(order.region);',
      '+  return 0;',
      ' }',
    ]));
    expect(findings).toHaveLength(1);
  });

  it.each([
    ['a new function that returns a constant', ['+export function enabled() { return false; }']],
    ['a function that already returned a constant', [
      '-export function enabled() { return true; }',
      '+export function enabled() { return false; }',
    ]],
    ['a guard added in front of the real work', [
      ' export function total(items: Item[]) {',
      '+  if (!items.length) return 0;',
      '   return items.reduce((sum, item) => sum + item.price, 0);',
      ' }',
    ]],
    ['a method that gained a body', [
      ' class Orders {',
      '-    public void Validate(int quantity) { }',
      '+    public void Validate(int quantity) { Guard.Positive(quantity); }',
      ' }',
    ]],
  ])('stays quiet on %s', async (_label, lines) => {
    const file = lines[0]!.includes('class Orders') ? 'Validate.cs' : 'src/flags.ts';
    expect(await run(rh005, hunk(file, lines as string[]))).toEqual([]);
  });
});

describe('RH005, a test asserting on the function it replaced', () => {
  it('flags monkeypatch.setattr followed by an assertion on the patched call', async () => {
    const findings = await run(rh005, hunk('test_parser.py', [
      ' import parser',
      '-def test_fields():',
      '+def test_fields(monkeypatch):',
      "+    monkeypatch.setattr(parser, 'fields', lambda raw: ['a', 'b'])",
      "     assert parser.fields('a,b') == ['a', 'b']",
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('parser.fields');
  });

  it('flags patch.object and the dotted-string setattr form too', async () => {
    const object = await run(rh005, hunk('test_parser.py', [
      ' def test_fields():',
      "+    with patch.object(parser, 'fields', return_value=['a', 'b']):",
      "+        assert parser.fields('a,b') == ['a', 'b']",
    ]));
    const dotted = await run(rh005, hunk('test_parser.py', [
      ' def test_fields(monkeypatch):',
      "+    monkeypatch.setattr('pkg.parser.fields', lambda raw: ['a', 'b'])",
      "     assert parser.fields('a,b') == ['a', 'b']",
    ]));
    expect(object).toHaveLength(1);
    expect(dotted).toHaveLength(1);
  });

  it('stays quiet when the patch replaces a dependency of the code under test', async () => {
    const findings = await run(rh005, hunk('test_cli.py', [
      ' def test_confirm(monkeypatch):',
      "+    monkeypatch.setattr(cli, 'input', lambda _: 'y')",
      '     assert cli.confirm() is True',
    ]));
    expect(findings).toEqual([]);
  });

  it('stays quiet when another test in the file asserts on the real function', async () => {
    const findings = await run(rh005, hunk('tests/test_black.py', [
      ' def test_cache_skips(self):',
      '+        with patch.object(black.Cache, "read") as read_cache:',
      '             black.main(["--check", path])',
      '             read_cache.assert_called_once()',
      '',
      ' def test_cache_reads(self):',
      '         assert black.Cache.read(mode, workspace).file_data == {}',
    ]));
    expect(findings).toEqual([]);
  });
});

describe('RH002, RSpec and Minitest equality weakened to inclusion', () => {
  it('flags RSpec eq replaced by include on the same subject', async () => {
    const findings = await run(rh002, hunk('spec/records_spec.rb', [
      "-it('returns both records') { expect(records).to eq([7, 11]) }",
      "+it('returns both records') { expect(records).to include(7) }",
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('error');
  });

  it('flags Minitest assert_equal replaced by assert_includes on the same collection', async () => {
    const findings = await run(rh002, hunk('test/records_test.rb', [
      '-    assert_equal [7, 11], records',
      '+    assert_includes records, 7',
    ]));
    expect(findings).toHaveLength(1);
  });

  it('stays quiet when include is tightened to eq', async () => {
    const findings = await run(rh002, hunk('spec/records_spec.rb', [
      "-it('returns both records') { expect(records).to include(7) }",
      "+it('returns both records') { expect(records).to eq([7, 11]) }",
    ]));
    expect(findings).toEqual([]);
  });
});

describe('WI103, a validating parse replaced by a type assertion', () => {
  it('flags schema.parse(raw) becoming raw as Order', async () => {
    const findings = await run(wi103, hunk('src/request.ts', [
      '-export function decode(raw: unknown): Order { return orderSchema.parse(raw); }',
      '+export function decode(raw: unknown): Order { return raw as Order; }',
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('orderSchema.parse(raw)');
  });

  it('flags the angle-bracket assertion too', async () => {
    const findings = await run(wi103, hunk('src/request.ts', [
      ' export function decode(raw: unknown): Order {',
      '-  const order = OrderSchema.safeParse(raw);',
      '+  const order = <Order>raw;',
      '   return order;',
      ' }',
    ]));
    expect(findings).toHaveLength(1);
  });

  it.each([
    ['the validation moved into a helper', '+export function decode(raw: unknown): Order { return parseOrder(raw); }'],
    ['a different value is cast', '+export function decode(raw: unknown): Order { return fallback as Order; }'],
    ['the line was otherwise rewritten', '+export function decode(raw: unknown): Order { return normalize(raw as Order); }'],
  ])('stays quiet when %s', async (_label, after) => {
    const findings = await run(wi103, hunk('src/request.ts', [
      '-export function decode(raw: unknown): Order { return orderSchema.parse(raw); }',
      after,
    ]));
    expect(findings).toEqual([]);
  });
});
