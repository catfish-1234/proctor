import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { wi101 } from '../../src/verifiers/wi101.js';
import { wi102 } from '../../src/verifiers/wi102.js';
import { wi103 } from '../../src/verifiers/wi103.js';
import { wi104 } from '../../src/verifiers/wi104.js';
import { wi105 } from '../../src/verifiers/wi105.js';
import { wi106 } from '../../src/verifiers/wi106.js';
import type { Context, Finding, Language, Verifier } from '../../src/types.js';

/**
 * Unit coverage for the WI1xx family, one describe per check.
 *
 * The fixture suite (tests/fixtures-wi.test.ts) proves each check against a real git diff of a
 * realistic file. These tests do the other half: they walk the individual signatures and, more
 * importantly, the gates. Almost every bug worth having in a check like this is a false positive,
 * so most of what follows asserts silence.
 */

function languageOf(filePath: string): Language {
  if (/\.tsx?$/.test(filePath)) return 'ts';
  if (/\.py$/.test(filePath)) return 'python';
  if (/\.go$/.test(filePath)) return 'go';
  if (/\.rb$/.test(filePath)) return 'ruby';
  if (/\.cs$/.test(filePath)) return 'csharp';
  return 'unknown';
}

function ctx(): Context {
  return {
    cwd: '',
    files: [],
    testPathGlobs: ['**/*.test.ts'],
    testFiles: [],
    enabled: [],
    isTestFile: (p: string) => p.includes('.test.') || p.includes('_test.'),
    getLanguage: languageOf,
    aiEnabled: false,
    judge: undefined,
  };
}

/**
 * Builds a diff for one file from explicit before/after content.
 *
 * Hand-writing unified-diff headers in every test made the intent unreadable, so this generates
 * them. Lines are compared naively (a deleted block then an added block), which is enough for
 * single-hunk cases and keeps each test's before/after visible as ordinary source.
 */
function diffOf(filePath: string, before: string, after: string) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const header = [
    `diff --git a/${filePath} b/${filePath}`,
    'index 1111111..2222222 100644',
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
  ];
  const bodyLines = [
    ...beforeLines.map(l => `-${l}`),
    ...afterLines.map(l => `+${l}`),
  ];
  return parseDiff([...header, ...bodyLines].join('\n'));
}

/** Diff for a pure addition, which is the common shape for WI101/WI102/WI105. */
function addedOf(filePath: string, added: string) {
  return diffOf(filePath, '', added);
}

async function run(verifier: Verifier, files: ReturnType<typeof parseDiff>): Promise<Finding[]> {
  return await verifier.run({ ...ctx(), files });
}

describe('WI101, silent error swallowing', () => {
  it.each([
    ['an empty JS catch with a binding', 'src/a.ts', 'try { work(); } catch (err) {}'],
    ['an empty JS catch without one', 'src/a.ts', 'try { work(); } catch {}'],
    ['a discarded promise rejection', 'src/a.ts', 'load().catch(() => {});'],
    ['a promise rejection mapped to null', 'src/a.ts', 'load().catch(() => null);'],
    ['a Python except that passes', 'src/a.py', 'try:\n    work()\nexcept Exception:\n    pass'],
    ['a Python except returning a default', 'src/a.py', 'try:\n    work()\nexcept ValueError: return None'],
    ['a Ruby rescue nil', 'src/a.rb', 'value = work() rescue nil'],
    ['a Go discarded error', 'src/a.go', '_ = err'],
    ['an empty C# catch', 'src/a.cs', 'try { Work(); } catch (Exception e) { }'],
  ])('flags %s', async (_label, file, code) => {
    const findings = await run(wi101, addedOf(file, code));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.verifierId).toBe('WI101');
    expect(findings[0]!.severity).toBe('error');
  });

  it('stays silent when the handler does something with the error', async () => {
    const findings = await run(wi101, addedOf('src/a.ts', 'try { work(); } catch (err) { report(err); }'));
    expect(findings).toEqual([]);
  });

  it('stays silent when the empty handler carries an explanation', async () => {
    const code = ['try {', '  work();', '} catch (err) {', '  // Best effort: the cache is rebuilt on the next request anyway.', '}'].join('\n');
    expect(await run(wi101, addedOf('src/a.ts', code))).toEqual([]);
  });

  it('does not treat a bare marker as an explanation', async () => {
    const code = ['try {', '  work();', '} catch (err) {', '  // TODO', '}'].join('\n');
    expect((await run(wi101, addedOf('src/a.ts', code))).length).toBe(1);
  });

  it('stays silent on a pre-existing empty handler this change did not add', async () => {
    const files = parseDiff([
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,4 @@',
      ' try {',
      '+  work();',
      ' } catch (err) {}',
    ].join('\n'));
    expect(await run(wi101, files)).toEqual([]);
  });
});

