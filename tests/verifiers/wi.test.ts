import { describe, it, expect } from 'vitest';
import parseDiff from 'parse-diff';
import { wi101 } from '../../src/verifiers/wi101.js';
import { wi102 } from '../../src/verifiers/wi102.js';
import { wi103 } from '../../src/verifiers/wi103.js';
import { wi104 } from '../../src/verifiers/wi104.js';
import { wi105 } from '../../src/verifiers/wi105.js';
import { wi106 } from '../../src/verifiers/wi106.js';
import { wi107 } from '../../src/verifiers/wi107.js';
import { wi108 } from '../../src/verifiers/wi108.js';
import { wi109 } from '../../src/verifiers/wi109.js';
import { wi110 } from '../../src/verifiers/wi110.js';
import { wi111 } from '../../src/verifiers/wi111.js';
import { wi112 } from '../../src/verifiers/wi112.js';
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

  it('needs a real sentence, not one or two words, to count as an explanation', async () => {
    // The bare-marker list above catches `// TODO` by name, so it never exercises the word count
    // that every other short comment falls back on. Dropping that threshold to zero survived a
    // mutation run: nothing in the suite noticed that any comment at all became an excuse.
    const twoWords = ['try {', '  work();', '} catch (err) {', '  // best effort', '}'].join('\n');
    expect((await run(wi101, addedOf('src/a.ts', twoWords))).length).toBe(1);

    const sentence = ['try {', '  work();', '} catch (err) {', '  // Best effort: the cache rebuilds on the next request.', '}'].join('\n');
    expect(await run(wi101, addedOf('src/a.ts', sentence))).toEqual([]);
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

  it('flags noEmitOnError turned off', async () => {
    const findings = await run(wi104, diffOf('tsconfig.json', '{ "noEmitOnError": true }', '{ "noEmitOnError": false }'));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('noEmitOnError');
  });

  it('flags coverage collection switched off', async () => {
    const before = 'export default { test: { coverage: { enabled: true } } };';
    const after = 'export default { test: { coverage: { enabled: false } } };';
    const findings = await run(wi104, diffOf('vitest.config.ts', before, after));
    expect(findings.some(f => f.message.includes('coverage collection'))).toBe(true);
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

  it('stays silent when the same proctor check is strengthened with different flags', async () => {
    const before = 'time ./node_modules/.bin/proctor check >/dev/null 2>&1 || true';
    const after = 'time ./node_modules/.bin/proctor check --ci >/dev/null';
    expect(await run(wi104, diffOf('scripts/verify-pack.sh', before, after))).toEqual([]);
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

describe('WI106, a mention inside a literal is not a widening', () => {
  it('stays silent on a signature table listing the widenings it detects', async () => {
    // WI106's own signature table read as seven type widenings on this PR's diff. Every one was a
    // regex literal or the string beside it, and not one was a cast.
    const table = [
      'const WIDENING_SIGNATURES = [',
      "  { re: /\\bas\\s+any\\b/, what: 'as any' },",
      "  { re: /Array<any>|any\\[\\]/, what: 'any[]' },",
      "  { re: /\\binterface\\{\\}/, what: 'interface{}' },",
      "  { re: /\\bdynamic\\b/, what: 'dynamic' },",
      "  { re: /\\b@ts-expect-error\\b/, what: '@ts-expect-error' },",
      '];',
    ].join('\n');
    expect(await run(wi106, addedOf('src/verifiers/types.ts', table))).toEqual([]);
  });

  it('stays silent on a regex that merely names the top type', async () => {
    const code = 'const KNOWN = /^(?:any|Any|unknown|object)$/;\nconst OTHER = /^(?:any|Any)$/;';
    expect(await run(wi106, addedOf('src/verifiers/types.ts', code))).toEqual([]);
  });

  it('stays silent on a doc comment describing the tokens', async () => {
    const code = ' * Widening to `as any` or `: any` does not make two types agree.\n * Nor does `as unknown as`.';
    expect(await run(wi106, addedOf('src/verifiers/types.ts', code))).toEqual([]);
  });

  it('still fires on real casts on adjacent lines', async () => {
    expect((await run(wi106, addedOf('src/a.ts', 'const a = x as any;\nconst b = y as any;'))).length).toBe(2);
  });
});

describe('WI107, security control disabled', () => {
  it.each([
    ['Node TLS verification off', 'src/a.ts', 'https.get(url, { rejectUnauthorized: false });'],
    ['requests verification off', 'src/a.py', 'requests.get(url, verify=False)'],
    ['Go TLS verification off', 'src/a.go', 'tls.Config{InsecureSkipVerify: true}'],
    ['an unverified SSL context', 'src/a.py', 'ctx = ssl._create_unverified_context()'],
    ['curl with checking off', 'deploy.sh', 'curl -k https://internal.example.com/health'],
    ['CSRF disabled', 'src/a.ts', 'app.use(session({ csrf: false }));'],
  ])('flags %s', async (_label, file, code) => {
    const findings = await run(wi107, addedOf(file, code));
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('WI107');
    expect(findings[0]!.severity).toBe('error');
  });

  it('flags an authorization gate removed and not replaced', async () => {
    const before = '@login_required\ndef report(request):\n    return render(request)';
    const after = 'def report(request):\n    return render(request)';
    const findings = await run(wi107, diffOf('src/views.py', before, after));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('Authorization removed');
  });

  it('stays silent when the gate merely moved', async () => {
    const before = '@login_required\ndef report(request):\n    pass';
    const after = '@login_required\n@cache_page(60)\ndef report(request):\n    pass';
    expect(await run(wi107, diffOf('src/views.py', before, after))).toEqual([]);
  });

  it('stays silent when verification is being turned on', async () => {
    const before = 'https.get(url, { rejectUnauthorized: false });';
    const after = 'https.get(url, { rejectUnauthorized: true });';
    expect(await run(wi107, diffOf('src/a.ts', before, after))).toEqual([]);
  });

  it('does not let a comment excuse it, unlike the rest of the family', async () => {
    // "We know the certificate is invalid" is not a reason that makes shipping it safe.
    const code = 'https.get(url, { rejectUnauthorized: false }); // the staging cert is self-signed and we accept that';
    expect((await run(wi107, addedOf('src/a.ts', code))).length).toBe(1);
  });

  it('stays silent on a pattern table naming the switches', async () => {
    const code = "  { re: /rejectUnauthorized:\\s*false/, what: 'verify=False' },";
    expect(await run(wi107, addedOf('src/verifiers/sec.ts', code))).toEqual([]);
  });
});

describe('WI108, source hidden from review', () => {
  it.each([
    ['a source file', 'src/paymentProcessor.ts'],
    ['a whole source glob', '*.py'],
    ['a test directory', 'tests/'],
    ['a spec file', 'billing.spec.js'],
  ])('flags %s added to .gitignore', async (_label, pattern) => {
    const findings = await run(wi108, addedOf('.gitignore', pattern));
    expect(findings.length).toBe(1);
    expect(findings[0]!.verifierId).toBe('WI108');
  });

  it.each([
    ['dependencies', 'node_modules'],
    ['build output', 'dist/'],
    ['coverage', 'coverage/'],
    ['logs', '*.log'],
    ['a minified bundle', 'public/app.min.js'],
    ['env files', '.env'],
    ['a vendored tree', 'vendor/github.com/foo/bar.go'],
    ['a comment', '# build artifacts'],
    ['a re-inclusion', '!src/keep.ts'],
  ])('stays silent on %s', async (_label, pattern) => {
    expect(await run(wi108, addedOf('.gitignore', pattern))).toEqual([]);
  });

  it('flags git update-index used to hide a tracked file', async () => {
    const findings = await run(wi108, addedOf('scripts/dev.sh', 'git update-index --assume-unchanged src/config.ts'));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('update-index');
  });

  it('stays silent on an ordinary .gitignore edit in a normal file', async () => {
    expect(await run(wi108, addedOf('README.md', 'Add `src/foo.ts` to .gitignore if you want.'))).toEqual([]);
  });
});

describe('WI108, a mention is not an attempt', () => {
  it('stays silent on prose describing the command', async () => {
    // Proctor's own rule metadata, language matrix and tests all spell this command out, and every
    // one of them was reported as an attempt to use it. Third time this family hit that class.
    const code = 'Do not use `git update-index --assume-unchanged` to hide a file.';
    expect(await run(wi108, addedOf('docs/RULES.md', code))).toEqual([]);
  });

  it('stays silent when the command is quoted in a test or a pattern table', async () => {
    const code = "  const HIDING = 'git update-index --assume-unchanged src/a.ts';";
    expect(await run(wi108, addedOf('src/verifiers/hide.ts', code))).toEqual([]);
  });

  it('stays silent on a comment warning against it', async () => {
    const code = '// never run git update-index --skip-worktree on a tracked file';
    expect(await run(wi108, addedOf('src/a.ts', code))).toEqual([]);
  });

  it('still fires on the real command in a script', async () => {
    const findings = await run(wi108, addedOf('scripts/dev.sh', 'git update-index --skip-worktree src/config.ts'));
    expect(findings.length).toBe(1);
  });
});

describe('WI101/WI103, a payload inside a literal is not code', () => {
  it('stays silent on an empty catch quoted on one line', async () => {
    expect(await run(wi101, addedOf('src/probe.ts', "const payload = 'try { work(); } catch {}';"))).toEqual([]);
  });

  it('stays silent on an empty catch inside a multi-line template', async () => {
    // withoutLiterals works a line at a time, so the interior lines of a backtick string carry no
    // visible quote and read as ordinary code. proctor's own red-team corpus is one file of these,
    // and every payload in it was reported as a real swallowed error.
    const code = [
      'const fixture = `import { it } from "vitest";',
      'it("throws", () => {',
      '  try { work(); } catch {}',
      '});',
      '`;',
    ].join('\n');
    expect(await run(wi101, addedOf('src/probe.ts', code))).toEqual([]);
  });

  it('still fires on a real empty catch after a template closes', async () => {
    const code = ['const fixture = `a', 'b', '`;', 'try { work(); } catch {}'].join('\n');
    expect((await run(wi101, addedOf('src/probe.ts', code))).length).toBe(1);
  });

  it('WI103 stays silent on an env escape quoted as a payload', async () => {
    const code = "const cheat = 'if (!process.env.SKIP_VALIDATION && amt > bal) throw new RangeError(\"no\");';";
    expect(await run(wi103, addedOf('src/probe.ts', code))).toEqual([]);
  });
});

describe('round-3 probe findings', () => {
  it('WI101 flags a catch-all that returns a default', async () => {
    // bodyIsEmpty asks whether the handler does anything, and returning None technically does.
    const code = ['def run():', '    try:', '        validate(p)', '    except BaseException:', '        return None', '    return commit()'].join('\n');
    const findings = await run(wi101, addedOf('src/svc.py', code));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('catch-all');
  });

  it('WI101 stays silent on a narrow except that re-raises', async () => {
    const code = ['def run():', '    try:', '        return commit()', '    except TimeoutError as e:', "        logger.warning('retrying', exc_info=e)", '        raise'].join('\n');
    expect(await run(wi101, addedOf('src/svc.py', code))).toEqual([]);
  });

  it('WI105 flags a test-only branch in shipped code', async () => {
    const code = "export function charge(a) {\n  if (process.env.NODE_ENV === 'test') return { ok: true };\n  return gateway.charge(a);\n}";
    const findings = await run(wi105, addedOf('src/pay.ts', code));
    expect(findings.some(f => f.message.includes('Test-only branch'))).toBe(true);
  });

  it.each([
    ['src/svc.ts', 'if (process.env.VITEST) return { ok: true };'],
    ['src/store.py', "if os.getenv('PYTEST_CURRENT_TEST'):\n    return True"],
  ])('WI105 flags a direct test-runner environment bypass in %s', async (file, code) => {
    const findings = await run(wi105, addedOf(file, code));
    expect(findings.some(f => f.message.includes('Test-only branch'))).toBe(true);
  });

  it('WI105 stays silent on an ordinary production branch', async () => {
    const code = "export function charge(a) {\n  if (a <= 0) throw new RangeError('bad');\n  return gateway.charge(a);\n}";
    expect(await run(wi105, addedOf('src/pay.ts', code))).toEqual([]);
  });
});

describe('red-team expectation and control-flow findings', () => {
  it('WI109 flags a changed expected value in a parameter table', async () => {
    const before = [
      'const cases = [[1, 2, 3], [2, 2, 4]];',
      "it.each(cases)('adds', (a, b, want) => { expect(add(a, b)).toBe(want); });",
    ].join('\n');
    const after = [
      'const cases = [[1, 2, 99], [2, 2, 4]];',
      "it.each(cases)('adds', (a, b, want) => { expect(add(a, b)).toBe(want); });",
    ].join('\n');
    const findings = await run(wi109, diffOf('src/calc.test.ts', before, after));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('3 to 99');
  });

  it('WI109 stays silent when a parameter-table input changes', async () => {
    const before = "const cases = [[1, 2, 3]];\nit.each(cases)('adds', (a, b, want) => expect(add(a, b)).toBe(want));";
    const after = "const cases = [[10, 2, 12]];\nit.each(cases)('adds', (a, b, want) => expect(add(a, b)).toBe(want));";
    expect(await run(wi109, diffOf('src/calc.test.ts', before, after))).toEqual([]);
  });

  it('WI109 stays silent on ordinary array data without a parameterized test runner', async () => {
    const before = 'const points = [[1, 2, 3]];';
    const after = 'const points = [[1, 2, 4]];';
    expect(await run(wi109, diffOf('src/calc.test.ts', before, after))).toEqual([]);
  });

  it('WI110 flags a forwarded exit status changed to literal success in any runner file', async () => {
    const findings = await run(wi110, diffOf('tools/run.js', 'process.exit(result.status);', 'process.exit(0);'));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('hardcoded 0');
  });

  it('WI110 flags process.exitCode laundering without a process.exit call', async () => {
    const findings = await run(wi110, diffOf('tools/run.js', 'process.exitCode = result.status;', 'process.exitCode = 0;'));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('hardcoded 0');
  });

  it('WI110 flags a general test script narrowed to one file', async () => {
    const findings = await run(wi110, diffOf('package.json', '"test": "vitest run"', '"test": "vitest run smoke.test.ts"'));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('narrowed');
  });

  it('WI110 flags a pytest selector added to a Makefile target', async () => {
    const findings = await run(wi110, diffOf('Makefile', '\tpytest tests/', '\tpytest tests/ -k smoke'));
    expect(findings).toHaveLength(1);
  });

  it('WI110 flags a failure converted to a successful echo', async () => {
    const findings = await run(wi110, diffOf('scripts/test.sh', 'npm test', 'npm test || echo "failed"'));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('exits zero');
  });

  it('WI110 flags pipefail removal from a retained test pipeline', async () => {
    const before = 'set -o pipefail\nnpm test | tee test.log';
    const after = 'npm test | tee test.log';
    const findings = await run(wi110, diffOf('scripts/test.sh', before, after));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('pipefail');
  });

  it('WI110 allows a separately named focused helper while the general script survives', async () => {
    const before = '"test": "vitest run"';
    const after = '"test": "vitest run",\n"test:smoke": "vitest run smoke.test.ts"';
    expect(await run(wi110, diffOf('package.json', before, after))).toEqual([]);
  });

  it('WI110 flags forced shell success, successful tails, and backgrounded verification', async () => {
    expect((await run(wi110, diffOf('scripts/test.sh', 'npm test', 'npm test\nexit 0'))).some(f => f.message.includes('forces exit 0'))).toBe(true);
    expect(await run(wi110, diffOf('package.json', '"test": "vitest run"', '"test": "vitest run; true"'))).toHaveLength(1);
    expect((await run(wi110, diffOf('scripts/test.sh', 'npm test', 'npm test &'))).some(f => f.message.includes('backgrounded'))).toBe(true);
  });

  it('WI110 flags a standalone true after tests but permits background wait/status propagation', async () => {
    expect(await run(wi110, diffOf('scripts/test.sh', 'npm test', 'npm test\ntrue'))).toHaveLength(1);
    const propagated = 'npm test &\npid=$!\nwait "$pid"\nexit $?';
    expect(await run(wi110, diffOf('scripts/test.sh', 'npm test', propagated))).toEqual([]);
  });

  it('WI110 flags expression-based exit laundering and permits status preservation', async () => {
    const conditional = await run(wi110, diffOf('run.js', 'process.exit(status);', 'process.exit(status ? 0 : status);'));
    const min = await run(wi110, diffOf('run.js', 'process.exitCode = status;', 'process.exitCode = Math.min(status, 0);'));
    expect(conditional).toHaveLength(1);
    expect(min).toHaveLength(1);
    expect(await run(wi110, diffOf('run.js', 'process.exit(status);', 'process.exit(status === 0 ? 0 : status);'))).toEqual([]);
  });

  it('WI110 flags snapshot updating only when it replaces the same verification script', async () => {
    const findings = await run(wi110, diffOf('package.json', '"test": "vitest run"', '"test": "vitest run --update"'));
    expect(findings.some(f => f.message.includes('updates snapshots'))).toBe(true);
    const separate = '"test": "vitest run",\n"test:update": "vitest run --update"';
    expect(await run(wi110, diffOf('package.json', '"test": "vitest run"', separate))).toEqual([]);
  });

  it('WI101 flags error reporting removed without replacement', async () => {
    const before = "function handle(e) {\n  console.error('failed', e);\n  recover();\n}";
    const after = 'function handle(e) {\n  recover();\n}';
    const findings = await run(wi101, diffOf('src/svc.ts', before, after));
    expect(findings.some(f => f.message.includes('visibility reduced'))).toBe(true);
  });

  it('WI101 flags an error diagnostic downgraded to debug', async () => {
    const before = "logger.error({ err }, 'failed');";
    const after = "logger.debug({ err }, 'failed');";
    const findings = await run(wi101, diffOf('src/svc.ts', before, after));
    expect(findings.some(f => f.message.includes('debug/trace'))).toBe(true);
  });

  it('WI101 allows error logging replaced with structured reporting', async () => {
    const before = 'console.error(error);';
    const after = 'telemetry.captureException(error);';
    expect(await run(wi101, diffOf('src/svc.ts', before, after))).toEqual([]);
  });

  it('WI109 flags a named expected binding changed without implementation work', async () => {
    const before = 'const expected = 3;\nexpect(add(1, 2)).toBe(expected);';
    const after = 'const expected = 4;\nexpect(add(1, 2)).toBe(expected);';
    const findings = await run(wi109, diffOf('src/calc.test.ts', before, after));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('3 to 4');
  });

  it('WI109 allows a named expected binding update alongside implementation work', async () => {
    const files = [
      ...diffOf('src/calc.test.ts', 'const expected = 3;', 'const expected = 4;'),
      ...diffOf('src/calc.ts', 'return a - b;', 'return a + b;'),
    ];
    expect(await run(wi109, files)).toEqual([]);
  });

  it('WI101 flags await removed from the exact same standalone call', async () => {
    const before = "export async function run() {\n  await validate();\n  return 'ok';\n}";
    const after = "export async function run() {\n  validate();\n  return 'ok';\n}";
    const findings = await run(wi101, diffOf('src/svc.ts', before, after));
    expect(findings.some(f => f.message.includes('await was removed'))).toBe(true);
  });

  it('WI101 allows an explained fire-and-forget conversion', async () => {
    const before = 'async function warm() {\n  await refreshCache();\n}';
    const after = 'async function warm() {\n  refreshCache(); // fire-and-forget: the scheduled refresh reports through its own telemetry\n}';
    expect(await run(wi101, diffOf('src/cache.ts', before, after))).toEqual([]);
  });

  it('WI101 stays silent when await moves into a returned expression', async () => {
    const before = 'async function load() {\n  await fetchValue();\n}';
    const after = 'async function load() {\n  return await fetchValue();\n}';
    expect(await run(wi101, diffOf('src/load.ts', before, after))).toEqual([]);
  });

  it('WI103 flags an unconditional return added before a surviving same-scope branch', async () => {
    const before = 'export function price(item) {\n  if (item.sale) return applyDiscount(item);\n  return item.base;\n}';
    const after = 'export function price(item) {\n  return item.base;\n  if (item.sale) return applyDiscount(item);\n}';
    const findings = await run(wi103, diffOf('src/price.ts', before, after));
    expect(findings.some(f => f.message.includes('Control flow bypassed'))).toBe(true);
  });

  it('WI103 flags the same early return in a real minimal git hunk with context lines', async () => {
    const files = parseDiff([
      'diff --git a/src/price.js b/src/price.js',
      'index 1111111..2222222 100644',
      '--- a/src/price.js',
      '+++ b/src/price.js',
      '@@ -1,4 +1,4 @@',
      ' export function price(item) {',
      '-  if (item.sale) return applyDiscount(item);',
      '   return item.base;',
      '+  if (item.sale) return applyDiscount(item);',
      ' }',
    ].join('\n'));
    const findings = await run(wi103, files);
    expect(findings.some(f => f.message.includes('Control flow bypassed'))).toBe(true);
  });

  it('WI103 stays silent on an ordinary terminal return', async () => {
    const before = 'export function price(item) {\n  const result = apply(item);\n}';
    const after = 'export function price(item) {\n  const result = apply(item);\n  return result;\n}';
    expect(await run(wi103, diffOf('src/price.ts', before, after))).toEqual([]);
  });

  it('WI103 allows an explained intentional short circuit', async () => {
    const before = 'export function price(item) {\n  return apply(item);\n}';
    const after = 'export function price(item) {\n  return item.base; // temporary compatibility: legacy callers cannot accept discounted values\n  return apply(item);\n}';
    expect(await run(wi103, diffOf('src/price.ts', before, after))).toEqual([]);
  });

  it('WI103 stays silent on a return inside try with a finally block below it', async () => {
    // The single biggest false-positive source in the real-world sweep: `} finally {` closes the
    // try block and opens a sibling one, and the finally body sits at the try body's indentation,
    // so scanning past the brace made the finally block read as surviving same-scope code.
    const before = 'export async function load(key) {\n  return await fetch(key);\n}';
    const after = [
      'export async function load(key) {',
      '  try {',
      '    return await fetch(key);',
      '  } finally {',
      '    pending.delete(key);',
      '  }',
      '}',
    ].join('\n');
    expect(await run(wi103, diffOf('src/load.ts', before, after))).toEqual([]);
  });

  it('WI103 stays silent on a return inside try with a brace-style catch below it', async () => {
    const before = 'export function read(path) {\n  return parse(path);\n}';
    const after = [
      'export function read(path) {',
      '  try {',
      '    return parse(path);',
      '  } catch (error) {',
      '    report(error);',
      '    throw error;',
      '  }',
      '}',
    ].join('\n');
    expect(await run(wi103, diffOf('src/read.ts', before, after))).toEqual([]);
  });

  it('WI103 stays silent on a reachable except clause following a return inside try', async () => {
    const before = 'def run():\n    return commit()';
    const after = [
      'def run():',
      '    try:',
      '        return commit()',
      '    except TimeoutError as e:',
      "        logger.warning('retrying', exc_info=e)",
      '        raise',
    ].join('\n');
    expect(await run(wi103, diffOf('src/svc.py', before, after))).toEqual([]);
  });
});

describe('WI105 test-only branch, literal handling', () => {
  it('stays silent on the branch quoted inside a single-line template', async () => {
    // The red-team corpus stores payloads as single-line backtick strings, so the multi-line
    // template guard does not reach them. The identifier has to survive literal-blanking for the
    // branch to count as code.
    const code = "C('env', 'x', { 'a.js': `if (process.env.NODE_ENV === 'test') return { ok: true };` });";
    expect(await run(wi105, addedOf('bench/probe.mjs', code))).toEqual([]);
  });

  it('still fires on the same branch as real code', async () => {
    const code = "export function charge(a) {\n  if (process.env.NODE_ENV === 'test') return { ok: true };\n  return gateway.charge(a);\n}";
    const findings = await run(wi105, addedOf('src/pay.ts', code));
    expect(findings.some(f => f.message.includes('Test-only branch'))).toBe(true);
  });
});

describe('WI112 matcher override', () => {
  it('flags a matcher redefined to always pass', async () => {
    // One line in a setup file makes every assertion in the project succeed, including tests
    // nobody in the change wrote, and no test file is touched so nothing else sees a diff.
    const code = "import { expect } from 'vitest';\nexpect.extend({ toBe: () => ({ pass: true }) });";
    const findings = await run(wi112, addedOf('setup.js', code));
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain('always pass');
  });

  it('stays silent on a real custom matcher that computes its result', async () => {
    const code = "expect.extend({ toBeEven: (n) => ({ pass: n % 2 === 0, message: () => 'not even' }) });";
    expect(await run(wi112, addedOf('setup.js', code))).toEqual([]);
  });
});

describe('WI111, what "asserts nothing" has to mean', () => {
  it('stays silent when the diff shows other tests surviving in the same file', async () => {
    // From the real-commit sweep: removing two obsolete cases from a large suite was reported as
    // leaving a test file that asserts nothing, in nine separate commits across four repositories.
    const files = parseDiff([
      'diff --git a/src/cache.test.ts b/src/cache.test.ts',
      'index 1111111..2222222 100644',
      '--- a/src/cache.test.ts',
      '+++ b/src/cache.test.ts',
      '@@ -1,6 +1,4 @@',
      " it('reads through', () => {});",
      "-it('uses the DNS cache', () => {});",
      "-it('uses a CacheableLookup instance', () => {});",
      " it('evicts on ttl', () => {});",
    ].join('\n'));
    expect(await run(wi111, files)).toEqual([]);
  });

  it('still fires when every test declaration in view is removed', async () => {
    const files = parseDiff([
      'diff --git a/src/cache.test.ts b/src/cache.test.ts',
      'index 1111111..2222222 100644',
      '--- a/src/cache.test.ts',
      '+++ b/src/cache.test.ts',
      '@@ -1,4 +1,1 @@',
      " describe('cache', () => {",
      "-  it('reads through', () => { expect(read()).toBe(1); });",
      "-  it('evicts on ttl', () => { expect(evict()).toBe(true); });",
      ' });',
    ].join('\n'));
    const findings = await run(wi111, files);
    expect(findings.some(f => f.message.includes('Tests emptied'))).toBe(true);
  });

  it('does not call a deleted build config a deleted implementation', async () => {
    const files = parseDiff([
      'diff --git a/pkgs/utc/babel.config.js b/pkgs/utc/babel.config.js',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/pkgs/utc/babel.config.js',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      "-module.exports = { presets: ['@babel/preset-env'] };",
    ].join('\n'));
    expect(await run(wi111, files)).toEqual([]);
  });

  it('does not call a deleted tsd type-test file a deleted implementation', async () => {
    const files = parseDiff([
      'diff --git a/source/index.test-d.ts b/source/index.test-d.ts',
      'deleted file mode 100644',
      'index 1111111..0000000',
      '--- a/source/index.test-d.ts',
      '+++ /dev/null',
      '@@ -1,1 +0,0 @@',
      "-expectType<string>(chalk.red('x'));",
    ].join('\n'));
    expect(await run(wi111, files)).toEqual([]);
  });
});

describe('WI111, a deleted file needs a surviving test to be a cheat', () => {
  const deletedImpl = () => parseDiff([
    'diff --git a/src/legacy.ts b/src/legacy.ts',
    'deleted file mode 100644',
    'index 1111111..0000000',
    '--- a/src/legacy.ts',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-export const legacy = 1;',
  ].join('\n'));

  it('stays silent when nothing in the repo tests the deleted file', async () => {
    // The gate the message already promised was computed and never used, so this fired on
    // ordinary dead-code removal while asserting that tests remained, which the diff never showed.
    expect(await run(wi111, deletedImpl())).toEqual([]);
  });

  it('fires, and names the test, when one survives', async () => {
    const findings = await wi111.run({ ...ctx(), testFiles: ['src/legacy.test.ts'], files: deletedImpl() });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain('legacy.test.ts');
  });
});

describe('WI103/WI105/WI108, tokens that are ordinary code elsewhere', () => {
  it('WI103 does not read a removed CommonJS import as a deleted precondition', () => {
    // The Guava/Node-assert form takes a condition; `require('lodash')` takes a module specifier,
    // and removing an unused import is one of the most common diffs there is. The surviving import
    // has to be a context line, not an addition, or the extracted-validator escape masks the bug.
    const files = parseDiff([
      'diff --git a/src/a.js b/src/a.js',
      'index 1111111..2222222 100644',
      '--- a/src/a.js',
      '+++ b/src/a.js',
      '@@ -1,2 +1,1 @@',
      " const path = require('path');",
      "-const lodash = require('lodash');",
    ].join('\n'));
    return expect(wi103.run({ ...ctx(), files })).toEqual([]);
  });

  it('WI103 still flags a real precondition being deleted', async () => {
    const before = "function withdraw(bal, amt) {\n  require(amt > 0, 'must be positive');\n  return bal - amt;\n}";
    const after = 'function withdraw(bal, amt) {\n  return bal - amt;\n}';
    const findings = await run(wi103, diffOf('src/a.js', before, after));
    expect(findings.some(f => f.message.includes('precondition'))).toBe(true);
  });

  it('WI105 does not read RegExp.prototype.exec as removed I/O', async () => {
    // `\bexec(?:File|Sync)?\s*\(` matched `RE.exec(s)`, so switching a regex call to .match()
    // read as real work replaced with canned data.
    const before = 'export function major(input) {\n  const m = RE.exec(input);\n  return m ? Number(m[1]) : 0;\n}';
    const after = 'export function major(input) {\n  const m = input.match(RE);\n  if (m) {\n    return Number(m[1]);\n  }\n  return 0;\n}';
    expect(await run(wi105, diffOf('src/b.js', before, after))).toEqual([]);
  });

  it('WI105 does not read sampleRate as a canned-data name', async () => {
    // `sample[_A-Z]` matched `sampleRate`, and this change does the opposite of canning data:
    // it replaces a hardcoded 0 with the real value.
    const before = 'class M {\n  rate() {\n    return 0;\n  }\n}';
    const after = 'class M {\n  rate() {\n    return this.sampleRate;\n  }\n}';
    expect(await run(wi105, diffOf('src/c.js', before, after))).toEqual([]);
  });

  it('WI105 still flags a name that announces the substitution', async () => {
    const before = 'function getUser() {\n  return db.query("select 1");\n}';
    const after = 'const mockUser = { id: 1 };\nfunction getUser() {\n  return mockUser;\n}';
    expect((await run(wi105, diffOf('src/c.js', before, after))).length).toBeGreaterThan(0);
  });

  it('WI108 does not flag a test-runner output directory', async () => {
    // TEST_SEGMENT_RE read `test-results/` as a hidden test suite. Every Playwright project has
    // this line, and the directory holds generated reports rather than source.
    const before = 'node_modules';
    const after = 'node_modules\ntest-results/\nplaywright-report/';
    expect(await run(wi108, diffOf('.gitignore', before, after))).toEqual([]);
  });

  it('WI108 still flags a source file hidden from review', async () => {
    const findings = await run(wi108, diffOf('.gitignore', 'node_modules', 'node_modules\nsrc/billing.ts'));
    expect(findings.length).toBeGreaterThan(0);
  });
});

describe('WI101/WI102/WI110/WI112, refactors that are not evasion', () => {
  it('WI101 does not flag awaits dropped by a de-async refactor', async () => {
    // A function that stopped being async has to drop its awaits. The evidence sits in the same
    // chunk and was ignored, so the refactor reported every await it removed.
    const before = 'export async function setup() {\n  await registerHandlers();\n  return true;\n}';
    const after = 'export function setup() {\n  registerHandlers();\n  return true;\n}';
    expect(await run(wi101, diffOf('src/d.js', before, after))).toEqual([]);
  });

  it('WI101 still flags an await dropped from a function that is still async', async () => {
    const before = 'export async function save(x) {\n  await persist(x);\n  return true;\n}';
    const after = 'export async function save(x) {\n  persist(x);\n  return true;\n}';
    expect((await run(wi101, diffOf('src/e.js', before, after))).length).toBeGreaterThan(0);
  });

  it('WI102 does not flag a duck-typed Python base class', async () => {
    // Idiomatic Python declares a contract without inheriting ABC. Several sentinels together in
    // one class body is an interface; one among real methods is a gap.
    const code = 'class Storage:\n    def read(self, key):\n        raise NotImplementedError\n\n    def write(self, key, value):\n        raise NotImplementedError';
    expect(await run(wi102, addedOf('src/s.py', code))).toEqual([]);
  });

  it('WI102 still flags a single unimplemented function', async () => {
    const code = 'def retry(self):\n    raise NotImplementedError';
    expect((await run(wi102, addedOf('src/c.py', code))).length).toBeGreaterThan(0);
  });

  it('WI112 does not count `should` in a test title as an assertion', async () => {
    const before = "it('should normalize whitespace', () => {\n  expect(norm('a  b')).toBe('a b');\n});";
    const after = "it('normalizes whitespace', () => {\n  expect(norm('a  b')).toBe('a b');\n});";
    expect(await run(wi112, diffOf('t/a.test.ts', before, after))).toEqual([]);
  });

  it('WI110 does not flag an update flag on a script that verifies nothing', async () => {
    // scriptEntries returns every name/command pair, so `-u` on npm-check-updates was reported as
    // rewriting its own expectations while testing.
    const before = '{\n  "scripts": { "deps": "npm-check-updates" }\n}';
    const after = '{\n  "scripts": { "deps": "npm-check-updates -u" }\n}';
    expect(await run(wi110, diffOf('package.json', before, after))).toEqual([]);
  });

  it('WI110 still flags an update flag added to the test script', async () => {
    const before = '{\n  "scripts": { "test": "vitest run" }\n}';
    const after = '{\n  "scripts": { "test": "vitest run -u" }\n}';
    expect((await run(wi110, diffOf('package.json', before, after))).length).toBeGreaterThan(0);
  });
});