describe('WI102, unimplemented work claimed', () => {
  it.each([
    ['Python NotImplementedError', 'src/a.py', 'def retry(self):\n    raise NotImplementedError'],
    ['a JS not-implemented throw', 'src/a.ts', "function retry() {\n  throw new Error('not implemented');\n}"],
    ['a C# NotImplementedException', 'src/a.cs', 'public void Retry() {\n  throw new NotImplementedException();\n}'],
    ['a Rust todo macro', 'src/a.rs', 'fn retry() {\n    todo!()\n}'],
    ['a Go unimplemented panic', 'src/a.go', 'func retry() {\n\tpanic("not implemented")\n}'],
  ])('flags %s', async (_label, file, code) => {
    const findings = await run(wi102, addedOf(file, code));
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('WI102');
  });

  it('stays silent on an abstract method, where the marker is the correct body', async () => {
    const code = ['class Store(ABC):', '    @abstractmethod', '    def load(self, key):', '        raise NotImplementedError'].join('\n');
    expect(await run(wi102, addedOf('src/store.py', code))).toEqual([]);
  });

  it('stays silent on a declaration file', async () => {
    expect(await run(wi102, addedOf('src/types.d.ts', "throw new Error('not implemented');"))).toEqual([]);
  });

  it('stays silent on an ordinary TODO comment', async () => {
    expect(await run(wi102, addedOf('src/a.ts', '// TODO: revisit the retry backoff once metrics land'))).toEqual([]);
  });

  it('stays silent when the marker is quoted prose rather than a statement', async () => {
    // Proctor's own rule metadata describes every sentinel this check looks for. An unanchored
    // match reported the description of the check as a violation of it, which is how this
    // regression was found in the first place.
    const code = "  fullDescription: 'Detects raise NotImplementedError and todo!() in shipped code.',";
    expect(await run(wi102, addedOf('src/rules.ts', code))).toEqual([]);
  });
});

describe('WI103, validation removed', () => {
  const guarded = [
    'export function withdraw(balance: number, amount: number): number {',
    '  if (amount > balance) {',
    "    throw new RangeError('insufficient funds');",
    '  }',
    '  return balance - amount;',
    '}',
  ].join('\n');

  it('flags a deleted guard', async () => {
    const after = ['export function withdraw(balance: number, amount: number): number {', '  return balance - amount;', '}'].join('\n');
    const findings = await run(wi103, diffOf('src/account.ts', guarded, after));
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('WI103');
  });

  it('stays silent when the guard moved into a named validator', async () => {
    const after = [
      'export function withdraw(balance: number, amount: number): number {',
      '  validateWithdrawal(balance, amount);',
      '  return balance - amount;',
      '}',
    ].join('\n');
    expect(await run(wi103, diffOf('src/account.ts', guarded, after))).toEqual([]);
  });

  it('stays silent when the guard was rewritten in place', async () => {
    const after = [
      'export function withdraw(balance: number, amount: number): number {',
      '  if (amount > balance) {',
      "    throw new InsufficientFundsError(balance, amount);",
      '  }',
      '  return balance - amount;',
      '}',
    ].join('\n');
    expect(await run(wi103, diffOf('src/account.ts', guarded, after))).toEqual([]);
  });

  it('stays silent on a test file, where a deleted throw is RH001 territory', async () => {
    expect(await run(wi103, diffOf('src/account.test.ts', guarded, 'const x = 1;'))).toEqual([]);
  });
});

describe('WI104, guardrail disabled', () => {
  it('flags a check removed from the enabled list', async () => {
    const before = '{\n  "enabled": [\n    "RH001",\n    "RH002"\n  ]\n}';
    const after = '{\n  "enabled": [\n    "RH001"\n  ]\n}';
    const findings = await run(wi104, diffOf('proctor.config.json', before, after));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('RH002');
  });

  it('does not report a rule as removed when only its trailing comma changed', async () => {
    // Deleting the last array element rewrites the line above it too. Reading deletions alone
    // reported the surviving neighbour as removed, which would fire on every ordinary config edit.
    const before = '{\n  "enabled": [\n    "RH001",\n    "RH002",\n    "RH003"\n  ]\n}';
    const after = '{\n  "enabled": [\n    "RH001",\n    "RH002"\n  ]\n}';
    const findings = await run(wi104, diffOf('proctor.config.json', before, after));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('RH003');
    expect(findings[0]!.message).not.toContain('RH002');
  });

  it('stays silent when a check is added to the enabled list', async () => {
    const before = '{\n  "enabled": [\n    "RH001"\n  ]\n}';
    const after = '{\n  "enabled": [\n    "RH001",\n    "RH002"\n  ]\n}';
    expect(await run(wi104, diffOf('proctor.config.json', before, after))).toEqual([]);
  });

  it('flags a severity downgraded so a check stops blocking', async () => {
    const after = '{\n  "severity": {\n    "RH001": "warn"\n  }\n}';
    const findings = await run(wi104, addedOf('proctor.config.json', after));
    expect(findings.some(f => f.message.includes('RH001'))).toBe(true);
  });

  it('flags a self-written approval', async () => {
    const after = '{\n  "approvedTestChanges": [\n    { "rule": "RH001" }\n  ]\n}';
    const findings = await run(wi104, addedOf('proctor.config.json', after));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]!.message).toContain('approvedTestChanges');
  });

  it('flags TypeScript strictness turned off', async () => {
    const findings = await run(wi104, addedOf('tsconfig.json', '{ "compilerOptions": { "strict": false } }'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('strict');
  });

  it('flags a hook bypass', async () => {
    const findings = await run(wi104, addedOf('package.json', '"ship": "git commit --no-verify -m wip"'));
    expect(findings.length).toBe(1);
  });

  it('flags proctor removed from a runnable config', async () => {
    const findings = await run(wi104, diffOf('package.json', '"precommit": "proctor check --staged"', '"precommit": "echo ok"'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('no longer runs');
  });

  it('stays silent when prose stops mentioning proctor', async () => {
    // This repository's own docs would trip the check on every edit otherwise.
    expect(await run(wi104, diffOf('README.md', 'Run `proctor check` to try it.', 'Read the docs.'))).toEqual([]);
  });

  it('flags a deleted ruleset file', async () => {
    const files = parseDiff([
      'diff --git a/AGENTS.md b/AGENTS.md',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/AGENTS.md',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-# Rules',
      '-Do not delete tests.',
    ].join('\n'));
    const findings = await run(wi104, files);
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('ruleset');
  });
});

describe('WI105, fake data substituted', () => {
  it('flags removed IO paired with a fixed value', async () => {
    const before = 'async function list() {\n  const res = await fetch(url);\n  return res.json();\n}';
    const after = "async function list() {\n  return [{ id: '1' }];\n}";
    const findings = await run(wi105, diffOf('src/catalog.ts', before, after));
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('WI105');
  });

  it('flags a returned value named as mock data', async () => {
    const findings = await run(wi105, addedOf('src/catalog.ts', 'function get() {\n  return MOCK_RESPONSE;\n}'));
    expect(findings.length).toBe(1);
  });

  it('does not treat declaring canned data as returning it', async () => {
    // The name pattern's alternation used to bind at the top level, so the `return` prefix only
    // guarded its first branch and a bare declaration matched.
    expect(await run(wi105, addedOf('src/catalog.ts', "const MOCK_ITEM = { id: '1' };"))).toEqual([]);
  });

  it('stays silent when the IO call merely moved', async () => {
    const before = 'async function list() {\n  const res = await fetch(url);\n  return res.json();\n}';
    const after = 'async function list() {\n  const res = await fetch(buildUrl());\n  return res.json();\n}';
    expect(await run(wi105, diffOf('src/catalog.ts', before, after))).toEqual([]);
  });

  it('reports one finding per substitution, not one per signal', async () => {
    const before = 'async function list() {\n  const res = await fetch(url);\n  return res.json();\n}';
    const after = 'async function list() {\n  return MOCK_ITEMS;\n}';
    expect((await run(wi105, diffOf('src/catalog.ts', before, after))).length).toBe(1);
  });
});

describe('WI106, type safety eroded', () => {
  it('flags a specific type widened to any', async () => {
    const findings = await run(wi106, diffOf('src/a.ts', '  const data: Settings = parse(raw);', '  const data: any = parse(raw);'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.severity).toBe('warn');
  });

  it('flags repeated unexplained casts', async () => {
    const findings = await run(wi106, addedOf('src/a.ts', 'const a = x as any;\nconst b = y as any;'));
    expect(findings.length).toBe(2);
  });

  it('stays silent on a single unpaired cast', async () => {
    expect(await run(wi106, addedOf('src/a.ts', 'const a = x as any;'))).toEqual([]);
  });

  it('stays silent when each cast carries an explanation', async () => {
    const code = [
      'const a = x as any; // the vendor SDK ships no types for this response',
      'const b = y as any; // same untyped payload, handed straight back to the SDK',
    ].join('\n');
    expect(await run(wi106, addedOf('src/a.ts', code))).toEqual([]);
  });

  it('stays silent in a language where these tokens mean something else', async () => {
    expect(await run(wi106, addedOf('src/a.rb', 'value = thing as any'))).toEqual([]);
  });
});
